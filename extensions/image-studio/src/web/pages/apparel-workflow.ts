export const APPAREL_PREVIEW_IMAGES = {
    tryon: "/extension/image-studio/images/apparel-tryon.jpg",
    model_swap: "/extension/image-studio/images/apparel-model_swap.jpg",
    outfit: "/extension/image-studio/images/apparel-outfit.jpg",
    fabric: "/extension/image-studio/images/apparel-fabric.jpg",
    apparel_sku: "/extension/image-studio/images/apparel-apparel_sku.jpg",
    ugc_outfit: "/extension/image-studio/images/apparel-ugc_outfit.jpg",
    nail_tryon: "/extension/image-studio/images/apparel-nail_tryon.jpg",
    dewrinkle: "/extension/image-studio/images/apparel-dewrinkle.jpg",
} as const;

import {
    APPAREL_WORKFLOWS, apparelModelSnapshot, isApparelToolKey, NAIL_HAND_STYLES, OUTFIT_STYLES,
    TRYON_SCENES, UGC_OUTFIT_SCENES, type ApparelToolKey, type ApparelWorkflowInput,
} from "../../api/shared/apparel-workflow";
import type { CreativeAsset } from "../../api/shared/assets";
import { TOOL_REGISTRY, type GenerationCapabilities } from "../../api/shared/tools";
import { validateToolWorkflow, type ToolDesign, type ToolWorkflowInput } from "../../api/shared/tool-workflow";
import type { ImageGeneration, ProductImage } from "../services/types";
import { referenceLimit } from "./specialized-workflow";

export interface ApparelDraft {
    tool: ApparelToolKey;
    modelId: string;
    sourceAssetIds: string[];
    target?: { modelAssetId: string; modelImageId: string };
    styleAssetId?: string;
    scene: string;
    style: string;
    category: string;
    garmentDescription: string;
    outputMode: "flat" | "worn";
    platform: NonNullable<ToolDesign["platform"]>;
    productName: string;
    instructions: string;
    count: number;
    ratio: ToolWorkflowInput["ratio"];
}

export function createApparelDraft(tool: ApparelToolKey, defaultCount = 1): ApparelDraft {
    return { tool, modelId: "", sourceAssetIds: [], scene: tool === "ugc_outfit" ? UGC_OUTFIT_SCENES[0] : TRYON_SCENES[0],
        style: tool === "nail_tryon" ? NAIL_HAND_STYLES[0] : OUTFIT_STYLES[0], category: "", garmentDescription: "",
        outputMode: "flat", platform: "淘宝", productName: "", instructions: "", count: tool === "dewrinkle" ? 1 : defaultCount,
        ratio: tool === "dewrinkle" || tool === "apparel_sku" ? "1:1" : "3:4" };
}

export function apparelNeedsModel(draft: Pick<ApparelDraft, "tool" | "outputMode">) {
    return draft.tool === "tryon" || draft.tool === "model_swap" || (draft.tool === "fabric" && draft.outputMode === "worn");
}

export function apparelModels(capabilities: GenerationCapabilities, tool: ApparelToolKey, references = 0) {
    const availability = capabilities.tools.find((item) => item.key === tool);
    if (availability?.status !== "available") return [];
    return capabilities.models.filter((model) => TOOL_REGISTRY[tool].requiredCapabilities.every((capability) =>
        model.capabilities.includes(capability) && availability.modelIdsByCapability[capability]?.includes(model.id))
        && referenceLimit(model) >= Math.max(APPAREL_WORKFLOWS[tool].minAssets, references)
        && references <= Math.min(5, availability.limits.maxInputImages ?? 5));
}

export function readableApparelImage(image: ProductImage) {
    return ["image/png", "image/jpeg", "image/webp"].includes(image.mediaType) && image.width > 0 && image.height > 0;
}

export function savedModelCatalog(assets: readonly CreativeAsset[], images: readonly ProductImage[]) {
    return assets.filter((asset) => asset.kind === "model" && asset.imageIds.length === 1)
        .flatMap((asset) => {
            const matches = images.filter((image) => image.id === asset.imageIds[0] && readableApparelImage(image));
            return matches.length === 1 ? [{ asset, image: matches[0]! }] : [];
        });
}

export function assertApparelCatalog(input: ToolWorkflowInput, assets: readonly CreativeAsset[], images: readonly ProductImage[]) {
    if (input.assetIds.some((id) => !images.some((image) => image.id === id && readableApparelImage(image))))
        throw new Error("已选图片已删除或不可用，请重新选择素材");
    const snapshot = input.design?.apparel && apparelModelSnapshot(input.design.apparel);
    if (snapshot && !savedModelCatalog(assets, images).some(({ asset, image }) => asset.id === snapshot.modelAssetId && image.id === snapshot.modelImageId))
        throw new Error("目标模特已删除或照片已改变，请重新选择我的模特");
}

export function buildApparelInput(draft: ApparelDraft, capabilities: GenerationCapabilities, assets: readonly CreativeAsset[], images: readonly ProductImage[]): ApparelWorkflowInput {
    if (draft.tool === "apparel_sku") throw new Error("请使用服饰 SKU 区域与变体编辑器");
    const needsModel = apparelNeedsModel(draft);
    if (needsModel && !draft.target) throw new Error("请选择一位我的模特");
    const apparel = { sourceAssetIds: [...draft.sourceAssetIds],
        ...(needsModel ? draft.target : {}),
        ...(draft.tool === "tryon" || draft.tool === "ugc_outfit" ? { scene: draft.scene } : {}),
        ...(draft.tool === "outfit" || draft.tool === "ugc_outfit" || draft.tool === "nail_tryon" ? { style: draft.style } : {}),
        ...(draft.tool === "fabric" ? { category: draft.category.trim(), garmentDescription: draft.garmentDescription.trim(), outputMode: draft.outputMode,
            ...(draft.styleAssetId ? { styleAssetId: draft.styleAssetId } : {}) } : {}) };
    const input = { tool: draft.tool, modelId: draft.modelId, assetIds: [...draft.sourceAssetIds,
        ...(needsModel && draft.target ? [draft.target.modelImageId] : []), ...(draft.tool === "fabric" && draft.styleAssetId ? [draft.styleAssetId] : [])],
        ...(draft.productName.trim() ? { productName: draft.productName.trim() } : {}), instructions: draft.instructions.trim(), count: draft.count, ratio: draft.ratio,
        design: { apparel, ...(draft.tool === "outfit" ? { platform: draft.platform } : {}) } } as ApparelWorkflowInput;
    const error = validateToolWorkflow(input);
    if (error) throw new Error(error);
    assertApparelCatalog(input, assets, images);
    if (!apparelModels(capabilities, draft.tool, input.assetIds.length).some((model) => model.id === draft.modelId))
        throw new Error(`当前模型最多支持 ${referenceLimit(capabilities.models.find((model) => model.id === draft.modelId))} 张参考图，请移除部分素材或手动更换模型`);
    return input;
}

export function apparelSkuInput(input: ToolWorkflowInput): ApparelWorkflowInput<"apparel_sku"> {
    if (input.tool !== "sku" || validateToolWorkflow(input) || !input.design?.skuRegions || !input.design.skuVariants)
        throw new Error("服饰 SKU 须提供完整区域和显式变体");
    const converted: ApparelWorkflowInput<"apparel_sku"> = { tool: "apparel_sku", modelId: input.modelId, assetIds: [...input.assetIds],
        ...(input.productName ? { productName: input.productName } : {}), instructions: input.instructions, count: input.count, ratio: input.ratio,
        design: { apparel: { sourceAssetIds: input.assetIds.slice(0, 1) }, skuRegions: input.design.skuRegions, skuVariants: input.design.skuVariants } };
    const error = validateToolWorkflow(converted);
    if (error) throw new Error(error);
    return converted;
}

export function restoreApparelDraft(task: ImageGeneration, tool: ApparelToolKey): ApparelDraft {
    const input = task.toolInput;
    if (!input || input.tool !== tool || task.toolKey !== tool || !isApparelToolKey(input.tool) || validateToolWorkflow(input))
        throw new Error("历史服饰参数无效，结果仍可查看，请重新填写输入");
    const apparel = input.design!.apparel!;
    return { ...createApparelDraft(tool), modelId: input.modelId, sourceAssetIds: [...apparel.sourceAssetIds],
        target: apparelModelSnapshot(apparel) ?? undefined,
        ...("scene" in apparel && typeof apparel.scene === "string" ? { scene: apparel.scene } : {}),
        ...("style" in apparel && typeof apparel.style === "string" ? { style: apparel.style } : {}),
        ...("outputMode" in apparel ? { outputMode: apparel.outputMode, category: apparel.category, garmentDescription: apparel.garmentDescription,
            ...("styleAssetId" in apparel ? { styleAssetId: apparel.styleAssetId } : {}) } : {}),
        platform: input.design?.platform ?? "淘宝", productName: input.productName ?? "", instructions: input.instructions ?? "", count: input.count, ratio: input.ratio };
}