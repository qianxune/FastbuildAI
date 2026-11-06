import { CloudStorageService } from "@buildingai/core/modules";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { StorageConfig } from "@buildingai/db/entities";
import { Repository } from "@buildingai/db/typeorm";
import { HttpErrorFactory } from "@buildingai/errors";
import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { lstat, mkdir, readFile, realpath, rm, writeFile } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import sharp from "sharp";

import type { GeneratedImage } from "../../../db/entities/image-generation.entity";
import { GENERATION_FAILED, GENERATION_STORAGE_RESTRICTED } from "../constants/generation.constants";

const APP_IDENTIFIER = "image-studio";
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_THUMBNAIL_BYTES = 256 * 1024;
const THUMBNAIL_SUFFIX = ".thumbnail-v1.webp";
const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const IMAGE_EXTENSIONS: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
};

@Injectable()
export class GenerationImageService {
    private readonly thumbnails = new Map<string, { expires: number; value: Promise<{ buffer: Buffer; mediaType: string }> }>();
    private readonly thumbnailReads = new Map<string, Promise<{ buffer: Buffer; mediaType: string }>>();
    private readonly thumbnailRemovals = new Set<string>();
    private readonly logger = new Logger(GenerationImageService.name);
    /** 复用系统启用的存储配置及云存储服务，不在扩展内另存密钥。 */
    constructor(
        @InjectRepository(StorageConfig)
        private readonly storageConfigRepository: Repository<StorageConfig>,
        private readonly cloudStorageService: CloudStorageService,
    ) {}

    /** 根据扩展接口前缀构造生成图的受保护访问地址，索引从零开始。 */
    url(id: string, index: number) {
        const prefix = (process.env.VITE_APP_WEB_API_PREFIX || "api").replace(/^\/+|\/+$/g, "");
        return `/${APP_IDENTIFIER}/${prefix}/generations/${id}/images/${index}`;
    }

    /** 按记录读取 COS 或历史本地文件，校验大小和图片签名；鉴权由上层服务执行。 */
    async read(id: string, index: number, image: GeneratedImage) {
        const location = this.imageLocation(id, index, image);
        try {
            if (image.storage) {
                const config = await this.cloudConfig(id, index, image);
                const buffer = await this.cloudStorageService.readBuffer(
                    config,
                    image.storage.key,
                    MAX_IMAGE_BYTES,
                );
                this.validateImage(buffer, image.mediaType);
                return { buffer, mediaType: image.mediaType };
            }
            const filename = await this.checkedPath(location.directory, location.filename);
            const info = await lstat(filename);
            if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_IMAGE_BYTES) {
                throw new Error("invalid image file");
            }
            const buffer = await readFile(filename);
            this.validateImage(buffer, image.mediaType);
            return { buffer, mediaType: image.mediaType };
        } catch {
            throw HttpErrorFactory.notFound("图片不存在或格式不受支持");
        }
    }

    async readThumbnail(id: string, index: number, image: GeneratedImage) {
        const location = this.imageLocation(id, index, image);
        const config = image.storage ? await this.cloudConfig(id, index, image) : undefined;
        const cacheKey = this.thumbnailCacheKey(id, index, image);
        if (this.thumbnailRemovals.has(cacheKey)) throw HttpErrorFactory.notFound("图片不存在");
        const pending = this.thumbnailReads.get(cacheKey);
        if (pending) return pending;
        const cached = this.thumbnails.get(cacheKey);
        if (cached && cached.expires > Date.now()) return cached.value;
        this.thumbnails.delete(cacheKey);
        const value = (async () => {
            try {
                let buffer: Buffer;
                try {
                    if (config) buffer = await this.cloudStorageService.readBuffer(config, image.storage!.key + THUMBNAIL_SUFFIX, MAX_THUMBNAIL_BYTES);
                    else {
                        const filename = await this.checkedPath(location.directory, location.filename + THUMBNAIL_SUFFIX);
                        const info = await lstat(filename);
                        if (!info.isFile() || info.isSymbolicLink() || !info.size || info.size > MAX_THUMBNAIL_BYTES) throw new Error("Invalid thumbnail file");
                        buffer = await readFile(filename);
                    }
                } catch (error) {
                    const detail = error as { code?: string; statusCode?: number };
                    if (detail.code !== "ENOENT" && detail.code !== "NoSuchKey" && detail.statusCode !== 404) throw error;
                    const original = await this.read(id, index, image);
                    buffer = await this.createThumbnail(original.buffer);
                    await this.writeThumbnail(id, index, image, buffer);
                }
                await this.validateThumbnail(buffer);
                return { buffer, mediaType: "image/webp" };
            } catch {
                throw HttpErrorFactory.notFound("缩略图暂不可用，请稍后重试");
            }
        })();
        this.thumbnailReads.set(cacheKey, value);
        this.thumbnails.set(cacheKey, { expires: Date.now() + 10 * 60 * 1000, value });
        if (this.thumbnails.size > 128) this.thumbnails.delete(this.thumbnails.keys().next().value!);
        try { return await value; } catch (error) {
            if (this.thumbnails.get(cacheKey)?.value === value) this.thumbnails.delete(cacheKey);
            throw error;
        } finally { if (this.thumbnailReads.get(cacheKey) === value) this.thumbnailReads.delete(cacheKey); }
    }

    private thumbnailCacheKey(id: string, index: number, image: GeneratedImage) {
        return JSON.stringify([id, index, image.storage ?? image.url, THUMBNAIL_SUFFIX]);
    }

    private async createThumbnail(buffer: Buffer) {
        const thumbnail = await sharp(buffer, { limitInputPixels: 40000000, failOn: "warning", animated: false })
            .rotate().resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
            .webp({ quality: 78 }).toBuffer();
        await this.validateThumbnail(thumbnail);
        return thumbnail;
    }

    private async validateThumbnail(buffer: Buffer) {
        if (!buffer.length || buffer.length > MAX_THUMBNAIL_BYTES) throw new Error("Invalid thumbnail size");
        const metadata = await sharp(buffer, { limitInputPixels: 512 * 512, animated: false }).metadata();
        if (metadata.format !== "webp" || !metadata.width || !metadata.height ||
            metadata.width > 512 || metadata.height > 512 || (metadata.pages ?? 1) > 1) throw new Error("Invalid thumbnail");
    }

    private async writeThumbnail(id: string, index: number, image: GeneratedImage, buffer: Buffer) {
        const location = this.imageLocation(id, index, image);
        if (image.storage) {
            const config = await this.cloudConfig(id, index, image);
            const key = image.storage.key + THUMBNAIL_SUFFIX;
            try {
                await this.cloudStorageService.upload({ storageConfig: config, path: key, privateObject: true, file: {
                    fieldname: "file", originalname: `${index}${THUMBNAIL_SUFFIX}`, encoding: "7bit", mimetype: "image/webp",
                    size: buffer.length, buffer, destination: "", filename: `${index}${THUMBNAIL_SUFFIX}`, path: key, stream: Readable.from(buffer),
                } });
            } catch (error) {
                await this.cloudStorageService.deleteObject(config, key).catch(() => undefined);
                throw error;
            }
        } else {
            const original = await this.checkedPath(location.directory, location.filename);
            try { await writeFile(original + THUMBNAIL_SUFFIX, buffer, { flag: "wx", mode: 0o600 }); }
            catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
        }
    }

    private async persistThumbnails(id: string, images: GeneratedImage[], buffers: Buffer[]) {
        for (const [index, image] of images.entries()) {
            try {
                const buffer = await this.createThumbnail(buffers[index]);
                await this.writeThumbnail(id, index, image, buffer);
            } catch {
                this.logger.warn(`Thumbnail pending for ${id}:${index}`);
            }
        }
    }

    private async removeStoredImage(id: string, index: number, image: GeneratedImage) {
        const location = this.imageLocation(id, index, image);
        const config = image.storage ? await this.cloudConfig(id, index, image) : undefined;
        const cacheKey = this.thumbnailCacheKey(id, index, image);
        this.thumbnailRemovals.add(cacheKey);
        try {
            await this.thumbnailReads.get(cacheKey)?.catch(() => undefined);
            this.thumbnails.delete(cacheKey);
            const removeLocal = async (filename: string) => {
                try { await rm(await this.checkedPath(location.directory, filename), { force: true }); }
                catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
            };
            const results = await Promise.allSettled(config ? [
                this.cloudStorageService.deleteObject(config, image.storage!.key),
                this.cloudStorageService.deleteObject(config, image.storage!.key + THUMBNAIL_SUFFIX),
            ] : [removeLocal(location.filename), removeLocal(location.filename + THUMBNAIL_SUFFIX)]);
            const failure = results.find((result) => result.status === "rejected");
            if (failure?.status === "rejected") throw failure.reason;
        } finally { this.thumbnailRemovals.delete(cacheKey); }
    }

    /** 删除记录关联的 COS 或本地图片；忽略本地文件不存在，其余错误转换为业务提示。 */
    async remove(id: string, images: GeneratedImage[]) {
        await Promise.all(
            images.map(async (image, index) => {
                try {
                    await this.removeStoredImage(id, index, image);
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                        throw HttpErrorFactory.badRequest("图片删除失败，请稍后重试");
                    }
                }
            }),
        );
    }

    /** 尽力清理记录指定的 COS 或本地输出，不让补偿异常覆盖原始错误。 */
    cleanup(id: string, images: GeneratedImage[]) {
        return Promise.allSettled(
            images.map((image, index) => this.removeStoredImage(id, index, image)),
        );
    }

    /** 校验图片后按系统启用配置写入 COS 或本地，COS 失败不回退到本地存储。 */
    async persist(
        generationId: string,
        images: Array<{ base64: string; mediaType: string }>,
        tool?: "sku",
    ): Promise<GeneratedImage[]> {
        if (
            !new RegExp(`^${UUID_PATTERN}$`, "i").test(generationId) ||
            images.length < 1 ||
            images.length > (tool === "sku" ? 10 : 4)
        ) {
            throw new Error(GENERATION_FAILED);
        }
        const decoded = images.map((image) => {
            if (
                !Object.hasOwn(IMAGE_EXTENSIONS, image.mediaType) ||
                typeof image.base64 !== "string" ||
                image.base64.length > 4 * Math.ceil(MAX_IMAGE_BYTES / 3) ||
                !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
                    image.base64,
                )
            ) {
                throw new Error(GENERATION_FAILED);
            }
            const buffer = Buffer.from(image.base64, "base64");
            if (buffer.toString("base64") !== image.base64) throw new Error(GENERATION_FAILED);
            this.validateImage(buffer, image.mediaType);
            return buffer;
        });
        const storageConfig = await this.storageConfigRepository.findOne({ where: { isActive: true } });
        if (!storageConfig) throw new Error("No active image storage configuration");
        if (storageConfig.storageType === "cos") {
            return this.persistCloud(generationId, images, decoded, storageConfig);
        }
        if (storageConfig.storageType !== "local") {
            throw new Error("Generated images require local or Tencent COS storage");
        }
        const outputDir = this.storageDirectory();
        await mkdir(outputDir, { recursive: true });

        const writtenFiles: string[] = [];
        const persisted: GeneratedImage[] = [];
        try {
            for (const [index, image] of images.entries()) {
                const filename = `${generationId}-${index}.${IMAGE_EXTENSIONS[image.mediaType]}`;
                const destination = path.join(outputDir, filename);
                try {
                    await writeFile(destination, decoded[index], { flag: "wx", mode: 0o600 });
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== "EEXIST")
                        writtenFiles.push(destination);
                    throw error;
                }
                writtenFiles.push(destination);
                persisted.push({ url: this.url(generationId, index), mediaType: image.mediaType });
            }
            await this.persistThumbnails(generationId, persisted, decoded);
            return persisted;
        } catch (error) {
            await this.cleanupFiles(writtenFiles);
            throw error;
        }
    }

    /** 使用唯一对象前缀上传一批图片；任何上传失败时清理本批次已尝试写入的对象。 */
    private async persistCloud(
        generationId: string,
        images: Array<{ mediaType: string }>,
        decoded: Buffer[],
        storageConfig: StorageConfig,
    ): Promise<GeneratedImage[]> {
        const config = storageConfig.config;
        if (!config?.bucket || !config.region) throw new Error("Invalid Tencent COS configuration");
        const prefix = `${APP_IDENTIFIER}/generated/${generationId}/${randomUUID()}`;
        const persisted: GeneratedImage[] = [];
        try {
            for (const [index, image] of images.entries()) {
                const filename = `${index}.${IMAGE_EXTENSIONS[image.mediaType]}`;
                const key = `${prefix}/${filename}`;
                persisted.push({
                    url: this.url(generationId, index),
                    mediaType: image.mediaType,
                    storage: {
                        type: "cos",
                        configId: storageConfig.id,
                        bucket: config.bucket,
                        region: config.region,
                        key,
                    },
                });
                await this.cloudStorageService.upload({
                    storageConfig,
                    path: key,
                    file: {
                        fieldname: "file",
                        originalname: filename,
                        encoding: "7bit",
                        mimetype: image.mediaType,
                        size: decoded[index].length,
                        buffer: decoded[index],
                        destination: "",
                        filename,
                        path: key,
                        stream: Readable.from(decoded[index]),
                    },
                });
            }
            await this.persistThumbnails(generationId, persisted, decoded);
            return persisted;
        } catch (error) {
            await Promise.allSettled(
                persisted.map((image) =>
                    this.cloudStorageService.deleteObject(storageConfig, image.storage!.key),
                ),
            );
            const detail = error as { statusCode?: unknown; code?: unknown } | null;
            if (detail?.statusCode === 451 || detail?.code === "UnavailableForLegalReasons") {
                throw new Error(GENERATION_STORAGE_RESTRICTED, { cause: error });
            }
            throw error;
        }
    }

    /** 校验对象属于当前任务及索引，读取原配置密钥并使用上传时的存储桶与地域。 */
    private async cloudConfig(id: string, index: number, image: GeneratedImage) {
        const storage = image.storage;
        if (
            !storage || storage.type !== "cos" ||
            !new RegExp(`^${UUID_PATTERN}$`, "i").test(storage.configId) ||
            !new RegExp(
                `^${APP_IDENTIFIER}/generated/${id}/${UUID_PATTERN}/${index}\\.${IMAGE_EXTENSIONS[image.mediaType]}$`,
                "i",
            ).test(storage.key) || !storage.bucket || !storage.region
        ) {
            throw new Error("Invalid generated image storage reference");
        }
        const config = await this.storageConfigRepository.findOne({ where: { id: storage.configId } });
        if (!config || config.storageType !== "cos" || !config.config) {
            throw new Error("Generated image storage configuration is unavailable");
        }
        return {
            ...config,
            config: { ...config.config, bucket: storage.bucket, region: storage.region },
        };
    }

    /** 返回生成图目录，可切换到兼容旧记录的 uploads 路径。 */
    private storageDirectory(legacy = false) {
        return path.join(
            process.cwd(),
            "..",
            "..",
            "extensions",
            APP_IDENTIFIER,
            "storage",
            legacy ? "uploads" : "private",
            "generated",
        );
    }

    /** 校验任务编号和图片元数据，将受保护地址或合法旧地址映射到存储文件名。 */
    private imageLocation(id: string, index: number, image: GeneratedImage) {
        if (
            !new RegExp(`^${UUID_PATTERN}$`, "i").test(id) ||
            !Number.isInteger(index) ||
            index < 0 ||
            index >= 10 ||
            !Object.hasOwn(IMAGE_EXTENSIONS, image.mediaType)
        ) {
            throw HttpErrorFactory.notFound("图片不存在或格式不受支持");
        }
        if (image.url === this.url(id, index)) {
            return {
                directory: this.storageDirectory(),
                filename: `${id}-${index}.${IMAGE_EXTENSIONS[image.mediaType]}`,
            };
        }
        const legacyPrefix = `/${APP_IDENTIFIER}/uploads/generated/`;
        const filename = image.url.startsWith(legacyPrefix)
            ? image.url.slice(legacyPrefix.length)
            : "";
        const legacyExtension = image.mediaType === "image/jpeg" ? "jpg" : "png";
        if (
            !new RegExp(`^${id}-${index + 1}-${UUID_PATTERN}\\.${legacyExtension}$`, "i").test(
                filename,
            )
        ) {
            throw HttpErrorFactory.notFound("图片不存在或格式不受支持");
        }
        return { directory: this.storageDirectory(true), filename };
    }

    /** 解析真实路径并拒绝指向不同目标的符号链接，返回校验后的文件路径。 */
    private async checkedPath(directory: string, filename: string) {
        const root = await realpath(directory);
        const candidate = path.join(root, filename);
        const resolved = await realpath(candidate);
        if (resolved !== candidate) throw HttpErrorFactory.notFound("图片不存在");
        return candidate;
    }

    /** 检查 PNG、JPEG 或 WebP 文件签名及二十 MiB 大小上限，不进行完整解码。 */
    private validateImage(buffer: Buffer, mediaType: string) {
        const valid =
            mediaType === "image/png"
                ? buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
                : mediaType === "image/jpeg"
                  ? buffer.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex")) &&
                    buffer.subarray(-2).equals(Buffer.from("ffd9", "hex"))
                  : mediaType === "image/webp" &&
                    buffer.length >= 12 &&
                    buffer.toString("ascii", 0, 4) === "RIFF" &&
                    buffer.toString("ascii", 8, 12) === "WEBP" &&
                    buffer.readUInt32LE(4) === buffer.length - 8;
        if (!valid || buffer.length > MAX_IMAGE_BYTES) throw new Error(GENERATION_FAILED);
    }

    /** 并行尝试删除文件并吸收清理异常，避免覆盖原始生成错误。 */
    private async cleanupFiles(filenames: string[]) {
        await Promise.allSettled(filenames.map((filename) => rm(filename, { force: true })));
    }
}
