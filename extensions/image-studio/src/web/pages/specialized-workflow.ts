import { TOOL_REGISTRY, type CapabilityModel, type GenerationCapabilities } from "../../api/shared/tools";
import type { ProductImage } from "../services/types";
import {
    DETAIL_MODULES, EXPAND_POSITIONS, WATERMARK_MARK_LIMIT, validateToolWorkflow, type ToolDesign, type ToolWorkflowInput,
} from "../../api/shared/tool-workflow";

export const SPECIALIZED_TOOLS = ["detail", "replica", "creative", "fusion", "sku"] as const;
export type SpecializedTool = typeof SPECIALIZED_TOOLS[number];
export const SPECIALIZED_WORKSPACE_LAYOUT = {
    detail: { className: "specialized-workspace specialized-detail", stage: "plan", preferredFormWidth: 480 },
    replica: { className: "specialized-workspace specialized-replica", stage: "roles", preferredFormWidth: 440 },
    creative: { className: "specialized-workspace specialized-creative", stage: "prompt", preferredFormWidth: 440 },
    fusion: { className: "specialized-workspace specialized-fusion", stage: "gallery", preferredFormWidth: 640 },
    sku: { className: "specialized-workspace specialized-sku", stage: "variants", preferredFormWidth: 480 },
} as const;

export function isSpecializedTool(tool: string): tool is SpecializedTool {
    return (SPECIALIZED_TOOLS as readonly string[]).includes(tool);
}

export function referenceLimit(model?: CapabilityModel): number {
    return model?.capabilities.includes("reference-image")
        ? Math.min(5, Math.max(0, Math.floor(model.maxReferenceImages ?? 1))) : 0;
}

export function specializedModels(capabilities: GenerationCapabilities, tool: SpecializedTool, references: number) {
    const availability = capabilities.tools.find((item) => item.key === tool);
    if (availability?.status !== "available") return [];
    return capabilities.models.filter((model) => {
        if (tool === "creative") {
            const capability = references ? "reference-image" : "text-to-image";
            const approved = availability.modelIdsByCapability[capability]
                ?? availability.modelIdsByCapability["text-to-image"] ?? [];
            return approved.includes(model.id) && model.capabilities.includes(capability)
                && (!references || referenceLimit(model) >= references);
        }
        return TOOL_REGISTRY[tool].requiredCapabilities.every((capability) =>
            model.capabilities.includes(capability) && availability.modelIdsByCapability[capability]?.includes(model.id))
            && referenceLimit(model) >= Math.max(references, tool === "replica" || tool === "fusion" ? 2 : 1);
    });
}

export interface PlanSource {
    assetIds: string[];
    productName: string;
    brand: string;
    platform: ToolDesign["platform"];
    language: ToolDesign["language"];
    description: string;
    modules: string[];
}
export interface DetailPlan {
    sourceKey: string;
    pages: Array<{ id: string; requirement: string }>;
}

export function planSourceKey(source: PlanSource): string {
    return JSON.stringify(source);
}

export function createDetailPlan(source: PlanSource): DetailPlan {
    if (!source.assetIds.length || !source.description.trim()) throw new Error("请填写商品图片和已确认的描述");
    if (!source.modules.length || source.modules.length > 10 || new Set(source.modules).size !== source.modules.length) throw new Error("请选择 1 至 10 个详情模块");
    return {
        sourceKey: planSourceKey(source),
        pages: source.modules.map((id) => {
            const module = DETAIL_MODULES.find((item) => item.id === id);
            if (!module) throw new Error("详情模块无效");
            return { id, requirement: `${module.label}：${module.description}。未确认的信息留空。` };
        }),
    };
}

export type Region = NonNullable<ToolDesign["skuRegion"]>;
export function expansionRegion(sourceWidth: number, sourceHeight: number, ratio: ToolWorkflowInput["ratio"], scale: number, position: NonNullable<ToolDesign["expandPosition"]>): Region | undefined {
    if (![sourceWidth, sourceHeight, scale].every(Number.isFinite) || sourceWidth <= 0 || sourceHeight <= 0 || !Number.isInteger(scale) || scale < 1 || scale > 100) return undefined;
    const index = EXPAND_POSITIONS.findIndex((item) => item.id === position);
    const [outputWidth, outputHeight] = ratio.split(":").map(Number);
    if (index < 0 || !outputWidth || !outputHeight) return undefined;
    const relativeAspect = (sourceWidth / sourceHeight) / (outputWidth / outputHeight);
    const width = Math.min(1, relativeAspect) * scale / 100;
    const height = Math.min(1, 1 / relativeAspect) * scale / 100;
    return { x: (1 - width) * (index % 3) / 2, y: (1 - height) * Math.floor(index / 3) / 2, width, height };
}
export interface WatermarkMark {
    id: string;
    region: Region;
    points?: Array<{ x: number; y: number }>;
    brushWidth?: number;
    shape?: "ellipse" | "lasso";
    instruction?: string;
    referenceAsset?: ProductImage;
}
export interface WatermarkHistory {
    marks: WatermarkMark[];
    past: WatermarkMark[][];
    future: WatermarkMark[][];
}
export function recordWatermarkEdit(history: WatermarkHistory, marks: WatermarkMark[]): WatermarkHistory {
    if (marks.length > WATERMARK_MARK_LIMIT || JSON.stringify(history.marks) === JSON.stringify(marks)) return history;
    return { marks, past: [...history.past.slice(-49), history.marks], future: [] };
}
export function stepWatermarkHistory(history: WatermarkHistory, direction: "undo" | "redo"): WatermarkHistory {
    if (direction === "undo") {
        const marks = history.past.at(-1);
        return marks ? { marks, past: history.past.slice(0, -1), future: [history.marks, ...history.future] } : history;
    }
    const marks = history.future[0];
    return marks ? { marks, past: [...history.past, history.marks], future: history.future.slice(1) } : history;
}
export function transformWatermarkMark(mark: WatermarkMark, dx: number, dy: number, handle = "move"): WatermarkMark {
    const bounded = (value: number, max: number) => Math.min(max, Math.max(0, value));
    const original = mark.region;
    let region: Region;
    if (handle === "move") {
        region = { ...original, x: bounded(original.x + dx, 1 - original.width), y: bounded(original.y + dy, 1 - original.height) };
    } else {
        let left = original.x, top = original.y, right = left + original.width, bottom = top + original.height;
        if (handle.includes("w")) left = bounded(left + dx, right - 0.01);
        if (handle.includes("e")) right = Math.min(1, Math.max(left + 0.01, right + dx));
        if (handle.includes("n")) top = bounded(top + dy, bottom - 0.01);
        if (handle.includes("s")) bottom = Math.min(1, Math.max(top + 0.01, bottom + dy));
        region = { x: left, y: top, width: right - left, height: bottom - top };
    }
    return { ...mark, region, points: mark.points?.map((point) => ({ x: region.x + (point.x - original.x) / original.width * region.width,
        y: region.y + (point.y - original.y) / original.height * region.height })) };
}
export function normalizeRegion(region: Region): Region {
    const bounded = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
    const x = bounded(region.x, 0, 0.99);
    const y = bounded(region.y, 0, 0.99);
    return { x, y, width: bounded(region.width, 0.01, 1 - x), height: bounded(region.height, 0.01, 1 - y) };
}

export function regionFromPoints(start: { x: number; y: number }, end: { x: number; y: number }): Region {
    return normalizeRegion({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) });
}

export function validateRoleSelection(tool: SpecializedTool, primary: string[], references: string[], limit: number, skuReferences = false): string | null {
    const all = [...primary, ...references];
    if (new Set(all).size !== all.length) return "同一素材不能重复或同时用于两个角色";
    if (all.length > limit) return `当前模型最多支持 ${limit} 张参考图，请移除部分素材或手动更换模型`;
    if (primary.length > (tool === "replica" ? 4 : tool === "creative" ? 0 : tool === "detail" ? 5 : 1)) return "商品图片超过当前角色上限";
    if (references.length > (tool === "replica" ? 1 : tool === "creative" || tool === "fusion" || (tool === "sku" && skuReferences) ? 4 : 0)) return "参考图片超过当前角色上限";
    return null;
}

export interface SpecializedDraft {
    tool: SpecializedTool;
    modelId: string;
    primary: string[];
    references: string[];
    productName: string;
    brand: string;
    platform: ToolDesign["platform"];
    language: ToolDesign["language"];
    description: string;
    instructions: string;
    count: number;
    ratio: ToolWorkflowInput["ratio"];
    modules: string[];
    outputModules: string[];
    plan?: DetailPlan;
    replicaMode: "style" | "faithful";
    fusionPreset: string;
    skuVariants: NonNullable<ToolDesign["skuVariants"]>;
    skuRegion?: Region;
    skuRegions?: ToolDesign["skuRegions"];
}

export function draftPlanSource(draft: SpecializedDraft): PlanSource {
    return { assetIds: draft.primary, productName: draft.productName, brand: draft.brand,
        platform: draft.platform, language: draft.language, description: draft.description, modules: draft.modules };
}

export function specializedInstructionBudget(draft: Pick<SpecializedDraft, "tool" | "instructions" | "plan" | "outputModules">) {
    const pages = draft.tool === "detail" ? draft.plan?.pages.filter((page) => draft.outputModules.includes(page.id)) ?? [] : [];
    const requirements = pages.map((page) => `${page.id}: ${page.requirement.trim()}`).join("\n");
    return {
        instructions: [draft.instructions.trim(), requirements].filter(Boolean).join("\n"),
        remaining: Math.max(0, 1500 - requirements.length - (requirements ? 1 : 0)),
    };
}

export function buildSpecializedInput(draft: SpecializedDraft, limit: number): ToolWorkflowInput {
    const roleError = validateRoleSelection(draft.tool, draft.primary, draft.references, limit, Boolean(draft.skuRegions));
    if (roleError) throw new Error(roleError);
    const design: ToolDesign = { ...(draft.brand.trim() ? { brand: draft.brand.trim() } : {}), platform: draft.platform, language: draft.language };
    let instructions = draft.instructions.trim();
    let count = draft.count;
    if (draft.tool === "detail") {
        if (!draft.plan || draft.plan.sourceKey !== planSourceKey(draftPlanSource(draft))) throw new Error("商品信息或模块已改变，请重新生成本地规划");
        if (!draft.description.trim()) throw new Error("请填写已确认的商品描述");
        design.description = draft.description.trim();
        design.detailModules = [...draft.modules];
        design.outputModules = [...draft.outputModules];
        count = draft.outputModules.length;
        const pages = draft.plan.pages.filter((page) => draft.outputModules.includes(page.id));
        if (pages.length !== count || pages.some((page) => !page.requirement.trim())) throw new Error("请填写本批每页要求");
        if (pages.some((page) => page.requirement.length > 300)) throw new Error("每页要求不能超过 300 字");
        instructions = specializedInstructionBudget(draft).instructions;
    }
    if (draft.tool === "replica") { design.productAssetIds = [...draft.primary]; design.replicaMode = draft.replicaMode; }
    if (draft.tool === "fusion") {
        if (!draft.fusionPreset) throw new Error("请选择融合预设");
        design.productAssetIds = [...draft.primary]; design.fusionPreset = draft.fusionPreset;
    }
    if (draft.tool === "sku") {
        if (!draft.skuRegion && !draft.skuRegions?.length) throw new Error("请先选择模板编辑参考区域");
        design.skuVariants = draft.skuVariants.map((variant) => ({ name: variant.name.trim(), instruction: variant.instruction.trim(),
            ...(draft.skuRegions ? { edits: variant.edits?.map((edit) => ({ ...edit, instruction: edit.instruction.trim() })) } : {}) }));
        if (draft.skuRegions) design.skuRegions = draft.skuRegions;
        else design.skuRegion = draft.skuRegion;
        count = design.skuVariants.length;
    }
    const input: ToolWorkflowInput = { tool: draft.tool, modelId: draft.modelId, assetIds: [...draft.primary, ...draft.references],
        ...(draft.productName.trim() ? { productName: draft.productName.trim() } : {}), instructions, count, ratio: draft.ratio, design };
    const error = validateToolWorkflow(input);
    if (error) throw new Error(error);
    return input;
}

export function acceptsAssetTransfer(target: { closest?: (selector: string) => unknown } | null, disabled: boolean): boolean {
    return !disabled && !target?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']");
}

export function validImageFile(file: Pick<File, "size" | "type">): boolean {
    return ["image/png", "image/jpeg", "image/webp"].includes(file.type) && file.size > 0 && file.size <= 10 * 1024 * 1024;
}