import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { ValidationPipe } from "@nestjs/common";
import { generateImage, generateText } from "ai";
import { ImageGenerationStatus } from "../src/api/db/entities/image-generation.entity";
import { ToolWorkflowDto, ToolSuggestionDto } from "../src/api/modules/generation/dto/tool-workflow.dto";
import { GenerationService } from "../src/api/modules/generation/services/generation.service";
import { EXPAND_POSITIONS, RETOUCH_MODES, TOOL_SUGGESTION_SYSTEM, type ToolWorkflowInput } from "../src/api/shared/tool-workflow";
import { AddToolWorkflowInput1793448000000 } from "../src/api/db/migrations/1793448000000-0.1.3-add-tool-workflow-input";
import { GENERATION_FAILED, GENERATION_STORAGE_RESTRICTED } from "../src/api/modules/generation/constants/generation.constants";
import { LOCAL_CUTOUT_MODEL_ID } from "../src/api/shared/tools";
import { CutoutService } from "../src/api/modules/generation/services/cutout.service";

jest.mock("@buildingai/db/@nestjs/typeorm", () => ({ InjectRepository: () => () => undefined }));
jest.mock("@buildingai/db/typeorm", () => ({ Repository: class {}, TableColumn: class { constructor(value: unknown) { Object.assign(this, value); } } }));
jest.mock("@buildingai/errors", () => ({ HttpErrorFactory: { badRequest: (message: string) => new Error(message), notFound: (message: string) => new Error(message) } }));
jest.mock("ai", () => ({ generateImage: jest.fn(), generateText: jest.fn() }));
jest.mock("../src/api/db/entities/image-generation.entity", () => ({ ImageGeneration: class {}, ImageGenerationStatus: { QUEUED: "queued", PROCESSING: "processing", COMPLETED: "completed", CANCELLED: "cancelled", FAILED: "failed" } }));
jest.mock("../src/api/modules/generation/services/generation-model.service", () => ({ GenerationModelService: class {} }));
jest.mock("../src/api/modules/generation/services/generation-image.service", () => ({ GenerationImageService: class {} }));
jest.mock("../src/api/modules/generation/services/product-image.service", () => ({ ProductImageService: class {} }));
jest.mock("../src/api/modules/generation/services/generation-billing.service", () => ({ GenerationBillingService: class {} }));
jest.mock("../src/api/modules/generation/services/cutout.service", () => ({ CutoutService: class { static ready = jest.fn().mockResolvedValue(true); },
    cutoutSourceSize: jest.fn().mockResolvedValue({ width: 64, height: 96 }) }));

const modelId = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";
const secondAsset = "33333333-3333-4333-8333-333333333333";
const input = (overrides: Partial<ToolWorkflowInput> = {}): ToolWorkflowInput => ({ tool: "retouch", modelId, assetIds: [assetId], productName: "Product", instructions: "Lighting", count: 2, ratio: "1:1", ...overrides });

const designRequests: ToolWorkflowInput[] = [
    input({ tool: "detail", design: { brand: "Confirmed brand", platform: "淘宝", language: "English", description: "Confirmed description", detailModules: ["hero", "selling", "specs"], outputModules: ["selling", "hero"] } }),
    input({ tool: "replica", productName: undefined, assetIds: [secondAsset, assetId], design: { productAssetIds: [assetId], replicaMode: "faithful" } }),
    input({ tool: "creative", productName: undefined, assetIds: [], instructions: "Geometric glass sculpture", design: { description: "Confirmed creative request", language: "English" } }),
    input({ tool: "fusion", productName: undefined, assetIds: [secondAsset, assetId], design: { productAssetIds: [assetId], fusionPreset: "print" } }),
    input({ tool: "sku", productName: undefined, design: { skuVariants: [{ name: "Blue edition", instruction: "Change panel to blue" }, { name: "Green edition", instruction: "Change panel to green" }], skuRegion: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 } } }),
    input({ tool: "sku", productName: undefined, instructions: "", count: 10, assetIds: [assetId, secondAsset], design: {
        skuRegions: [1, 2, 3].map((index) => ({ id: `region-${index}`, region: { x: index * .2, y: .1, width: .1, height: .2 } })),
        skuVariants: Array.from({ length: 10 }, (_value, index) => ({ name: `SKU ${index + 1}`, instruction: "", edits: [1, 2, 3].map((region) => ({
            regionId: `region-${region}`, instruction: `Only output ${index + 1}, region ${region}`, ...(region === 1 ? { referenceAssetId: secondAsset } : {}) })) })),
    } }),
    input({ tool: "watermark", productName: undefined, count: 1, authorized: true, design: { watermarkRegion: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 } } }),
    input({ tool: "watermark", productName: undefined, count: 1, authorized: true, design: { watermarkRegions: [{ x: .1, y: .2, width: .2, height: .3 }, { x: .5, y: .6, width: .2, height: .3 }, { x: .7, y: .1, width: .2, height: .2 }] } }),
    input({ tool: "translate", productName: undefined, count: 1, targetLanguage: "日本語", design: { protectSubject: true } }),
    ...EXPAND_POSITIONS.map((position) => input({ tool: "expand", productName: undefined, count: 1, ratio: "16:9", expansion: "surround", design: { expandScale: 37, expandPosition: position.id } })),
    ...RETOUCH_MODES.map((mode) => input({ tool: "retouch", productName: undefined, count: 1, design: { retouchMode: mode.id } })),
    input({ tool: "redraw", productName: undefined, count: 1, instructions: "", assetIds: [assetId, secondAsset], design: {
        redrawRegions: [{ x: .1, y: .2, width: .3, height: .4 }], redrawEdits: [{ instruction: "Replace only the pocket", referenceAssetId: secondAsset }],
    } }),
    input({ tool: "redraw", productName: undefined, count: 1, instructions: "Change the bag to black", design: { redrawRegions: [{ x: .1, y: .2, width: .3, height: .4 }] } }),
];

function fixture() {
    const record = { id: "task", userId: "owner", ...input(), toolKey: "retouch", toolInput: input(), status: ImageGenerationStatus.PROCESSING, images: [], error: null };
    const builder = { where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getExists: jest.fn().mockResolvedValue(false) };
    const repository = { manager: {} as any, findOne: jest.fn().mockResolvedValue(record), update: jest.fn().mockResolvedValue({ affected: 1 }), createQueryBuilder: jest.fn().mockReturnValue(builder) };
    const manager = { transaction: jest.fn(async (callback) => callback(manager)), query: jest.fn().mockResolvedValue([]), getRepository: jest.fn().mockReturnValue(repository) };
    repository.manager = manager;
    const model = { id: modelId, name: "Seedream", billingRule: { power: 2 } };
    const imageModel = { provider: "volcengine", modelId: "doubao-seedream-5-0-lite", supportsReferenceImages: true };
    const prepare = jest.fn().mockResolvedValue({ model, imageModel });
    const prepareVision = jest.fn().mockResolvedValue({ model: { name: "vision" }, providerOptions: {} });
    const read = jest.fn().mockResolvedValue(Buffer.from("owned"));
    const readThumbnail = jest.fn().mockResolvedValue(Buffer.from("thumbnail"));
    const readForAnalysis = jest.fn().mockResolvedValue(Buffer.from("owned-resized"));
    const remove = jest.fn().mockResolvedValue({ success: true });
    const createTask = jest.fn(async (_manager, data) => ({ id: "new-task", ...data }));
    const finishUnsuccessful = jest.fn().mockResolvedValue({ ...record, status: ImageGenerationStatus.FAILED });
    const add = jest.fn().mockResolvedValue({});
    const persist = jest.fn().mockResolvedValue([{ url: "private", mediaType: "image/png" }]);
    const cleanup = jest.fn().mockResolvedValue(undefined);
    const materials = { read, readThumbnail, readForAnalysis, remove, groups: jest.fn().mockResolvedValue(["Shop"]),
        updateMetadata: jest.fn(), createGroup: jest.fn(), changeGroup: jest.fn() };
    const localGenerate = jest.fn().mockResolvedValue(Buffer.from("transparent-png"));
    const service = new GenerationService(repository as never, { prepare, prepareVision } as never, { persist, cleanup, url: () => "protected" } as never, { add } as never, materials as never, { createTask, finishUnsuccessful } as never, { generate: localGenerate, ready: CutoutService.ready, billingRule: () => ({ power: 0 }) } as never);
    return { service, record, repository, manager, builder, prepare, imageModel, read, readThumbnail, readForAnalysis, remove, createTask, finishUnsuccessful, add, persist, cleanup, prepareVision, materials, localGenerate };
}

describe("tool DTO whitelist", () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    it("accepts typed inputs and rejects arbitrary URLs and unknown fields", async () => {
        await expect(pipe.transform(input(), { type: "body", metatype: ToolWorkflowDto })).resolves.toBeInstanceOf(ToolWorkflowDto);
        for (const bad of [{ url: "https://example.test" }, { assetIds: ["url"] }, { modelId: "bad" }, { count: "2" }, { count: 5 }, { ratio: "bad" }, { authorized: "true" }, { targetLanguage: "bad" }, { expansion: "bad" }]) {
            await expect(pipe.transform(input(bad as never), { type: "body", metatype: ToolWorkflowDto })).rejects.toThrow();
        }
    });
    it("validates read-only suggestions without generation settings", () => {
        expect(validateSync(plainToInstance(ToolSuggestionDto, { modelId, assetIds: [assetId], productName: "Product", language: "English" }))).toHaveLength(0);
        expect(validateSync(plainToInstance(ToolSuggestionDto, { modelId, assetIds: [assetId], productName: "Product", language: "invalid" }))).not.toHaveLength(0);
    });
    it.each(designRequests)("retains the complete nested design and order for $tool", async (request) => {
        const result = await pipe.transform(request, { type: "body", metatype: ToolWorkflowDto });
        expect(result).toBeInstanceOf(ToolWorkflowDto);
        expect(result.design).toEqual(request.design);
        expect(result.assetIds).toEqual(request.assetIds);
        expect(result.productName).toBe(request.productName);
    });
    it.each([
        input({ tool: "creative", assetIds: [], instructions: " " }),
        input({ assetIds: [] }), input({ productName: undefined }), input({ tool: "creative", productName: null } as never),
        input({ tool: "detail", design: { unknown: true } } as never), input({ tool: "creative", design: [] } as never),
        input({ tool: "creative", design: { skuRegion: {} } } as never),
        input({ tool: "detail", design: { detailModules: ["hero"], outputModules: ["hero"] } }),
        input({ tool: "fusion", assetIds: [assetId, secondAsset], design: { productAssetIds: [assetId, secondAsset] } }),
        input({ tool: "sku", variant: "Blue", design: { skuRegion: { x: NaN, y: 0, width: 1, height: 1 } } }),
        input({ tool: "sku", count: 1, design: { skuVariants: [{ name: "Blue", instruction: "Blue", extra: true }] } } as never),
        input({ tool: "watermark", count: 1, authorized: false, design: { watermarkRegion: { x: 0, y: 0, width: 1, height: 1 } } }),
        input({ tool: "watermark", count: 1, authorized: true, design: { watermarkRegion: { x: 0.8, y: 0, width: 0.5, height: 1 } } }),
        input({ tool: "watermark", count: 1, authorized: true, design: { watermarkRegions: [] } }),
        input({ tool: "watermark", count: 1, authorized: true, design: { watermarkRegions: Array.from({ length: 4 }, () => ({ x: 0, y: 0, width: 1, height: 1 })) } }),
        input({ tool: "watermark", count: 1, authorized: true, design: { watermarkRegion: { x: 0, y: 0, width: 1, height: 1 }, watermarkRegions: [{ x: 0, y: 0, width: 1, height: 1 }] } }),
        input({ tool: "translate", count: 1, targetLanguage: "日本語", design: { watermarkRegions: [{ x: 0, y: 0, width: 1, height: 1 }] } }),
        input({ tool: "translate", count: 1, targetLanguage: "日本語", design: { protectSubject: "true" } } as never),
        input({ tool: "retouch", count: 1, design: { retouchMode: "unknown" } } as never),
        input({ tool: "retouch", count: 2, design: { retouchMode: "overall" } }),
        input({ tool: "expand", count: 1, expansion: "surround", design: { expandScale: 0, expandPosition: "center" } }),
        input({ tool: "expand", count: 1, expansion: "surround", design: { expandScale: 101, expandPosition: "center" } }),
        input({ tool: "expand", count: 1, expansion: "surround", design: { expandScale: 80, expandPosition: "unknown" } } as never),
        input({ tool: "expand", count: 1, expansion: "surround", assetIds: [assetId, secondAsset], design: { expandScale: 80, expandPosition: "center" } }),
        input({ tool: "expand", count: 2, expansion: "surround", design: { expandScale: 80, expandPosition: "center" } }),
        input({ tool: "expand", count: 1, expansion: "horizontal", design: { expandScale: 80, expandPosition: "center" } }),
        input({ tool: "retouch", count: 1, design: { retouchMode: "overall", expandScale: 80 } }),
    ])("rejects malformed or inapplicable nested design at the DTO boundary %#", async (request) => {
        await expect(pipe.transform(request, { type: "body", metatype: ToolWorkflowDto })).rejects.toThrow();
    });
});

describe("tool generation lifecycle", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.mocked(generateImage).mockResolvedValue({ images: [{ base64: "image", mediaType: "image/png" }] } as never);
        jest.mocked(generateText).mockResolvedValue({ text: "Observations and suggestions" } as never);
    });
    it("creates original-size Tencent cutout with configured credits without public model inference", async () => {
        const state = fixture();
        const request = input({ tool: "cutout", modelId: LOCAL_CUTOUT_MODEL_ID, productName: undefined,
            count: 1, instructions: "", design: { backgroundColor: null } });
        const result = await state.service.submitTool("owner", request);
        expect(result.modelId).toBe(LOCAL_CUTOUT_MODEL_ID);
        expect(state.createTask).toHaveBeenCalledWith(state.manager, expect.objectContaining({ toolKey: "cutout", toolInput: request, size: "64x96", quality: "原图", count: 1 }), { power: 0 });
        Object.assign(state.record, { toolKey: "cutout", modelId: LOCAL_CUTOUT_MODEL_ID, count: 1, toolInput: request });
        await state.service.processTask({ id: "task", userId: "owner" });
        expect(state.localGenerate).toHaveBeenCalledWith(Buffer.from("owned"), null);
        expect(state.persist).toHaveBeenCalledWith("task", [{ base64: Buffer.from("transparent-png").toString("base64"), mediaType: "image/png" }]);
        expect(state.prepare).not.toHaveBeenCalled(); expect(generateImage).not.toHaveBeenCalled(); expect(generateText).not.toHaveBeenCalled();
    });
    it("rejects unavailable Tencent configuration before creating or queuing a task", async () => {
        const state = fixture();
        jest.mocked(CutoutService.ready).mockResolvedValueOnce(false);
        await expect(state.service.submitTool("owner", input({ tool: "cutout", modelId: LOCAL_CUTOUT_MODEL_ID,
            count: 1, instructions: "", design: { backgroundColor: "#ffffff" } }))).rejects.toThrow("腾讯云抠图未配置");
        expect(state.createTask).not.toHaveBeenCalled(); expect(state.add).not.toHaveBeenCalled(); expect(state.localGenerate).not.toHaveBeenCalled();
    });
    it("processes redraw regions with the existing no-retry reference-image model", async () => {
        const state = fixture();
        const request = designRequests[designRequests.length - 1]!;
        Object.assign(state.record, { toolKey: "redraw", count: 1, toolInput: request });
        await state.service.processTask({ id: "task", userId: "owner" });
        expect(generateImage).toHaveBeenCalledTimes(1);
        expect(generateImage).toHaveBeenCalledWith(expect.objectContaining({ n: 1, maxRetries: 0,
            prompt: { text: expect.stringContaining(JSON.stringify(request.design!.redrawRegions![0])), images: [Buffer.from("owned")] } }));
        expect(state.localGenerate).not.toHaveBeenCalled();
    });
    it("retains a safe Tencent permission error without retrying or persisting output", async () => {
        const state = fixture();
        Object.assign(state.record, { toolKey: "cutout", modelId: LOCAL_CUTOUT_MODEL_ID, count: 1,
            toolInput: input({ tool: "cutout", modelId: LOCAL_CUTOUT_MODEL_ID, count: 1, instructions: "", design: { backgroundColor: null } }) });
        state.localGenerate.mockRejectedValueOnce(new Error("CUTOUT_ACCESS_DENIED"));
        await expect(state.service.processTask({ id: "task", userId: "owner" })).rejects.toThrow(GENERATION_FAILED);
        expect(state.finishUnsuccessful).toHaveBeenCalledWith(state.manager, "owner", "task", ImageGenerationStatus.FAILED, expect.stringContaining("ci:CreateS3AIPicMattingJob"));
        expect(state.localGenerate).toHaveBeenCalledTimes(1);
        expect(state.persist).not.toHaveBeenCalled();
    });
    it("reads both owned redraw images in order and sends the linked regional reference to the model", async () => {
        const state = fixture(), request = designRequests.find((item) => item.design?.redrawEdits)!;
        state.read.mockImplementation(async (_owner, id) => Buffer.from(id));
        Object.assign(state.record, { toolKey: "redraw", count: 1, toolInput: request });
        await state.service.processTask({ id: "task", userId: "owner" });
        expect(state.read).toHaveBeenCalledWith("owner", secondAsset);
        expect(generateImage).toHaveBeenCalledWith(expect.objectContaining({ n: 1, maxRetries: 0,
            prompt: { text: expect.stringContaining("Reference image 2 applies only to this region"), images: [Buffer.from(assetId), Buffer.from(secondAsset)] } }));
    });
    it("rejects redraw references exceeding the actual provider limit before billing", async () => {
        const state = fixture(), request = designRequests.find((item) => item.design?.redrawEdits)!;
        state.imageModel.provider = "openai";
        await expect(state.service.submitTool("owner", request)).rejects.toThrow();
        expect(state.createTask).not.toHaveBeenCalled(); expect(state.add).not.toHaveBeenCalled();
    });
    it("retains a safe COS 451 reason through compensation and public records without retrying generation", async () => {
        const state = fixture();
        Object.assign(state.record, { toolKey: "watermark", count: 1, toolInput: input({ tool: "watermark", count: 1, authorized: true }) });
        const failure = new Error(GENERATION_STORAGE_RESTRICTED, { cause: Object.assign(new Error("private cloud response"), { code: "UnavailableForLegalReasons", statusCode: 451 }) });
        state.persist.mockRejectedValueOnce(failure);
        await expect(state.service.processTask({ id: "task", userId: "owner" })).rejects.toThrow(GENERATION_FAILED);
        expect(state.finishUnsuccessful).toHaveBeenCalledTimes(1);
        expect(state.finishUnsuccessful).toHaveBeenCalledWith(state.manager, "owner", "task", ImageGenerationStatus.FAILED, GENERATION_STORAGE_RESTRICTED);
        expect(state.cleanup).toHaveBeenCalledWith("task", []);
        expect(state.repository.update).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: ImageGenerationStatus.COMPLETED }));
        expect(state.service["publicRecord"]({ ...state.record, error: GENERATION_STORAGE_RESTRICTED } as never).error).toBe(GENERATION_STORAGE_RESTRICTED);
        expect(state.service["publicRecord"]({ ...state.record, error: "private cloud response" } as never).error).toBe(GENERATION_FAILED);
        expect(generateImage).toHaveBeenCalledTimes(1);
    });
    it("does not misclassify model failures as a COS restriction", async () => {
        const state = fixture();
        jest.mocked(generateImage).mockRejectedValueOnce(new Error(GENERATION_STORAGE_RESTRICTED));
        await expect(state.service.processTask({ id: "task", userId: "owner" })).rejects.toThrow(GENERATION_FAILED);
        expect(state.persist).not.toHaveBeenCalled();
        expect(state.finishUnsuccessful).toHaveBeenCalledWith(state.manager, "owner", "task", ImageGenerationStatus.FAILED);
    });
    it("delegates thumbnails separately from original reads without database or queue work", async () => {
        const state = fixture();
        await expect(state.service.readProductThumbnail("owner", assetId)).resolves.toEqual(Buffer.from("thumbnail"));
        expect(state.readThumbnail).toHaveBeenCalledWith("owner", assetId);
        expect(state.read).not.toHaveBeenCalled();
        expect(state.manager.transaction).not.toHaveBeenCalled();
        expect(state.add).not.toHaveBeenCalled();
        await expect(state.service.readProductImage("owner", assetId)).resolves.toEqual(Buffer.from("owned"));
        state.readThumbnail.mockRejectedValueOnce(new Error("not found"));
        await expect(state.service.readProductThumbnail("other", assetId)).rejects.toThrow("not found");
    });
    it("reads owned assets under the advisory lock before billing and retains metadata", async () => {
        const state = fixture();
        const result = await state.service.submitTool("owner", input());
        expect(state.manager.query).toHaveBeenCalledWith(expect.stringContaining("pg_advisory_xact_lock"), ["image-studio-products:owner"]);
        expect(state.read).toHaveBeenCalledWith("owner", assetId);
        expect(state.manager.query.mock.invocationCallOrder[0]).toBeLessThan(state.read.mock.invocationCallOrder[0]);
        expect(state.read.mock.invocationCallOrder[0]).toBeLessThan(state.createTask.mock.invocationCallOrder[0]);
        expect(state.createTask).toHaveBeenCalledWith(state.manager, expect.objectContaining({ toolKey: "retouch", toolInput: input(), count: 2, status: "queued" }), { power: 2 });
        expect(result.toolInput).toEqual(input());
        expect(state.add).toHaveBeenCalledWith("generate", { id: "new-task", userId: "owner" }, expect.objectContaining({ attempts: 1 }));
        expect(generateImage).not.toHaveBeenCalled();
    });
    it.each(designRequests)("stores and returns complete $tool design without inference during submission", async (request) => {
        const state = fixture();
        const result = await state.service.submitTool("owner", request);
        expect(state.createTask).toHaveBeenCalledWith(state.manager, expect.objectContaining({ toolKey: request.tool, toolInput: request, count: request.count, status: "queued" }), { power: 2 });
        expect(result.toolInput).toEqual(request);
        expect(result.toolInput!.design).toEqual(request.design);
        expect(generateImage).not.toHaveBeenCalled(); expect(generateText).not.toHaveBeenCalled();
    });
    it.each(designRequests.filter((request) => ["watermark", "translate", "retouch"].includes(request.tool)))("processes one $tool output using the saved editing metadata and existing configured model", async (request) => {
        const state = fixture();
        Object.assign(state.record, { toolKey: request.tool, count: request.count, toolInput: request });
        await state.service.processTask({ id: "task", userId: "owner" });
        expect(generateImage).toHaveBeenCalledTimes(1);
        expect(generateImage).toHaveBeenCalledWith(expect.objectContaining({ model: state.imageModel, n: 1, maxRetries: 0,
            prompt: { text: expect.stringContaining(request.tool === "watermark" ? JSON.stringify(request.design!.watermarkRegion ?? request.design!.watermarkRegions![0]) : request.tool === "retouch" ? RETOUCH_MODES.find((mode) => mode.id === request.design!.retouchMode)!.instruction : "Protect the product subject"), images: [Buffer.from("owned")] } }));
        for (const region of request.design?.watermarkRegions ?? []) expect((jest.mocked(generateImage).mock.calls[0][0].prompt as { text: string }).text).toContain(JSON.stringify(region));
        expect(state.persist).toHaveBeenCalledTimes(1); expect(generateText).not.toHaveBeenCalled();
    });
    it.each(["openai", "custom-provider"])("selects the configured %s text-only adapter for reference-free creative", async (provider) => {
        const state = fixture();
        const selectedModelId = "44444444-4444-4444-8444-444444444444";
        const request = input({ tool: "creative", modelId: selectedModelId, productName: undefined, assetIds: [], instructions: "A geometric glass sculpture", design: { platform: "其他" } });
        const imageModel = { provider, modelId: "configured-image-model", supportsReferenceImages: false };
        state.prepare.mockResolvedValue({ imageModel, model: { id: selectedModelId, name: "Configured image model", billingRule: { power: 2 } } });
        const result = await state.service.submitTool("owner", request);
        expect(result.modelId).toBe(selectedModelId);
        expect(state.read).not.toHaveBeenCalled(); expect(generateImage).not.toHaveBeenCalled();
        Object.assign(state.record, { toolKey: "creative", modelId: selectedModelId, toolInput: request });
        await state.service.processTask({ id: "task", userId: "owner" });
        expect(state.prepare.mock.calls).toEqual([[selectedModelId], [selectedModelId]]);
        expect(generateImage).toHaveBeenCalledTimes(2);
        for (const [call] of jest.mocked(generateImage).mock.calls) {
            expect(call).toMatchObject({ model: imageModel, n: 1, maxRetries: 0, size: "2048x2048" });
            expect(typeof call.prompt).toBe("string");
            expect(call.prompt).toContain(request.instructions);
            expect(call.prompt).toContain("No reference images were supplied");
        }
        expect(state.read).not.toHaveBeenCalled(); expect(state.finishUnsuccessful).not.toHaveBeenCalled();
    });
    it("requires actual reference support and adapter limits for referenced creative before charging", async () => {
        const state = fixture();
        const request = input({ tool: "creative", assetIds: [secondAsset, assetId] });
        state.imageModel.supportsReferenceImages = false;
        await expect(state.service.submitTool("owner", { ...request, assetIds: [assetId] })).rejects.toThrow();
        state.imageModel.supportsReferenceImages = true;
        state.imageModel.provider = "custom-provider";
        await expect(state.service.submitTool("owner", request)).rejects.toThrow();
        expect(state.createTask).not.toHaveBeenCalled(); expect(state.add).not.toHaveBeenCalled(); expect(state.read).not.toHaveBeenCalled();
        await expect(state.service.submitTool("owner", { ...request, assetIds: [assetId] })).resolves.toHaveProperty("toolInput");
    });
    it("sends owned creative references in asset order with one no-retry call per output", async () => {
        const state = fixture();
        const request = input({ tool: "creative", assetIds: [secondAsset, assetId], instructions: "Arrange these shapes", design: { language: "English" } });
        state.read.mockImplementation(async (_userId, id) => Buffer.from(id));
        await state.service.submitTool("owner", request);
        Object.assign(state.record, { toolKey: "creative", toolInput: request });
        await state.service.processTask({ id: "task", userId: "owner" });
        expect(state.read.mock.calls.slice(-2)).toEqual([["owner", secondAsset], ["owner", assetId]]);
        expect(generateImage).toHaveBeenCalledTimes(2);
        expect(generateImage).toHaveBeenCalledWith(expect.objectContaining({ model: state.imageModel, prompt: { text: expect.stringContaining(request.instructions), images: [Buffer.from(secondAsset), Buffer.from(assetId)] }, n: 1, maxRetries: 0 }));
    });
    it.each(["reference-support", "reference-limit"])("rechecks changed creative %s during processing and uses inherited refund", async (change) => {
        const state = fixture();
        const request = input({ tool: "creative", assetIds: [assetId, secondAsset] });
        Object.assign(state.record, { toolKey: "creative", toolInput: request });
        if (change === "reference-support") state.imageModel.supportsReferenceImages = false;
        else state.imageModel.provider = "custom-provider";
        await expect(state.service.processTask({ id: "task", userId: "owner" })).rejects.toThrow();
        expect(generateImage).not.toHaveBeenCalled(); expect(state.persist).not.toHaveBeenCalled(); expect(state.read).not.toHaveBeenCalled();
        expect(state.finishUnsuccessful).toHaveBeenCalledTimes(1);
    });
    it.each([
        { request: designRequests[0], first: '"id":"selling"', second: '"id":"hero"' },
        { request: designRequests[4], first: "Blue edition", second: "Green edition" },
    ])("passes only the matching per-output module or variant to the adapter %#", async ({ request, first, second }) => {
        const state = fixture();
        Object.assign(state.record, { toolKey: request.tool, toolInput: request });
        await state.service.processTask({ id: "task", userId: "owner" });
        const prompts = jest.mocked(generateImage).mock.calls.map(([call]) => (call.prompt as { text: string }).text);
        expect(prompts).toHaveLength(2);
        expect(prompts[0]).toContain(first); expect(prompts[0]).not.toContain(second);
        expect(prompts[1]).toContain(second); expect(prompts[1]).not.toContain(first);
        expect(generateText).not.toHaveBeenCalled();
    });
    it("rejects inaccessible assets before billing or queue entry", async () => {
        const state = fixture();
        state.read.mockRejectedValue(new Error("not owned"));
        await expect(state.service.submitTool("other", input())).rejects.toThrow("not owned");
        expect(state.createTask).not.toHaveBeenCalled();
        expect(state.add).not.toHaveBeenCalled();
    });
    it.each([input({ tool: "watermark" }), input({ tool: "fusion" }), input({ count: 0 }), input({ tool: "sku" })])("rejects invalid business input before prepare or billing", async (bad) => {
        const state = fixture();
        await expect(state.service.submitTool("owner", bad)).rejects.toThrow();
        expect(state.prepare).not.toHaveBeenCalled();
        expect(state.createTask).not.toHaveBeenCalled();
    });
    it("rejects text-only and unverified multi-image adapters before charging", async () => {
        const state = fixture();
        state.imageModel.supportsReferenceImages = false;
        await expect(state.service.submitTool("owner", input())).rejects.toThrow();
        state.imageModel.supportsReferenceImages = true;
        state.imageModel.provider = "unknown";
        await expect(state.service.submitTool("owner", input({ tool: "fusion", assetIds: [assetId, secondAsset] }))).rejects.toThrow();
        expect(state.createTask).not.toHaveBeenCalled();
    });
    it("accepts verified fusion and authorized watermark input", async () => {
        const state = fixture();
        await state.service.submitTool("owner", input({ tool: "fusion", assetIds: [assetId, secondAsset] }));
        await state.service.submitTool("owner", input({ tool: "watermark", authorized: true }));
        expect(state.createTask).toHaveBeenCalledTimes(2);
    });
    it("uses inherited unsuccessful-task refund on queue failure", async () => {
        const state = fixture();
        state.add.mockRejectedValue(new Error("queue down"));
        await expect(state.service.submitTool("owner", input())).rejects.toThrow();
        expect(state.finishUnsuccessful).toHaveBeenCalledWith(state.manager, "owner", "new-task", "failed");
    });
    it.each(["retry", "retryTask"] as const)("%s preserves tool inputs and never falls back to creative", async (method) => {
        const state = fixture();
        const submit = jest.spyOn(state.service, "submitTool").mockResolvedValue({ id: "new" } as never);
        await state.service[method]("owner", "task");
        expect(submit).toHaveBeenCalledWith("owner", input());
        state.record.toolInput = null as never;
        await expect(state.service[method]("owner", "task")).rejects.toThrow();
    });
    it.each(["retry", "retryTask"] as const)("%s preserves full design and asset roles for all design workflows", async (method) => {
        for (const request of designRequests) {
            const state = fixture();
            Object.assign(state.record, { toolKey: request.tool, toolInput: request });
            const result = await state.service[method]("owner", "task");
            expect(result.toolInput).toEqual(request);
            expect(state.createTask).toHaveBeenCalledWith(state.manager, expect.objectContaining({ toolInput: request }), { power: 2 });
        }
        expect(generateImage).not.toHaveBeenCalled(); expect(generateText).not.toHaveBeenCalled();
    });
    it.each(["retry", "retryTask"] as const)("%s keeps ordinary legacy creative records on the existing retry path", async (method) => {
        const state = fixture();
        Object.assign(state.record, { toolKey: "creative", toolInput: null, prompt: "Legacy prompt", size: "1024x1024" });
        const legacy = jest.spyOn(state.service, method === "retry" ? "generate" : "submit").mockResolvedValue({ id: "legacy-retry" } as never);
        const submitTool = jest.spyOn(state.service, "submitTool");
        await expect(state.service[method]("owner", "task")).resolves.toHaveProperty("id", "legacy-retry");
        expect(legacy).toHaveBeenCalledWith("owner", expect.objectContaining({ prompt: "Legacy prompt", modelId, size: "1024x1024", count: 2 }));
        expect(submitTool).not.toHaveBeenCalled();
    });
    it("keeps ordinary legacy creative inference batched without tool input", async () => {
        const state = fixture();
        Object.assign(state.record, { toolKey: "creative", toolInput: null, prompt: "Legacy prompt", size: "1024x1024" });
        state.prepare.mockResolvedValue({ imageModel: state.imageModel, model: { provider: { provider: "custom-provider" } } });
        await state.service.processTask({ id: "task", userId: "owner" });
        expect(generateImage).toHaveBeenCalledTimes(1);
        expect(generateImage).toHaveBeenCalledWith(expect.objectContaining({ prompt: "Legacy prompt", n: 2, maxRetries: 0, size: "1024x1024" }));
        expect(state.read).not.toHaveBeenCalled();
    });
    it("protects main and tool reference images with a user-scoped OR query under the same lock", async () => {
        const state = fixture();
        state.builder.getExists.mockResolvedValue(true);
        await expect(state.service.removeProductImage("owner", assetId)).rejects.toThrow();
        expect(state.builder.where).toHaveBeenCalledWith("generation.userId = :userId", { userId: "owner" });
        expect(state.builder.andWhere).toHaveBeenCalledWith(expect.stringContaining("OR generation.toolInput @>"), { input: JSON.stringify({ assetIds: [assetId] }) });
        expect(state.remove).not.toHaveBeenCalled();
    });
    it.each(["metadata", "create", "rename", "delete"])("serializes material %s mutations under the existing product lock", async (operation) => {
        const state = fixture();
        const mutations = {
            metadata: () => state.service.updateProductImage("owner", assetId, { name: "Front", group: "Shop" }),
            create: () => state.service.createProductImageGroup("owner", "Shop"),
            rename: () => state.service.changeProductImageGroup("owner", "Shop", "New"),
            delete: () => state.service.changeProductImageGroup("owner", "Shop"),
        };
        await mutations[operation]();
        const method = operation === "metadata" ? state.materials.updateMetadata : operation === "create" ? state.materials.createGroup : state.materials.changeGroup;
        expect(state.manager.query).toHaveBeenCalledWith(expect.stringContaining("pg_advisory_xact_lock"), ["image-studio-products:owner"]);
        expect(state.manager.query.mock.invocationCallOrder[0]).toBeLessThan(method.mock.invocationCallOrder[0]);
        expect(method.mock.calls[0][0]).toBe("owner");
        expect(state.add).not.toHaveBeenCalled(); expect(state.createTask).not.toHaveBeenCalled();
        expect(generateImage).not.toHaveBeenCalled(); expect(generateText).not.toHaveBeenCalled();
    });
    it("reads material groups without billing, transactions or inference", async () => {
        const state = fixture();
        await expect(state.service.listProductImageGroups("owner")).resolves.toEqual(["Shop"]);
        expect(state.materials.groups).toHaveBeenCalledWith("owner");
        expect(state.manager.transaction).not.toHaveBeenCalled(); expect(state.createTask).not.toHaveBeenCalled();
        expect(generateImage).not.toHaveBeenCalled(); expect(generateText).not.toHaveBeenCalled();
    });
    it("makes one reference-image request per result, with no automatic retries", async () => {
        const state = fixture();
        await state.service.processTask({ id: "task", userId: "owner" });
        expect(generateImage).toHaveBeenCalledTimes(2);
        expect(generateImage).toHaveBeenCalledWith(expect.objectContaining({ n: 1, maxRetries: 0, prompt: { text: expect.any(String), images: [Buffer.from("owned")] }, abortSignal: expect.any(AbortSignal) }));
        expect(state.persist).toHaveBeenCalledTimes(1);
        expect(state.finishUnsuccessful).not.toHaveBeenCalled();
    });
    it("checks cancellation before each call and cleans outputs through inherited failure handling", async () => {
        const state = fixture();
        jest.mocked(generateImage).mockImplementationOnce(async () => {
            state.record.status = ImageGenerationStatus.CANCELLED;
            return { images: [{ base64: "image", mediaType: "image/png" }] } as never;
        });
        await expect(state.service.processTask({ id: "task", userId: "owner" })).rejects.toThrow();
        expect(generateImage).toHaveBeenCalledTimes(1);
        expect(state.persist).not.toHaveBeenCalled();
        expect(state.cleanup).toHaveBeenCalled();
        expect(state.finishUnsuccessful).toHaveBeenCalled();
    });
    it("refunds unexpected output counts without persisting partial images", async () => {
        const state = fixture();
        jest.mocked(generateImage).mockResolvedValueOnce({ images: [] } as never);
        await expect(state.service.processTask({ id: "task", userId: "owner" })).rejects.toThrow();
        expect(state.persist).not.toHaveBeenCalled();
        expect(state.finishUnsuccessful).toHaveBeenCalledTimes(1);
    });
    it("does not infer when the task was cancelled before the first image call", async () => {
        const state = fixture();
        state.repository.findOne.mockResolvedValueOnce(state.record).mockResolvedValueOnce(state.record).mockResolvedValue({ ...state.record, status: ImageGenerationStatus.CANCELLED });
        await expect(state.service.processTask({ id: "task", userId: "owner" })).rejects.toThrow();
        expect(generateImage).not.toHaveBeenCalled();
        expect(state.persist).not.toHaveBeenCalled();
    });
    it("suggests explicitly from owned resized images with bounded safe vision and no billing", async () => {
        const state = fixture();
        const result = await state.service.suggestProduct("owner", { modelId, assetIds: [assetId], productName: "Product", language: "English" });
        expect(result).toEqual({ suggestions: "Observations and suggestions" });
        expect(state.readForAnalysis).toHaveBeenCalledWith("owner", assetId);
        expect(generateText).toHaveBeenCalledWith(expect.objectContaining({ system: TOOL_SUGGESTION_SYSTEM, maxRetries: 0, maxOutputTokens: 1200 }));
        expect(state.createTask).not.toHaveBeenCalled();
        expect(generateImage).not.toHaveBeenCalled();
    });
    it("rejects foreign suggestion images before vision and bounds/cleans failure messages", async () => {
        const state = fixture();
        state.readForAnalysis.mockRejectedValueOnce(new Error("not owned"));
        const request = { modelId, assetIds: [assetId], productName: "Product", language: "English" as const };
        await expect(state.service.suggestProduct("owner", request)).rejects.toThrow("not owned");
        expect(state.prepareVision).not.toHaveBeenCalled();
        jest.mocked(generateText).mockRejectedValueOnce(new Error("private provider details"));
        await expect(state.service.suggestProduct("owner", request)).rejects.not.toThrow("private provider details");
    });
});

describe("forward tool metadata migration", () => {
    it("adds the nullable JSONB column idempotently and rolls back a failed addition", async () => {
        const runner = {
            connection: { getMetadata: () => ({ tablePath: "image_generation", findColumnWithPropertyName: () => ({ databaseName: "tool_input" }) }) },
            startTransaction: jest.fn(), commitTransaction: jest.fn(), rollbackTransaction: jest.fn(),
            hasColumn: jest.fn().mockResolvedValue(false), addColumn: jest.fn().mockResolvedValue(undefined),
        };
        const migration = new AddToolWorkflowInput1793448000000();
        await migration.up(runner as never);
        expect(runner.addColumn).toHaveBeenCalledWith("image_generation", expect.objectContaining({ name: "tool_input", type: "jsonb", isNullable: true }));
        runner.hasColumn.mockResolvedValueOnce(true);
        await migration.up(runner as never);
        expect(runner.addColumn).toHaveBeenCalledTimes(1);
        runner.addColumn.mockRejectedValueOnce(new Error("write failure"));
        await expect(migration.up(runner as never)).rejects.toThrow("write failure");
        expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
        await expect(migration.down()).rejects.toThrow();
    });
});