import { CloudStorageService } from "@buildingai/core/modules";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { StorageConfig } from "@buildingai/db/entities";
import { Repository } from "@buildingai/db/typeorm";
import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import sharp from "sharp";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 4096 * 4096;
export const CUTOUT_MODEL = "Tencent CI AIPicMatting";

export async function cutoutSourceSize(source: Buffer) {
    if (!Buffer.isBuffer(source) || !source.length || source.length > MAX_BYTES) throw new Error("Invalid cutout source");
    const metadata = await sharp(source, { limitInputPixels: MAX_PIXELS, animated: false, failOn: "warning" }).metadata();
    if (!metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096
        || metadata.width * metadata.height > MAX_PIXELS || (metadata.pages ?? 1) !== 1
        || !["png", "jpeg", "webp"].includes(metadata.format ?? "")) throw new Error("Invalid cutout dimensions");
    return { width: metadata.width, height: metadata.height };
}

export async function composeCutout(source: Buffer, mask: { data: Uint8Array | Uint8ClampedArray; width: number; height: number }, background: string | null) {
    const dimensions = await cutoutSourceSize(source);
    if (background !== null && !/^#[0-9a-f]{6}$/i.test(background)) throw new Error("Invalid background color");
    if (!(mask.data instanceof Uint8Array || mask.data instanceof Uint8ClampedArray) || mask.width !== dimensions.width || mask.height !== dimensions.height
        || mask.data.length !== dimensions.width * dimensions.height) throw new Error("Invalid alpha mask");
    const { data, info } = await sharp(source).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.channels !== 4) throw new Error("Invalid source channels");
    for (let pixel = 0; pixel < mask.data.length; pixel++) {
        const alpha = pixel * 4 + 3;
        data[alpha] = Math.round(data[alpha]! * mask.data[pixel]! / 255);
    }
    const image = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
    return (background === null ? image : image.flatten({ background })).png().toBuffer();
}

@Injectable()
export class CutoutService {
    private readonly logger = new Logger(CutoutService.name);

    constructor(
        @InjectRepository(StorageConfig) private readonly repository: Repository<StorageConfig>,
        private readonly storage: CloudStorageService,
    ) {}

    async ready() {
        return Boolean(await this.configuration());
    }

    billingRule() {
        const configured = process.env.IMAGE_STUDIO_CUTOUT_CREDITS_PER_IMAGE ?? "0";
        const power = Number(configured);
        if (!configured.trim() || !Number.isSafeInteger(power) || power < 0) throw new Error("CUTOUT_INVALID_PRICE");
        return { power };
    }

    private async configuration() {
        const config = await this.repository.findOne({ where: { isActive: true, storageType: "cos" } });
        return config?.config?.bucket && config.config.region && config.config.accessKey && config.config.secretKey ? config : null;
    }

    async generate(source: Buffer, background: string | null) {
        const dimensions = await cutoutSourceSize(source);
        if (background !== null && !/^#[0-9a-f]{6}$/i.test(background)) throw new Error("Invalid background color");
        const config = await this.configuration();
        if (!config) throw new Error("CUTOUT_NOT_CONFIGURED");
        const png = await sharp(source).png().toBuffer();
        const key = `image-studio/cutout-temp/${randomUUID()}/source.png`;
        try {
            await this.storage.upload({
                storageConfig: config, path: key, privateObject: true,
                file: { fieldname: "file", originalname: "source.png", encoding: "7bit", mimetype: "image/png",
                    size: png.length, buffer: png, destination: "", filename: "source.png", path: key, stream: Readable.from(png) },
            });
            const output = await this.storage.matting(config, key, 20 * 1024 * 1024);
            const metadata = await sharp(output, { limitInputPixels: MAX_PIXELS, failOn: "warning" }).metadata();
            if (metadata.format !== "png" || !metadata.hasAlpha || metadata.width !== dimensions.width
                || metadata.height !== dimensions.height || (metadata.pages ?? 1) !== 1) throw new Error("CUTOUT_INVALID_RESPONSE");
            const image = sharp(output);
            return (background === null ? image : image.flatten({ background })).png().toBuffer();
        } catch (error) {
            const detail = error as { statusCode?: number; code?: string; name?: string };
            if (detail.statusCode === 403 || detail.code === "AccessDenied") throw new Error("CUTOUT_ACCESS_DENIED");
            if (detail.statusCode === 451) throw new Error("CUTOUT_STORAGE_RESTRICTED");
            if (detail.statusCode === 400 || detail.statusCode === 404) throw new Error("CUTOUT_SERVICE_UNAVAILABLE");
            if (detail.name === "TimeoutError" || detail.name === "AbortError") throw new Error("CUTOUT_TIMEOUT");
            throw new Error("CUTOUT_FAILED");
        } finally {
            try { await this.storage.deleteObject(config, key); }
            catch { this.logger.warn(JSON.stringify({ event: "cutout_temporary_object_cleanup_failed", configId: config.id, key })); }
        }
    }
}