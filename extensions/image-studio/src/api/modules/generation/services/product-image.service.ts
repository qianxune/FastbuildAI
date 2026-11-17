import { HttpErrorFactory } from "@buildingai/errors";
import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rm, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";

const MAX_BYTES = 10 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATALOG = ".materials.json";
const CATALOG_BYTES = 64 * 1024;

interface MaterialCatalog {
    version: 1;
    groups: string[];
    images: Record<string, { name: string; group: string }>;
}

export interface ProductImageMetadata {
    name?: string;
    group?: string;
}

export interface ProductImageRemovalResult {
    success: true;
    metadataCleanupPending?: boolean;
}

function validLabel(value: unknown, max: number): value is string {
    return typeof value === "string" && value === value.trim() && value.length > 0 &&
        value.length <= max && !/[\x00-\x1f\x7f-\x9f/\\<>:"|?*\u202a-\u202e\u2066-\u2069]/u.test(value) &&
        value !== "." && value !== "..";
}

export interface ProductImageUpload {
    buffer: Buffer;
    mimetype: string;
    originalname?: string;
}

@Injectable()
export class ProductImageService {
    private async safeDirectory(userId: string, create = false) {
        const directory = path.resolve(this.directory(userId));
        const root = path.parse(directory).root;
        let current = root;
        for (const segment of directory.slice(root.length).split(path.sep)) {
            current = path.join(current, segment);
            if (create) {
                await mkdir(current, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
                    if (error.code !== "EEXIST") throw error;
                });
            }
            const stat = await lstat(current);
            if (!stat.isDirectory() || stat.isSymbolicLink())
                throw HttpErrorFactory.badRequest("素材目录不可用");
        }
        if (await realpath(directory) !== directory)
            throw HttpErrorFactory.badRequest("素材目录不可用");
        return directory;
    }

    private async catalog(userId: string): Promise<MaterialCatalog> {
        try {
            const directory = await this.safeDirectory(userId);
            const filename = path.join(directory, CATALOG);
            const stat = await lstat(filename).catch((error: NodeJS.ErrnoException) => {
                if (error.code === "ENOENT") return undefined;
                throw error;
            });
            if (!stat) return { version: 1, groups: [], images: {} };
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size > CATALOG_BYTES ||
                await realpath(filename) !== filename) throw new Error();
            const bytes = await readFile(filename);
            if (bytes.length > CATALOG_BYTES) throw new Error();
            const value = JSON.parse(bytes.toString("utf8")) as MaterialCatalog;
            if (!value || value.version !== 1 || !Array.isArray(value.groups) || value.groups.length > 40 ||
                !value.groups.every((group) => validLabel(group, 60)) || new Set(value.groups).size !== value.groups.length ||
                !value.images || typeof value.images !== "object" || Array.isArray(value.images) ||
                !Object.entries(value.images).every(([id, image]) =>
                    UUID.test(id) && image && validLabel(image.name, 120) &&
                    (image.group === "" || value.groups.includes(image.group)))) throw new Error();
            return value;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, groups: [], images: {} };
            throw HttpErrorFactory.badRequest("素材名称与分组读取失败，原图仍保留，请联系管理员检查元数据");
        }
    }

    private async saveCatalog(userId: string, catalog: MaterialCatalog) {
        const directory = await this.safeDirectory(userId, true);
        const filename = path.join(directory, CATALOG);
        const temporary = path.join(directory, `.materials-${randomUUID()}.tmp`);
        const bytes = Buffer.from(JSON.stringify(catalog));
        if (bytes.length > CATALOG_BYTES) throw HttpErrorFactory.badRequest("素材元数据已达上限");
        const existing = await lstat(filename).catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return undefined;
            throw error;
        });
        if (existing && (!existing.isFile() || existing.isSymbolicLink()))
            throw HttpErrorFactory.badRequest("素材元数据不可用");
        let handle;
        try {
            handle = await open(temporary, "wx", 0o600);
            await handle.writeFile(bytes);
            await handle.sync();
            await handle.close();
            handle = undefined;
            await rename(temporary, filename);
        } catch {
            throw HttpErrorFactory.badRequest("素材名称与分组保存失败，原图未删除");
        } finally {
            await handle?.close().catch(() => undefined);
            await rm(temporary, { force: true }).catch(() => undefined);
        }
    }

    async groups(userId: string) {
        return (await this.catalog(userId)).groups;
    }

    async createGroup(userId: string, name: string) {
        if (!validLabel(name, 60)) throw HttpErrorFactory.badRequest("分组名称须为 1-60 字且不能包含路径或控制字符");
        const catalog = await this.catalog(userId);
        if (catalog.groups.includes(name) || catalog.groups.length >= 40)
            throw HttpErrorFactory.badRequest("分组已存在或已达 40 个上限");
        catalog.groups.push(name);
        await this.saveCatalog(userId, catalog);
        return catalog.groups;
    }

    async changeGroup(userId: string, name: string, next?: string) {
        if (!validLabel(name, 60) || (next !== undefined && !validLabel(next, 60)))
            throw HttpErrorFactory.badRequest("分组名称无效");
        const catalog = await this.catalog(userId);
        if (!catalog.groups.includes(name)) throw HttpErrorFactory.notFound("分组不存在");
        if (next !== undefined && next !== name && catalog.groups.includes(next))
            throw HttpErrorFactory.badRequest("分组已存在");
        catalog.groups = catalog.groups.flatMap((group) => group === name ? next === undefined ? [] : [next] : [group]);
        for (const image of Object.values(catalog.images)) {
            if (image.group === name) image.group = next ?? "";
        }
        await this.saveCatalog(userId, catalog);
        return catalog.groups;
    }

    async updateMetadata(userId: string, id: string, input: ProductImageMetadata) {
        if (!input || (!Object.hasOwn(input, "name") && !Object.hasOwn(input, "group")) ||
            Object.keys(input).some((key) => key !== "name" && key !== "group") ||
            (input.name !== undefined && !validLabel(input.name, 120)) ||
            (input.group !== undefined && input.group !== "" && !validLabel(input.group, 60)))
            throw HttpErrorFactory.badRequest("素材名称或分组无效");
        await this.filename(userId, id);
        const catalog = await this.catalog(userId);
        if (input.group && !catalog.groups.includes(input.group)) throw HttpErrorFactory.badRequest("分组不存在");
        const previous = catalog.images[id] ?? { name: `素材-${id.slice(0, 8)}`, group: "" };
        catalog.images[id] = { name: input.name ?? previous.name, group: input.group ?? previous.group };
        await this.saveCatalog(userId, catalog);
        return { id, ...catalog.images[id], metadataStatus: "ready" as const };
    }

    /** 校验用户编号并构造按用户隔离的私有商品图目录。 */
    private directory(userId: string) {
        if (!UUID.test(userId)) throw HttpErrorFactory.badRequest("用户信息无效");
        return path.join(
            process.cwd(),
            "..",
            "..",
            "extensions",
            "image-studio",
            "storage",
            "private",
            "products",
            userId,
        );
    }

    /** 校验图片编号、真实路径及文件属性，拒绝符号链接和超限文件。 */
    private async filename(userId: string, id: string) {
        if (!UUID.test(id)) throw HttpErrorFactory.notFound("商品图不存在");
        const requested = path.resolve(this.directory(userId));
        const directory = await realpath(requested);
        if (directory !== requested) throw HttpErrorFactory.notFound("商品图不存在");
        const filename = path.join(directory, `${id}.png`);
        if ((await realpath(filename)) !== filename)
            throw HttpErrorFactory.notFound("商品图不存在");
        const stat = await lstat(filename);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES)
            throw HttpErrorFactory.notFound("商品图不存在");
        return { filename, stat };
    }

    /** 校验静态图片并旋转缩放为 PNG，排他写入用户私有目录。 */
    async upload(userId: string, file?: ProductImageUpload) {
        if (
            !file?.buffer?.length ||
            file.buffer.length > MAX_BYTES ||
            !["image/png", "image/jpeg", "image/webp"].includes(file.mimetype)
        ) {
            throw HttpErrorFactory.badRequest("请上传不超过 10 MB 的 PNG、JPEG 或 WebP 图片");
        }
        let buffer: Buffer;
        let width: number;
        let height: number;
        try {
            const image = sharp(file.buffer, {
                limitInputPixels: 40000000,
                failOn: "warning",
                animated: false,
            });
            const metadata = await image.metadata();
            const formats: Record<string, string> = {
                png: "image/png",
                jpeg: "image/jpeg",
                webp: "image/webp",
            };
            if (
                !metadata.format ||
                formats[metadata.format] !== file.mimetype ||
                (metadata.pages ?? 1) > 1 ||
                !metadata.width ||
                !metadata.height ||
                metadata.width < 64 ||
                metadata.height < 64
            )
                throw new Error();
            const normalized = await image
                .rotate()
                .resize({ width: 4096, height: 4096, fit: "inside", withoutEnlargement: true })
                .png()
                .toBuffer({ resolveWithObject: true });
            buffer = normalized.data;
            width = normalized.info.width;
            height = normalized.info.height;
            if (buffer.length > MAX_BYTES) throw new Error();
        } catch {
            throw HttpErrorFactory.badRequest(
                "图片无法解码，请使用 64 像素以上、4000 万像素以内的静态商品图片",
            );
        }
        const directory = await this.safeDirectory(userId, true);
        const catalog = await this.catalog(userId);
        const files = await readdir(directory);
        const id = randomUUID();
        const filename = path.join(directory, `${id}.png`);
        try {
            await writeFile(filename, buffer, { flag: "wx", mode: 0o600 });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST")
                await rm(filename, { force: true }).catch(() => undefined);
            throw HttpErrorFactory.badRequest("商品图保存失败");
        }
        const label = file.originalname?.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "").trim();
        const name = validLabel(label, 120) ? label : `素材-${id.slice(0, 8)}`;
        const existingIds = new Set(files.filter((value) => value.endsWith(".png")).map((value) => value.slice(0, -4)));
        catalog.images = Object.fromEntries(Object.entries(catalog.images).filter(([key]) => existingIds.has(key)));
        catalog.images[id] = { name, group: "" };
        let metadataStatus: "ready" | "unavailable" = "ready";
        try {
            await this.saveCatalog(userId, catalog);
        } catch {
            metadataStatus = "unavailable";
        }
        return { id, mediaType: "image/png", width, height, size: buffer.length,
            createdAt: new Date().toISOString(), name, group: "", metadataStatus };
    }

    /** 读取用户所属商品图并检查 PNG 签名和大小，失败时统一返回未找到提示。 */
    async read(userId: string, id: string) {
        try {
            const { filename } = await this.filename(userId, id);
            const buffer = await readFile(filename);
            if (
                buffer.length > MAX_BYTES ||
                !buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
            )
                throw new Error();
            return buffer;
        } catch {
            throw HttpErrorFactory.notFound("商品图不存在或已删除，请重新上传");
        }
    }

    async readThumbnail(userId: string, id: string) {
        const original = await this.read(userId, id);
        try {
            const thumbnail = await sharp(original, {
                limitInputPixels: 40000000,
                failOn: "warning",
                animated: false,
            })
                .rotate()
                .resize({ width: 256, height: 256, fit: "inside", withoutEnlargement: true })
                .png({ compressionLevel: 9, palette: true })
                .toBuffer();
            if (!thumbnail.length || thumbnail.length > 256 * 1024) throw new Error();
            return thumbnail;
        } catch {
            throw HttpErrorFactory.notFound("商品图不存在或已删除，请重新上传");
        }
    }

    /** 将商品图缩放到一千零二十四像素以内，铺白底并转为 JPEG 供视觉分析。 */
    async readForAnalysis(userId: string, id: string) {
        const buffer = await this.read(userId, id);
        return sharp(buffer, { limitInputPixels: 40000000 })
            .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
            .flatten({ background: "#ffffff" })
            .jpeg({ quality: 85 })
            .toBuffer();
    }

    /** 枚举用户目录中的有效商品图元数据，跳过异常文件并按修改时间倒序返回。 */
    async list(userId: string) {
        const directory = this.directory(userId);
        const names = await this.safeDirectory(userId).then(() => readdir(directory)).catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return [];
            throw HttpErrorFactory.badRequest("商品图列表加载失败");
        });
        let metadataStatus: "ready" | "unavailable" = "ready";
        const catalog = await this.catalog(userId).catch(() => {
            metadataStatus = "unavailable";
            return { version: 1, groups: [], images: {} } as MaterialCatalog;
        });
        const items = await Promise.all(
            names
                .filter((name) => name.endsWith(".png") && UUID.test(name.slice(0, -4)))
                .map(async (name) => {
                    const id = name.slice(0, -4);
                    try {
                        const { filename, stat } = await this.filename(userId, id);
                        const metadata = await sharp(filename, {
                            limitInputPixels: 40000000,
                        }).metadata();
                        return {
                            id,
                            mediaType: "image/png",
                            width: metadata.width ?? 0,
                            height: metadata.height ?? 0,
                            size: stat.size,
                            createdAt: stat.mtime.toISOString(),
                            name: catalog.images[id]?.name ?? `素材-${id.slice(0, 8)}`,
                            group: catalog.images[id]?.group ?? "",
                            metadataStatus,
                        };
                    } catch {
                        return null;
                    }
                }),
        );
        return items
            .filter((item) => item !== null)
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    }

    /** 校验归属路径后删除商品图；历史引用保护由上层生成服务负责。 */
    async remove(userId: string, id: string): Promise<ProductImageRemovalResult> {
        try {
            const { filename } = await this.filename(userId, id);
            const catalog = await this.catalog(userId);
            await rm(filename, { force: true });
            if (catalog.images[id]) {
                delete catalog.images[id];
                try {
                    await this.saveCatalog(userId, catalog);
                } catch {
                    return { success: true, metadataCleanupPending: true };
                }
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT")
                throw HttpErrorFactory.badRequest("商品图删除失败");
        }
        return { success: true };
    }
}
