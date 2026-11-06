import { validateCreativeAsset, type CreativeAsset } from "../../api/shared/assets";
import type { GenerationCapabilities } from "../../api/shared/tools";
import type { ProductImage } from "../services/types";
import { specializedModels, referenceLimit } from "./specialized-workflow";

export function assetDraftSnapshot(asset: CreativeAsset, images: ProductImage[], capabilities: GenerationCapabilities, modelId: string) {
    const { kind, name, prompt, imageIds } = asset;
    const error = validateCreativeAsset({ kind, name, prompt, imageIds });
    if (error) throw new Error(error);
    if (imageIds.length > 4) throw new Error("创意生图最多支持 4 张参考图片；资料已保留，请编辑后再使用");
    const references = imageIds.map((id) => images.find((image) => image.id === id));
    if (references.some((image) => !image)) throw new Error("部分图片已不存在，请编辑资料重新选择图片");
    const models = specializedModels(capabilities, "creative", imageIds.length);
    const model = modelId ? models.find((item) => item.id === modelId) : models[0];
    const availability = capabilities.tools.find((item) => item.key === "creative");
    if (!model || imageIds.length > Math.min(referenceLimit(model), availability?.limits?.maxInputImages ?? 5)) {
        throw new Error("当前模型不支持这些参考图片，请先在创意生图中更换可用模型");
    }
    const role = kind === "model" ? "person" : "style";
    const guidance = role === "person"
        ? "参考图片角色：person（人物外观参考），不是目标商品身份；不承诺人物一致性或试穿。"
        : "参考图片角色：style（构图、配色与光影参考），不复制参考图中的商品身份、品牌或文字。";
    const instructions = [guidance, prompt.trim()].filter(Boolean).join("\n");
    if (instructions.length > 1500) throw new Error(`角色说明与 Prompt 总长不能超过 1500 字，请将 Prompt 缩短至 ${1500 - guidance.length - 1} 字以内`);
    return { references: references.map((image) => ({ ...image! })), instructions, modelId: model.id, role };
}

export function confirmAssetReplacement(dirty: boolean, confirm: () => boolean): boolean {
    return !dirty || confirm();
}

export function assetFormDirty(current: { name: string; prompt: string; imageIds: string[] }, original: { name: string; prompt: string; imageIds: string[] }): boolean {
    return current.name !== original.name || current.prompt !== original.prompt || JSON.stringify(current.imageIds) !== JSON.stringify(original.imageIds);
}