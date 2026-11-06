export type CreativeAssetKind = "model" | "reference";

export interface CreativeAssetInput {
    kind: CreativeAssetKind;
    name: string;
    prompt: string;
    imageIds: string[];
}

export interface CreativeAsset extends CreativeAssetInput {
    id: string;
    version: number;
    createdAt: string;
    updatedAt: string;
}

export interface AssetApplication {
    asset: CreativeAsset;
    requestId: number;
}

export function validateCreativeAsset(value: unknown): string | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return "资产资料无效";
    const input = value as Record<string, unknown>;
    if (Object.keys(input).some((key) => !["kind", "name", "prompt", "imageIds"].includes(key))) return "资产资料包含不支持的字段";
    if (input.kind !== "model" && input.kind !== "reference") return "不支持的资产类型";
    if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 120
        || /[\x00-\x1f\x7f/\\<>:"|?*]/.test(input.name)) return "名称须为 1–120 字且不能包含路径或控制字符";
    if (typeof input.prompt !== "string" || input.prompt.length > 1500) return "Prompt 不能超过 1500 字";
    const limit = input.kind === "model" ? 1 : 5;
    if (!Array.isArray(input.imageIds) || input.imageIds.length < 1 || input.imageIds.length > limit
        || new Set(input.imageIds).size !== input.imageIds.length
        || input.imageIds.some((id) => typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)))
        return input.kind === "model" ? "请选择 1 张有效的模特照片" : "请选择 1–5 张有效且不重复的参考图片";
    return null;
}