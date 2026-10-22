import { HttpErrorFactory } from "@buildingai/errors";
import { Injectable } from "@nestjs/common";
import { lstat, mkdir, readFile, realpath, rm, writeFile } from "fs/promises";
import path from "path";

import type { GeneratedImage } from "../../../db/entities/image-generation.entity";
import { GENERATION_FAILED } from "../constants/generation.constants";

const APP_IDENTIFIER = "image-studio";
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const IMAGE_EXTENSIONS: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
};

@Injectable()
export class GenerationImageService {
    url(id: string, index: number) {
        const prefix = (process.env.VITE_APP_WEB_API_PREFIX || "api").replace(/^\/+|\/+$/g, "");
        return `/${APP_IDENTIFIER}/${prefix}/generations/${id}/images/${index}`;
    }

    async read(id: string, index: number, image: GeneratedImage) {
        const location = this.imageLocation(id, index, image);
        try {
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

    async remove(id: string, images: GeneratedImage[]) {
        await Promise.all(
            images.map(async (image, index) => {
                const location = this.imageLocation(id, index, image);
                try {
                    await rm(await this.checkedPath(location.directory, location.filename), {
                        force: true,
                    });
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                        throw HttpErrorFactory.badRequest("图片删除失败，请稍后重试");
                    }
                }
            }),
        );
    }

    cleanup(id: string, images: GeneratedImage[]) {
        return this.cleanupFiles(
            images.map((image, index) =>
                path.join(
                    this.storageDirectory(),
                    `${id}-${index}.${IMAGE_EXTENSIONS[image.mediaType]}`,
                ),
            ),
        );
    }

    async persist(
        generationId: string,
        images: Array<{ base64: string; mediaType: string }>,
    ): Promise<GeneratedImage[]> {
        if (
            !new RegExp(`^${UUID_PATTERN}$`, "i").test(generationId) ||
            images.length < 1 ||
            images.length > 4
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
            return persisted;
        } catch (error) {
            await this.cleanupFiles(writtenFiles);
            throw error;
        }
    }

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

    private imageLocation(id: string, index: number, image: GeneratedImage) {
        if (
            !new RegExp(`^${UUID_PATTERN}$`, "i").test(id) ||
            !Number.isInteger(index) ||
            index < 0 ||
            index >= 4 ||
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

    private async checkedPath(directory: string, filename: string) {
        const root = await realpath(directory);
        const candidate = path.join(root, filename);
        const resolved = await realpath(candidate);
        if (resolved !== candidate) throw HttpErrorFactory.notFound("图片不存在");
        return candidate;
    }

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

    private async cleanupFiles(filenames: string[]) {
        await Promise.allSettled(filenames.map((filename) => rm(filename, { force: true })));
    }
}
