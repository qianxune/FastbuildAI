import { getProvider, MODEL_TYPES } from "@buildingai/ai-sdk";
import type { AiModel } from "@buildingai/db/entities";
import type { Repository } from "@buildingai/db/typeorm";
import type { PublicAiModelService } from "@buildingai/extension-sdk";
import { RequestMethod, StreamableFile } from "@nestjs/common";
import { HEADERS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import type { Job, Queue } from "bullmq";
import { getProviderSecret } from "@buildingai/utils";
import { generateImage, generateText } from "ai";
import { lstat, mkdir, readFile, realpath, rm, writeFile } from "fs/promises";
import path from "path";

import {
    type ImageGeneration,
    ImageGenerationStatus,
} from "../src/api/db/entities/image-generation.entity";
import { GenerationController } from "../src/api/modules/generation/controllers/web/generation.controller";
import { GenerationProcessor } from "../src/api/modules/generation/generation.processor";
import { GenerationImageService } from "../src/api/modules/generation/services/generation-image.service";
import { GenerationModelService } from "../src/api/modules/generation/services/generation-model.service";
import { CutoutService } from "../src/api/modules/generation/services/cutout.service";
import { LOCAL_CUTOUT_MODEL_ID } from "../src/api/shared/tools";
import { GenerationBillingService } from "../src/api/modules/generation/services/generation-billing.service";
import type { ProductImageService } from "../src/api/modules/generation/services/product-image.service";
import {
    GENERATION_QUEUE,
    type GenerationJobData,
    GenerationService,
} from "../src/api/modules/generation/services/generation.service";
import { TOOL_RATIOS } from "../src/api/shared/tool-workflow";

jest.mock("@buildingai/ai-sdk", () => ({
    MODEL_TYPES: { TEXT_TO_IMAGE: "text-to-image", LLM: "llm" },
    MODEL_FEATURES: { VISION: "vision" },
    getProvider: jest.fn(),
    getReasoningOptions: jest.fn().mockReturnValue({}),
}));
jest.mock("@buildingai/db/@nestjs/typeorm", () => ({ InjectRepository: () => () => undefined }));
jest.mock("@buildingai/db/entities", () => ({ AiModel: class {}, StorageConfig: class {} }));
jest.mock("@buildingai/db/typeorm", () => ({ Repository: class {} }));
jest.mock("@buildingai/extension-sdk", () => ({ PublicAiModelService: class {}, ExtensionBillingService: class {} }));
jest.mock("@buildingai/core/modules", () => ({ BaseBillingService: class {}, CloudStorageService: class {} }));
jest.mock("@buildingai/errors", () => ({
    HttpErrorFactory: {
        badRequest: (message: string) => new Error(message),
        notFound: (message: string) => new Error(message),
    },
}));
jest.mock("@buildingai/utils", () => ({ getProviderSecret: jest.fn() }));
jest.mock("ai", () => ({ generateImage: jest.fn(), generateText: jest.fn() }));
jest.mock("../src/api/modules/generation/services/cutout.service", () => ({
    CutoutService: class { static ready = jest.fn().mockResolvedValue(false); ready = CutoutService.ready; billingRule = () => ({ power: 0 }); },
    CUTOUT_MODEL: "Tencent CI AIPicMatting",
}));
jest.mock("fs/promises", () => ({
    lstat: jest.fn(),
    mkdir: jest.fn(),
    readFile: jest.fn(),
    realpath: jest.fn(),
    rm: jest.fn(),
    writeFile: jest.fn(),
}));
jest.mock("../src/api/db/entities/image-generation.entity", () => ({
    ImageGeneration: class {},
    ImageGenerationStatus: {
        QUEUED: "queued",
        CANCELLED: "cancelled",
        PROCESSING: "processing",
        FAILED: "failed",
        COMPLETED: "completed",
    },
}));
jest.mock("@buildingai/core/decorators", () =>
    jest.requireActual("../../../packages/core/src/decorators/extension-controller.decorator"),
);
jest.mock("../../../packages/core/src/modules/extension/utils/extension.utils", () => ({
    getExtensionPackNameFromControllerSync: () => "image-studio",
}));
jest.mock(
    "@buildingai/constants",
    () => ({
        DECORATOR_KEYS: {
            PLUGIN_PACK_NAME_KEY: "decorator:plugin-pack-name",
            PLUGIN_WEB_CONTROLLER_KEY: "decorator:plugin-web-controller",
            IS_PUBLIC_KEY: "decorator:is-public-controller",
        },
    }),
    { virtual: true },
);
jest.mock(
    "@buildingai/utils/helper",
    () => ({
        joinRouterPaths: (...segments: string[]) => segments.filter(Boolean).join("/"),
    }),
    { virtual: true },
);
jest.mock("@buildingai/utils/path-validator", () => ({ validatePath: jest.fn() }), {
    virtual: true,
});
jest.mock("@buildingai/decorators/playground.decorator", () => ({
    Playground: () => () => undefined,
}));

describe("product image analysis", () => {
    const input = { modelId: "vision-model", assetIds: ["image-one", "image-two"], productName: "Product", language: "English" as const };
    const generateTextMock = jest.mocked(generateText);
    const model = { specificationVersion: "v3", doGenerate: jest.fn(), doStream: jest.fn() };

    function fixture() {
        const prepareVision = jest.fn().mockResolvedValue({ model, providerOptions: { volcengine: { thinking: { type: "disabled" } } } });
        const readForAnalysis = jest.fn().mockResolvedValue(Buffer.from("owned resized image"));
        const service = new GenerationService({} as never, { prepareVision } as never, {} as never,
            {} as never, { readForAnalysis } as never, {} as never);
        return { service, prepareVision, readForAnalysis };
    }

    beforeEach(() => {
        jest.clearAllMocks();
        generateTextMock.mockResolvedValue({ text: "  Visible product description  " } as Awaited<ReturnType<typeof generateText>>);
    });

    it("analyzes only owned resized images with bounded inference and no image generation", async () => {
        const state = fixture();
        expect(await state.service.analyzeProduct("owner", input)).toEqual({ description: "Visible product description" });
        expect(state.readForAnalysis.mock.calls).toEqual([["owner", "image-one"], ["owner", "image-two"]]);
        expect(state.prepareVision).toHaveBeenCalledWith("vision-model");
        expect(generateTextMock).toHaveBeenCalledWith(expect.objectContaining({
            model, maxRetries: 0, maxOutputTokens: 1200, abortSignal: expect.any(AbortSignal),
            providerOptions: { volcengine: { thinking: { type: "disabled" } } },
            messages: [{ role: "user", content: [expect.objectContaining({ type: "text" }),
                { type: "image", image: Buffer.from("owned resized image"), mediaType: "image/jpeg" },
                { type: "image", image: Buffer.from("owned resized image"), mediaType: "image/jpeg" }] }],
        }));
        expect(generateImage).not.toHaveBeenCalled();
    });

    it("rejects inaccessible images before touching the configured provider", async () => {
        const state = fixture();
        state.readForAnalysis.mockRejectedValue(new Error("not owned"));
        await expect(state.service.analyzeProduct("other-owner", input)).rejects.toThrow("not owned");
        expect(state.prepareVision).not.toHaveBeenCalled();
        expect(generateTextMock).not.toHaveBeenCalled();
    });

    it("blocks concurrent analyses for the same user and releases the lock on completion", async () => {
        const state = fixture();
        let finish!: (result: Awaited<ReturnType<typeof generateText>>) => void;
        generateTextMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
        const first = state.service.analyzeProduct("owner", input);
        await new Promise(setImmediate);
        await expect(state.service.analyzeProduct("owner", input)).rejects.toThrow();
        expect(generateTextMock).toHaveBeenCalledTimes(1);
        finish({ text: "Completed" } as Awaited<ReturnType<typeof generateText>>);
        await first;
        await expect(state.service.analyzeProduct("owner", input)).resolves.toHaveProperty("description");
    });

    it("sanitizes provider failures and permits a subsequent analysis", async () => {
        const state = fixture();
        generateTextMock.mockRejectedValueOnce(new Error("secret provider payload"));
        await expect(state.service.analyzeProduct("owner", input)).rejects.not.toThrow("secret provider payload");
        await expect(state.service.analyzeProduct("owner", input)).resolves.toHaveProperty("description");
    });

    it("reports an unavailable upstream model instead of a timeout without retrying inference", async () => {
        const state = fixture();
        generateTextMock.mockRejectedValueOnce(Object.assign(new Error("secret provider payload"), { statusCode: 404 }));
        await expect(state.service.analyzeProduct("owner", input)).rejects.toThrow("所选视觉模型不存在或当前密钥无权访问");
        expect(generateTextMock).toHaveBeenCalledTimes(1);
        expect(generateImage).not.toHaveBeenCalled();
        await expect(state.service.analyzeProduct("owner", input)).resolves.toHaveProperty("description");
    });

    it("rejects empty output and bounds the returned description", async () => {
        const state = fixture();
        generateTextMock.mockResolvedValueOnce({ text: "   " } as Awaited<ReturnType<typeof generateText>>);
        await expect(state.service.analyzeProduct("owner", input)).rejects.toThrow();
        generateTextMock.mockResolvedValueOnce({ text: "a".repeat(4000) } as Awaited<ReturnType<typeof generateText>>);
        expect((await state.service.analyzeProduct("owner", input)).description).toHaveLength(3000);
    });

    it.each([
        { isActive: false }, { modelType: "text-to-image" }, { features: [] }, { provider: { isActive: false } },
    ])("rejects unavailable or non-vision public model %p", async (overrides) => {
        const getProviderConfig = jest.fn();
        const getModelInfo = jest.fn().mockResolvedValue({ id: "vision-model", model: "configured-vision", isActive: true,
            modelType: "llm", features: ["vision"], provider: { isActive: true }, ...overrides });
        const service = new GenerationModelService({} as never, { getModelInfo, getProviderConfig } as never);
        await expect(service.prepareVision("vision-model")).rejects.toThrow();
        expect(getProviderConfig).not.toHaveBeenCalled();
        expect(generateTextMock).not.toHaveBeenCalled();
    });

    it("uses configured credentials only on the backend and returns the language adapter", async () => {
        const getModelInfo = jest.fn().mockResolvedValue({ id: "vision-model", model: "configured-vision", isActive: true,
            modelType: "llm", features: ["vision"], provider: { isActive: true } });
        const languageModel = jest.fn().mockReturnValue(model);
        const getProviderAdapter = jest.fn().mockResolvedValue({ supports: () => true, languageModel });
        const service = new GenerationModelService({} as never, { getModelInfo,
            getProviderConfig: jest.fn().mockResolvedValue({}), getProviderAdapter } as never);
        expect(await service.prepareVision("vision-model")).toEqual({ model, providerOptions: {} });
        expect(languageModel).toHaveBeenCalledWith("configured-vision");
        expect(generateTextMock).not.toHaveBeenCalled();
    });

    it.each([
        ["doubao-seed-1-6-250615", true],
        ["doubao-seed-1-6-flash-250828", true],
        ["doubao-seed-2-1-lite-260915", true],
        ["doubao-seed-1-6-thinking-250715", false],
    ])("bounds reasoning for supported Doubao analysis models %s", async (configuredModel, disableThinking) => {
        const service = new GenerationModelService({} as never, {
            getModelInfo: jest.fn().mockResolvedValue({ id: "vision-model", model: configuredModel,
                isActive: true, modelType: "llm", features: ["vision"],
                provider: { isActive: true, provider: "volcengine" } }),
            getProviderConfig: jest.fn().mockResolvedValue({}),
            getProviderAdapter: jest.fn().mockResolvedValue({ supports: () => true, languageModel: () => model }),
        } as never);
        const prepared = await service.prepareVision("vision-model");
        expect(prepared.providerOptions).toEqual(disableThinking ? { volcengine: { thinking: { type: "disabled" } } } : {});
        expect(generateTextMock).not.toHaveBeenCalled();
    });

    it("logs only bounded failure metadata, excluding provider payloads and credentials", async () => {
        const state = fixture();
        const logger = jest.spyOn((state.service as unknown as { logger: { error: (message: string) => void } }).logger, "error").mockImplementation(() => {});
        generateTextMock.mockRejectedValueOnce(Object.assign(new Error("secret provider payload"), {
            statusCode: 400, cause: Object.assign(new Error("private image and key"), { code: "InvalidParameter" }),
            responseBody: "secret response", headers: { Authorization: "secret key" },
        }));
        await expect(state.service.analyzeProduct("owner", input)).rejects.toThrow();
        const entry = JSON.parse(logger.mock.calls[0][0]);
        expect(entry).toMatchObject({ event: "product_image_analysis_failed", modelId: input.modelId,
            errors: [{ name: "Error", statusCode: 400 }, { name: "Error", code: "InvalidParameter" }] });
        expect(logger.mock.calls[0][0]).not.toMatch(/secret|private|Authorization/);
        logger.mockRestore();
    });
});

describe("generation capabilities", () => {
    const getProviderMock = jest.mocked(getProvider);
    const find = jest.fn();
    const image = jest.fn();
    const languageModel = jest.fn();
    const supports = jest.fn();
    const getProviderConfig = jest.fn();
    const getProviderAdapter = jest.fn();
    const service = new GenerationModelService(
        { find } as unknown as Repository<AiModel>,
        { getProviderConfig, getProviderAdapter } as unknown as PublicAiModelService,
        new CutoutService(),
    );
    const configuredModel = (overrides: Record<string, unknown> = {}) => ({
        id: "image-model",
        name: "Configured model",
        model: "image-edit-segmentation-fusion",
        modelType: MODEL_TYPES.TEXT_TO_IMAGE,
        isActive: true,
        features: ["vision", "image-edit", "segmentation", "multi-image"],
        provider: {
            isActive: true,
            name: "Provider",
            provider: "adapter",
            bindSecretId: "secret-id",
        },
        ...overrides,
    });

    beforeEach(() => {
        jest.clearAllMocks();
        jest.mocked(CutoutService.ready).mockResolvedValue(false);
        find.mockResolvedValue([configuredModel()]);
        supports.mockReturnValue(true);
        image.mockReturnValue({ model: { specificationVersion: "v3", doGenerate: jest.fn() } });
        languageModel.mockReturnValue({
            specificationVersion: "v3",
            doGenerate: jest.fn(),
            doStream: jest.fn(),
        });
        getProviderMock.mockReturnValue({ supports, image, languageModel } as unknown as ReturnType<
            typeof getProvider
        >);
    });

    it("advertises Tencent cutout only when COS is configured, independent of image models", async () => {
        find.mockResolvedValue([]);
        expect((await service.capabilities()).tools.find((tool) => tool.key === "cutout")).toMatchObject({ status: "unavailable", reason: "unsupported_capabilities" });
        jest.mocked(CutoutService.ready).mockResolvedValue(true);
        const result = await service.capabilities();
        expect(result.models).toEqual([expect.objectContaining({ id: LOCAL_CUTOUT_MODEL_ID, capabilities: ["segmentation"], maxReferenceImages: 1 })]);
        expect(result.tools.find((tool) => tool.key === "cutout")).toMatchObject({ status: "available", reason: null,
            modelIdsByCapability: { segmentation: [LOCAL_CUTOUT_MODEL_ID] }, limits: { maxInputImages: 1, sizes: null } });
        expect(result.tools.find((tool) => tool.key === "creative")?.status).toBe("unavailable");
        expect(getProviderMock).not.toHaveBeenCalled(); expect(generateImage).not.toHaveBeenCalled();
    });

    it("quotes the configured cutout credits and never prepares image model secrets", async () => {
        jest.mocked(CutoutService.ready).mockResolvedValue(true);
        await expect(service.quote(LOCAL_CUTOUT_MODEL_ID, 1)).resolves.toMatchObject({ total: 0 });
        await expect(service.quote(LOCAL_CUTOUT_MODEL_ID, 2)).rejects.toThrow();
        await expect(service.quote(LOCAL_CUTOUT_MODEL_ID, 1, "sku")).rejects.toThrow();
        await expect(service.prepare(LOCAL_CUTOUT_MODEL_ID)).rejects.toThrow();
        jest.mocked(CutoutService.ready).mockResolvedValue(false);
        await expect(service.quote(LOCAL_CUTOUT_MODEL_ID, 1)).rejects.toThrow();
        expect(getProviderConfig).not.toHaveBeenCalled(); expect(getProviderAdapter).not.toHaveBeenCalled();
        expect(generateImage).not.toHaveBeenCalled();
    });

    it("advertises only text-to-image for an actual image adapter", async () => {
        const result = await service.capabilities();
        expect(result.models[0].capabilities).toEqual(["text-to-image"]);
        expect(result.tools.find((tool) => tool.key === "creative")).toMatchObject({
            status: "available",
            reason: null,
            modelIdsByCapability: { "text-to-image": ["image-model"] },
            limits: { sizes: TOOL_RATIOS, maxInputImages: 0 },
        });
        expect(image).toHaveBeenCalledWith("image-edit-segmentation-fusion");
    });

    it("never infers image operations from names or metadata", async () => {
        const result = await service.capabilities();
        for (const key of [
            "main",
            "detail",
            "replica",
            "fusion",
            "sku",
            "retouch",
            "watermark",
            "expand",
            "translate",
        ]) {
            expect(result.tools.find((tool) => tool.key === key)).toMatchObject({
                status: "unavailable",
                reason: "unsupported_capabilities",
            });
        }
        expect(result.tools.find((tool) => tool.key === "cutout")).toMatchObject({
            status: "unavailable",
            reason: "unsupported_capabilities",
            modelIdsByCapability: { segmentation: [] },
        });
    });

    it("only advertises multi-image for the verified reference adapter and never implies masks or alpha", async () => {
        image.mockReturnValue({ model: { specificationVersion: "v3", doGenerate: jest.fn(), supportsReferenceImages: true, provider: "unknown" } });
        const single = await service.capabilities();
        expect(single.models[0].maxReferenceImages).toBe(1);
        expect(single.tools.find((tool) => tool.key === "retouch")).toMatchObject({ status: "available", limits: { maxInputImages: 1 } });
        expect(single.tools.find((tool) => tool.key === "fusion")?.status).toBe("unavailable");
        expect(single.tools.find((tool) => tool.key === "replica")?.status).toBe("unavailable");
        image.mockReturnValue({ model: { specificationVersion: "v3", doGenerate: jest.fn(), supportsReferenceImages: true, provider: "volcengine", modelId: "doubao-seedream-5-0-lite" } });
        const multi = await service.capabilities();
        expect(multi.models[0].capabilities).toEqual(["text-to-image", "reference-image", "multi-image"]);
        expect(multi.tools.find((tool) => tool.key === "fusion")).toMatchObject({ status: "available", limits: { maxInputImages: 5 } });
        expect(multi.tools.find((tool) => tool.key === "cutout")).toMatchObject({ status: "unavailable", reason: "unsupported_capabilities" });
        expect(generateImage).not.toHaveBeenCalled();
    });

    it("requires image support even when the wrapper exposes image()", async () => {
        supports.mockReturnValue(false);
        expect((await service.capabilities()).models).toEqual([]);
        expect(image).not.toHaveBeenCalled();
    });

    it.each(["throws", "invalid model"])(
        "fails closed when the image adapter returns %s",
        async (behavior) => {
            image.mockImplementation(() => {
                if (behavior === "throws") throw new Error("upstream-secret-value");
                return { model: {} };
            });
            const result = await service.capabilities();
            expect(result.models).toEqual([]);
            expect(JSON.stringify(result)).not.toContain("upstream-secret-value");
        },
    );

    it("requires both vision metadata and a runtime language model", async () => {
        find.mockResolvedValue([
            configuredModel({ id: "vision", modelType: MODEL_TYPES.LLM, features: ["vision"] }),
            configuredModel({ id: "name-only", modelType: MODEL_TYPES.LLM, features: [] }),
        ]);
        const result = await service.capabilities();
        expect(result.models.map((model) => model.id)).toEqual(["vision"]);
        expect(result.models[0].capabilities).toEqual(["vision"]);
        expect(result.tools.find((tool) => tool.key === "suggest")).toMatchObject({
            status: "available",
        });
        expect(languageModel).toHaveBeenCalledTimes(1);
        languageModel.mockImplementation(() => {
            throw new Error("unsupported language");
        });
        expect((await service.capabilities()).models).toEqual([]);
    });

    it("rejects malformed language implementations and unsupported language capability", async () => {
        find.mockResolvedValue([configuredModel({ modelType: MODEL_TYPES.LLM })]);
        languageModel.mockReturnValue({ specificationVersion: "v3", doGenerate: jest.fn() });
        expect((await service.capabilities()).models).toEqual([]);
        supports.mockReturnValue(false);
        languageModel.mockClear();
        expect((await service.capabilities()).models).toEqual([]);
        expect(languageModel).not.toHaveBeenCalled();
    });

    it("filters disabled models, disabled or missing providers, and unrelated model types", async () => {
        find.mockResolvedValue([
            configuredModel({ isActive: false }),
            configuredModel({ provider: { isActive: false, provider: "disabled" } }),
            configuredModel({ provider: null }),
            configuredModel({ modelType: "tts" }),
            configuredModel({ id: "enabled" }),
        ]);
        const result = await service.capabilities();
        expect(result.models.map((model) => model.id)).toEqual(["enabled"]);
        expect(find).toHaveBeenCalledWith({
            where: [
                { modelType: "text-to-image", isActive: true, provider: { isActive: true } },
                { modelType: "llm", isActive: true, provider: { isActive: true } },
            ],
            relations: ["provider"],
            order: { sortOrder: "DESC", createdAt: "DESC" },
        });
    });

    it("isolates unknown providers without hiding supported models", async () => {
        find.mockResolvedValue([
            configuredModel({ provider: { isActive: true, provider: "unknown" } }),
            configuredModel(),
        ]);
        getProviderMock.mockImplementation((provider) => {
            if (provider === "unknown") throw new Error("unknown provider");
            return { supports, image, languageModel } as unknown as ReturnType<typeof getProvider>;
        });
        expect((await service.capabilities()).models).toHaveLength(1);
    });

    it("returns only whitelisted fields and never retrieves credentials or invokes inference", async () => {
        find.mockResolvedValue([
            configuredModel({
                apiKey: "private-api-key",
                modelConfig: [{ secret: "private-config" }],
                provider: {
                    isActive: true,
                    name: "Provider",
                    provider: "adapter",
                    apiKey: "private-provider-key",
                    baseURL: "https://private-endpoint",
                    bindSecretId: "private-secret-id",
                },
            }),
        ]);
        const result = await service.capabilities();
        expect(Object.keys(result.models[0]).sort()).toEqual([
            "capabilities",
            "id",
            "maxReferenceImages",
            "model",
            "name",
            "provider",
            "providerCode",
        ]);
        expect(JSON.stringify(result)).not.toMatch(
            /private-|apiKey|baseURL|bindSecretId|modelConfig/,
        );
        expect(getProviderConfig).not.toHaveBeenCalled();
        expect(getProviderAdapter).not.toHaveBeenCalled();
        expect(getProviderSecret).not.toHaveBeenCalled();
        expect(generateImage).not.toHaveBeenCalled();
        expect(getProviderMock).toHaveBeenCalledWith("adapter", {
            apiKey: "capability-probe-not-a-credential",
        });
        expect(image.mock.results[0].value.model.doGenerate).not.toHaveBeenCalled();
    });

    it("marks all tools unavailable when no models are configured", async () => {
        find.mockResolvedValue([]);
        const result = await service.capabilities();
        expect(result.models).toEqual([]);
        expect(result.tools).toHaveLength(13);
        expect(result.tools.every((tool) => tool.status === "unavailable")).toBe(true);
    });
});

describe("generation runtime security", () => {
    const save = jest.fn();
    const update = jest.fn();
    const taskId = "11111111-1111-4111-8111-111111111111";
    const create = jest.fn((value) => ({ id: taskId, ...value }));
    const findOne = jest.fn();
    const findAndCount = jest.fn();
    const remove = jest.fn();
    const getModelInfo = jest.fn();
    const getProviderConfig = jest.fn();
    const getProviderAdapter = jest.fn();
    const service = new GenerationService(
        {
            save,
            update,
            create,
            findOne,
            findAndCount,
            remove,
            manager: { transaction: async (work: (manager: unknown) => unknown) => work({ getRepository: () => ({ create, save, findOne }) }) },
        } as unknown as Repository<ImageGeneration>,
        new GenerationModelService(
            {} as Repository<AiModel>,
            {
                getModelInfo,
                getProviderConfig,
                getProviderAdapter,
            } as unknown as PublicAiModelService,
        ),
        new GenerationImageService(
            { findOne: async () => ({ storageType: "local" }) } as never,
            {} as never,
        ),
        {} as Queue<GenerationJobData>,
        {} as ProductImageService,
        new GenerationBillingService({} as never, {} as never),
    );
    const input = {
        prompt: "A product photo",
        modelId: "model",
        count: 1,
        size: "1024x1024",
        quality: "standard",
        style: "vivid",
    } as const;

    beforeEach(() => {
        jest.clearAllMocks();
        findOne.mockResolvedValue({ id: taskId, userId: "owner", status: "processing", billingStatus: "free", billingAmount: 0 });
        getModelInfo.mockResolvedValue({
            id: "model",
            name: "Image model",
            model: "image-model",
            isActive: true,
            modelType: MODEL_TYPES.TEXT_TO_IMAGE,
            billingRule: { power: 0 },
            provider: { isActive: true, provider: "adapter" },
        });
        getProviderConfig.mockResolvedValue({});
        getProviderAdapter.mockResolvedValue({
            supports: () => true,
            image: () => ({ model: { specificationVersion: "v3", doGenerate: jest.fn() } }),
        });
        save.mockImplementation(async (value) => value);
        update.mockResolvedValue({ affected: 1 });
        jest.mocked(realpath).mockImplementation(async (value) => path.resolve(String(value)));
        jest.mocked(lstat).mockResolvedValue({
            isFile: () => true,
            isSymbolicLink: () => false,
            size: 68,
        } as Awaited<ReturnType<typeof lstat>>);
        jest.mocked(readFile).mockResolvedValue(
            Buffer.from(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=",
                "base64",
            ),
        );
    });

    it.each([
        { supports: () => false, image: jest.fn() },
        {
            supports: () => true,
            image: () => ({ model: { specificationVersion: "v2", doGenerate: jest.fn() } }),
        },
        { supports: () => true, image: () => ({ model: { specificationVersion: "v3" } }) },
        {
            supports: () => true,
            image: () => {
                throw new Error("secret-response-body");
            },
        },
    ])("rejects unsupported adapters before creating a processing task", async (adapter) => {
        getProviderAdapter.mockResolvedValue(adapter);
        await expect(service.generate("owner", input)).rejects.toThrow("所选图片模型不可用");
        expect(create).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
        expect(generateImage).not.toHaveBeenCalled();
    });

    it("redacts provider errors from both the response and saved task", async () => {
        jest.mocked(generateImage).mockRejectedValue(
            new Error("Bearer sk-secret raw response body"),
        );
        await expect(service.generate("owner", input)).rejects.toThrow("图片生成失败，请稍后重试");
        expect(save).toHaveBeenLastCalledWith(
            expect.objectContaining({
                status: "failed",
                error: "图片生成失败，请稍后重试",
            }),
        );
        expect(JSON.stringify(save.mock.calls)).not.toContain("sk-secret");
        expect(JSON.stringify(update.mock.calls)).not.toContain("sk-secret");
    });

    it("rejects deletion of processing tasks in the backend", async () => {
        findOne.mockResolvedValue({ status: "processing", images: [] });
        await expect(service.remove("owner", "task-id")).rejects.toThrow("生成中的记录不可删除");
        expect(remove).not.toHaveBeenCalled();
    });

    const imageUrl = () =>
        `/image-studio/${(process.env.VITE_APP_WEB_API_PREFIX || "api").replace(/^\/+|\/+$/g, "")}/generations/${taskId}/images/0`;
    const legacyUrl = () =>
        `/image-studio/uploads/generated/${taskId}-1-22222222-2222-4222-8222-222222222222.png`;
    const owned = (url = imageUrl(), mediaType = "image/png") => ({
        id: taskId,
        userId: "owner",
        status: "completed",
        images: [{ url, mediaType }],
    });

    it("does not touch the filesystem when the task is not owned", async () => {
        findOne.mockResolvedValue(null);
        await expect(service.readImage("stranger", taskId, 0)).rejects.toThrow("生成记录不存在");
        expect(findOne).toHaveBeenCalledWith({ where: { id: taskId, userId: "stranger" } });
        for (const operation of [realpath, lstat, readFile, rm, mkdir, writeFile]) {
            expect(operation).not.toHaveBeenCalled();
        }
    });

    it.each([imageUrl, legacyUrl])(
        "serves only the owner's validated private or legacy image",
        async (url) => {
            findOne.mockResolvedValue(owned(url()));
            await expect(service.readImage("owner", taskId, 0)).resolves.toMatchObject({
                mediaType: "image/png",
            });
            const filename = jest.mocked(readFile).mock.calls[0][0] as string;
            expect(filename).toContain(
                path.join("storage", url === imageUrl ? "private" : "uploads", "generated"),
            );
            expect(path.basename(filename)).toBe(
                url === imageUrl ? `${taskId}-0.png` : path.basename(legacyUrl()),
            );
        },
    );

    it.each([-1, 0.5, 1, NaN])(
        "rejects invalid image index %s before filesystem access",
        async (index) => {
            findOne.mockResolvedValue(owned());
            await expect(service.readImage("owner", taskId, index)).rejects.toThrow("图片不存在");
            expect(realpath).not.toHaveBeenCalled();
            expect(readFile).not.toHaveBeenCalled();
        },
    );

    it.each([
        "/image-studio/uploads/generated/../../secret.png",
        "/image-studio/uploads/generated/%2e%2e%2fsecret.png",
        "https://example.test/secret.png",
        "/image-studio/uploads/generated/22222222-2222-4222-8222-222222222222-1-22222222-2222-4222-8222-222222222222.png",
        "C:\\secret.png",
        "data:image/svg+xml,secret",
    ])("rejects supplied paths and noncanonical URLs: %s", async (url) => {
        findOne.mockResolvedValue(owned(url));
        await expect(service.readImage("owner", taskId, 0)).rejects.toThrow("图片不存在");
        expect(realpath).not.toHaveBeenCalled();
        expect(readFile).not.toHaveBeenCalled();
    });

    it("rejects an invalid record UUID and unsupported media type before filesystem access", async () => {
        findOne.mockResolvedValue({ ...owned(), id: "../../secret" });
        await expect(service.readImage("owner", "../../secret", 0)).rejects.toThrow("图片不存在");
        findOne.mockResolvedValue(owned(imageUrl(), "image/svg+xml"));
        await expect(service.readImage("owner", taskId, 0)).rejects.toThrow("图片不存在");
        expect(realpath).not.toHaveBeenCalled();
    });

    it("rejects symlink escapes before reading bytes", async () => {
        findOne.mockResolvedValue(owned());
        jest.mocked(realpath).mockImplementation(async (value) =>
            String(value).endsWith(".png") ? "/secret.png" : path.resolve(String(value)),
        );
        await expect(service.readImage("owner", taskId, 0)).rejects.toThrow("图片不存在");
        expect(readFile).not.toHaveBeenCalled();
    });

    it("rejects oversized files before reading bytes and rejects MIME mismatches", async () => {
        findOne.mockResolvedValue(owned());
        jest.mocked(lstat).mockResolvedValueOnce({
            isFile: () => true,
            isSymbolicLink: () => false,
            size: 21 * 1024 * 1024,
        } as Awaited<ReturnType<typeof lstat>>);
        await expect(service.readImage("owner", taskId, 0)).rejects.toThrow("图片不存在");
        expect(readFile).not.toHaveBeenCalled();
        jest.mocked(readFile).mockResolvedValueOnce(Buffer.from("<html>secret-body</html>"));
        await expect(service.readImage("owner", taskId, 0)).rejects.toThrow(
            "图片不存在或格式不受支持",
        );
    });

    it("writes validated new results only to private storage with canonical names", async () => {
        const png = await readFile("fixture");
        jest.mocked(generateImage).mockResolvedValue({
            images: [{ base64: png.toString("base64"), mediaType: "image/png" }],
        } as never);
        const result = await service.generate("owner", input);
        expect(result.images).toEqual([{ url: imageUrl(), mediaType: "image/png" }]);
        expect(writeFile).toHaveBeenCalledWith(
            expect.stringContaining(
                path.join("storage", "private", "generated", `${taskId}-0.png`),
            ),
            png,
            { flag: "wx", mode: 0o600 },
        );
        expect(JSON.stringify(jest.mocked(mkdir).mock.calls)).not.toContain("uploads");
    });

    it("cleans successful and partially written files when a later image write fails", async () => {
        const png = await readFile("fixture");
        const image = { base64: png.toString("base64"), mediaType: "image/png" };
        jest.mocked(generateImage).mockResolvedValue({ images: [image, image] } as never);
        jest.mocked(writeFile)
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(Object.assign(new Error("disk full"), { code: "ENOSPC" }));
        await expect(service.generate("owner", { ...input, count: 2 })).rejects.toThrow(
            "图片生成失败",
        );
        expect(rm).toHaveBeenCalledTimes(2);
        for (const index of [0, 1]) {
            expect(rm).toHaveBeenCalledWith(expect.stringContaining(`${taskId}-${index}.png`), {
                force: true,
            });
        }
        expect(update).toHaveBeenLastCalledWith(
            expect.any(Array),
            expect.objectContaining({ status: "failed", images: [] }),
        );
    });

    it("does not delete an existing file when exclusive creation fails", async () => {
        const png = await readFile("fixture");
        jest.mocked(generateImage).mockResolvedValue({
            images: [{ base64: png.toString("base64"), mediaType: "image/png" }],
        } as never);
        jest.mocked(writeFile).mockRejectedValueOnce(
            Object.assign(new Error("exists"), { code: "EEXIST" }),
        );
        await expect(service.generate("owner", input)).rejects.toThrow("图片生成失败");
        expect(rm).not.toHaveBeenCalled();
    });

    it("cleans generated files and clears image metadata when completion persistence fails", async () => {
        const png = await readFile("fixture");
        jest.mocked(generateImage).mockResolvedValue({
            images: [{ base64: png.toString("base64"), mediaType: "image/png" }],
        } as never);
        update.mockRejectedValueOnce(new Error("database unavailable"));
        await expect(service.generate("owner", input)).rejects.toThrow("图片生成失败");
        expect(rm).toHaveBeenCalledWith(expect.stringContaining(`${taskId}-0.png`), {
            force: true,
        });
        expect(update).toHaveBeenLastCalledWith(
            expect.any(Array),
            expect.objectContaining({ status: "failed", images: [] }),
        );
    });

    it.each([
        { base64: "PHN2Zy8+", mediaType: "image/svg+xml" },
        { base64: "not base64!", mediaType: "image/png" },
        { base64: "data:image/png;base64,aGVsbG8=", mediaType: "image/png" },
        { base64: "PGh0bWw+c2VjcmV0PC9odG1sPg==", mediaType: "image/png" },
        { base64: "", mediaType: "image/png" },
        { base64: "A".repeat(4 * Math.ceil((20 * 1024 * 1024) / 3) + 4), mediaType: "image/png" },
    ])("rejects invalid generated payload without writing files", async (image) => {
        jest.mocked(generateImage).mockResolvedValue({ images: [image] } as never);
        await expect(service.generate("owner", input)).rejects.toThrow("图片生成失败，请稍后重试");
        expect(mkdir).not.toHaveBeenCalled();
        expect(writeFile).not.toHaveBeenCalled();
    });

    it("projects legacy records through auth URLs and redacts stored raw errors without mutating them", async () => {
        const record = { ...owned(legacyUrl()), error: "sk-secret upstream body" };
        findAndCount.mockResolvedValue([[record], 1]);
        const result = await service.list("owner", { page: 1, limit: 20 });
        expect(result.items[0].images[0].url).toBe(imageUrl());
        expect(result.items[0].error).toBe("图片生成失败，请稍后重试");
        expect(record.images[0].url).toBe(legacyUrl());
        expect(record.error).toContain("sk-secret");
        expect(save).not.toHaveBeenCalled();
    });

    it("does not delete arbitrary paths and preserves missing-file removal", async () => {
        findOne.mockResolvedValue(owned("/image-studio/uploads/generated/../../secret.png"));
        await expect(service.remove("owner", taskId)).rejects.toThrow("图片不存在");
        expect(rm).not.toHaveBeenCalled();
        expect(remove).not.toHaveBeenCalled();
        findOne.mockResolvedValue(owned());
        jest.mocked(realpath).mockRejectedValueOnce(
            Object.assign(new Error("missing"), { code: "ENOENT" }),
        );
        await expect(service.remove("owner", taskId)).resolves.toEqual({ success: true });
        expect(remove).toHaveBeenCalled();
    });

    it("does not expose provider setup or persistence secrets", async () => {
        getProviderConfig.mockRejectedValueOnce(new Error("sk-config-secret"));
        await expect(service.generate("owner", input)).rejects.toThrow("所选图片模型不可用");
        expect(save).not.toHaveBeenCalled();
        save.mockRejectedValueOnce(new Error("db-secret"));
        await expect(service.generate("owner", input)).rejects.toThrow("图片生成失败，请稍后重试");
    });
});

describe("async generation tasks", () => {
    const taskId = "11111111-1111-4111-8111-111111111111";
    const input = {
        prompt: "A product photo",
        modelId: "model",
        count: 1,
        size: "1024x1024",
        quality: "standard",
        style: "vivid",
    } as const;
    const data = { id: taskId, userId: "owner" };
    let record: ImageGeneration | undefined;
    const add = jest.fn();
    const getJob = jest.fn();
    const removeJob = jest.fn();
    const create = jest.fn();
    const save = jest.fn();
    const update = jest.fn();
    const findOne = jest.fn();
    const remove = jest.fn();
    const getModelInfo = jest.fn();
    const getProviderConfig = jest.fn();
    const getProviderAdapter = jest.fn();
    const service = new GenerationService(
        { create, save, update, findOne, remove,
            manager: { transaction: async (work: (manager: unknown) => unknown) => work({ getRepository: () => ({ create, save, findOne }) }) },
        } as unknown as Repository<ImageGeneration>,
        new GenerationModelService(
            {} as Repository<AiModel>,
            {
                getModelInfo,
                getProviderConfig,
                getProviderAdapter,
            } as unknown as PublicAiModelService,
        ),
        new GenerationImageService(
            { findOne: async () => ({ storageType: "local" }) } as never,
            {} as never,
        ),
        { add, getJob } as unknown as Queue<GenerationJobData>,
        {} as ProductImageService,
        new GenerationBillingService({} as never, {} as never),
    );
    const processor = new GenerationProcessor(service);
    const job = { data } as Job<GenerationJobData>;
    const image = {
        base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=",
        mediaType: "image/png",
    };
    const seed = (status = ImageGenerationStatus.QUEUED) => {
        record = {
            ...input,
            ...data,
            toolKey: "creative",
            modelName: "Image model",
            status,
            billingAmount: 0,
            billingStatus: "uncharged",
            images: [],
            error: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    };
    const deferred = <Value>() => {
        let resolve!: (value: Value) => void;
        const promise = new Promise<Value>((complete) => {
            resolve = complete;
        });
        return { promise, resolve };
    };

    beforeEach(() => {
        jest.resetAllMocks();
        record = undefined;
        create.mockImplementation((value) => ({ id: taskId, ...value }));
        save.mockImplementation(async (value) => {
            record = { ...value };
            return { ...record };
        });
        findOne.mockImplementation(async ({ where }) =>
            record && record.id === where.id && record.userId === where.userId
                ? { ...record }
                : null,
        );
        update.mockImplementation(async (criteria, values) => {
            const alternatives = Array.isArray(criteria) ? criteria : [criteria];
            const matches =
                record &&
                alternatives.some((condition) =>
                    Object.entries(condition).every(
                        ([key, value]) => record![key as keyof ImageGeneration] === value,
                    ),
                );
            if (matches) record = { ...record!, ...values };
            return { affected: matches ? 1 : 0 };
        });
        getModelInfo.mockResolvedValue({
            id: "model",
            name: "Image model",
            model: "image-model",
            isActive: true,
            modelType: MODEL_TYPES.TEXT_TO_IMAGE,
            provider: { isActive: true, provider: "openai" },
            billingRule: { power: 0 },
        });
        getProviderConfig.mockResolvedValue({});
        getProviderAdapter.mockResolvedValue({
            supports: () => true,
            image: () => ({ model: { specificationVersion: "v3", doGenerate: jest.fn() } }),
        });
        add.mockResolvedValue(job);
        getJob.mockResolvedValue({ data, remove: removeJob });
        removeJob.mockResolvedValue(undefined);
        jest.mocked(generateImage).mockResolvedValue({ images: [image] } as never);
        jest.mocked(writeFile).mockResolvedValue(undefined);
        jest.mocked(rm).mockResolvedValue(undefined);
    });

    it("validates then submits a queued public record without inference or files", async () => {
        const response = await service.submit("owner", input);
        expect(response).toMatchObject({
            id: taskId,
            userId: "owner",
            status: "queued",
            images: [],
            error: null,
        });
        expect(getProviderAdapter.mock.invocationCallOrder[0]).toBeLessThan(
            save.mock.invocationCallOrder[0],
        );
        expect(add).toHaveBeenCalledWith("generate", data, {
            jobId: taskId,
            attempts: 1,
            removeOnComplete: true,
            removeOnFail: true,
        });
        expect(GENERATION_QUEUE).toBe("image-studio-generation");
        expect(generateImage).not.toHaveBeenCalled();
        expect(writeFile).not.toHaveBeenCalled();
        expect(JSON.stringify(add.mock.calls)).not.toContain(input.prompt);
    });

    it.each(["disabled", "adapter"])(
        "rejects an invalid %s before saving or enqueuing",
        async (kind) => {
            if (kind === "disabled") getModelInfo.mockResolvedValue({ isActive: false });
            else getProviderAdapter.mockResolvedValue({ supports: () => false });
            await expect(service.submit("owner", input)).rejects.toThrow("所选图片模型不可用");
            expect(save).not.toHaveBeenCalled();
            expect(add).not.toHaveBeenCalled();
        },
    );

    it("sanitizes queue failure and prevents delivery of the failed row", async () => {
        add.mockRejectedValue(new Error("redis://password secret"));
        await expect(service.submit("owner", input)).rejects.toThrow(/^图片生成失败，请稍后重试$/);
        expect(record).toMatchObject({ status: "failed", error: "图片生成失败，请稍后重试" });
        await processor.process(job);
        expect(generateImage).not.toHaveBeenCalled();
        expect(JSON.stringify(update.mock.calls)).not.toContain("password");
    });

    it.each(["get", "cancel", "retryTask", "remove"] as const)(
        "rejects another owner's %s before queue or filesystem effects",
        async (method) => {
            seed();
            await expect(service[method]("stranger", taskId)).rejects.toThrow("生成记录不存在");
            expect(update).not.toHaveBeenCalled();
            expect(getJob).not.toHaveBeenCalled();
            expect(add).not.toHaveBeenCalled();
            expect(rm).not.toHaveBeenCalled();
            expect(generateImage).not.toHaveBeenCalled();
        },
    );

    it.each([ImageGenerationStatus.QUEUED, ImageGenerationStatus.PROCESSING])(
        "blocks deletion of %s records",
        async (status) => {
            seed(status);
            await expect(service.remove("owner", taskId)).rejects.toThrow("生成中的记录不可删除");
            expect(remove).not.toHaveBeenCalled();
            expect(rm).not.toHaveBeenCalled();
        },
    );

    it("persists cancellation before queue removal and skips cancelled delivery", async () => {
        seed();
        removeJob.mockImplementation(async () => {
            expect(record?.status).toBe("cancelled");
            throw new Error("job locked");
        });
        await expect(service.cancel("owner", taskId)).resolves.toMatchObject({
            status: "cancelled",
        });
        await processor.process(job);
        expect(generateImage).not.toHaveBeenCalled();
        expect(getModelInfo).not.toHaveBeenCalled();
        expect(writeFile).not.toHaveBeenCalled();
    });

    it.each([
        ImageGenerationStatus.COMPLETED,
        ImageGenerationStatus.FAILED,
        ImageGenerationStatus.CANCELLED,
    ])("returns an already %s record without cancelling effects", async (status) => {
        seed(status);
        await expect(service.cancel("owner", taskId)).resolves.toMatchObject({ status });
        expect(update).not.toHaveBeenCalled();
        expect(getJob).not.toHaveBeenCalled();
    });

    it("processes the same row once under concurrent double delivery and late redelivery", async () => {
        seed();
        await Promise.all([processor.process(job), processor.process(job)]);
        await processor.process(job);
        expect(generateImage).toHaveBeenCalledTimes(1);
        expect(generateImage).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0 }));
        expect(save).not.toHaveBeenCalled();
        expect(record).toMatchObject({ id: taskId, status: "completed" });
        expect(update).toHaveBeenCalledWith(
            { ...data, status: "processing" },
            expect.objectContaining({ status: "completed" }),
        );
    });

    it("does not claim a row with a mismatched worker owner", async () => {
        seed();
        await service.processTask({ ...data, userId: "stranger" });
        expect(generateImage).not.toHaveBeenCalled();
        expect(findOne).not.toHaveBeenCalled();
    });

    it("discards and cleans results when cancellation wins during inference", async () => {
        seed();
        const started = deferred<void>();
        const provider = deferred<{ images: (typeof image)[] }>();
        jest.mocked(generateImage).mockImplementation(() => {
            started.resolve();
            return provider.promise as never;
        });
        const processing = processor.process(job);
        await started.promise;
        await service.cancel("owner", taskId);
        provider.resolve({ images: [image] });
        await processing;
        expect(record).toMatchObject({ status: "cancelled", images: [], error: null });
        expect(rm).toHaveBeenCalledWith(expect.stringContaining(`${taskId}-0.png`), {
            force: true,
        });
        await expect(service.readImage("owner", taskId, 0)).rejects.toThrow("图片不存在");
    });

    it("cleans results when cancellation wins during a file write", async () => {
        seed();
        jest.mocked(writeFile).mockImplementationOnce(async () => {
            await service.cancel("owner", taskId);
        });
        await processor.process(job);
        expect(record).toMatchObject({ status: "cancelled", images: [] });
        expect(rm).toHaveBeenCalledTimes(1);
    });

    it("keeps results when completion wins the cancellation CAS", async () => {
        seed();
        await processor.process(job);
        await expect(service.cancel("owner", taskId)).resolves.toMatchObject({
            status: "completed",
            images: [expect.anything()],
        });
        expect(getJob).not.toHaveBeenCalled();
        expect(rm).not.toHaveBeenCalled();
    });

    it("also protects legacy synchronous completion from cancellation", async () => {
        const started = deferred<void>();
        const provider = deferred<{ images: (typeof image)[] }>();
        jest.mocked(generateImage).mockImplementation(() => {
            started.resolve();
            return provider.promise as never;
        });
        const synchronous = service.generate("owner", input);
        await started.promise;
        await service.cancel("owner", taskId);
        provider.resolve({ images: [image] });
        await expect(synchronous).resolves.toMatchObject({ status: "cancelled", images: [] });
        expect(record).toMatchObject({ status: "cancelled", images: [] });
        expect(save).toHaveBeenCalledTimes(1);
        expect(rm).toHaveBeenCalledWith(expect.stringContaining(`${taskId}-0.png`), {
            force: true,
        });
    });

    it("does not overwrite cancelled legacy requests after provider failure", async () => {
        jest.mocked(generateImage).mockImplementation(async () => {
            await service.cancel("owner", taskId);
            throw new Error("sk-provider-secret");
        });
        await expect(service.generate("owner", input)).rejects.toThrow(
            /^图片生成失败，请稍后重试$/,
        );
        expect(record).toMatchObject({ status: "cancelled", images: [], error: null });
    });

    it("cleans persisted files on completion database failure and marks failed", async () => {
        seed();
        const normalUpdate = update.getMockImplementation()!;
        update.mockImplementation(async (criteria, values) => {
            if (values.status === "completed") throw new Error("db secret");
            return normalUpdate(criteria, values);
        });
        await expect(processor.process(job)).rejects.toThrow(/^图片生成失败，请稍后重试$/);
        expect(record).toMatchObject({ status: "failed", images: [] });
        expect(rm).toHaveBeenCalledWith(expect.stringContaining(`${taskId}-0.png`), {
            force: true,
        });
    });

    it("sanitizes provider failure without paid retries", async () => {
        seed();
        jest.mocked(generateImage).mockRejectedValue(new Error("sk-provider-secret"));
        await expect(processor.process(job)).rejects.toThrow(/^图片生成失败，请稍后重试$/);
        expect(record).toMatchObject({
            status: "failed",
            images: [],
            error: "图片生成失败，请稍后重试",
        });
        expect(generateImage).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(update.mock.calls)).not.toContain("sk-provider-secret");
    });

    it.each([ImageGenerationStatus.QUEUED, ImageGenerationStatus.PROCESSING])(
        "marks %s failed after a worker failure or stall",
        async (status) => {
            seed(status);
            await processor.onFailed(job);
            expect(record).toMatchObject({
                status: "failed",
                images: [],
                error: "图片生成失败，请稍后重试",
            });
        },
    );

    it.each([ImageGenerationStatus.CANCELLED, ImageGenerationStatus.COMPLETED])(
        "does not overwrite %s on a late worker failure",
        async (status) => {
            seed(status);
            await processor.onFailed(job);
            expect(record?.status).toBe(status);
        },
    );

    it("handles absent failed jobs and database errors without exposing details", async () => {
        await expect(processor.onFailed(undefined)).resolves.toBeUndefined();
        update.mockRejectedValue(new Error("db-password"));
        await expect(processor.onFailed(job)).resolves.toBeUndefined();
    });

    it("finalizes a stalled job by its queue-owned identity without inference", async () => {
        seed(ImageGenerationStatus.PROCESSING);
        await processor.onStalled(taskId);
        expect(getJob).toHaveBeenCalledWith(taskId);
        expect(record).toMatchObject({ status: "failed", images: [] });
        expect(generateImage).not.toHaveBeenCalled();
        await processor.process(job);
        expect(generateImage).not.toHaveBeenCalled();
    });

    it.each([ImageGenerationStatus.CANCELLED, ImageGenerationStatus.COMPLETED])(
        "keeps %s unchanged on a stalled event",
        async (status) => {
            seed(status);
            await processor.onStalled(taskId);
            expect(record?.status).toBe(status);
        },
    );

    it("handles a removed stalled job and unavailable Redis without throwing raw errors", async () => {
        getJob.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("redis-password"));
        await expect(processor.onStalled(taskId)).resolves.toBeUndefined();
        await expect(processor.onStalled(taskId)).resolves.toBeUndefined();
        expect(update).not.toHaveBeenCalled();
    });

    it("does not remove queue jobs when cancellation persistence fails", async () => {
        seed();
        update.mockRejectedValue(new Error("db-password"));
        await expect(service.cancel("owner", taskId)).rejects.toThrow(/^图片生成失败，请稍后重试$/);
        expect(getJob).not.toHaveBeenCalled();
        await expect(processor.process(job)).rejects.toThrow(/^图片生成失败，请稍后重试$/);
        expect(generateImage).not.toHaveBeenCalled();
    });

    it("retries asynchronously into a new queued record using the stored input", async () => {
        seed(ImageGenerationStatus.FAILED);
        const oldId = "22222222-2222-4222-8222-222222222222";
        record!.id = oldId;
        await expect(service.retryTask("owner", oldId)).resolves.toMatchObject({
            id: taskId,
            status: "queued",
        });
        expect(create).toHaveBeenCalledWith(expect.objectContaining({ ...input, userId: "owner" }));
        expect(add).toHaveBeenCalledTimes(1);
        expect(generateImage).not.toHaveBeenCalled();
    });

    it("registers a worker with no automatic stalled replay and a renewable lock", () => {
        expect(Reflect.getMetadata("bullmq:processor_metadata", GenerationProcessor)).toMatchObject(
            { name: GENERATION_QUEUE },
        );
        expect(Reflect.getMetadata("bullmq:worker_metadata", GenerationProcessor)).toMatchObject({
            maxStalledCount: 0,
            lockDuration: 120000,
        });
        expect(
            Reflect.getMetadata(
                "bullmq:worker_events_metadata",
                GenerationProcessor.prototype.onFailed,
            ),
        ).toMatchObject({ eventName: "failed" });
        expect(
            Reflect.getMetadata(
                "bullmq:worker_events_metadata",
                GenerationProcessor.prototype.onStalled,
            ),
        ).toMatchObject({ eventName: "stalled" });
    });
});

describe("generation controller contracts", () => {
    it("returns binary images under existing web auth with private response headers", async () => {
        const handler = GenerationController.prototype.image;
        expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(":id/images/:index");
        expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
        expect(Reflect.getMetadata("skip_transform", handler)).toBe(true);
        expect(Reflect.getMetadata("decorator:is-public-controller", handler)).toBeUndefined();
        expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual(
            expect.arrayContaining([
                { name: "X-Content-Type-Options", value: "nosniff" },
                { name: "Cache-Control", value: "private, no-store" },
            ]),
        );
        const readImage = jest
            .fn()
            .mockResolvedValue({ buffer: Buffer.from("png"), mediaType: "image/png" });
        const controller = new GenerationController({ readImage } as unknown as GenerationService);
        const result = await controller.image({ id: "owner" } as never, "task", 0);
        expect(readImage).toHaveBeenCalledWith("owner", "task", 0);
        expect(result).toBeInstanceOf(StreamableFile);
        expect(result.getHeaders()).toMatchObject({ type: "image/png", length: 3 });
    });

    it("keeps capabilities on the authenticated extension web controller", () => {
        expect(Reflect.getMetadata("decorator:plugin-web-controller", GenerationController)).toBe(
            true,
        );
        expect(
            Reflect.getMetadata("decorator:is-public-controller", GenerationController),
        ).toBeUndefined();
        expect(Reflect.getMetadata(PATH_METADATA, GenerationController)).toMatch(
            /image-studio\/.*generations$/,
        );
        expect(
            Reflect.getMetadata(PATH_METADATA, GenerationController.prototype.capabilities),
        ).toBe("capabilities");
        expect(
            Reflect.getMetadata(METHOD_METADATA, GenerationController.prototype.capabilities),
        ).toBe(RequestMethod.GET);
        expect(
            Reflect.getMetadata(
                "decorator:is-public-controller",
                GenerationController.prototype.capabilities,
            ),
        ).toBeUndefined();
    });

    it.each([
        ["listModels", "models", RequestMethod.GET],
        ["list", "/", RequestMethod.GET],
        ["generate", "/", RequestMethod.POST],
        ["retry", ":id/retry", RequestMethod.POST],
        ["remove", ":id", RequestMethod.DELETE],
        ["submit", "tasks", RequestMethod.POST],
        ["get", ":id", RequestMethod.GET],
        ["cancel", ":id/cancel", RequestMethod.POST],
        ["retryTask", ":id/retry-task", RequestMethod.POST],
    ] as const)("preserves the %s route", (method, route, verb) => {
        const handler = GenerationController.prototype[method];
        expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(route);
        expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(verb);
    });

    it("delegates capabilities and legacy user-scoped requests without changing their arguments", async () => {
        const methods = {
            capabilities: jest.fn().mockResolvedValue({ models: [], tools: [] }),
            listModels: jest.fn().mockResolvedValue([]),
            list: jest.fn(),
            generate: jest.fn(),
            retry: jest.fn(),
            remove: jest.fn(),
        };
        const controller = new GenerationController(methods as unknown as GenerationService);
        const user = { id: "owner" } as Parameters<GenerationController["list"]>[0];
        const query = { page: 1, limit: 20 };
        const input = {
            prompt: "A product photo",
            modelId: "model",
            count: 1,
            size: "1024x1024",
            quality: "standard",
            style: "vivid",
        } as const;
        await expect(controller.capabilities()).resolves.toEqual({ models: [], tools: [] });
        await expect(controller.listModels()).resolves.toEqual([]);
        await controller.list(user, query);
        await controller.generate(user, input);
        await controller.retry(user, "record-id");
        await controller.remove(user, "record-id");
        expect(methods.capabilities).toHaveBeenCalledWith();
        expect(methods.list).toHaveBeenCalledWith("owner", query);
        expect(methods.generate).toHaveBeenCalledWith("owner", input);
        expect(methods.retry).toHaveBeenCalledWith("owner", "record-id");
        expect(methods.remove).toHaveBeenCalledWith("owner", "record-id");
    });
});
