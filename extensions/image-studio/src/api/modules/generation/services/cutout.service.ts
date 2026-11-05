import { Injectable } from "@nestjs/common";
import path from "node:path";
import { stat } from "node:fs/promises";
import sharp from "sharp";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 4096 * 4096;
export const CUTOUT_MODEL = "onnx-community/BiRefNet_lite-ONNX";
const MODEL_REVISION = "de15b22ba131738a16dff04aab8bdf8dc32e3ac1";
export const CUTOUT_CACHE_DIRECTORY = path.resolve(process.cwd(), "..", "..", "extensions", "image-studio", "storage", "models");

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
    private engine?: Promise<Awaited<ReturnType<CutoutService["loadEngine"]>>>;
    private tail: Promise<void> = Promise.resolve();

    static async ready() {
        try {
            const directory = path.join(CUTOUT_CACHE_DIRECTORY, CUTOUT_MODEL, MODEL_REVISION);
            const model = await stat(path.join(directory, "onnx", "model.onnx"));
            const config = await stat(path.join(directory, "config.json"));
            const processor = await stat(path.join(directory, "preprocessor_config.json"));
            return model.isFile() && model.size === 224005088 && config.isFile() && processor.isFile();
        } catch { return false; }
    }

    private async loadEngine() {
        const library = await import("@huggingface/transformers");
        const model = await library.AutoModel.from_pretrained(CUTOUT_MODEL, {
            cache_dir: CUTOUT_CACHE_DIRECTORY, revision: MODEL_REVISION, local_files_only: true, dtype: "fp32", device: "cpu",
            session_options: { intraOpNumThreads: 1, interOpNumThreads: 1, graphOptimizationLevel: "disabled", enableCpuMemArena: false, enableMemPattern: false },
        });
        const processor = await library.AutoProcessor.from_pretrained(CUTOUT_MODEL, { cache_dir: CUTOUT_CACHE_DIRECTORY, revision: MODEL_REVISION, local_files_only: true });
        return { model, processor, RawImage: library.RawImage };
    }

    async generate(source: Buffer, background: string | null) {
        await cutoutSourceSize(source);
        if (background !== null && !/^#[0-9a-f]{6}$/i.test(background)) throw new Error("Invalid background color");
        const previous = this.tail;
        let release!: () => void;
        this.tail = new Promise<void>((resolve) => { release = resolve; });
        await previous;
        try {
            this.engine ??= this.loadEngine().catch((error) => { this.engine = undefined; throw error; });
            const { model, processor, RawImage } = await this.engine;
            const { data, info } = await sharp(source).toColourspace("srgb").removeAlpha().raw().toBuffer({ resolveWithObject: true });
            const image = new RawImage(new Uint8Array(data), info.width, info.height, 3);
            const { pixel_values } = await processor(image);
            const { output_image } = await model({ input_image: pixel_values });
            const mask = await RawImage.fromTensor(output_image[0].sigmoid().mul(255).to("uint8")).resize(info.width, info.height);
            if (mask.channels !== 1) throw new Error("Invalid model alpha channels");
            return await composeCutout(source, mask, background);
        } finally { release(); }
    }
}