import { getProvider, MODEL_FEATURES, MODEL_TYPES } from "@buildingai/ai-sdk";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { AiModel } from "@buildingai/db/entities";
import { Repository } from "@buildingai/db/typeorm";
import { HttpErrorFactory } from "@buildingai/errors";
import { PublicAiModelService } from "@buildingai/extension-sdk";
import { getProviderSecret } from "@buildingai/utils";
import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { generateImage } from "ai";
import type { Queue } from "bullmq";
import { lstat, mkdir, readFile, realpath, rm, writeFile } from "fs/promises";
import path from "path";

import {
    type CapabilityModel,
    type GenerationCapabilities,
    TOOL_KEYS,
    TOOL_REGISTRY,
    type ToolCapability,
    type ToolDefinition,
} from "../../../shared/tools";
import {
    GeneratedImage,
    ImageGeneration,
    ImageGenerationStatus,
} from "../../../db/entities/image-generation.entity";
import { GenerateImageDto, QueryGenerationDto } from "../dto";

const APP_IDENTIFIER = "image-studio";
export const GENERATION_QUEUE = "image-studio-generation";
export interface GenerationJobData {
    id: string;
    userId: string;
}
const GENERATION_FAILED = "图片生成失败，请稍后重试";
const MODEL_UNAVAILABLE = "所选图片模型不可用，请在模型管理中启用图片模型";
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const IMAGE_EXTENSIONS: Record<string, string> = {
    "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
};

@Injectable()
export class GenerationService {
    constructor(
        @InjectRepository(ImageGeneration)
        private readonly generationRepository: Repository<ImageGeneration>,
        @InjectRepository(AiModel)
        private readonly modelRepository: Repository<AiModel>,
        private readonly publicAiModelService: PublicAiModelService,
        @InjectQueue(GENERATION_QUEUE)
        private readonly generationQueue?: Queue<GenerationJobData>,
    ) {}

    async capabilities(): Promise<GenerationCapabilities> {
        const configuredModels = await this.modelRepository.find({
            where: [
                { modelType: MODEL_TYPES.TEXT_TO_IMAGE, isActive: true, provider: { isActive: true } },
                { modelType: MODEL_TYPES.LLM, isActive: true, provider: { isActive: true } },
            ],
            relations: ["provider"],
            order: { sortOrder: "DESC", createdAt: "DESC" },
        });
        const models: CapabilityModel[] = [];

        for (const model of configuredModels) {
            if (!model.isActive || !model.provider?.isActive) continue;
            const capabilities: ToolCapability[] = [];
            try {
                const provider = getProvider(model.provider.provider, {
                    apiKey: "capability-probe-not-a-credential",
                });
                if (model.modelType === MODEL_TYPES.TEXT_TO_IMAGE) {
                    this.requireImageModel(provider, model.model);
                    capabilities.push("text-to-image");
                }
                if (model.modelType === MODEL_TYPES.LLM &&
                    model.features?.includes(MODEL_FEATURES.VISION) && provider.supports("language")) {
                    const languageModel = provider.languageModel(model.model);
                    if (languageModel?.specificationVersion === "v3" &&
                        typeof languageModel.doGenerate === "function" &&
                        typeof languageModel.doStream === "function") {
                        capabilities.push("vision");
                    }
                }
            } catch {
                continue;
            }
            if (capabilities.length === 0) continue;
            models.push({
                id: model.id,
                name: model.name,
                model: model.model,
                provider: model.provider.name,
                providerCode: model.provider.provider,
                capabilities,
            });
        }

        return {
            models,
            tools: TOOL_KEYS.map((key) => {
                const definition: ToolDefinition = TOOL_REGISTRY[key];
                const modelIdsByCapability: Partial<Record<ToolCapability, string[]>> = {};
                for (const capability of definition.requiredCapabilities) {
                    modelIdsByCapability[capability] = models
                        .filter((model) => model.capabilities.includes(capability))
                        .map((model) => model.id);
                }
                const disabled = definition.status === "disabled";
                const supported = !disabled && definition.requiredCapabilities.every(
                    (capability) => modelIdsByCapability[capability]!.length > 0,
                );
                return {
                    key,
                    status: supported ? "available" : "unavailable",
                    requiredCapabilities: definition.requiredCapabilities,
                    modelIdsByCapability,
                    reason: disabled ? "tool_disabled" : supported ? null : "unsupported_capabilities",
                    limits: { sizes: null, maxInputImages: null },
                };
            }),
        };
    }

    async listModels() {
        const models = await this.modelRepository.find({
            where: {
                modelType: MODEL_TYPES.TEXT_TO_IMAGE,
                isActive: true,
                provider: { isActive: true },
            },
            relations: ["provider"],
            order: { sortOrder: "DESC", createdAt: "DESC" },
        });

        return models.map((model) => ({
            id: model.id,
            name: model.name,
            model: model.model,
            provider: model.provider.name,
            providerCode: model.provider.provider,
            description: model.description,
        }));
    }

    async list(userId: string, query: QueryGenerationDto) {
        const [items, total] = await this.generationRepository.findAndCount({
            where: { userId },
            order: { createdAt: "DESC" },
            skip: (query.page - 1) * query.limit,
            take: query.limit,
        });

        return { items: items.map((item) => this.publicRecord(item)), total, page: query.page, limit: query.limit };
    }

    private async prepare(input: GenerateImageDto) {
        const model = await this.publicAiModelService.getModelInfo(input.modelId).catch(() => {
            throw HttpErrorFactory.badRequest(MODEL_UNAVAILABLE);
        });
        if (
            !model.isActive ||
            !model.provider?.isActive ||
            model.modelType !== MODEL_TYPES.TEXT_TO_IMAGE
        ) {
            throw HttpErrorFactory.badRequest(MODEL_UNAVAILABLE);
        }

        const imageModel = await (async () => {
            try {
                const secretConfig = await this.publicAiModelService.getProviderConfig(model.id);
                const provider = await this.publicAiModelService.getProviderAdapter(model.id, {
                    apiKey: getProviderSecret("apiKey", secretConfig),
                    baseURL: getProviderSecret("baseUrl", secretConfig) || undefined,
                });
                return this.requireImageModel(provider, model.model);
            } catch {
                throw HttpErrorFactory.badRequest(MODEL_UNAVAILABLE);
            }
        })();

        return { model, imageModel };
    }

    async generate(userId: string, input: GenerateImageDto) {
        const { model, imageModel } = await this.prepare(input);
        const generation = await this.generationRepository.save(
            this.generationRepository.create({
                userId,
                prompt: input.prompt.trim(),
                modelId: model.id,
                modelName: model.name,
                size: input.size,
                quality: input.quality,
                style: input.style,
                count: input.count,
                status: ImageGenerationStatus.PROCESSING,
                images: [],
            }),
        ).catch(() => { throw HttpErrorFactory.badRequest(GENERATION_FAILED); });

        try {
            const result = await this.infer(generation, { model, imageModel });

            generation.images = await this.persistImages(
                generation.id,
                result.images.map((image) => ({
                    base64: image.base64,
                    mediaType: image.mediaType,
                })),
            );
            const completed = await this.generationRepository.update({
                id: generation.id, userId, status: ImageGenerationStatus.PROCESSING,
            }, { status: ImageGenerationStatus.COMPLETED, images: generation.images, error: null });
            if (!completed.affected) {
                await this.cleanupTaskImages(generation.id, generation.images);
                generation.images = [];
                return this.get(userId, generation.id);
            }
            generation.status = ImageGenerationStatus.COMPLETED;
            generation.error = null;
            generation.updatedAt = new Date();
            return this.publicRecord(generation);
        } catch {
            await this.cleanupTaskImages(generation.id, generation.images);
            await this.failTask({ id: generation.id, userId }).catch(() => undefined);
            throw HttpErrorFactory.badRequest(GENERATION_FAILED);
        }
    }

    async retry(userId: string, id: string) {
        const generation = await this.findOwned(userId, id);
        return this.generate(userId, this.generationInput(generation));
    }

    private generationInput(generation: ImageGeneration): GenerateImageDto {
        return {
            prompt: generation.prompt,
            modelId: generation.modelId,
            size: generation.size as GenerateImageDto["size"],
            quality: generation.quality as GenerateImageDto["quality"],
            style: generation.style as GenerateImageDto["style"],
            count: generation.count,
        };
    }

    private infer(generation: ImageGeneration, prepared: Awaited<ReturnType<GenerationService["prepare"]>>) {
        return generateImage({
            model: prepared.imageModel,
            prompt: generation.prompt,
            size: generation.size as GenerateImageDto["size"],
            n: generation.count,
            maxRetries: 0,
            abortSignal: AbortSignal.timeout(5 * 60 * 1000),
            providerOptions: prepared.model.provider.provider === "openai"
                ? { openai: { quality: generation.quality, style: generation.style } }
                : undefined,
        });
    }

    async get(userId: string, id: string) {
        return this.publicRecord(await this.findOwned(userId, id));
    }

    async submit(userId: string, input: GenerateImageDto) {
        const { model } = await this.prepare(input);
        const generation = await this.generationRepository.save(this.generationRepository.create({
            userId, prompt: input.prompt.trim(), modelId: model.id, modelName: model.name,
            size: input.size, quality: input.quality, style: input.style, count: input.count,
            status: ImageGenerationStatus.QUEUED, images: [], error: null,
        })).catch(() => { throw HttpErrorFactory.badRequest(GENERATION_FAILED); });
        try {
            if (!this.generationQueue) throw new Error(GENERATION_FAILED);
            await this.generationQueue.add("generate", { id: generation.id, userId }, {
                jobId: generation.id, attempts: 1, removeOnComplete: true, removeOnFail: true,
            });
        } catch {
            await this.failTask({ id: generation.id, userId }).catch(() => undefined);
            throw HttpErrorFactory.badRequest(GENERATION_FAILED);
        }
        return this.publicRecord(generation);
    }

    async retryTask(userId: string, id: string) {
        const generation = await this.findOwned(userId, id);
        return this.submit(userId, this.generationInput(generation));
    }

    async cancel(userId: string, id: string) {
        const generation = await this.findOwned(userId, id);
        if (![ImageGenerationStatus.QUEUED, ImageGenerationStatus.PROCESSING].includes(generation.status)) {
            return this.publicRecord(generation);
        }
        const result = await this.generationRepository.update([
            { id, userId, status: ImageGenerationStatus.QUEUED },
            { id, userId, status: ImageGenerationStatus.PROCESSING },
        ], { status: ImageGenerationStatus.CANCELLED, images: [], error: null })
            .catch(() => { throw HttpErrorFactory.badRequest(GENERATION_FAILED); });
        if (result.affected) {
            try {
                const job = await this.generationQueue?.getJob(id);
                await job?.remove();
            } catch {}
        }
        return this.get(userId, id);
    }

    async processTask(data: GenerationJobData) {
        const claimed = await this.generationRepository.update({
            ...data, status: ImageGenerationStatus.QUEUED,
        }, { status: ImageGenerationStatus.PROCESSING })
            .catch(() => { throw new Error(GENERATION_FAILED); });
        if (!claimed.affected) return;
        let images: GeneratedImage[] = [];
        try {
            const generation = await this.findOwned(data.userId, data.id);
            if (generation.status !== ImageGenerationStatus.PROCESSING) return;
            const prepared = await this.prepare(this.generationInput(generation));
            const current = await this.findOwned(data.userId, data.id);
            if (current.status !== ImageGenerationStatus.PROCESSING) return;
            const result = await this.infer(generation, prepared);
            images = await this.persistImages(data.id, result.images.map((image) => ({
                base64: image.base64, mediaType: image.mediaType,
            })));
            const completed = await this.generationRepository.update({
                ...data, status: ImageGenerationStatus.PROCESSING,
            }, { status: ImageGenerationStatus.COMPLETED, images, error: null });
            if (completed.affected) return;
        } catch {
            await this.cleanupTaskImages(data.id, images);
            await this.failTask(data);
            throw new Error(GENERATION_FAILED);
        }
        await this.cleanupTaskImages(data.id, images);
    }

    async failTask(data: GenerationJobData) {
        await this.generationRepository.update([
            { ...data, status: ImageGenerationStatus.QUEUED },
            { ...data, status: ImageGenerationStatus.PROCESSING },
        ], { status: ImageGenerationStatus.FAILED, images: [], error: GENERATION_FAILED })
            .catch(() => { throw new Error(GENERATION_FAILED); });
    }

    async failStalledTask(id: string) {
        const job = await this.generationQueue?.getJob(id);
        if (job) await this.failTask(job.data);
    }

    private cleanupTaskImages(id: string, images: GeneratedImage[]) {
        return this.cleanupFiles(images.map((image, index) =>
            path.join(this.storageDirectory(), `${id}-${index}.${IMAGE_EXTENSIONS[image.mediaType]}`),
        ));
    }

    async remove(userId: string, id: string) {
        const generation = await this.findOwned(userId, id);
        if ([ImageGenerationStatus.QUEUED, ImageGenerationStatus.PROCESSING].includes(generation.status)) {
            throw HttpErrorFactory.badRequest("生成中的记录不可删除");
        }
        await Promise.all(generation.images.map(async (image, index) => {
            const location = this.imageLocation(generation.id, index, image);
            try {
                await rm(await this.checkedPath(location.directory, location.filename), { force: true });
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                    throw HttpErrorFactory.badRequest("图片删除失败，请稍后重试");
                }
            }
        }));
        await this.generationRepository.remove(generation);
        return { success: true };
    }

    private requireImageModel(provider: ReturnType<typeof getProvider>, model: string) {
        if (!provider.supports("image")) throw new Error(MODEL_UNAVAILABLE);
        const imageModel = provider.image(model).model;
        if (imageModel?.specificationVersion !== "v3" || typeof imageModel.doGenerate !== "function") {
            throw new Error(MODEL_UNAVAILABLE);
        }
        return imageModel;
    }

    private async findOwned(userId: string, id: string) {
        const generation = await this.generationRepository.findOne({ where: { id, userId } });
        if (!generation) {
            throw HttpErrorFactory.notFound("生成记录不存在");
        }
        return generation;
    }

    async readImage(userId: string, id: string, index: number) {
        const generation = await this.findOwned(userId, id);
        if (!Number.isInteger(index) || index < 0 || index >= generation.images.length) {
            throw HttpErrorFactory.notFound("图片不存在");
        }
        const image = generation.images[index];
        const location = this.imageLocation(generation.id, index, image);
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

    private imageUrl(id: string, index: number) {
        const prefix = (process.env.VITE_APP_WEB_API_PREFIX || "api").replace(/^\/+|\/+$/g, "");
        return `/${APP_IDENTIFIER}/${prefix}/generations/${id}/images/${index}`;
    }

    private publicRecord(generation: ImageGeneration) {
        return {
            ...generation,
            error: generation.error ? GENERATION_FAILED : null,
            images: generation.images.map((image, index) => ({
                mediaType: image.mediaType, url: this.imageUrl(generation.id, index),
            })),
        };
    }

    private storageDirectory(legacy = false) {
        return path.join(process.cwd(), "..", "..", "extensions", APP_IDENTIFIER, "storage",
            legacy ? "uploads" : "private", "generated");
    }

    private imageLocation(id: string, index: number, image: GeneratedImage) {
        if (!new RegExp(`^${UUID_PATTERN}$`, "i").test(id) ||
            !Number.isInteger(index) || index < 0 || index >= 4 ||
            !Object.hasOwn(IMAGE_EXTENSIONS, image.mediaType)) {
            throw HttpErrorFactory.notFound("图片不存在或格式不受支持");
        }
        if (image.url === this.imageUrl(id, index)) {
            return { directory: this.storageDirectory(), filename: `${id}-${index}.${IMAGE_EXTENSIONS[image.mediaType]}` };
        }
        const legacyPrefix = `/${APP_IDENTIFIER}/uploads/generated/`;
        const filename = image.url.startsWith(legacyPrefix) ? image.url.slice(legacyPrefix.length) : "";
        const legacyExtension = image.mediaType === "image/jpeg" ? "jpg" : "png";
        if (!new RegExp(`^${id}-${index + 1}-${UUID_PATTERN}\\.${legacyExtension}$`, "i").test(filename)) {
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
        const valid = mediaType === "image/png"
            ? buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
            : mediaType === "image/jpeg"
                ? buffer.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex")) &&
                    buffer.subarray(-2).equals(Buffer.from("ffd9", "hex"))
                : mediaType === "image/webp" && buffer.length >= 12 &&
                    buffer.toString("ascii", 0, 4) === "RIFF" &&
                    buffer.toString("ascii", 8, 12) === "WEBP" && buffer.readUInt32LE(4) === buffer.length - 8;
        if (!valid || buffer.length > MAX_IMAGE_BYTES) throw new Error(GENERATION_FAILED);
    }

    private async persistImages(
        generationId: string,
        images: Array<{ base64: string; mediaType: string }>,
    ): Promise<GeneratedImage[]> {
        if (!new RegExp(`^${UUID_PATTERN}$`, "i").test(generationId) || images.length < 1 || images.length > 4) {
            throw new Error(GENERATION_FAILED);
        }
        const decoded = images.map((image) => {
            if (!Object.hasOwn(IMAGE_EXTENSIONS, image.mediaType) || typeof image.base64 !== "string" ||
                image.base64.length > 4 * Math.ceil(MAX_IMAGE_BYTES / 3) ||
                !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image.base64)) {
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
                    if ((error as NodeJS.ErrnoException).code !== "EEXIST") writtenFiles.push(destination);
                    throw error;
                }
                writtenFiles.push(destination);
                persisted.push({
                    url: this.imageUrl(generationId, index),
                    mediaType: image.mediaType,
                });
            }
            return persisted;
        } catch (error) {
            await this.cleanupFiles(writtenFiles);
            throw error;
        }
    }

    private async cleanupFiles(filenames: string[]) {
        await Promise.allSettled(filenames.map((filename) => rm(filename, { force: true })));
    }

}