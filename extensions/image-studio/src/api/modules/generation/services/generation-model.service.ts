import { getProvider, getReasoningOptions, MODEL_FEATURES, MODEL_TYPES } from "@buildingai/ai-sdk";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { AiModel } from "@buildingai/db/entities";
import { Repository } from "@buildingai/db/typeorm";
import { HttpErrorFactory } from "@buildingai/errors";
import { PublicAiModelService } from "@buildingai/extension-sdk";
import { getProviderSecret } from "@buildingai/utils";
import { Injectable } from "@nestjs/common";

import {
    type CapabilityModel,
    type GenerationCapabilities,
    TOOL_KEYS,
    TOOL_REGISTRY,
    LOCAL_CUTOUT_MODEL_ID,
    type ToolCapability,
    type ToolDefinition,
} from "../../../shared/tools";
import { MODEL_UNAVAILABLE } from "../constants/generation.constants";
import { quoteGenerationCredits, type GenerationQuoteTool } from "../../../shared/billing";
import { isToolEditKey, toolReferenceLimit, TOOL_RATIOS } from "../../../shared/tool-workflow";
import { CUTOUT_MODEL, CutoutService } from "./cutout.service";

@Injectable()
export class GenerationModelService {
    /** 注入公共模型仓储及模型配置、密钥和适配器读取服务。 */
    constructor(
        @InjectRepository(AiModel)
        private readonly modelRepository: Repository<AiModel>,
        private readonly publicAiModelService: PublicAiModelService,
        private readonly cutoutService?: CutoutService,
    ) {}

    /** 根据已启用配置及适配器接口推导工具能力，不调用供应商或验证真实密钥权限。 */
    async capabilities(): Promise<GenerationCapabilities> {
        const configuredModels = await this.modelRepository.find({
            where: [
                {
                    modelType: MODEL_TYPES.TEXT_TO_IMAGE,
                    isActive: true,
                    provider: { isActive: true },
                },
                { modelType: MODEL_TYPES.LLM, isActive: true, provider: { isActive: true } },
            ],
            relations: ["provider"],
            order: { sortOrder: "DESC", createdAt: "DESC" },
        });
        const models: CapabilityModel[] = [];

        for (const model of configuredModels) {
            if (!model.isActive || !model.provider?.isActive) continue;
            const capabilities: ToolCapability[] = [];
            let maxReferenceImages = 0;
            try {
                const provider = getProvider(model.provider.provider, {
                    apiKey: "capability-probe-not-a-credential",
                });
                if (model.modelType === MODEL_TYPES.TEXT_TO_IMAGE) {
                    const imageModel = this.requireImageModel(provider, model.model);
                    capabilities.push("text-to-image");
                    if (
                        "supportsReferenceImages" in imageModel &&
                        imageModel.supportsReferenceImages === true
                    ) {
                        maxReferenceImages = toolReferenceLimit(imageModel);
                        if (maxReferenceImages > 0) capabilities.push("reference-image");
                        if (maxReferenceImages >= 2) capabilities.push("multi-image");
                    }
                }
                if (
                    model.modelType === MODEL_TYPES.LLM &&
                    model.features?.includes(MODEL_FEATURES.VISION) &&
                    provider.supports("language")
                ) {
                    const languageModel = provider.languageModel(model.model);
                    if (
                        languageModel?.specificationVersion === "v3" &&
                        typeof languageModel.doGenerate === "function" &&
                        typeof languageModel.doStream === "function"
                    ) {
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
                maxReferenceImages,
            });
        }

        if (await this.cutoutService?.ready()) models.push({ id: LOCAL_CUTOUT_MODEL_ID, name: "腾讯云智能抠图", model: CUTOUT_MODEL,
            provider: "腾讯云数据万象", providerCode: "tencent-ci", capabilities: ["segmentation"], maxReferenceImages: 1 });
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
                const eligibleModels = models.filter((model) => definition.requiredCapabilities.every(
                    (capability) => model.capabilities.includes(capability),
                ));
                const supported =
                    !disabled &&
                    eligibleModels.length > 0;
                return {
                    key,
                    status: supported ? "available" : "unavailable",
                    requiredCapabilities: definition.requiredCapabilities,
                    modelIdsByCapability,
                    reason: disabled
                        ? "tool_disabled"
                        : supported
                          ? null
                          : "unsupported_capabilities",
                    limits: {
                        sizes: key === "cutout" ? null : isToolEditKey(key) ? TOOL_RATIOS : null,
                        maxInputImages: key === "main" || key === "suggest" ? 5 : isToolEditKey(key)
                            ? Math.max(0, ...eligibleModels.map((model) => model.maxReferenceImages ?? 0)) : null,
                    },
                };
            }),
        };
    }

    /** 返回模型与供应商均启用的图片模型列表，不暴露密钥。 */
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

    /** 校验图片模型状态并读取密钥配置，构造符合 V3 接口的图片适配器。 */
    async prepare(modelId: string) {
        if (modelId === LOCAL_CUTOUT_MODEL_ID) throw HttpErrorFactory.badRequest(MODEL_UNAVAILABLE);
        const model = await this.publicAiModelService.getModelInfo(modelId).catch(() => {
            throw HttpErrorFactory.badRequest(MODEL_UNAVAILABLE);
        });
        if (
            !model.isActive ||
            !model.provider?.isActive ||
            model.modelType !== MODEL_TYPES.TEXT_TO_IMAGE
        ) {
            throw HttpErrorFactory.badRequest(MODEL_UNAVAILABLE);
        }

        try {
            const secretConfig = await this.publicAiModelService.getProviderConfig(model.id);
            const provider = await this.publicAiModelService.getProviderAdapter(model.id, {
                apiKey: getProviderSecret("apiKey", secretConfig),
                baseURL: getProviderSecret("baseUrl", secretConfig) || undefined,
            });
            return { model, imageModel: this.requireImageModel(provider, model.model) };
        } catch {
            throw HttpErrorFactory.badRequest(MODEL_UNAVAILABLE);
        }
    }

    /** 校验视觉语言模型并构造适配器，为适用模型配置关闭思考的供应商参数。 */
    async prepareVision(modelId: string) {
        const model = await this.publicAiModelService.getModelInfo(modelId).catch(() => {
            throw HttpErrorFactory.badRequest("图片分析模型不可用，请检查公共视觉模型配置");
        });
        if (
            !model.isActive ||
            !model.provider?.isActive ||
            model.modelType !== MODEL_TYPES.LLM ||
            !model.features?.includes(MODEL_FEATURES.VISION)
        ) {
            throw HttpErrorFactory.badRequest("请选择已启用且支持视觉的语言模型");
        }
        try {
            const config = await this.publicAiModelService.getProviderConfig(model.id);
            const provider = await this.publicAiModelService.getProviderAdapter(model.id, {
                apiKey: getProviderSecret("apiKey", config),
                baseURL: getProviderSecret("baseUrl", config) || undefined,
            });
            if (!provider.supports("language")) throw new Error();
            const languageModel = provider.languageModel(model.model);
            if (
                languageModel?.specificationVersion !== "v3" ||
                typeof languageModel.doGenerate !== "function"
            )
                throw new Error();
            const providerOptions =
                model.provider.provider === "volcengine" &&
                (model.model.startsWith("doubao-seed-1-6-") ||
                    model.model === "doubao-seed-2-1-lite-260915") &&
                !model.model.startsWith("doubao-seed-1-6-thinking-")
                    ? { volcengine: { thinking: { type: "disabled" } } }
                    : getReasoningOptions(model.provider.provider, { thinking: false });
            return { model: languageModel, providerOptions };
        } catch {
            throw HttpErrorFactory.badRequest("图片分析模型配置无效，请联系管理员");
        }
    }

    /** 校验模型启用状态并按图片数量计算积分报价，不调用模型或扣费。 */
    async quote(modelId: string, count: number, tool?: GenerationQuoteTool) {
        if (modelId === LOCAL_CUTOUT_MODEL_ID) {
            const cutout = this.cutoutService;
            if (!cutout || count !== 1 || tool !== undefined || !await cutout.ready()) throw HttpErrorFactory.badRequest(MODEL_UNAVAILABLE);
            try { return quoteGenerationCredits(cutout.billingRule(), 1); }
            catch { throw HttpErrorFactory.badRequest("抠图积分价格配置无效，请联系管理员"); }
        }
        const model = await this.modelRepository.findOne({
            where: {
                id: modelId,
                modelType: MODEL_TYPES.TEXT_TO_IMAGE,
                isActive: true,
                provider: { isActive: true },
            },
            relations: ["provider"],
        });
        if (!model) throw HttpErrorFactory.badRequest(MODEL_UNAVAILABLE);
        try {
            return quoteGenerationCredits(model.billingRule, count, tool);
        } catch {
            throw HttpErrorFactory.badRequest("所选模型的积分价格配置无效，请联系管理员");
        }
    }

    /** 要求供应商支持图片生成，且返回的模型实现 V3 图片生成接口。 */
    private requireImageModel(provider: ReturnType<typeof getProvider>, model: string) {
        if (!provider.supports("image")) throw new Error(MODEL_UNAVAILABLE);
        const imageModel = provider.image(model).model;
        if (
            imageModel?.specificationVersion !== "v3" ||
            typeof imageModel.doGenerate !== "function"
        ) {
            throw new Error(MODEL_UNAVAILABLE);
        }
        return imageModel;
    }
}
