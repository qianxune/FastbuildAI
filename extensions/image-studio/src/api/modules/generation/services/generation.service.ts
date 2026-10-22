import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { Repository } from "@buildingai/db/typeorm";
import { HttpErrorFactory } from "@buildingai/errors";
import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { generateImage } from "ai";
import type { Queue } from "bullmq";
import {
    mainImagePrompt,
    mainImageSize,
    mainImageVariants,
    type MainImageInput,
} from "../../../shared/main-image";
import {
    GENERATION_FAILED,
    GENERATION_QUEUE,
    type GenerationJobData,
    MODEL_UNAVAILABLE,
} from "../constants/generation.constants";
import { GenerationModelService } from "./generation-model.service";
import { GenerationImageService } from "./generation-image.service";
import { ProductImageService, type ProductImageUpload } from "./product-image.service";

import {
    GeneratedImage,
    ImageGeneration,
    ImageGenerationStatus,
} from "../../../db/entities/image-generation.entity";
import { GenerateImageDto, MainImageDto, QueryGenerationDto } from "../dto";

export { GENERATION_QUEUE, type GenerationJobData } from "../constants/generation.constants";

@Injectable()
export class GenerationService {
    constructor(
        @InjectRepository(ImageGeneration)
        private readonly generationRepository: Repository<ImageGeneration>,
        private readonly generationModelService: GenerationModelService,
        private readonly generationImageService: GenerationImageService,
        @InjectQueue(GENERATION_QUEUE)
        private readonly generationQueue: Queue<GenerationJobData>,
        private readonly productImageService: ProductImageService,
    ) {}

    async capabilities() {
        return this.generationModelService.capabilities();
    }

    async listModels() {
        return this.generationModelService.listModels();
    }

    async list(userId: string, query: QueryGenerationDto) {
        const [items, total] = await this.generationRepository.findAndCount({
            where: { userId },
            order: { createdAt: "DESC" },
            skip: (query.page - 1) * query.limit,
            take: query.limit,
        });

        return {
            items: items.map((item) => this.publicRecord(item)),
            total,
            page: query.page,
            limit: query.limit,
        };
    }

    async generate(userId: string, input: GenerateImageDto) {
        const { model, imageModel } = await this.generationModelService.prepare(input.modelId);
        const generation = await this.generationRepository
            .save(
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
            )
            .catch(() => {
                throw HttpErrorFactory.badRequest(GENERATION_FAILED);
            });

        try {
            const result = await this.infer(generation, { model, imageModel });

            generation.images = await this.generationImageService.persist(
                generation.id,
                result.images.map((image) => ({
                    base64: image.base64,
                    mediaType: image.mediaType,
                })),
            );
            const completed = await this.generationRepository.update(
                {
                    id: generation.id,
                    userId,
                    status: ImageGenerationStatus.PROCESSING,
                },
                { status: ImageGenerationStatus.COMPLETED, images: generation.images, error: null },
            );
            if (!completed.affected) {
                await this.generationImageService.cleanup(generation.id, generation.images);
                generation.images = [];
                return this.get(userId, generation.id);
            }
            generation.status = ImageGenerationStatus.COMPLETED;
            generation.error = null;
            generation.updatedAt = new Date();
            return this.publicRecord(generation);
        } catch {
            await this.generationImageService.cleanup(generation.id, generation.images);
            await this.failTask({ id: generation.id, userId }).catch(() => undefined);
            throw HttpErrorFactory.badRequest(GENERATION_FAILED);
        }
    }

    async retry(userId: string, id: string) {
        const generation = await this.findOwned(userId, id);
        if (generation.toolKey === "main" && generation.mainInput)
            return this.submitMain(userId, generation.mainInput);
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

    private async infer(
        generation: ImageGeneration,
        prepared: Awaited<ReturnType<GenerationModelService["prepare"]>>,
    ) {
        if (generation.toolKey === "main" && generation.mainInput) {
            if (
                !("supportsReferenceImages" in prepared.imageModel) ||
                prepared.imageModel.supportsReferenceImages !== true
            ) {
                throw new Error(MODEL_UNAVAILABLE);
            }
            const references = await this.readProductImages(
                generation.userId,
                generation.mainInput.assetIds,
            );
            const images: Array<{ base64: string; mediaType: string }> = [];
            const deadline = AbortSignal.timeout(5 * 60 * 1000);
            for (const type of mainImageVariants(generation.mainInput)) {
                const current = await this.findOwned(generation.userId, generation.id);
                if (current.status !== ImageGenerationStatus.PROCESSING)
                    throw new Error("Task cancelled");
                const result = await generateImage({
                    model: prepared.imageModel,
                    prompt: {
                        text: mainImagePrompt(generation.mainInput, type),
                        images: references,
                    },
                    size: mainImageSize(generation.mainInput),
                    n: 1,
                    maxRetries: 0,
                    abortSignal: deadline,
                });
                if (result.images.length !== 1) throw new Error(GENERATION_FAILED);
                images.push({
                    base64: result.images[0].base64,
                    mediaType: result.images[0].mediaType,
                });
            }
            return { images };
        }
        return generateImage({
            model: prepared.imageModel,
            prompt: generation.prompt,
            size: generation.size as GenerateImageDto["size"],
            n: generation.count,
            maxRetries: 0,
            abortSignal: AbortSignal.timeout(5 * 60 * 1000),
            providerOptions:
                prepared.model.provider.provider === "openai"
                    ? { openai: { quality: generation.quality, style: generation.style } }
                    : undefined,
        });
    }

    async get(userId: string, id: string) {
        return this.publicRecord(await this.findOwned(userId, id));
    }

    async submit(userId: string, input: GenerateImageDto) {
        const { model } = await this.generationModelService.prepare(input.modelId);
        const generation = await this.generationRepository
            .save(
                this.generationRepository.create({
                    userId,
                    prompt: input.prompt.trim(),
                    modelId: model.id,
                    modelName: model.name,
                    size: input.size,
                    quality: input.quality,
                    style: input.style,
                    count: input.count,
                    status: ImageGenerationStatus.QUEUED,
                    images: [],
                    error: null,
                }),
            )
            .catch(() => {
                throw HttpErrorFactory.badRequest(GENERATION_FAILED);
            });
        try {
            await this.generationQueue.add(
                "generate",
                { id: generation.id, userId },
                {
                    jobId: generation.id,
                    attempts: 1,
                    removeOnComplete: true,
                    removeOnFail: true,
                },
            );
        } catch {
            await this.failTask({ id: generation.id, userId }).catch(() => undefined);
            throw HttpErrorFactory.badRequest(GENERATION_FAILED);
        }
        return this.publicRecord(generation);
    }

    async retryTask(userId: string, id: string) {
        const generation = await this.findOwned(userId, id);
        if (generation.toolKey === "main" && generation.mainInput)
            return this.submitMain(userId, generation.mainInput);
        return this.submit(userId, this.generationInput(generation));
    }

    async readProductImage(userId: string, id: string) {
        return this.productImageService.read(userId, id);
    }

    async listProductImages(userId: string) {
        return this.productImageService.list(userId);
    }

    private async readProductImages(userId: string, ids: string[]) {
        return Promise.all(ids.map((id) => this.readProductImage(userId, id)));
    }

    async submitMain(userId: string, input: MainImageDto | MainImageInput) {
        const total = Object.values(input.counts).reduce((sum, count) => sum + count, 0);
        if (!Number.isInteger(total) || total < 1 || total > 4)
            throw HttpErrorFactory.badRequest("请选择 1–4 张配图");
        const { imageModel, model } = await this.generationModelService.prepare(input.modelId);
        if (
            !("supportsReferenceImages" in imageModel) ||
            imageModel.supportsReferenceImages !== true
        ) {
            throw HttpErrorFactory.badRequest("所选模型不支持商品参考图，请选择火山引擎图片模型");
        }
        const generation = await this.withProductLock(userId, async (repository) => {
            await this.readProductImages(userId, input.assetIds);
            return repository
                .save(
                    repository.create({
                        userId,
                        toolKey: "main",
                        mainInput: input,
                        prompt: input.productName,
                        modelId: model.id,
                        modelName: model.name,
                        size: mainImageSize(input),
                        quality: input.resolution,
                        style: "product",
                        count: total,
                        status: ImageGenerationStatus.QUEUED,
                        images: [],
                        error: null,
                    }),
                )
                .catch(() => {
                    throw HttpErrorFactory.badRequest(GENERATION_FAILED);
                });
        });
        try {
            await this.generationQueue.add(
                "generate",
                { id: generation.id, userId },
                {
                    jobId: generation.id,
                    attempts: 1,
                    removeOnComplete: true,
                    removeOnFail: true,
                },
            );
        } catch {
            await this.failTask({ id: generation.id, userId }).catch(() => undefined);
            throw HttpErrorFactory.badRequest(GENERATION_FAILED);
        }
        return this.publicRecord(generation);
    }

    async removeProductImage(userId: string, id: string) {
        return this.withProductLock(userId, async (repository) => {
            const used = await repository
                .createQueryBuilder("generation")
                .where("generation.userId = :userId", { userId })
                .andWhere("generation.mainInput @> CAST(:input AS jsonb)", {
                    input: JSON.stringify({ assetIds: [id] }),
                })
                .getExists();
            if (used) throw HttpErrorFactory.badRequest("商品图已用于生成记录，请先删除相关记录");
            return this.productImageService.remove(userId, id);
        });
    }

    async uploadProductImage(userId: string, file?: ProductImageUpload) {
        return this.withProductLock(userId, async () => {
            return this.productImageService.upload(userId, file);
        });
    }

    private withProductLock<T>(
        userId: string,
        operation: (repository: Repository<ImageGeneration>) => Promise<T>,
    ) {
        return this.generationRepository.manager.transaction(async (manager) => {
            await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
                `image-studio-products:${userId}`,
            ]);
            return operation(manager.getRepository(ImageGeneration));
        });
    }

    async cancel(userId: string, id: string) {
        const generation = await this.findOwned(userId, id);
        if (
            ![ImageGenerationStatus.QUEUED, ImageGenerationStatus.PROCESSING].includes(
                generation.status,
            )
        ) {
            return this.publicRecord(generation);
        }
        const result = await this.generationRepository
            .update(
                [
                    { id, userId, status: ImageGenerationStatus.QUEUED },
                    { id, userId, status: ImageGenerationStatus.PROCESSING },
                ],
                { status: ImageGenerationStatus.CANCELLED, images: [], error: null },
            )
            .catch(() => {
                throw HttpErrorFactory.badRequest(GENERATION_FAILED);
            });
        if (result.affected) {
            try {
                const job = await this.generationQueue.getJob(id);
                await job?.remove();
            } catch {}
        }
        return this.get(userId, id);
    }

    async processTask(data: GenerationJobData) {
        const claimed = await this.generationRepository
            .update(
                {
                    ...data,
                    status: ImageGenerationStatus.QUEUED,
                },
                { status: ImageGenerationStatus.PROCESSING },
            )
            .catch(() => {
                throw new Error(GENERATION_FAILED);
            });
        if (!claimed.affected) return;
        let images: GeneratedImage[] = [];
        try {
            const generation = await this.findOwned(data.userId, data.id);
            if (generation.status !== ImageGenerationStatus.PROCESSING) return;
            const prepared = await this.generationModelService.prepare(generation.modelId);
            const current = await this.findOwned(data.userId, data.id);
            if (current.status !== ImageGenerationStatus.PROCESSING) return;
            const result = await this.infer(generation, prepared);
            images = await this.generationImageService.persist(
                data.id,
                result.images.map((image) => ({
                    base64: image.base64,
                    mediaType: image.mediaType,
                })),
            );
            const completed = await this.generationRepository.update(
                {
                    ...data,
                    status: ImageGenerationStatus.PROCESSING,
                },
                { status: ImageGenerationStatus.COMPLETED, images, error: null },
            );
            if (completed.affected) return;
        } catch {
            await this.generationImageService.cleanup(data.id, images);
            await this.failTask(data);
            throw new Error(GENERATION_FAILED);
        }
        await this.generationImageService.cleanup(data.id, images);
    }

    async failTask(data: GenerationJobData) {
        await this.generationRepository
            .update(
                [
                    { ...data, status: ImageGenerationStatus.QUEUED },
                    { ...data, status: ImageGenerationStatus.PROCESSING },
                ],
                { status: ImageGenerationStatus.FAILED, images: [], error: GENERATION_FAILED },
            )
            .catch(() => {
                throw new Error(GENERATION_FAILED);
            });
    }

    async failStalledTask(id: string) {
        const job = await this.generationQueue.getJob(id);
        if (job) await this.failTask(job.data);
    }

    async remove(userId: string, id: string) {
        const generation = await this.findOwned(userId, id);
        if (
            [ImageGenerationStatus.QUEUED, ImageGenerationStatus.PROCESSING].includes(
                generation.status,
            )
        ) {
            throw HttpErrorFactory.badRequest("生成中的记录不可删除");
        }
        await this.generationImageService.remove(generation.id, generation.images);
        await this.generationRepository.remove(generation);
        return { success: true };
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
        return this.generationImageService.read(generation.id, index, generation.images[index]);
    }

    private publicRecord(generation: ImageGeneration) {
        return {
            ...generation,
            error: generation.error ? GENERATION_FAILED : null,
            images: generation.images.map((image, index) => ({
                mediaType: image.mediaType,
                url: this.generationImageService.url(generation.id, index),
            })),
        };
    }
}
