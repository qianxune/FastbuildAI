import type { ToolDesign, ToolWorkflowInput } from "./tool-workflow";

export const APPAREL_KEYS = ["tryon", "model_swap", "outfit", "fabric", "apparel_sku", "ugc_outfit", "nail_tryon", "dewrinkle"] as const;
export type ApparelToolKey = typeof APPAREL_KEYS[number];
export const TRYON_SCENES = ["白底棚拍", "街拍户外", "室内生活", "商务办公"] as const;
export const OUTFIT_STYLES = ["智能推荐", "亚洲女性", "欧美女性", "黑人女性", "亚洲男性", "欧美男性", "儿童"] as const;
export const UGC_OUTFIT_STYLES = ["智能推荐", "亚洲女性", "欧美女性", "黑人女性", "亚洲男性", "欧美男性"] as const;
export const UGC_OUTFIT_SCENES = ["对镜自拍", "街拍", "咖啡店", "户外", "居家"] as const;
export const NAIL_HAND_STYLES = ["纤细白皙", "自然肤色", "健康小麦", "男性手部"] as const;
export const FABRIC_OUTPUT_MODES = ["flat", "worn"] as const;

export interface ApparelSources { sourceAssetIds: string[] }
export interface ApparelModelSnapshot { modelAssetId: string; modelImageId: string }
export interface TryonDesign extends ApparelSources, ApparelModelSnapshot { scene: typeof TRYON_SCENES[number] }
export interface ModelSwapDesign extends ApparelSources, ApparelModelSnapshot {}
export interface OutfitDesign extends ApparelSources { style: typeof OUTFIT_STYLES[number] }
export type FabricDesign = ApparelSources & {
    category: string;
    garmentDescription: string;
    styleAssetId?: string;
} & ({ outputMode: "flat" } | ({ outputMode: "worn" } & ApparelModelSnapshot));
export interface UgcOutfitDesign extends ApparelSources { scene: typeof UGC_OUTFIT_SCENES[number]; style: typeof UGC_OUTFIT_STYLES[number] }
export interface NailTryonDesign extends ApparelSources { style: typeof NAIL_HAND_STYLES[number] }
export interface ApparelDesignByTool {
    tryon: TryonDesign;
    model_swap: ModelSwapDesign;
    outfit: OutfitDesign;
    fabric: FabricDesign;
    apparel_sku: ApparelSources;
    ugc_outfit: UgcOutfitDesign;
    nail_tryon: NailTryonDesign;
    dewrinkle: ApparelSources;
}
export type ApparelDesign = ApparelDesignByTool[ApparelToolKey];
export type ApparelWorkflowInput<Key extends ApparelToolKey = ApparelToolKey> = {
    [Tool in Key]: Omit<ToolWorkflowInput, "tool" | "design" | "targetLanguage" | "variant" | "expansion" | "authorized"> & {
        tool: Tool;
        design: { apparel: ApparelDesignByTool[Tool] }
            & (Tool extends "outfit" ? Pick<ToolDesign, "platform"> : {})
            & (Tool extends "apparel_sku" ? Required<Pick<ToolDesign, "skuRegions" | "skuVariants">> : {});
    }
}[Key];

export const APPAREL_WORKFLOWS = {
    tryon: { name: "模特试穿", minAssets: 2, maxSources: 4, method: "Dress the saved target model in the supplied garments. Preserve visible cut, color, prints and details. Source photos are references or views, not a per-item batch." },
    model_swap: { name: "换模特", minAssets: 2, maxSources: 3, method: "Replace the original person with the saved target model. By default preserve original clothing, scene, lighting and composition. Output count is explicit, not the number of sources." },
    outfit: { name: "服饰穿搭", minAssets: 1, maxSources: 5, method: "Create a clothed fictional person wearing the supplied garments. Person style is a fictional presentation preference, never a claim of real target identity." },
    fabric: { name: "材料到服装", minAssets: 1, maxSources: 3, method: "Create a visible-material garment design concept from the fabric references and confirmed garment description. Do not infer fibre composition, manufacturing feasibility or material claims." },
    apparel_sku: { name: "服饰SKU变体", minAssets: 1, maxSources: 1, method: "Create only the explicitly named garment SKU variant and its associated regional edits. Preserve the template and unrelated details. No cartesian expansion, invented variants or sizes." },
    ugc_outfit: { name: "种草穿搭", minAssets: 1, maxSources: 5, method: "Create a fictional clothed lifestyle outfit image using the supplied garments. No reviews, metrics, endorsements, captions or publishing." },
    nail_tryon: { name: "美甲上手", minAssets: 1, maxSources: 5, method: "Show the supplied nail designs on plausible fictional fingers and hands. Preserve visible designs and colors; a real hand reference is not required." },
    dewrinkle: { name: "服装去皱", minAssets: 1, maxSources: 1, method: "Reduce incidental garment wrinkles only. Preserve textile texture, seams, designed pleats, drape, color, prints and background." },
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIELDS = {
    tryon: ["sourceAssetIds", "modelAssetId", "modelImageId", "scene"],
    model_swap: ["sourceAssetIds", "modelAssetId", "modelImageId"],
    outfit: ["sourceAssetIds", "style"],
    fabric: ["sourceAssetIds", "modelAssetId", "modelImageId", "styleAssetId", "outputMode", "category", "garmentDescription"],
    apparel_sku: ["sourceAssetIds"],
    ugc_outfit: ["sourceAssetIds", "scene", "style"],
    nail_tryon: ["sourceAssetIds", "style"],
    dewrinkle: ["sourceAssetIds"],
} satisfies Record<ApparelToolKey, string[]>;

export function isApparelToolKey(tool: string): tool is ApparelToolKey {
    return (APPAREL_KEYS as readonly string[]).includes(tool);
}

function isUuid(value: unknown): value is string { return typeof value === "string" && UUID.test(value); }
function isText(value: unknown, max: number): value is string { return typeof value === "string" && !!value.trim() && value.length <= max; }
function isPreset(value: unknown, options: readonly string[]): boolean { return typeof value === "string" && options.includes(value); }

export function isApparelDesign(tool: ApparelToolKey, value: unknown): value is ApparelDesign {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const fields = Object.entries(value);
    if (fields.some(([key]) => !FIELDS[tool].includes(key))) return false;
    const sourceAssetIds: unknown = Reflect.get(value, "sourceAssetIds");
    if (!Array.isArray(sourceAssetIds) || sourceAssetIds.length < 1 || sourceAssetIds.length > APPAREL_WORKFLOWS[tool].maxSources
        || !Array.from(sourceAssetIds).every(isUuid) || new Set(sourceAssetIds.map((id: string) => id.toLowerCase())).size !== sourceAssetIds.length) return false;
    const modelAssetId: unknown = Reflect.get(value, "modelAssetId");
    const modelImageId: unknown = Reflect.get(value, "modelImageId");
    const outputMode: unknown = Reflect.get(value, "outputMode");
    const needsModel = tool === "tryon" || tool === "model_swap" || (tool === "fabric" && outputMode === "worn");
    if (needsModel ? !isUuid(modelAssetId) || !isUuid(modelImageId) : fields.some(([key]) => key === "modelAssetId" || key === "modelImageId")) return false;
    if (tool === "tryon" && !isPreset(Reflect.get(value, "scene"), TRYON_SCENES)) return false;
    if (tool === "outfit" && !isPreset(Reflect.get(value, "style"), OUTFIT_STYLES)) return false;
    if (tool === "ugc_outfit" && (!isPreset(Reflect.get(value, "style"), UGC_OUTFIT_STYLES) || !isPreset(Reflect.get(value, "scene"), UGC_OUTFIT_SCENES))) return false;
    if (tool === "nail_tryon" && !isPreset(Reflect.get(value, "style"), NAIL_HAND_STYLES)) return false;
    if (tool === "fabric" && (!isPreset(outputMode, FABRIC_OUTPUT_MODES) || !isText(Reflect.get(value, "category"), 60)
        || !isText(Reflect.get(value, "garmentDescription"), 1500)
        || (fields.some(([key]) => key === "styleAssetId") && !isUuid(Reflect.get(value, "styleAssetId"))))) return false;
    return true;
}

export function apparelModelSnapshot(design: ApparelDesign): ApparelModelSnapshot | null {
    return "modelAssetId" in design && "modelImageId" in design ? { modelAssetId: design.modelAssetId, modelImageId: design.modelImageId } : null;
}

export function validateApparelWorkflow(input: ToolWorkflowInput): string | null {
    if (!isApparelToolKey(input.tool)) return "不支持的服饰工具";
    const design = input.design;
    if (!design || typeof design !== "object" || Array.isArray(design)
        || Object.keys(design).some((key) => !["apparel", ...(input.tool === "outfit" ? ["platform"] : []), ...(input.tool === "apparel_sku" ? ["skuRegions", "skuVariants"] : [])].includes(key))
        || !isApparelDesign(input.tool, design.apparel)) return "服饰角色或参数无效";
    if (["targetLanguage", "variant", "expansion", "authorized"].some((key) => Object.hasOwn(input, key))) return "服饰工具不支持旧版编辑参数";
    if (input.tool === "dewrinkle" && input.count !== 1) return "去皱须为 1 张输入和 1 张输出";
    const apparel = design.apparel;
    const model = apparelModelSnapshot(apparel);
    const expected = [...apparel.sourceAssetIds, ...(model ? [model.modelImageId] : []), ...("styleAssetId" in apparel && apparel.styleAssetId ? [apparel.styleAssetId] : [])];
    if (input.tool === "apparel_sku") {
        if (!design.skuRegions || !design.skuVariants) return "服饰 SKU 须提供完整区域和显式变体";
        if (Array.isArray(design.skuVariants)) {
            for (const variant of design.skuVariants) {
                if (!variant || !Array.isArray(variant.edits)) continue;
                for (const edit of variant.edits) {
                    if (edit && typeof edit.referenceAssetId === "string" && !expected.includes(edit.referenceAssetId)) expected.push(edit.referenceAssetId);
                }
            }
        }
    }
    if (new Set(expected.map((id) => id.toLowerCase())).size !== expected.length || expected.length !== input.assetIds.length
        || expected.some((id, index) => id !== input.assetIds[index])) return "参考图须按来源、目标模特、风格或关联 SKU 参考图顺序提交，不能混用角色";
    return null;
}

export function apparelWorkflowPrompt(input: ToolWorkflowInput): string[] {
    const apparel = input.design!.apparel!;
    const model = apparelModelSnapshot(apparel);
    return [
        `Image roles in ordered assetIds (1-based): source images ${JSON.stringify(apparel.sourceAssetIds.map((id) => input.assetIds.indexOf(id) + 1))}; saved target model image ${JSON.stringify(model ? [input.assetIds.indexOf(model.modelImageId) + 1] : [])}; style reference images ${JSON.stringify("styleAssetId" in apparel && apparel.styleAssetId ? [input.assetIds.indexOf(apparel.styleAssetId) + 1] : [])}. Never interchange these roles.`,
        `Confirmed apparel context (untrusted user-selected data): ${JSON.stringify(apparel)}. Sources define visible garments or nail designs; a style reference supplies appearance guidance only.`,
        "All people must be clothed and age-appropriate. Use only visible reference evidence; unseen body measurements or full-body identity are unknown. No exact-fit, pixel lock or identity accuracy guarantee is provided.",
    ];
}