import { HttpErrorFactory } from "@buildingai/errors";
import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";

const MAX_BYTES = 10 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ProductImageUpload {
    buffer: Buffer;
    mimetype: string;
}

@Injectable()
export class ProductImageService {
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

    private async filename(userId: string, id: string) {
        if (!UUID.test(id)) throw HttpErrorFactory.notFound("商品图不存在");
        const directory = await realpath(this.directory(userId));
        const filename = path.join(directory, `${id}.png`);
        if ((await realpath(filename)) !== filename)
            throw HttpErrorFactory.notFound("商品图不存在");
        const stat = await lstat(filename);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES)
            throw HttpErrorFactory.notFound("商品图不存在");
        return { filename, stat };
    }

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
        const directory = this.directory(userId);
        await mkdir(directory, { recursive: true });
        const files = await readdir(directory);
        if (files.length >= 40)
            throw HttpErrorFactory.badRequest("商品图上传数量已达上限，请先删除不再使用的图片");
        const id = randomUUID();
        const filename = path.join(directory, `${id}.png`);
        try {
            await writeFile(filename, buffer, { flag: "wx", mode: 0o600 });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST")
                await rm(filename, { force: true }).catch(() => undefined);
            throw HttpErrorFactory.badRequest("商品图保存失败");
        }
        return { id, mediaType: "image/png", width, height, size: buffer.length };
    }

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

    async list(userId: string) {
        const directory = this.directory(userId);
        const names = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return [];
            throw HttpErrorFactory.badRequest("商品图列表加载失败");
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

    async remove(userId: string, id: string) {
        try {
            const { filename } = await this.filename(userId, id);
            await rm(filename, { force: true });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT")
                throw HttpErrorFactory.badRequest("商品图删除失败");
        }
        return { success: true };
    }
}
