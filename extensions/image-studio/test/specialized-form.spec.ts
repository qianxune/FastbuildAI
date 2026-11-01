import {
    acceptsAssetTransfer, buildSpecializedInput, createDetailPlan, draftPlanSource, normalizeRegion,
    regionFromPoints, specializedInstructionBudget, specializedModels, validateRoleSelection, validImageFile,
    type SpecializedDraft,
} from "../src/web/pages/specialized-workflow";
import { validateToolWorkflow, DETAIL_MODULES, toolWorkflowPrompt } from "../src/api/shared/tool-workflow";
import type { GenerationCapabilities } from "../src/api/shared/tools";
import { TOOL_REGISTRY } from "../src/api/shared/tools";
import * as workflow from "../src/api/shared/tool-workflow";
import * as specialized from "../src/web/pages/specialized-workflow";
import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import * as ts from "typescript";

const modelId = "11111111-1111-4111-8111-111111111111";
const assetIds = Array.from({ length: 6 }, (_value, index) => `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`);
function draft(tool: SpecializedDraft["tool"]): SpecializedDraft {
    return { tool, modelId, primary: tool === "creative" ? [] : [assetIds[0]], references: tool === "replica" || tool === "fusion" ? [assetIds[1]] : [],
        productName: tool === "detail" ? "Confirmed product" : "", brand: "", platform: "淘宝", language: "简体中文", description: "Confirmed description",
        instructions: "User request", count: 1, ratio: "3:4", modules: DETAIL_MODULES.slice(0, 6).map((item) => item.id), outputModules: ["hero"],
        replicaMode: "style", fusionPreset: "print", skuVariants: [{ name: "Blue", instruction: "Use blue" }], skuRegion: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } };
}

describe("specialized workflow payloads", () => {
    it.each(["detail", "replica", "creative", "fusion", "sku"] as const)("builds strict %s input", (tool) => {
        const value = draft(tool);
        if (tool === "detail") value.plan = createDetailPlan(draftPlanSource(value));
        expect(validateToolWorkflow(buildSpecializedInput(value, 5))).toBeNull();
    });
    it.each(["description", "productName", "brand", "platform", "language", "modules", "primary"] as const)("invalidates detail planning after %s changes", (field) => {
        const value = draft("detail"); value.plan = createDetailPlan(draftPlanSource(value));
        (value as any)[field] = Array.isArray(value[field]) ? [] : "Changed";
        expect(() => buildSpecializedInput(value, 5)).toThrow("重新生成");
    });
    it("retains the whole plan and distinct per-output requirements", () => {
        const value = draft("detail"); value.plan = createDetailPlan(draftPlanSource(value));
        value.outputModules = ["hero", "selling"];
        value.plan.pages[1].requirement = "Only confirmed selling points";
        const input = buildSpecializedInput(value, 5);
        expect(input.count).toBe(2);
        expect(input.design?.detailModules).toHaveLength(6);
        expect(input.instructions).toContain("selling: Only confirmed selling points");
        expect(toolWorkflowPrompt(input, 0)).not.toEqual(toolWorkflowPrompt(input, 1));
        value.outputModules = value.modules.slice(0, 5);
        expect(() => buildSpecializedInput(value, 5)).toThrow();
    });
    it("budgets final detail instructions at exactly 1500, reflecting page edits and output changes", () => {
        const value = draft("detail"); value.plan = createDetailPlan(draftPlanSource(value));
        value.outputModules = value.modules.slice(0, 4);
        const budget = specializedInstructionBudget(value);
        value.instructions = "x".repeat(budget.remaining);
        expect(buildSpecializedInput(value, 5).instructions).toHaveLength(1500);
        value.instructions += "x";
        expect(specializedInstructionBudget(value).instructions).toHaveLength(1501);
        expect(() => buildSpecializedInput(value, 5)).toThrow("1500");
        value.instructions = value.instructions.slice(1);
        value.plan.pages[0].requirement += "x";
        expect(specializedInstructionBudget(value).remaining).toBe(budget.remaining - 1);
        expect(() => buildSpecializedInput(value, 5)).toThrow("1500");
        value.outputModules = value.outputModules.slice(1);
        const reduced = specializedInstructionBudget(value);
        expect(reduced.remaining).toBeGreaterThan(budget.remaining);
        expect(buildSpecializedInput(value, 5).instructions).toBe(reduced.instructions);
        expect(reduced.instructions).not.toContain("hero:");
        expect(value.instructions).toBe("x".repeat(budget.remaining));
    });
    it("allows 300 characters per detail page but rejects 301 without truncation", () => {
        const value = draft("detail"); value.plan = createDetailPlan(draftPlanSource(value));
        value.plan.pages[0].requirement = "p".repeat(300);
        expect(buildSpecializedInput(value, 5).instructions).toContain("p".repeat(300));
        value.plan.pages[0].requirement += "p";
        expect(() => buildSpecializedInput(value, 5)).toThrow("300");
        expect(value.plan.pages[0].requirement).toHaveLength(301);
    });
    it("keeps replica roles ordered and modes meaningful", () => {
        const value = draft("replica"); value.primary.push(assetIds[2]);
        const style = buildSpecializedInput(value, 5);
        value.replicaMode = "faithful";
        const faithful = buildSpecializedInput(value, 5);
        expect(style.assetIds).toEqual([assetIds[0], assetIds[2], assetIds[1]]);
        expect(style.design?.productAssetIds).toEqual(value.primary);
        expect(toolWorkflowPrompt(style)).not.toEqual(toolWorkflowPrompt(faithful));
    });
    it("uses the same creative contract with and without references", () => {
        const value = draft("creative"); expect(buildSpecializedInput(value, 5).assetIds).toEqual([]);
        value.references = assetIds.slice(0, 4); expect(buildSpecializedInput(value, 5).assetIds).toEqual(value.references);
        value.instructions = ""; expect(() => buildSpecializedInput(value, 5)).toThrow();
    });
    it("requires one primary for fusion and named variants/count/region for SKU", () => {
        const fusion = draft("fusion"); expect(buildSpecializedInput(fusion, 5).design?.fusionPreset).toBe("print");
        fusion.primary.push(assetIds[2]); expect(() => buildSpecializedInput(fusion, 5)).toThrow();
        const sku = draft("sku"); sku.skuVariants.push({ name: "Red", instruction: "Use red" });
        const input = buildSpecializedInput(sku, 5); expect(input.count).toBe(2);
        expect(toolWorkflowPrompt(input, 1)).toContain("Use red");
        sku.skuRegion = undefined; expect(() => buildSpecializedInput(sku, 5)).toThrow("区域");
    });
    it("rejects duplicate roles, role maxima and model limits without truncation", () => {
        expect(validateRoleSelection("replica", [assetIds[0]], [assetIds[0]], 5)).toBeTruthy();
        expect(validateRoleSelection("fusion", [assetIds[0]], assetIds.slice(1), 5)).toBeTruthy();
        expect(validateRoleSelection("creative", [], assetIds.slice(0, 4), 1)).toBeTruthy();
        expect(validateRoleSelection("creative", [], assetIds.slice(0, 4), 5)).toBeNull();
    });
    it("normalizes positive regions in image bounds, including reverse drags", () => {
        expect(regionFromPoints({ x: 0.8, y: 0.9 }, { x: 0.2, y: 0.1 })).toEqual({ x: 0.2, y: 0.1, width: expect.closeTo(0.6), height: 0.8 });
        for (const region of [{ x: 3, y: -1, width: 10, height: 0 }, { x: NaN, y: Infinity, width: -1, height: NaN }]) {
            const next = normalizeRegion(region); expect(next.width).toBeGreaterThan(0); expect(next.height).toBeGreaterThan(0);
            expect(next.x + next.width).toBeLessThanOrEqual(1); expect(next.y + next.height).toBeLessThanOrEqual(1);
        }
    });
    it("filters by authorized dynamic creative capabilities and actual limits", () => {
        const capabilities = { tools: [{ key: "creative", status: "available", modelIdsByCapability: { "text-to-image": [modelId, "text"] } }],
            models: [{ id: "text", capabilities: ["text-to-image"] }, { id: modelId, capabilities: ["text-to-image", "reference-image"], maxReferenceImages: 5 }] } as GenerationCapabilities;
        expect(specializedModels(capabilities, "creative", 0).map((item) => item.id)).toEqual(["text", modelId]);
        expect(specializedModels(capabilities, "creative", 1).map((item) => item.id)).toEqual([modelId]);
        capabilities.tools[0].status = "unavailable"; expect(specializedModels(capabilities, "creative", 0)).toEqual([]);
    });
    it("gates transfers while typing or locked and validates upload formats", () => {
        expect(acceptsAssetTransfer({ closest: () => ({}) }, false)).toBe(false);
        expect(acceptsAssetTransfer(null, true)).toBe(false);
        expect(acceptsAssetTransfer({ closest: () => null }, false)).toBe(true);
        expect(validImageFile({ type: "image/png", size: 10 })).toBe(true);
        expect(validImageFile({ type: "image/svg+xml", size: 10 })).toBe(false);
        expect(validImageFile({ type: "image/png", size: 0 })).toBe(false);
    });
});

type ElementNode = { type: any; props: Record<string, any> };
const images = assetIds.map((id) => ({ id, width: 400, height: 300, mediaType: "image/png", size: 100, name: "Product" }));
const componentTokens = { AssetRolePicker: "AssetRolePicker", FusionPresetGallery: "FusionPresetGallery", SkuRegionEditor: "SkuRegionEditor" };
const elementText = (node: any): string => Array.isArray(node) ? node.map(elementText).join("") : node && typeof node === "object" ? elementText(node.props?.children) : String(node ?? "");

function renderHarness(file: string, exportName: string, props: Record<string, any>, services: Record<string, unknown> = {}) {
    const state: any[] = [], refs: any[] = [];
    const effects: Array<{ dependencies?: unknown[]; cleanup?: () => void }> = [];
    let stateCursor = 0, refCursor = 0, effectCursor = 0;
    const queued: Array<() => void> = [];
    const exports: any = {};
    const jsx = (type: unknown, childProps: ElementNode["props"]) => ({ type, props: childProps });
    const source = readFileSync(path.join(__dirname, `../src/web/pages/${file}.tsx`), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } });
    runInNewContext(compiled.outputText, { exports, Error, require: (name: string) => {
        if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
        if (name === "react") return {
            useState: (initial: unknown) => { const index = stateCursor++; if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
                return [state[index], (value: any) => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; },
            useRef: (initial: unknown) => { const index = refCursor++; return refs[index] ?? (refs[index] = { current: initial }); },
            useId: () => "test",
            useEffect: (effect: () => void | (() => void), dependencies?: unknown[]) => {
                const index = effectCursor++, previous = effects[index];
                if (!previous || !dependencies || dependencies.some((value, position) => !Object.is(value, previous.dependencies?.[position]))) {
                    queued.push(() => { previous?.cleanup?.(); const cleanup = effect(); effects[index] = { dependencies, cleanup: typeof cleanup === "function" ? cleanup : undefined }; });
                }
            },
        };
        if (name === "../../api/shared/tool-workflow") return workflow;
        if (name === "./specialized-workflow") return specialized;
        if (name === "./specialized-components") return componentTokens;
        if (name === "./material-picker") return { default: "MaterialPicker", MaterialDialog: "MaterialDialog" };
        if (name === "../services/generation" || name === "../services/tool-generation") return services;
        return new Proxy({}, { get: (_target, key) => key });
    } });
    function render() {
        stateCursor = 0; refCursor = 0; effectCursor = 0;
        const nodes: ElementNode[] = [];
        const visit = (value: any) => {
            if (Array.isArray(value)) value.forEach(visit);
            else if (value && typeof value === "object" && "props" in value) { nodes.push(value); visit(value.props.children); }
        };
        visit(exports[exportName](props));
        queued.splice(0).forEach((effect) => effect());
        return nodes;
    }
    return { render, props, exports, unmount: () => effects.forEach((effect) => effect.cleanup?.()) };
}

function formHarness(tool: SpecializedDraft["tool"], options: { ready?: boolean; locked?: boolean; unavailable?: boolean } = {}) {
    const onSubmit = jest.fn().mockResolvedValue(undefined), upload = jest.fn(), analyze = jest.fn().mockResolvedValue({ suggestions: "Unconfirmed visual advice" });
    const products = { data: [...images], isSuccess: true, isPending: false, isFetching: false, isError: false };
    const uploadState = { isPending: false, mutateAsync: async (file: File) => {
        uploadState.isPending = true;
        try {
            const image = await upload(file);
            products.data = [...products.data.filter((item) => item.id !== image.id), image];
            return image;
        } finally { uploadState.isPending = false; }
    } };
    const billing = jest.fn().mockReturnValue({ ready: options.ready ?? true, costText: "实际报价 2 积分" });
    const capabilities = {
        tools: [tool, "suggest"].map((key) => ({ key, status: options.unavailable ? "unavailable" : "available", requiredCapabilities: TOOL_REGISTRY[key].requiredCapabilities,
            modelIdsByCapability: { "text-to-image": [modelId], "reference-image": [modelId], "multi-image": [modelId], vision: [modelId] } })),
        models: [{ id: modelId, name: "Seedream", capabilities: ["text-to-image", "reference-image", "multi-image", "vision"], maxReferenceImages: 5 }],
    } as GenerationCapabilities;
    const view = renderHarness("specialized-tool-form", "default", { tool, capabilities, locked: options.locked ?? false, onSubmit }, {
        useGenerationBilling: billing, useProductImagesQuery: () => products, useUploadProductImageMutation: () => uploadState, useToolSuggestionsMutation: () => ({ mutateAsync: analyze, isPending: false }),
    });
    const field = (label: string) => view.render().find((node) => node.props["aria-label"] === label || node.props.id === `test-${label}`)!;
    const button = (text: string) => view.render().find((node) => node.type === "button" && elementText(node).includes(text))!;
    const set = (label: string, value: string) => field(label).props.onChange({ target: { value } });
    const role = (label: string) => view.render().find((node) => node.type === "AssetRolePicker" && node.props.label === label)!.props;
    const submitButton = () => view.render().find((node) => node.props.type === "submit")!;
    const submit = () => view.render().find((node) => node.type === "form")!.props.onSubmit({ preventDefault: jest.fn() });
    const preset = (value = "print") => view.render().find((node) => node.type === "FusionPresetGallery")!.props.onSelect(value);
    const filled = () => {
        if (tool === "fusion") preset();
        if (tool === "creative") { set("instructions", "User prompt"); return; }
        role(tool === "sku" ? "SKU 模板图" : tool === "replica" ? "商品图" : tool === "fusion" ? "主体图" : "商品图片").onChange([images[0]]);
        if (tool === "replica" || tool === "fusion") role(tool === "replica" ? "风格参考图" : "配件图").onChange([images[1]]);
        if (tool === "detail") { set("product", "Confirmed product"); set("已确认的商品描述", "Confirmed description"); button("生成本地规划").props.onClick(); }
        if (tool === "sku") {
            button("选择区域").props.onClick();
            const editor = view.render().find((node) => node.type === "SkuRegionEditor")!;
            editor.props.onChange({ x: .1, y: .2, width: .3, height: .4 }); editor.props.onClose();
            set("变体 1 名称", "Blue"); set("变体 1 变化要求", "Use blue");
        }
    };
    return { ...view, onSubmit, upload, analyze, billing, products, capabilities, field, button, set, role, submitButton, submit, preset, filled };
}

describe("specialized form interactions", () => {
    it.each([
        { isSuccess: false, isPending: true },
        { isFetching: true },
        { isSuccess: false, isError: true },
    ])("retains both image roles until the material query settles successfully: %p", (status) => {
        const view = formHarness("replica"); view.filled();
        Object.assign(view.products, status, { data: [] });
        expect(view.role("商品图").images).toEqual([images[0]]);
        expect(view.role("风格参考图").images).toEqual([images[1]]);
        Object.assign(view.products, { isSuccess: true, isPending: false, isFetching: false, isError: false, data: [images[0]] });
        view.render();
        expect(view.role("商品图").images).toEqual([images[0]]);
        expect(view.role("风格参考图").images).toEqual([]);
        expect(view.submitButton().props.disabled).toBe(true);
        view.products.data = [];
        view.render();
        expect(view.role("商品图").images).toEqual([]);
    });
    it("invalidates the local detail plan and output selection after a confirmed primary deletion", async () => {
        const view = formHarness("detail"); view.filled();
        view.set("hero 页面要求", "Previously edited page");
        view.field("输出 hero").props.onChange();
        view.products.data = [];
        view.render();
        expect(view.render().some((node) => node.props["aria-label"] === "输出 selling")).toBe(false);
        expect(view.role("商品图片").images).toEqual([]);
        await view.submit(); expect(view.onSubmit).not.toHaveBeenCalled();
        view.products.data = [...images];
        view.role("商品图片").onChange([images[0]]);
        expect(view.render().some((node) => node.props["aria-label"] === "输出 selling")).toBe(false);
        view.button("生成本地规划").props.onClick();
        expect(view.field("hero 页面要求").props.value).not.toContain("Previously edited page");
        expect(view.field("输出 hero").props.checked).toBe(true);
    });
    it("clears the SKU region and closes its modal after a confirmed template deletion", () => {
        const view = formHarness("sku"); view.filled(); view.button("调整区域").props.onClick();
        expect(view.render().some((node) => node.type === "SkuRegionEditor")).toBe(true);
        view.products.data = [];
        view.render();
        expect(view.role("SKU 模板图").images).toEqual([]);
        expect(view.render().some((node) => node.type === "SkuRegionEditor")).toBe(false);
        view.products.data = [...images];
        view.role("SKU 模板图").onChange([images[0]]);
        expect(view.render().some((node) => node.type === "SkuRegionEditor")).toBe(false);
        expect(view.button("选择区域").props.disabled).toBe(false);
        expect(view.submitButton().props.disabled).toBe(true);
    });
    it("retains selections during its own upload and retains the newly cache-seeded image", async () => {
        const view = formHarness("creative"); view.filled();
        view.role("参考图片（可选）").onChange([images[0]]);
        let finish!: (image: typeof images[number]) => void;
        view.upload.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
        const uploading = view.role("参考图片（可选）").onFiles([{ type: "image/png", size: 10 }]);
        view.products.data = [];
        expect(view.role("参考图片（可选）").images).toEqual([images[0]]);
        view.products.data = [images[0]];
        finish(images[1]); await uploading;
        expect(view.role("参考图片（可选）").images).toEqual([images[0], images[1]]);
        view.products.isFetching = true; view.products.data = [images[0]];
        expect(view.role("参考图片（可选）").images).toEqual([images[0], images[1]]);
        view.products.data = [images[0], images[1]]; view.products.isFetching = false;
        expect(view.role("参考图片（可选）").images).toEqual([images[0], images[1]]);
    });
    it.each(["detail", "replica", "creative", "fusion", "sku"] as const)("submits real %s form state through the existing contract", async (tool) => {
        const view = formHarness(tool); view.filled();
        expect(view.submitButton().props.disabled).toBe(false); await view.submit();
        const input = view.onSubmit.mock.calls[0][0];
        expect(input.tool).toBe(tool); expect(validateToolWorkflow(input)).toBeNull();
        expect(input.count).toBe(tool === "detail" ? 4 : 1);
        expect(view.billing).toHaveBeenLastCalledWith(modelId, input.count, true);
        expect(view.analyze).not.toHaveBeenCalled();
        if (tool === "creative") expect(input.productName).toBeUndefined();
    });
    it("edits planned pages, batches at four, and invalidates review on changed confirmed facts", async () => {
        const view = formHarness("detail"); view.filled();
        expect(view.field("输出 scene").props.disabled).toBe(true);
        view.field("输出 hero").props.onChange(); view.field("输出 scene").props.onChange();
        view.set("scene 页面要求", "Edited atmosphere"); await view.submit();
        expect(view.onSubmit.mock.calls[0][0]).toEqual(expect.objectContaining({ count: 4, instructions: expect.stringContaining("Edited atmosphere"), design: expect.objectContaining({ detailModules: expect.any(Array), outputModules: ["selling", "lifestyle", "angles", "scene"] }) }));
        view.button("商品信息").props.onClick(); view.set("已确认的商品描述", "New confirmed facts");
        expect(view.render().some((node) => node.props["aria-label"] === "输出 scene")).toBe(false);
        await view.submit(); expect(view.onSubmit).toHaveBeenCalledTimes(1);
        view.button("生成本地规划").props.onClick(); expect(view.field("hero 页面要求").props.value).not.toContain("Edited atmosphere");
    });
    it("shares the detail textarea budget with the payload and keeps text when page edits exceed it", async () => {
        const view = formHarness("detail"); view.filled();
        const remaining = view.field("instructions").props.maxLength;
        expect(remaining).toBeLessThan(1500);
        expect(view.field("hero 页面要求").props.maxLength).toBe(300);
        view.set("instructions", "x".repeat(remaining));
        expect(view.render().some((node) => node.type === "p" && elementText(node) === "总要求 1500 / 1500")).toBe(true);
        expect(view.submitButton().props.disabled).toBe(false);
        await view.submit(); expect(view.onSubmit.mock.calls[0][0].instructions).toHaveLength(1500);
        view.set("instructions", `${view.field("instructions").props.value}x`);
        expect(view.submitButton().props.disabled).toBe(true);
        expect(view.render().some((node) => node.type === "p" && elementText(node) === "总要求 1501 / 1500")).toBe(true);
        await view.submit(); expect(view.onSubmit).toHaveBeenCalledTimes(1);
        view.set("instructions", "x".repeat(remaining));
        view.set("hero 页面要求", `${view.field("hero 页面要求").props.value}x`);
        expect(view.field("instructions").props.maxLength).toBe(remaining - 1);
        expect(view.field("instructions").props.value).toBe("x".repeat(remaining));
        expect(view.submitButton().props.disabled).toBe(true);
        expect(view.render().some((node) => node.props.role === "status" && elementText(node).includes("1500"))).toBe(true);
        view.field("输出 hero").props.onChange();
        expect(view.field("instructions").props.maxLength).toBeGreaterThan(remaining);
        expect(view.submitButton().props.disabled).toBe(false);
        await view.submit();
        expect(view.onSubmit.mock.calls[1][0].instructions).not.toContain("hero:");
        expect(view.field("instructions").props.value).toBe("x".repeat(remaining));
    });
    it("still creates default detail plans when an existing supplement consumes the total budget", () => {
        const view = formHarness("detail");
        view.role("商品图片").onChange([images[0]]);
        view.set("product", "Confirmed product"); view.set("已确认的商品描述", "Confirmed description");
        view.set("instructions", "x".repeat(1500));
        expect(view.button("生成本地规划").props.disabled).toBe(false);
        view.button("生成本地规划").props.onClick();
        expect(view.field("输出 hero").props.checked).toBe(true);
        expect(view.field("instructions").props.value).toHaveLength(1500);
        expect(view.field("instructions").props.maxLength).toBeLessThan(1500);
        expect(view.submitButton().props.disabled).toBe(true);
        view.set("instructions", ""); expect(view.submitButton().props.disabled).toBe(false);
    });
    it("retains selected images and inputs when returning to the fusion gallery", async () => {
        const view = formHarness("fusion"); view.filled(); view.set("instructions", "Keep product shape");
        view.button("预设").props.onClick(); expect(view.render().some((node) => node.type === "FusionPresetGallery")).toBe(true);
        view.preset("gift"); expect(view.role("主体图").images).toEqual([images[0]]); expect(view.field("instructions").props.value).toBe("Keep product shape");
        await view.submit(); expect(view.onSubmit.mock.calls[0][0].design.fusionPreset).toBe("gift");
    });
    it("rejects duplicate role selections, and computes each role's remaining maximum", () => {
        const view = formHarness("replica"); view.filled();
        view.role("风格参考图").onChange([images[0]]);
        expect(view.role("风格参考图").images).toEqual([images[1]]);
        expect(view.render().some((node) => node.props.role === "alert" && elementText(node).includes("两个角色"))).toBe(true);
        view.role("商品图").onChange([images[0], images[2], images[3], images[4]]);
        expect(view.role("商品图").max).toBe(4); expect(view.role("风格参考图").max).toBe(1);
    });
    it("keeps stable SKU entries, derives count, and clears the region after template replacement", async () => {
        const view = formHarness("sku"); view.filled(); view.button("添加变体").props.onClick();
        view.set("变体 2 名称", "Red"); view.set("变体 2 变化要求", "Use red");
        expect(view.render().find((node) => node.props["data-variant-id"] === "sku-2")).toBeDefined();
        await view.submit(); expect(view.onSubmit.mock.calls[0][0].count).toBe(2);
        view.render().find((node) => node.props["aria-label"] === "移除变体 1")!.props.onClick();
        expect(view.field("变体 1 名称").props.value).toBe("Red");
        expect(view.render().find((node) => node.props["data-variant-id"] === "sku-2")).toBeDefined();
        view.role("SKU 模板图").onChange([images[2]]); expect(view.submitButton().props.disabled).toBe(true);
        expect(view.render().some((node) => node.props["aria-label"] === "生成数量")).toBe(false);
    });
    it.each([{ ready: false }, { locked: true }, { unavailable: true }])("gates generation for %p", async (options) => {
        const view = formHarness("creative", options); view.filled();
        expect(view.submitButton().props.disabled).toBe(true); await view.submit(); expect(view.onSubmit).not.toHaveBeenCalled();
        expect(view.field("生成模型")).toBeDefined();
    });
    it("pins the selected model and does not drop references when capability becomes unavailable", () => {
        const view = formHarness("creative"); view.filled(); view.role("参考图片（可选）").onChange(images.slice(0, 4));
        view.capabilities.models[0].maxReferenceImages = 1;
        expect(view.submitButton().props.disabled).toBe(true); expect(view.role("参考图片（可选）").images).toHaveLength(4);
        expect(view.field("生成模型").props.value).toBe(modelId);
        view.role("参考图片（可选）").onChange(images.slice(0, 3));
        expect(view.role("参考图片（可选）").images).toHaveLength(3);
        view.role("参考图片（可选）").onChange([images[0]]); expect(view.submitButton().props.disabled).toBe(false);
    });
    it("permits an explicit capable creative model choice before adding references", async () => {
        const view = formHarness("creative");
        const textId = "33333333-3333-4333-8333-333333333333";
        view.capabilities.models.unshift({ ...view.capabilities.models[0], id: textId, capabilities: ["text-to-image"] });
        view.capabilities.tools[0].modelIdsByCapability["text-to-image"]!.push(textId);
        view.filled(); expect(view.role("参考图片（可选）").max).toBe(0);
        view.set("生成模型", modelId); view.role("参考图片（可选）").onChange([images[0]]); await view.submit();
        expect(view.onSubmit.mock.calls[0][0]).toEqual(expect.objectContaining({ modelId, assetIds: [assetIds[0]] }));
    });
    it("prevents repeated submit and displays the actual rejected submission error", async () => {
        const view = formHarness("creative"); view.filled();
        let finish!: () => void;
        view.onSubmit.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
        const submit = view.render().find((node) => node.type === "form")!.props.onSubmit;
        const first = submit({ preventDefault: jest.fn() }); await submit({ preventDefault: jest.fn() });
        expect(view.onSubmit).toHaveBeenCalledTimes(1); finish(); await first;
        view.onSubmit.mockRejectedValueOnce(new Error("Quoted model unavailable")); await expect(view.submit()).resolves.toBeUndefined();
        expect(view.render().some((node) => node.props.role === "alert" && elementText(node).includes("Quoted model unavailable"))).toBe(true);
    });
    it("keeps fresh uploads without waiting for a historical material-query snapshot and serializes operations", async () => {
        const view = formHarness("creative"); view.filled();
        let finish!: (image: typeof images[number]) => void;
        view.upload.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
        const files = view.role("参考图片（可选）").onFiles;
        const first = files([{ type: "image/png", size: 10 }]); files([{ type: "image/png", size: 10 }]); await view.submit();
        expect(view.upload).toHaveBeenCalledTimes(1); expect(view.onSubmit).not.toHaveBeenCalled();
        finish(images[0]); await first; await Promise.resolve();
        expect(view.role("参考图片（可选）").images).toEqual([images[0]]);
        view.upload.mockResolvedValueOnce(images[1]); await view.role("参考图片（可选）").onFiles([{ type: "image/png", size: 10 }]);
        expect(view.role("参考图片（可选）").images).toEqual([images[0], images[1]]);
    });
    it.each(["locked", "capability"])("does not append a late upload after %s changes", async (change) => {
        const view = formHarness("creative"); view.filled();
        let finish!: (image: typeof images[number]) => void;
        view.upload.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
        const uploading = view.role("参考图片（可选）").onFiles([{ type: "image/png", size: 10 }]);
        if (change === "locked") view.props.locked = true;
        else view.capabilities.tools[0].status = "unavailable";
        view.render(); finish(images[0]); await uploading;
        expect(view.role("参考图片（可选）").images).toEqual([]);
        expect(view.render().some((node) => node.props.role === "alert" && elementText(node).includes("素材库"))).toBe(true);
    });
    it("only invokes a separately authorized vision analysis explicitly and hides stale advice", async () => {
        const view = formHarness("creative"); view.filled(); view.role("参考图片（可选）").onChange([images[0]]);
        expect(view.analyze).not.toHaveBeenCalled(); await view.button("分析参考图").props.onClick(); await Promise.resolve();
        expect(view.analyze).toHaveBeenCalledWith({ modelId, assetIds: [assetIds[0]], productName: "参考图片", language: "简体中文" });
        expect(view.render().some((node) => node.type === "output")).toBe(true);
        view.button("加入编辑要求").props.onClick(); expect(view.field("instructions").props.value).toContain("Unconfirmed visual advice");
        view.role("参考图片（可选）").onChange([images[1]]); expect(view.render().some((node) => node.type === "output")).toBe(false);
    });
});

describe("specialized assets and region controls", () => {
    (process.env.IMAGE_STUDIO_VERIFY_PRESETS === "1" ? it : it.skip)("decodes all public preset photographs without blank image placeholders", async () => {
        const view = renderHarness("specialized-components", "FusionPresetGallery", { onSelect: jest.fn() });
        const sharp: typeof import("sharp") = require("sharp");
        const results = await Promise.all(Object.entries(view.exports.FUSION_PRESET_IMAGES as Record<string, string>).map(async ([id, src]) => {
            const response = await fetch(new URL(src, "http://localhost:4090"), { signal: AbortSignal.timeout(20000) });
            if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) throw new Error(`${id}: HTTP ${response.status}, not an image`);
            const bytes = Buffer.from(await response.arrayBuffer());
            const metadata = await sharp(bytes).metadata();
            const statistics = await sharp(bytes).stats();
            expect(metadata.width).toBeGreaterThan(100); expect(metadata.height).toBeGreaterThan(100);
            expect(statistics.channels.some((channel) => channel.stdev > 3)).toBe(true);
            return { id, width: metadata.width, height: metadata.height, bytes: bytes.length };
        }));
        expect(results).toHaveLength(15);
        console.info("Preset image verification", results);
    }, 45000);
    it("keeps paste and drag scoped to the role area, preserving text editing and locks", () => {
        const onFiles = jest.fn(), onChange = jest.fn();
        const view = renderHarness("specialized-components", "AssetRolePicker", { label: "Reference", images: [], max: 4, disabled: false, onFiles, onChange });
        const event = (typing = false) => ({ target: { closest: () => typing ? {} : null }, preventDefault: jest.fn(), stopPropagation: jest.fn(), clipboardData: { files: [{ type: "image/png", size: 10 }] }, dataTransfer: { files: [{ type: "image/png", size: 10 }], types: ["Files"] } });
        const root = () => view.render().find((node) => node.type === "section")!;
        const typing = event(true); root().props.onPaste(typing); expect(typing.preventDefault).not.toHaveBeenCalled();
        root().props.onPaste(event()); root().props.onDrop(event()); expect(onFiles).toHaveBeenCalledTimes(2);
        view.props.disabled = true; const locked = event(); root().props.onPaste(locked); root().props.onDrop(locked);
        expect(locked.preventDefault).not.toHaveBeenCalled(); expect(onFiles).toHaveBeenCalledTimes(2);
    });
    it("disposes protected thumbnail loads on ID changes/unmount and ignores late callbacks", () => {
        const release = jest.fn(), load = jest.fn().mockReturnValue(release), original = jest.fn();
        const view = renderHarness("specialized-components", "ProtectedAsset", { image: images[0] }, { loadProductThumbnail: load, loadProductImage: original });
        view.render(); const oldReady = load.mock.calls[0][1];
        view.props.image = images[1]; view.render(); expect(release).toHaveBeenCalledTimes(1);
        oldReady("blob:old"); expect(view.render().some((node) => node.type === "img")).toBe(false);
        load.mock.calls[1][1]("blob:current"); expect(view.render().find((node) => node.type === "img")!.props.src).toBe("blob:current");
        view.unmount(); expect(release).toHaveBeenCalledTimes(2); expect(original).not.toHaveBeenCalled();
    });
    it("loads an original only inside the intentional region editor, handles reverse dragging and numeric bounds", () => {
        const onChange = jest.fn(), onClose = jest.fn();
        const view = renderHarness("specialized-components", "SkuRegionEditor", { image: images[0], disabled: false, onChange, onClose });
        const ready = view.render().find((node) => typeof node.type === "function" && node.props.original)!;
        ready.props.onReady(true);
        const stage = () => view.render().find((node) => node.props.className === "specialized-region-stage")!;
        const currentTarget = { getBoundingClientRect: () => ({ left: 10, top: 20, width: 400, height: 300 }), setPointerCapture: jest.fn(), releasePointerCapture: jest.fn() };
        stage().props.onPointerDown({ currentTarget, clientX: 330, clientY: 290, pointerId: 1, isPrimary: true, button: 0, preventDefault: jest.fn() });
        stage().props.onPointerMove({ currentTarget, clientX: 90, clientY: 50, pointerId: 1 });
        stage().props.onPointerUp({ currentTarget, clientX: 90, clientY: 50, pointerId: 1 });
        const confirm = () => view.render().find((node) => node.type === "button" && elementText(node).includes("确认区域"))!;
        confirm().props.onClick(); expect(onChange).toHaveBeenCalledWith({ x: .2, y: .1, width: expect.closeTo(.6), height: .8 });
        view.render().find((node) => node.props["aria-label"] === "x (%)")!.props.onChange({ target: { value: "200" } });
        confirm().props.onClick(); const region = onChange.mock.calls[1][0]; expect(region.x + region.width).toBeLessThanOrEqual(1);
        expect(region.width).toBeGreaterThan(0); expect(onClose).toHaveBeenCalledTimes(2);
    });
    it("provides all fifteen visual presets in two real categories with independent image sources", () => {
        const onSelect = jest.fn(); const view = renderHarness("specialized-components", "FusionPresetGallery", { selected: "print", onSelect });
        const nodes = view.render(); const pictures = nodes.filter((node) => node.type === "img");
        expect(pictures).toHaveLength(15); expect(new Set(pictures.map((node) => node.props.src)).size).toBe(15);
        expect(nodes.filter((node) => node.type === "h3").map(elementText)).toEqual(["表面附着", "空间摆放"]);
        nodes.find((node) => node.type === "button" && elementText(node).includes("礼盒组合"))!.props.onClick(); expect(onSelect).toHaveBeenCalledWith("gift");
    });
});