import { MODEL_TYPES } from "@buildingai/ai-sdk";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { AiModel } from "@buildingai/db/entities";
import { Repository } from "@buildingai/db/typeorm";
import { HttpErrorFactory } from "@buildingai/errors";
import { PublicAiModelService } from "@buildingai/extension-sdk";
import { getProviderSecret } from "@buildingai/utils";
import { Injectable } from "@nestjs/common";
import { generateImage } from "ai";
import { randomUUID } from "crypto";
import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";

import {
    GeneratedImage,
    ImageGeneration,
    ImageGenerationStatus,
} from "../../../db/entities/image-generation.entity";
import { GenerateImageDto, QueryGenerationDto } from "../dto";

const APP_IDENTIFIER = "image-studio";

@Injectable()
export class GenerationService {
    constructor(
        @InjectRepository(ImageGeneration)
        private readonly generationRepository: Repository<ImageGeneration>,
        @InjectRepository(AiModel)
        private readonly modelRepository: Repository<AiModel>,
        private readonly publicAiModelService: PublicAiModelService,
    ) {}

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

        return { items, total, page: query.page, limit: query.limit };
    }

    async generate(userId: string, input: GenerateImageDto) {
        const model = await this.publicAiModelService.getModelInfo(input.modelId);
        if (
            !model.isActive ||
            !model.provider?.isActive ||
            model.modelType !== MODEL_TYPES.TEXT_TO_IMAGE
        ) {
            throw HttpErrorFactory.badRequest("所选图片模型不可用，请在模型管理中启用图片模型");
        }

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
        );

        try {
            const secretConfig = await this.publicAiModelService.getProviderConfig(model.id);
            const provider = await this.publicAiModelService.getProviderAdapter(model.id, {
                apiKey: getProviderSecret("apiKey", secretConfig),
                baseURL: getProviderSecret("baseUrl", secretConfig) || undefined,
            });
            const imageModel = provider.image(model.model).model;
            const result = await generateImage({
                model: imageModel,
                prompt: generation.prompt,
                size: input.size,
                n: input.count,
                providerOptions:
                    model.provider.provider === "openai"
                        ? { openai: { quality: input.quality, style: input.style } }
                        : undefined,
            });

            generation.images = await this.persistImages(
                generation.id,
                result.images.map((image) => ({
                    base64: image.base64,
                    mediaType: image.mediaType,
                })),
            );
            generation.status = ImageGenerationStatus.COMPLETED;
            generation.error = null;
            return await this.generationRepository.save(generation);
        } catch (error) {
            const message = error instanceof Error ? error.message : "图片生成失败";
            generation.status = ImageGenerationStatus.FAILED;
            generation.error = message;
            await this.generationRepository.save(generation);
            throw HttpErrorFactory.badRequest(message);
        }
    }

    async retry(userId: string, id: string) {
        const generation = await this.findOwned(userId, id);
        return this.generate(userId, {
            prompt: generation.prompt,
            modelId: generation.modelId,
            size: generation.size as GenerateImageDto["size"],
            quality: generation.quality as GenerateImageDto["quality"],
            style: generation.style as GenerateImageDto["style"],
            count: generation.count,
        });
    }

    async remove(userId: string, id: string) {
        const generation = await this.findOwned(userId, id);
        await Promise.all(generation.images.map((image) => this.removeImage(image.url)));
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

    private async persistImages(
        generationId: string,
        images: Array<{ base64: string; mediaType: string }>,
    ): Promise<GeneratedImage[]> {
        const outputDir = path.join(
            process.cwd(),
            "..",
            "..",
            "extensions",
            APP_IDENTIFIER,
            "storage",
            "uploads",
            "generated",
        );
        await mkdir(outputDir, { recursive: true });

        return Promise.all(
            images.map(async (image, index) => {
                const extension = image.mediaType === "image/jpeg" ? "jpg" : "png";
                const filename = `${generationId}-${index + 1}-${randomUUID()}.${extension}`;
                await writeFile(path.join(outputDir, filename), Buffer.from(image.base64, "base64"));
                return {
                    url: `/${APP_IDENTIFIER}/uploads/generated/${filename}`,
                    mediaType: image.mediaType,
                };
            }),
        );
    }

    private async removeImage(url: string) {
        const filename = path.basename(url);
        const filePath = path.join(
            process.cwd(),
            "..",
            "..",
            "extensions",
            APP_IDENTIFIER,
            "storage",
            "uploads",
            "generated",
            filename,
        );
        await rm(filePath, { force: true });
    }
}