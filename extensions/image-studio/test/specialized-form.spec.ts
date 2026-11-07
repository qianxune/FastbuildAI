import {
    acceptsAssetTransfer, buildSpecializedInput, createDetailPlan, draftPlanSource, normalizeRegion,
    regionFromPoints, specializedInstructionBudget, specializedModels, validateRoleSelection, validImageFile,
    recordWatermarkEdit, stepWatermarkHistory, transformWatermarkMark, type WatermarkHistory,
    type SpecializedDraft,
} from "../src/web/pages/specialized-workflow";
import { validateToolWorkflow, DETAIL_MODULES, toolWorkflowPrompt } from "../src/api/shared/tool-workflow";
import type { GenerationCapabilities } from "../src/api/shared/tools";
import { TOOL_REGISTRY, LOCAL_CUTOUT_MODEL_ID } from "../src/api/shared/tools";
import * as workflow from "../src/api/shared/tool-workflow";
import * as specialized from "../src/web/pages/specialized-workflow";
import * as assetDraft from "../src/web/pages/asset-draft";
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
    it("accepts ten SKU outputs with three stable regions and distinct per-output edits", () => {
        const regions = Array.from({ length: 3 }, (_value, index) => ({ id: `region-${index + 1}`, region: { x: index * .2, y: .1, width: .1, height: .2 } }));
        const input = { tool: "sku", modelId, assetIds: [assetIds[0], assetIds[1]], instructions: "", count: 10, ratio: "1:1",
            design: { skuRegions: regions, skuVariants: Array.from({ length: 10 }, (_value, index) => ({ name: `SKU ${index + 1}`, instruction: "",
                edits: regions.map(({ id }) => ({ regionId: id, instruction: `Output ${index + 1} ${id}`, ...(id === "region-1" ? { referenceAssetId: assetIds[1] } : {}) })) })) } };
        expect(validateToolWorkflow(input as any)).toBeNull();
        expect(toolWorkflowPrompt(input as any, 9)).toContain("Output 10 region-3");
        expect(toolWorkflowPrompt(input as any, 9)).not.toContain("Output 1 region-3");
        expect(toolWorkflowPrompt(input as any, 9)).toContain("Reference image 2");
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

describe("watermark annotation history and geometry", () => {
    const mark = { id: "mark-1", region: { x: .1, y: .2, width: .3, height: .2 }, points: [{ x: .2, y: .3 }] };
    const empty: WatermarkHistory = { marks: [], past: [], future: [] };
    it("records edits, undo/redo and discards redo after a new edit", () => {
        const first = recordWatermarkEdit(empty, [mark]);
        expect(stepWatermarkHistory(first, "undo").marks).toEqual([]);
        expect(stepWatermarkHistory(stepWatermarkHistory(first, "undo"), "redo").marks).toEqual([mark]);
        expect(recordWatermarkEdit(stepWatermarkHistory(first, "undo"), [{ ...mark, id: "mark-2" }]).future).toEqual([]);
        expect(recordWatermarkEdit(first, first.marks)).toBe(first);
        expect(recordWatermarkEdit(empty, Array(4).fill(mark))).toBe(empty);
    });
    it("moves marks and brush points within image bounds", () => {
        const moved = transformWatermarkMark(mark, 2, -2);
        expect(moved.region).toEqual({ x: .7, y: 0, width: .3, height: .2 });
        expect(moved.points?.[0].x).toBeCloseTo(.8);
        expect(moved.points?.[0].y).toBeCloseTo(.1);
    });
    it.each(["n", "ne", "e", "se", "s", "sw", "w", "nw"])("keeps %s resizing positive and bounded", (handle) => {
        const resized = transformWatermarkMark(mark, -2, 2, handle).region;
        expect(resized.width).toBeGreaterThanOrEqual(.0099);
        expect(resized.height).toBeGreaterThanOrEqual(.0099);
        expect(resized.x).toBeGreaterThanOrEqual(0);
        expect(resized.y).toBeGreaterThanOrEqual(0);
        expect(resized.x + resized.width).toBeLessThanOrEqual(1);
        expect(resized.y + resized.height).toBeLessThanOrEqual(1);
    });
});

function renderHarness(file: string, exportName: string, props: Record<string, any>, services: Record<string, unknown> = {}) {
    const state: any[] = [], refs: any[] = [];
    const portals: ElementNode[] = [];
    const effects: Array<{ dependencies?: unknown[]; cleanup?: () => void }> = [];
    let stateCursor = 0, refCursor = 0, effectCursor = 0;
    const queued: Array<() => void> = [];
    const exports: any = {};
    const jsx = (type: unknown, childProps: ElementNode["props"]) => ({ type, props: childProps });
    const source = readFileSync(path.join(__dirname, `../src/web/pages/${file}.tsx`), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } });
    runInNewContext(compiled.outputText, { exports, Error, window: { confirm: () => props.confirmReplacement?.() ?? true }, require: (name: string) => {
        if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
        if (name === "react-dom") return { createPortal: (child: ElementNode) => { portals.push(child); return child; } };
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
        if (name === "../../api/shared/tools") return { TOOL_REGISTRY, LOCAL_CUTOUT_MODEL_ID };
        if (name === "./specialized-workflow") return specialized;
        if (name === "./asset-draft") return assetDraft;
        if (name === "./specialized-components") return componentTokens;
        if (name === "./material-picker") return { default: "MaterialPicker", MaterialDialog: "MaterialDialog" };
        if (name === "../services/generation" || name === "../services/tool-generation") return services;
        return new Proxy({}, { get: (_target, key) => key });
    } });
    function render() {
        stateCursor = 0; refCursor = 0; effectCursor = 0;
        portals.length = 0;
        const nodes: ElementNode[] = [];
        const visit = (value: any) => {
            if (Array.isArray(value)) value.forEach(visit);
            else if (value && typeof value === "object" && "props" in value) { nodes.push(value); visit(value.props.children); }
        };
        visit(exports[exportName](props));
        queued.splice(0).forEach((effect) => effect());
        return nodes;
    }
    return { render, props, exports, portals, unmount: () => effects.forEach((effect) => effect.cleanup?.()) };
}

describe("watermark canvas controls", () => {
    function canvas(marks: WatermarkHistory["marks"] = [], sku = false) {
        const release = jest.fn(), load = jest.fn().mockReturnValue(release), onChange = jest.fn(), onSelect = jest.fn(), onHistory = jest.fn(), onReady = jest.fn();
        const view = renderHarness("watermark-editor", "WatermarkCanvas", { image: images[0], history: { marks, past: [], future: [] }, selected: "", disabled: false, onChange, onSelect, onHistory, onReady, ...(sku ? { variant: "sku" } : {}) }, { loadProductImage: load });
        const stage = () => view.render().find((node) => node.props["aria-label"] === "原图标记区域")!;
        const button = (label: string) => view.render().find((node) => node.type === "button" && node.props["aria-label"] === label)!;
        const bounds = { left: 10, top: 20, width: 400, height: 300 };
        const event = (x = 50, y = 50) => ({ clientX: x, clientY: y, pointerId: 1, button: 0, preventDefault: jest.fn(), stopPropagation: jest.fn() });
        const ready = () => {
            view.render(); load.mock.calls.at(-1)![1]("blob:protected");
            view.render().find((node) => node.type === "img")!.props.onLoad();
            stage().props.ref.current = { getBoundingClientRect: () => bounds, focus: jest.fn(), setPointerCapture: jest.fn() };
        };
        return { ...view, stage, button, event, ready, release, load, onChange, onSelect, onHistory, onReady };
    }
    it("retains redraw brush and eraser without the old bottom description", () => {
        const view = canvas(); view.props.variant = "redraw"; view.props.instruction = "Change to black"; view.props.onInstructionChange = jest.fn();
        view.props.history.marks = [{ id: "redraw-1", region: { x: .1, y: .2, width: .3, height: .3 } }]; view.props.selected = "redraw-1";
        view.ready(); view.button("涂抹").props.onClick();
        expect(view.button("擦除").props.disabled).toBe(false);
        expect(view.render().some((node) => node.type === "textarea" || node.props.className === "redraw-prompt-panel")).toBe(false);
        view.stage().props.onPointerMove(view.event(90, 80));
        expect(view.render().some((node) => node.props.className === "redraw-brush-cursor")).toBe(true);
        expect(view.props.onInstructionChange).not.toHaveBeenCalled();
    });
    it("renders redraw paint without a filled rectangle or resize handles and starts at size 30", () => {
        const mark = { id: "paint-1", region: { x: .1, y: .2, width: .3, height: .3 }, points: [{ x: .2, y: .3 }, { x: .3, y: .4 }], brushWidth: .075 };
        const view = canvas([mark]); view.props.variant = "redraw"; view.props.selected = mark.id; view.ready();
        expect(view.button("涂抹").props["aria-pressed"]).toBe(true);
        expect(view.render().find((node) => node.props["aria-label"] === "画笔大小")!.props.value).toBe(30);
        const region = view.render().find((node) => node.props.className === "watermark-region")!;
        expect(region.props["data-brush"]).toBe(true);
        expect(region.props.style.pointerEvents).toBe("none");
        expect(view.render().some((node) => node.props.className === "watermark-resize-handle")).toBe(false);
        expect(view.button("选择标注 1")).toBeDefined();
        view.button("擦除").props.onClick();
        const stroke = view.render().find((node) => node.type === "polyline")!;
        expect(stroke.props.style.pointerEvents).toBe("stroke");
        stroke.props.onPointerDown(view.event(90, 80));
        expect(view.onChange).toHaveBeenCalledWith([]);
        view.props.disabled = true; view.render(); stroke.props.onPointerDown(view.event(90, 80));
        expect(view.onChange).toHaveBeenCalledTimes(1);
    });
    it("retains redraw rectangle handles and legacy watermark brush selection", () => {
        const mark = { id: "region-1", region: { x: .1, y: .2, width: .3, height: .3 } };
        const redraw = canvas([mark]); redraw.props.variant = "redraw"; redraw.props.selected = mark.id; redraw.ready();
        expect(redraw.render().filter((node) => node.props.className === "watermark-resize-handle")).toHaveLength(8);
        const watermark = canvas([{ ...mark, points: [{ x: .2, y: .3 }], brushWidth: .02 }]);
        watermark.props.selected = mark.id; watermark.ready();
        expect(watermark.button("画笔")).toBeDefined();
        expect(watermark.render().filter((node) => node.props.className === "watermark-resize-handle")).toHaveLength(8);
    });
    it.each(["框选", "画笔", "圆选", "套索"])("keeps the three-region cap for SKU %s gestures", (mode) => {
        const marks = [1, 2, 3].map((index) => ({ id: `region-${index}`, region: { x: .1, y: .1, width: .2, height: .2 } }));
        const view = canvas(marks, true); view.ready(); view.button(mode).props.onClick();
        view.stage().props.onPointerDown(view.event(50, 50)); view.stage().props.onPointerMove(view.event(120, 70));
        view.stage().props.onPointerMove(view.event(100, 120)); view.stage().props.onPointerUp(view.event(200, 200));
        expect(view.onChange).not.toHaveBeenCalled();
    });
    it.each([["圆选", "ellipse"], ["套索", "lasso"]])("creates bounded SKU %s guidance with visible shape metadata", (mode, shape) => {
        const view = canvas([], true); view.ready(); view.button(mode!).props.onClick();
        view.stage().props.onPointerDown(view.event(50, 50)); view.stage().props.onPointerMove(view.event(120, 60));
        view.stage().props.onPointerMove(view.event(90, 100)); view.stage().props.onPointerUp(view.event(50, 50));
        if (shape === "ellipse") { expect(view.onChange).not.toHaveBeenCalled(); view.stage().props.onPointerDown(view.event(50, 50)); view.stage().props.onPointerUp(view.event(120, 100)); }
        const mark = view.onChange.mock.calls[0][0][0];
        expect(mark.shape).toBe(shape); expect(mark.region.width).toBeGreaterThan(0); expect(mark.region.height).toBeGreaterThan(0);
    });
    it("uses SKU brush size and erases one selected region without deleting other edits", () => {
        const view = canvas([], true); view.ready(); view.button("画笔").props.onClick();
        view.render().find((node) => node.props["aria-label"] === "画笔大小")!.props.onChange({ target: { value: "64" } });
        view.stage().props.onPointerDown(view.event(50, 50)); view.stage().props.onPointerUp(view.event(120, 100));
        const mark = view.onChange.mock.calls[0][0][0]; expect(mark.brushWidth).toBeCloseTo(.16);
        view.props.history.marks = [mark, { id: "keep", region: { x: .6, y: .6, width: .2, height: .2 } }];
        view.button("擦除").props.onClick();
        view.render().find((node) => node.props.className === "watermark-region")!.props.onPointerDown(view.event());
        expect(view.onChange.mock.calls.at(-1)![0].map((value: { id: string }) => value.id)).toEqual(["keep"]);
    });
    it("renders a read-only SKU preview without editing controls or gestures", () => {
        const view = canvas([], true); view.ready(); view.props.readOnly = true;
        expect(view.render().some((node) => node.props["aria-label"] === "标记工具")).toBe(false);
        view.stage().props.onPointerDown(view.event()); view.stage().props.onPointerUp(view.event(200, 200));
        expect(view.onChange).not.toHaveBeenCalled();
    });
    it("requires protected loading and image decoding, releases reads and ignores stale callbacks", () => {
        const view = canvas(); view.render();
        expect(view.button("框选").props.disabled).toBe(true);
        const stale = view.load.mock.calls[0][1]; view.props.image = images[1]; view.render();
        expect(view.release).toHaveBeenCalledTimes(1);
        stale("blob:old"); expect(view.render().some((node) => node.type === "img")).toBe(false);
        view.ready(); expect(view.button("框选").props.disabled).toBe(false);
        expect(view.onReady).toHaveBeenLastCalledWith(true);
        view.unmount(); expect(view.release).toHaveBeenCalledTimes(2);
        expect(view.onReady).toHaveBeenLastCalledWith(false);
    });
    it("records reverse rectangle drags but rejects clicks and tiny rectangles", () => {
        const view = canvas(); view.ready();
        view.stage().props.onPointerDown(view.event(330, 290));
        view.stage().props.onPointerUp(view.event(90, 50));
        expect(view.onChange.mock.calls[0][0][0].region).toEqual({ x: .2, y: .1, width: expect.closeTo(.6), height: .8 });
        expect(view.onSelect).toHaveBeenCalledWith(expect.stringMatching(/^mark-/));
        view.stage().props.onPointerDown(view.event()); view.stage().props.onPointerUp(view.event(51, 51));
        expect(view.onChange).toHaveBeenCalledTimes(1);
    });
    it("records visible brush points and a bounded covering region", () => {
        const view = canvas(); view.ready(); view.button("画笔").props.onClick();
        view.stage().props.onPointerDown(view.event(10, 20)); view.stage().props.onPointerMove(view.event(90, 80)); view.stage().props.onPointerUp(view.event(130, 110));
        const mark = view.onChange.mock.calls[0][0][0];
        expect(mark.points).toHaveLength(3); expect(mark.brushWidth).toBeCloseTo(.03);
        expect(mark.region.x).toBe(0); expect(mark.region.y).toBe(0);
        expect(mark.region.width).toBeCloseTo(.315); expect(mark.region.height).toBeCloseTo(.32);
    });
    it.each(["disabled", "image"])("cancels an in-flight gesture after %s changes", (field) => {
        const view = canvas(); view.ready(); view.stage().props.onPointerDown(view.event());
        const finish = view.stage().props.onPointerUp;
        view.props[field] = field === "disabled" ? true : images[1]; view.render();
        finish(view.event(200, 200)); expect(view.onChange).not.toHaveBeenCalled();
    });
    it("caps creation at three and leaves hand gestures out of annotation history", () => {
        const view = canvas(Array.from({ length: 3 }, (_value, index) => ({ id: `mark-${index}`, region: { x: .1, y: .1, width: .1, height: .1 } }))); view.ready();
        view.stage().props.onPointerDown(view.event()); view.stage().props.onPointerUp(view.event(200, 200)); expect(view.onChange).not.toHaveBeenCalled();
        view.button("画笔").props.onClick(); view.stage().props.onPointerDown(view.event()); view.stage().props.onPointerUp(view.event(200, 200)); expect(view.onChange).not.toHaveBeenCalled();
        view.button("抓手").props.onClick(); view.stage().props.onPointerDown(view.event()); view.stage().props.onPointerUp(view.event(200, 200)); expect(view.onChange).not.toHaveBeenCalled();
        view.props.selected = "mark-0";
        view.render().find((node) => node.props["aria-label"] === "水印编辑画布")!.props.onKeyDown({ key: "Delete", target: { closest: () => null }, preventDefault: jest.fn() });
        view.props.history.marks = view.onChange.mock.calls.at(-1)![0];
        expect(view.props.history.marks).toHaveLength(2);
        view.onChange.mockClear(); view.button("框选").props.onClick();
        view.stage().props.onPointerDown(view.event()); view.stage().props.onPointerUp(view.event(200, 200));
        view.props.history.marks = view.onChange.mock.calls.at(-1)![0];
        expect(view.props.history.marks).toHaveLength(3);
        view.stage().props.onPointerDown(view.event()); view.stage().props.onPointerUp(view.event(200, 200));
        expect(view.onChange).toHaveBeenCalledTimes(1);
    });
    it("connects selection movement, eight resize handles, history and clear controls", () => {
        const mark = { id: "mark-1", region: { x: .1, y: .2, width: .2, height: .2 } };
        const view = canvas([mark]); view.props.selected = mark.id; view.props.history.past = [[]]; view.ready();
        expect(view.render().filter((node) => node.props.className === "watermark-resize-handle")).toHaveLength(8);
        const root = () => view.render().find((node) => node.props["aria-label"] === "水印编辑画布")!;
        root().props.onKeyDown({ key: "ArrowRight", shiftKey: true, target: { closest: () => null }, preventDefault: jest.fn() });
        expect(view.onChange.mock.calls[0][0][0].region.x).toBeCloseTo(.125);
        view.button("撤销").props.onClick(); expect(view.onHistory).toHaveBeenCalledWith("undo");
        view.button("清空全部标记").props.onClick(); expect(view.onChange).toHaveBeenLastCalledWith([]);
        const handle = view.render().find((node) => node.props["data-handle"] === "se")!;
        handle.props.onPointerDown(view.event(130, 140)); view.stage().props.onPointerUp(view.event(170, 170));
        expect(view.onChange.mock.calls.at(-1)![0][0].region).toEqual({ x: .1, y: .2, width: expect.closeTo(.3), height: expect.closeTo(.3) });
    });
    it("selects and deletes numbered marks with protected original crop geometry", () => {
        const mark = { id: "mark-1", region: { x: .1, y: .2, width: .2, height: .4 } }, onSelect = jest.fn(), onChange = jest.fn();
        const view = renderHarness("watermark-editor", "WatermarkMarkList", { image: images[0], history: { marks: [mark], past: [], future: [] }, selected: mark.id, disabled: false, onSelect, onChange });
        expect(elementText(view.render().find((node) => node.props.className === "specialized-section-heading"))).toContain("1 / 3");
        view.render().find((node) => node.props.className === "watermark-mark-select")!.props.onClick(); expect(onSelect).toHaveBeenCalledWith(mark.id);
        view.render().find((node) => node.props["aria-label"] === "删除标注 1")!.props.onClick(); expect(onChange).toHaveBeenCalledWith([]);
        expect(view.render().find((node) => node.props.original)!.props.image).toEqual(images[0]);
        expect(view.render().find((node) => node.props.style?.width === "500%")!.props.style.left).toBe("-50%");
    });
});

function skuHarness() {
    const onSubmit = jest.fn().mockResolvedValue(undefined), upload = jest.fn();
    const billing = jest.fn().mockReturnValue({ ready: true, costText: "20 credits" });
    const products = { data: [...images], isSuccess: true, isPending: false, isFetching: false, isError: false };
    const capabilities = { tools: [{ key: "sku", status: "available", requiredCapabilities: ["reference-image"], modelIdsByCapability: { "reference-image": [modelId] } }],
        models: [{ id: modelId, name: "Configured model", capabilities: ["reference-image"], maxReferenceImages: 5 }] } as GenerationCapabilities;
    const view = renderHarness("sku-tool-form", "default", { tool: "sku", capabilities, locked: false, onSubmit }, {
        useGenerationBilling: billing, useProductImagesQuery: () => products,
        useUploadProductImageMutation: () => ({ isPending: false, mutateAsync: upload }),
    });
    const role = (label: string) => view.render().find((node) => node.type === "AssetRolePicker" && node.props.label === label)!.props;
    const button = (label: string) => view.render().find((node) => node.type === "button" && (node.props["aria-label"] === label || elementText(node).includes(label)))!;
    const set = (label: string, value: string) => view.render().find((node) => node.props["aria-label"] === label)!.props.onChange({ target: { value } });
    const modal = () => view.render().find((node) => node.type === view.exports.SkuRegionsModal)!;
    const ready = () => { view.render().find((node) => node.type === view.exports.SkuTemplatePreview)!.props.onReady(true); };
    const marks = [1, 2, 3].map((index) => ({ id: `region-${index}`, region: { x: .1 * index, y: .1, width: .1, height: .2 } }));
    const filled = () => { role("SKU 模板图").onChange([images[0]]); button("选择变体区域").props.onClick(); modal().props.onApply(marks); ready();
        marks.forEach((_mark, index) => set(`SKU 1 变体区域 ${index + 1} 变化要求`, `SKU 1 region ${index + 1}`)); };
    const submit = () => view.render().find((node) => node.type === "form")!.props.onSubmit({ preventDefault: jest.fn() });
    const submitButton = () => view.render().find((node) => node.props.type === "submit")!;
    return { ...view, onSubmit, upload, billing, products, capabilities, role, button, set, modal, ready, marks, filled, submit, submitButton };
}

describe("multi-region SKU editor", () => {
    it("keeps the size-contained modal viewport out of flex shrink in an auto-height dialog", () => {
        const css = readFileSync(path.resolve(__dirname, "../src/web/styles/specialized-forms.css"), "utf8");
        const viewport = css.match(/\.sku-region-modal \.watermark-viewport \{([^}]+)\}/)![1]!;
        expect(viewport).toContain("flex: 0 0 auto");
        expect(viewport).toContain("height: min(58dvh, 640px)");
        expect(css).toContain(".sku-region-modal .watermark-editor { height: auto; min-height: 0; }");
    });

    it("requires confirmed template regions before adding independent SKU entries", () => {
        const view = skuHarness(); const add = view.button("添加 SKU");
        expect(add.props.disabled).toBe(true); add.props.onClick();
        expect(view.render().filter((node) => node.props.className === "sku-variant")).toHaveLength(1);
        view.role("SKU 模板图").onChange([images[0]]);
        expect(view.button("添加 SKU").props.disabled).toBe(true);
        view.modal().props.onApply(view.marks);
        expect(view.button("添加 SKU").props.disabled).toBe(false);
        view.role("SKU 模板图").onChange([]); add.props.onClick();
        expect(view.render().filter((node) => node.props.className === "sku-variant")).toHaveLength(1);
    });

    it("uploads and replaces each SKU reference independently while preserving regional text", async () => {
        const view = skuHarness(); view.filled(); view.button("添加 SKU").props.onClick();
        view.marks.forEach((_mark, index) => view.set(`SKU 2 变体区域 ${index + 1} 变化要求`, `second ${index + 1}`));
        view.role("SKU 1 变体区域 1").onChange([images[1]]);
        const second = view.role("SKU 2 变体区域 1"); expect(second.allowReplacement).toBe(true);
        view.upload.mockResolvedValueOnce(images[2]);
        await second.onFiles([{ type: "image/png", size: 100 }]);
        view.upload.mockRejectedValueOnce(new Error("Upload failed"));
        await view.role("SKU 1 变体区域 1").onFiles([{ type: "image/png", size: 100 }]);
        expect(view.role("SKU 1 变体区域 1").images[0].id).toBe(images[1]!.id);
        expect(view.role("SKU 2 变体区域 1").images[0].id).toBe(images[2]!.id);
        view.upload.mockResolvedValueOnce(images[3]);
        await view.role("SKU 1 变体区域 1").onFiles([{ type: "image/png", size: 100 }]);
        expect(view.role("SKU 1 变体区域 1").images[0].id).toBe(images[3]!.id);
        expect(view.role("SKU 2 变体区域 1").images[0].id).toBe(images[2]!.id);
        await view.submit(); const input = view.onSubmit.mock.calls[0][0] as ToolWorkflowInput;
        expect(input.assetIds).toEqual([images[0]!.id, images[3]!.id, images[2]!.id]);
        expect(input.design!.skuVariants![0]!.edits![0]!.instruction).toBe("SKU 1 region 1");
        expect(input.design!.skuVariants![1]!.edits![0]!.referenceAssetId).toBe(images[2]!.id);
    });

    it("opens the region dialog immediately after selecting or uploading a template", async () => {
        const view = skuHarness();
        view.role("SKU 模板图").onChange([images[0]]);
        expect(view.modal().props.image.id).toBe(images[0]!.id);
        view.modal().props.onClose();
        expect(view.render().some((node) => node.type === view.exports.SkuRegionsModal)).toBe(false);
        view.role("SKU 模板图").onChange([images[0]]);
        expect(view.modal().props.image.id).toBe(images[0]!.id);
        view.role("SKU 模板图").onChange([]);
        expect(view.render().some((node) => node.type === view.exports.SkuRegionsModal)).toBe(false);
        view.upload.mockResolvedValueOnce(images[1]);
        await view.role("SKU 模板图").onFiles([{ type: "image/png", size: 100 }]);
        expect(view.modal().props.image.id).toBe(images[1]!.id);
    });

    it("keeps selected single-reference uploads replaceable only for the opted-in picker", () => {
        const onFiles = jest.fn();
        const view = renderHarness("specialized-components", "AssetRolePicker", { label: "SKU reference", images: [images[1]], max: 1, disabled: false, onChange: jest.fn(), onFiles, allowReplacement: true });
        const input = () => view.render().find((node) => node.props.type === "file")!;
        const upload = () => view.render().find((node) => node.type === "button" && elementText(node).includes("重新上传"))!;
        expect(upload().props.disabled).toBe(false); expect(input().props.disabled).toBe(false);
        const files = [{ type: "image/png", size: 100 }];
        input().props.onChange({ target: { files, value: "file" } }); expect(onFiles).toHaveBeenCalledWith(files);
        view.props.disabled = true; expect(input().props.disabled).toBe(true);
        view.props.disabled = false; view.props.allowReplacement = false; expect(input().props.disabled).toBe(true);
        view.props.allowReplacement = true; view.props.max = 0; expect(input().props.disabled).toBe(true);
    });

    it.each([
        ["four regions", (input: any) => { input.design.skuRegions.push({ id: "region-4", region: { x: .7, y: .1, width: .1, height: .2 } }); }],
        ["duplicate regions", (input: any) => { input.design.skuRegions[1].id = input.design.skuRegions[0].id; }],
        ["mixed legacy region", (input: any) => { input.design.skuRegion = input.design.skuRegions[0].region; }],
        ["eleven outputs", (input: any) => { input.count = 11; input.design.skuVariants.push(input.design.skuVariants[0]); }],
        ["mismatched output count", (input: any) => { input.count = 2; }],
        ["missing regional edit", (input: any) => { input.design.skuVariants[0].edits.pop(); }],
        ["duplicate regional edit", (input: any) => { input.design.skuVariants[0].edits[1].regionId = "region-1"; }],
        ["unknown reference", (input: any) => { input.design.skuVariants[0].edits[0].referenceAssetId = images[1]!.id; }],
        ["template as reference", (input: any) => { input.design.skuVariants[0].edits[0].referenceAssetId = input.assetIds[0]; }],
        ["unassigned input reference", (input: any) => { input.assetIds.push(images[1]!.id); }],
        ["empty regional requirement", (input: any) => { input.design.skuVariants[0].edits[0].instruction = " "; }],
        ["oversize regional requirement", (input: any) => { input.design.skuVariants[0].edits[0].instruction = "x".repeat(301); }],
        ["unknown nested key", (input: any) => { input.design.skuVariants[0].edits[0].mask = true; }],
        ["out-of-bounds region", (input: any) => { input.design.skuRegions[0].region.width = 1; }],
        ["nonfinite region", (input: any) => { input.design.skuRegions[0].region.x = NaN; }],
        ["null edit", (input: any) => { input.design.skuVariants[0].edits[0] = null; }],
        ["sparse regions", (input: any) => { delete input.design.skuRegions[0]; }],
        ["sparse outputs", (input: any) => { delete input.design.skuVariants[0]; }],
        ["cross-tool payload", (input: any) => { input.tool = "retouch"; input.productName = "Product"; }],
    ] as const)("rejects %s without throwing", async (_name, mutate) => {
        const view = skuHarness(); view.filled(); await view.submit();
        const input = structuredClone(view.onSubmit.mock.calls[0][0]); mutate(input);
        expect(() => validateToolWorkflow(input)).not.toThrow();
        expect(validateToolWorkflow(input)).not.toBeNull();
    });

    it("requires a decoded template, confirmed regions and every regional requirement", async () => {
        const view = skuHarness();
        expect(view.submitButton().props.disabled).toBe(true);
        view.filled();
        expect(view.submitButton().props.disabled).toBe(false);
        view.set("SKU 1 变体区域 3 变化要求", "");
        expect(view.submitButton().props.disabled).toBe(true);
        view.role("SKU 1 变体区域 3").onChange([images[1]]);
        expect(view.submitButton().props.disabled).toBe(false);
        await view.submit();
        expect(view.onSubmit.mock.calls[0][0].design.skuVariants[0].edits[2].referenceAssetId).toBe(images[1]!.id);
    });

    it("submits ten independent SKU edits and deduplicates shared references", async () => {
        const view = skuHarness(); view.filled();
        for (let index = 2; index <= 10; index++) {
            view.button("添加 SKU").props.onClick();
            view.marks.forEach((_mark, region) => view.set(`SKU ${index} 变体区域 ${region + 1} 变化要求`, `SKU ${index} region ${region + 1}`));
        }
        view.role("SKU 1 变体区域 1").onChange([images[1]]);
        view.role("SKU 10 变体区域 3").onChange([images[1]]);
        expect(view.button("添加 SKU").props.disabled).toBe(true);
        view.button("添加 SKU").props.onClick();
        await view.submit();
        const input = view.onSubmit.mock.calls[0][0] as ToolWorkflowInput;
        expect(input.count).toBe(10); expect(input.design!.skuVariants).toHaveLength(10);
        expect(input.assetIds).toEqual([images[0]!.id, images[1]!.id]);
        expect(input.design!.skuRegions).toEqual(view.marks);
        expect(input.design!.skuVariants![9]!.edits![2]!.instruction).toBe("SKU 10 region 3");
        expect(view.billing).toHaveBeenLastCalledWith(modelId, 10, true, "sku");
        expect(validateToolWorkflow(input)).toBeNull();
    });

    it("preserves stable SKU and region ownership after deletions and region reconciliation", async () => {
        const view = skuHarness(); view.filled();
        view.button("添加 SKU").props.onClick();
        view.marks.forEach((_mark, index) => view.set(`SKU 2 变体区域 ${index + 1} 变化要求`, `second ${index + 1}`));
        view.button("删除 SKU 1").props.onClick();
        view.button("重新编辑").props.onClick();
        const marks = [view.marks[1]!, { id: "region-4", region: { x: .7, y: .2, width: .1, height: .2 } }];
        view.modal().props.onApply(marks);
        expect(view.render().find((node) => node.props["aria-label"] === "SKU 1 变体区域 1 变化要求")!.props.value).toBe("second 2");
        expect(view.render().find((node) => node.props["aria-label"] === "SKU 1 变体区域 2 变化要求")!.props.value).toBe("");
        view.set("SKU 1 变体区域 2 变化要求", "new region"); await view.submit();
        expect(view.onSubmit.mock.calls[0][0].design.skuVariants[0].name).toBe("SKU 2");
        expect(view.onSubmit.mock.calls[0][0].design.skuVariants[0].edits.map((edit: {regionId: string}) => edit.regionId)).toEqual(["region-2", "region-4"]);
    });

    it("keeps the confirmed layout when the region modal is cancelled", () => {
        const view = skuHarness(); view.filled(); view.button("重新编辑").props.onClick(); view.modal().props.onClose();
        expect(view.render().some((node) => node.type === view.exports.SkuRegionsModal)).toBe(false);
        expect(view.submitButton().props.disabled).toBe(false);
    });

    it("preserves a failed template replacement, and resets regions only after a successful replacement", async () => {
        const view = skuHarness(); view.filled();
        const input = () => view.render().find((node) => node.props["aria-label"] === "重新上传 SKU 模板图")!;
        view.upload.mockRejectedValueOnce(new Error("Upload failed"));
        input().props.onChange({ target: { files: [{ type: "image/png", size: 100 }], value: "file" } });
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(view.role("SKU 模板图").images[0].id).toBe(images[0]!.id);
        expect(view.submitButton().props.disabled).toBe(false);
        view.upload.mockResolvedValueOnce(images[1]);
        input().props.onChange({ target: { files: [{ type: "image/png", size: 100 }], value: "file" } });
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(view.role("SKU 模板图").images[0].id).toBe(images[1]!.id);
        expect(view.submitButton().props.disabled).toBe(true);
        expect(view.render().some((node) => node.props["aria-label"] === "SKU 1 变体区域 1 变化要求")).toBe(false);
    });

    it("ignores stale edits and uploads after the workspace becomes locked", async () => {
        const view = skuHarness(); view.filled();
        const cached = view.role("SKU 模板图");
        let resolve!: (image: ProductImage) => void;
        view.upload.mockReturnValue(new Promise<ProductImage>((done) => { resolve = done; }));
        const uploading = view.role("SKU 1 变体区域 1").onFiles([{ type: "image/png", size: 100 }]);
        view.props.locked = true; view.render(); cached.onChange([images[1]]); resolve(images[1]!); await uploading;
        expect(view.role("SKU 模板图").images[0].id).toBe(images[0]!.id);
        expect(view.role("SKU 1 变体区域 1").images).toEqual([]);
        await view.submit(); expect(view.onSubmit).not.toHaveBeenCalled();
    });

    it("applies regional drafts only after decoded-image confirmation and rejects a fourth region", () => {
        const onApply = jest.fn(), onClose = jest.fn();
        const marks = [{ id: "region-1", region: { x: .1, y: .1, width: .2, height: .2 } }];
        const view = renderHarness("sku-tool-form", "SkuRegionsModal", { image: images[0], regions: marks, disabled: false, onApply, onClose });
        const canvas = () => view.render().find((node) => node.type === "WatermarkCanvas")!;
        const confirm = () => view.render().find((node) => node.type === "button" && elementText(node).includes("确定"))!;
        expect(confirm().props.disabled).toBe(true);
        canvas().props.onReady(true);
        const draft = [...marks, { id: "region-2", region: { x: .4, y: .1, width: .2, height: .2 } }];
        canvas().props.onChange(draft); expect(onApply).not.toHaveBeenCalled();
        canvas().props.onChange([...draft, ...draft]);
        expect(canvas().props.history.marks).toEqual(draft);
        confirm().props.onClick(); expect(onApply).toHaveBeenCalledWith(draft);
        expect(marks).toHaveLength(1);
    });
});

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

describe("asset application in the owning creative form", () => {
    const record = { id: assetIds[5], kind: "reference", name: "Style", prompt: "Soft light", imageIds: [assetIds[0]], version: 1, createdAt: "2026-11-06", updatedAt: "2026-11-06" };
    it.each(["reference", "model"])("snapshots %s roles into submitted input and queued prompt without auto-generation", async (kind) => {
        const view = formHarness("creative");
        const consumed = jest.fn();
        view.props.onAssetConsumed = consumed;
        view.props.requestedAsset = { asset: { ...record, kind, imageIds: [...record.imageIds] }, requestId: 1 };
        view.render(); view.render();
        expect(consumed).toHaveBeenCalledTimes(1);
        expect(consumed).toHaveBeenCalledWith(1, true, undefined);
        expect(view.onSubmit).not.toHaveBeenCalled();
        await view.submit();
        const input = view.onSubmit.mock.calls[0][0];
        expect(input.assetIds).toEqual(record.imageIds);
        expect(input.instructions).toContain(kind === "model" ? "person" : "style");
        const prompt = toolWorkflowPrompt(input);
        expect(prompt).toContain(kind === "model" ? "person" : "style");
        view.props.requestedAsset.asset.prompt = "Changed later";
        view.props.requestedAsset.asset.imageIds.length = 0;
        expect(toolWorkflowPrompt(input)).toBe(prompt);
    });
    it("cancels dirty replacement without changing images, instructions, model, count or ratio", () => {
        const view = formHarness("creative"); view.filled();
        view.role("参考图片（可选）").onChange([images[1]]);
        const before = view.render().filter((node) => node.type === "input" || node.type === "textarea" || node.type === "select").map((node) => node.props.value);
        const confirm = jest.fn(() => false), consumed = jest.fn();
        view.props.confirmReplacement = confirm; view.props.onAssetConsumed = consumed;
        view.props.requestedAsset = { asset: record, requestId: 2 };
        view.render(); view.render();
        expect(confirm).toHaveBeenCalledTimes(1); expect(consumed).toHaveBeenCalledWith(2, false, undefined);
        expect(view.role("参考图片（可选）").images.map((image: any) => image.id)).toEqual([images[1]!.id]);
        expect(view.render().filter((node) => node.type === "input" || node.type === "textarea" || node.type === "select").map((node) => node.props.value)).toEqual(before);
    });
    it.each(["locked", "missing", "five", "model", "budget"])("consumes %s failures without replacing the draft", (failure) => {
        const view = formHarness("creative"); view.filled();
        const consumed = jest.fn(); view.props.onAssetConsumed = consumed;
        const candidate = { ...record, imageIds: [...record.imageIds] };
        if (failure === "locked") view.props.locked = true;
        if (failure === "missing") candidate.imageIds = ["33333333-3333-4333-8333-333333333333"];
        if (failure === "five") candidate.imageIds = assetIds.slice(0, 5);
        if (failure === "model") view.capabilities.models[0]!.capabilities = ["text-to-image"];
        if (failure === "budget") candidate.prompt = "x".repeat(1500);
        view.props.requestedAsset = { asset: candidate, requestId: 3 }; view.render(); view.render();
        expect(consumed).toHaveBeenCalledTimes(1); expect(consumed.mock.calls[0][1]).toBe(false);
        expect(consumed.mock.calls[0][2]).toBeTruthy(); expect(view.field("instructions").props.value).toBe("User prompt");
        expect(view.onSubmit).not.toHaveBeenCalled();
    });
});

function imageEditHarness(tool: "watermark" | "translate" | "retouch" | "recolor" | "expand" | "redraw" | "cutout", options: { ready?: boolean; locked?: boolean; unavailable?: boolean } = {}) {
    const onSubmit = jest.fn().mockResolvedValue(undefined), upload = jest.fn();
    const products = { data: [...images], isSuccess: true, isPending: false, isFetching: false, isError: false };
    const uploadState = { isPending: false, mutateAsync: async (file: File) => {
        uploadState.isPending = true;
        try { const image = await upload(file); products.data = [...products.data.filter((item) => item.id !== image.id), image]; return image; }
        finally { uploadState.isPending = false; }
    } };
    const billing = jest.fn().mockReturnValue({ ready: options.ready ?? true, costText: "实际报价 2 积分" });
    const selectedModelId = tool === "cutout" ? LOCAL_CUTOUT_MODEL_ID : modelId;
    const capabilities = { tools: [{ key: tool, status: options.unavailable ? "unavailable" : "available", modelIdsByCapability: { "reference-image": [selectedModelId], segmentation: [selectedModelId] } }],
        models: [{ id: selectedModelId, name: tool === "cutout" ? "腾讯云智能抠图" : "Seedream", capabilities: tool === "cutout" ? ["segmentation"] : ["reference-image"], maxReferenceImages: 5 }] } as GenerationCapabilities;
    const view = renderHarness("image-edit-form", "default", { tool, capabilities, locked: options.locked ?? false, onSubmit }, {
        useGenerationBilling: billing, useProductImagesQuery: () => products, useUploadProductImageMutation: () => uploadState,
    });
    const field = (suffix: string) => view.render().find((node) => node.props.id === `test-${suffix}`)!;
    const picker = () => view.render().find((node) => node.type === "AssetRolePicker")!.props;
    const button = (text: string) => view.render().find((node) => node.type === "button" && elementText(node).includes(text))!;
    const submitButton = () => view.render().find((node) => node.props.type === "submit")!;
    const submit = () => view.render().find((node) => node.type === "form")!.props.onSubmit({ preventDefault: jest.fn() });
    const selectRegion = () => {
        button("框选").props.onClick();
        const editor = view.render().find((node) => node.type === "SkuRegionEditor")!;
        editor.props.onChange({ x: .1, y: .2, width: .3, height: .4 }); editor.props.onClose();
    };
    const fill = () => { picker().onChange([images[0]]); if (tool === "watermark") { selectRegion(); field("rights").props.onChange({ target: { checked: true } }); } };
    return { ...view, field, picker, button, submitButton, submit, selectRegion, fill, onSubmit, upload, billing, products, capabilities };
}

describe("dedicated image editing", () => {
    it("submits preset and custom product colors only after the original is ready", async () => {
        const view = imageEditHarness("recolor"); view.props.annotationTarget = {}; view.props.onEditSource = jest.fn(); view.fill();
        const preview = () => view.render().find((node) => node.type === view.exports.RecolorPreview)!.props;
        expect(view.portals.some((node) => node.type === view.exports.RecolorPreview)).toBe(true);
        expect(view.picker().appearance).toBe("links"); expect(view.picker().allowReplacement).toBe(true);
        expect(view.render().filter((node) => node.props.type === "radio")).toHaveLength(5);
        expect(view.field("instructions")).toBeUndefined(); expect(view.submitButton().props.disabled).toBe(true);
        await view.submit(); expect(view.onSubmit).not.toHaveBeenCalled();
        preview().onReady(true);
        view.render().find((node) => node.props["aria-label"] === "商品颜色：蓝色")!.props.onChange();
        await view.submit(); expect(view.onSubmit).toHaveBeenLastCalledWith({ tool: "recolor", modelId, assetIds: [images[0].id], instructions: "", count: 1, ratio: "4:3", design: { productColor: "#287be5" } });
        view.field("custom-product-color").props.onChange({ target: { value: "#ABC123" } }); await view.submit();
        expect(view.onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ design: { productColor: "#abc123" } }));
        expect(view.render().filter((node) => node.props.type === "radio").some((node) => node.props.checked)).toBe(false);
        expect(view.props.onEditSource).toHaveBeenCalled();
        const oldColor = view.field("custom-product-color"); view.props.locked = true; view.render();
        oldColor.props.onChange({ target: { value: "#ff0000" } }); await view.submit();
        expect(view.field("custom-product-color").props.value).toBe("#abc123"); expect(view.onSubmit).toHaveBeenCalledTimes(2);
    });
    it.each(["#287be5", "#ABC123"])("restores recolor source and color %s only once and preserves choices on failed replacement", async (productColor) => {
        const view = imageEditHarness("recolor"); view.props.annotationTarget = {};
        view.props.taskSnapshot = { id: "saved-recolor", toolKey: "recolor", toolInput: { tool: "recolor", modelId, assetIds: [images[1].id], ratio: "4:3", design: { productColor } } };
        view.render(); view.render(); expect(view.picker().images[0].id).toBe(images[1].id); expect(view.field("ratio").props.value).toBe("4:3");
        view.field("custom-product-color").props.onChange({ target: { value: "#112233" } });
        view.products.data = [...view.products.data]; view.render(); expect(view.field("custom-product-color").props.value).toBe("#112233");
        view.upload.mockRejectedValueOnce(new Error("replacement failed")); await view.picker().onFiles([{ type: "image/png", size: 100 }], true);
        expect(view.picker().images[0].id).toBe(images[1].id); expect(view.field("custom-product-color").props.value).toBe("#112233");
        view.props.taskSnapshot = { ...view.props.taskSnapshot, id: "deleted-recolor", toolInput: { ...view.props.taskSnapshot.toolInput, assetIds: ["deleted"] } };
        view.render(); expect(view.picker().images).toEqual([]); expect(view.submitButton().props.disabled).toBe(true);
    });
    it("loads protected recolor originals, ignores stale image events and retries decoding failures", () => {
        const release = jest.fn(), load = jest.fn().mockReturnValue(release), onReady = jest.fn();
        const view = renderHarness("image-edit-form", "RecolorPreview", { image: images[0], onReady }, { loadProductImage: load });
        view.render(); expect(load).toHaveBeenCalledWith(images[0].id, expect.any(Function), expect.any(Function));
        load.mock.calls[0][1]("blob:original"); const oldImage = view.render().find((node) => node.type === "img")!;
        expect(onReady).toHaveBeenLastCalledWith(false); oldImage.props.onLoad(); expect(onReady).toHaveBeenLastCalledWith(true);
        expect(view.render().map(elementText).join(" ")).toContain("原图");
        view.props.image = images[1]; view.render(); load.mock.calls[0][1]("blob:stale"); oldImage.props.onLoad();
        expect(onReady).toHaveBeenLastCalledWith(false); expect(view.render().some((node) => node.type === "img")).toBe(false);
        load.mock.calls[1][1]("blob:next"); view.render().find((node) => node.type === "img")!.props.onError();
        view.render().find((node) => node.type === "button")!.props.onClick(); view.render(); expect(load).toHaveBeenCalledTimes(3);
        view.unmount(); expect(release).toHaveBeenCalledTimes(3);
        load.mock.calls[2][1]("blob:late"); expect(onReady).toHaveBeenLastCalledWith(false);
    });
    it.each([null, "#287be5", "#ABC123"])("restores saved cutout background %s and source only once per task", (color) => {
        const view = imageEditHarness("cutout");
        view.props.taskSnapshot = { id: "saved-cutout", toolKey: "cutout", toolInput: { tool: "cutout", modelId: LOCAL_CUTOUT_MODEL_ID, assetIds: [images[1]!.id], ratio: "4:3", design: { backgroundColor: color } } };
        view.products.isFetching = true; view.render(); expect(view.picker().images).toEqual([]);
        view.products.isFetching = false; view.render(); view.render();
        expect(view.picker().images[0].id).toBe(images[1]!.id);
        const radios = () => view.render().filter((node) => node.props.type === "radio");
        if (color === "#ABC123") {
            expect(radios().some((node) => node.props.checked)).toBe(false);
            expect(view.field("custom-color").props.value).toBe("#abc123");
            expect(view.render().find((node) => node.props.className === "cutout-custom-color")!.props["data-selected"]).toBe(true);
        } else expect(radios().find((node) => node.props.checked)!.props.value).toBe(color ?? "transparent");
        view.field("custom-color").props.onChange({ target: { value: "#123456" } });
        view.props.taskSnapshot = { ...view.props.taskSnapshot }; view.products.data = [...view.products.data]; view.render();
        expect(view.field("custom-color").props.value).toBe("#123456");
        expect(view.onSubmit).not.toHaveBeenCalled();
        view.picker().onChange([images[0]]); expect(radios().find((node) => node.props.checked)!.props.value).toBe("transparent");
    });
    it("retains historical color when the original source is unavailable without enabling submission", () => {
        const view = imageEditHarness("cutout");
        view.props.taskSnapshot = { id: "missing-source", toolKey: "cutout", toolInput: { tool: "cutout", modelId: LOCAL_CUTOUT_MODEL_ID, assetIds: ["deleted"], ratio: "1:1", design: { backgroundColor: "#287be5" } } };
        view.render(); view.render();
        expect(view.picker().images).toEqual([]);
        expect(view.render().find((node) => node.props.type === "radio" && node.props.checked)!.props.value).toBe("#287be5");
        expect(view.submitButton().props.disabled).toBe(true);
        expect(view.render().map(elementText).join(" ")).toContain("原任务素材已删除或不可用");
    });
    it("requires redraw source readiness, regions and explicit edits and submits their exact metadata", async () => {
        const view = imageEditHarness("redraw"); view.props.annotationTarget = {};
        view.picker().onChange([images[0]]);
        expect(view.render().find((node) => node.type === "footer")!.props.className).toContain("redraw-action-bar");
        expect(view.render().find((node) => node.type === "footer")!.props.className).not.toContain("regional-action-bar");
        expect(view.portals.some((node) => node.type === "footer")).toBe(false);
        expect(view.portals.some((node) => node.type === "WatermarkCanvas")).toBe(true);
        expect(view.picker().appearance).toBe("links"); expect(view.picker().allowReplacement).toBe(true);
        const canvas = () => view.render().find((node) => node.type === "WatermarkCanvas")!.props;
        const regions = [{ id: "redraw-1", region: { x: .1, y: .2, width: .3, height: .4 } }];
        canvas().onChange(regions); canvas().onReady(true);
        expect(view.submitButton().props.disabled).toBe(true);
        view.field("instructions-redraw-1").props.onChange({ target: { value: "Change to black" } }); await view.submit();
        expect(view.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tool: "redraw", modelId, count: 1, instructions: "", design: { redrawRegions: [regions[0]!.region], redrawEdits: [{ instruction: "Change to black" }] } }));
        expect(view.submitButton().props.form).toBe("test-image-edit");
        view.picker().onChange([images[1]]); expect(canvas().history.marks).toEqual([]); expect(view.field("instructions")).toBeUndefined();
        expect(view.submitButton().props.disabled).toBe(true);
    });
    it("keeps independent redraw descriptions and shared references aligned through deletion and undo", async () => {
        const view = imageEditHarness("redraw"); view.props.annotationTarget = {}; view.picker().onChange([images[0]]);
        const canvas = () => view.render().find((node) => node.type === "WatermarkCanvas")!.props;
        const role = (index: number) => view.render().find((node) => node.type === "AssetRolePicker" && node.props.label === `标注${index}参考图`)!.props;
        canvas().onChange([1, 2].map((index) => ({ id: `mark-${index}`, region: { x: index * .2, y: .2, width: .1, height: .3 } }))); canvas().onReady(true);
        view.field("instructions-mark-1").props.onChange({ target: { value: "Red handle" } });
        view.field("instructions-mark-2").props.onChange({ target: { value: "Blue pocket" } });
        role(1).onChange([images[1]]); role(2).onChange([images[1]]);
        await view.submit();
        expect(view.onSubmit.mock.calls[0][0].assetIds).toEqual([images[0]!.id, images[1]!.id]);
        expect(view.onSubmit.mock.calls[0][0].design.redrawEdits).toEqual([
            { instruction: "Red handle", referenceAssetId: images[1]!.id }, { instruction: "Blue pocket", referenceAssetId: images[1]!.id },
        ]);
        canvas().onChange([canvas().history.marks[1]]); await view.submit();
        expect(view.onSubmit.mock.calls[1][0].design.redrawEdits).toEqual([{ instruction: "Blue pocket", referenceAssetId: images[1]!.id }]);
        canvas().onHistory("undo"); expect(view.field("instructions-mark-1").props.value).toBe("Red handle");
        expect(role(1).images[0].id).toBe(images[1]!.id);
        expect(view.render().filter((node) => node.type === "textarea")).toHaveLength(2);
        expect(canvas().onInstructionChange).toBeUndefined();
        view.capabilities.models[0]!.maxReferenceImages = 1; expect(view.submitButton().props.disabled).toBe(true);
    });
    it("preserves redraw metadata on failed reference upload and rejects stale locked callbacks", async () => {
        const view = imageEditHarness("redraw"); view.props.annotationTarget = {}; view.picker().onChange([images[0]]);
        const canvas = () => view.render().find((node) => node.type === "WatermarkCanvas")!.props;
        canvas().onChange([{ id: "mark-1", region: { x: .2, y: .2, width: .2, height: .3 } }]); canvas().onReady(true);
        const role = () => view.render().find((node) => node.type === "AssetRolePicker" && node.props.label === "标注1参考图")!.props;
        view.field("instructions-mark-1").props.onChange({ target: { value: "Keep the text" } }); role().onChange([images[1]]);
        view.upload.mockRejectedValueOnce(new Error("reference upload failed")); await role().onFiles([{ type: "image/png", size: 100 }]);
        expect(view.field("instructions-mark-1").props.value).toBe("Keep the text"); expect(role().images[0].id).toBe(images[1]!.id);
        const oldField = view.field("instructions-mark-1"), oldRole = role(); view.props.locked = true; view.render();
        oldField.props.onChange({ target: { value: "stale" } }); oldRole.onChange([]); await oldRole.onFiles([{ type: "image/png", size: 100 }]);
        expect(view.field("instructions-mark-1").props.value).toBe("Keep the text"); expect(role().images[0].id).toBe(images[1]!.id); expect(view.upload).toHaveBeenCalledTimes(1);
    });
    it("submits transparent or validated custom cutout without quality/ratio or text editing controls", async () => {
        const view = imageEditHarness("cutout"); view.props.annotationTarget = {}; view.fill();
        expect(view.render().find((node) => node.type === "footer")!.props.className).toContain("cutout-action-bar");
        expect(view.render().find((node) => node.type === "footer")!.props.className).not.toContain("regional-action-bar");
        expect(view.portals.some((node) => node.type === "footer")).toBe(false);
        expect(view.portals.some((node) => node.type === "WatermarkCanvas")).toBe(true);
        expect(imageEditHarness("redraw").render().find((node) => node.type === "footer")!.props.className).not.toContain("cutout-action-bar");
        const canvas = () => view.render().find((node) => node.type === "WatermarkCanvas")!.props;
        expect(canvas().readOnly).toBe(true); expect(view.submitButton().props.disabled).toBe(true); canvas().onReady(true);
        expect(view.render().filter((node) => node.props.type === "radio")).toHaveLength(6);
        expect(view.render().some((node) => node.props.id === "test-ratio" || node.props.id === "test-instructions")).toBe(false);
        await view.submit(); expect(view.onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ tool: "cutout", modelId: LOCAL_CUTOUT_MODEL_ID, instructions: "", count: 1, design: { backgroundColor: null } }));
        view.field("custom-color").props.onChange({ target: { value: "#112233" } }); await view.submit();
        expect(view.onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ design: { backgroundColor: "#112233" } }));
        const oldColor = view.field("custom-color"); view.props.locked = true; view.render(); oldColor.props.onChange({ target: { value: "#ff0000" } });
        expect(view.field("custom-color").props.value).toBe("#112233"); expect(view.submitButton().props.disabled).toBe(true);
    });
    it("loads protected expansion originals, waits for decoding and ignores stale reads and DOM events", () => {
        const release = jest.fn(), load = jest.fn().mockReturnValue(release), onReady = jest.fn();
        const view = renderHarness("image-edit-form", "ExpansionPreview", { image: images[0], ratio: "1:1", scale: 80, position: "center", onReady }, { loadProductImage: load });
        view.render(); expect(load).toHaveBeenCalledWith(images[0].id, expect.any(Function), expect.any(Function));
        load.mock.calls[0][1]("blob:protected");
        const oldImage = view.render().find((node) => node.type === "img")!;
        expect(onReady).toHaveBeenLastCalledWith(false); oldImage.props.onLoad(); expect(onReady).toHaveBeenLastCalledWith(true);
        const placement = view.render().find((node) => node.props.className === "expansion-preview-image")!;
        expect(parseFloat(placement.props.style.width)).toBeCloseTo(80); expect(parseFloat(placement.props.style.height)).toBeCloseTo(60);
        view.props.position = "bottom-right"; view.props.scale = 50; view.render(); expect(load).toHaveBeenCalledTimes(1);
        view.props.image = images[1]; view.render(); expect(release).toHaveBeenCalledTimes(1);
        load.mock.calls[0][1]("blob:stale"); oldImage.props.onLoad(); expect(onReady).toHaveBeenLastCalledWith(false);
        expect(view.render().some((node) => node.type === "img")).toBe(false);
        view.unmount(); expect(release).toHaveBeenCalledTimes(2);
        load.mock.calls[1][1]("blob:after-unmount"); expect(onReady).toHaveBeenLastCalledWith(false);
    });
    it("handles expansion decoding errors with protected retry and labels empty examples honestly", () => {
        const release = jest.fn(), load = jest.fn().mockReturnValue(release), onReady = jest.fn();
        const view = renderHarness("image-edit-form", "ExpansionPreview", { image: images[0], ratio: "4:3", scale: 80, position: "center", onReady }, { loadProductImage: load });
        view.render(); load.mock.calls[0][1]("blob:protected");
        view.render().find((node) => node.type === "img")!.props.onError(); expect(onReady).toHaveBeenLastCalledWith(false);
        view.render().find((node) => node.props["aria-label"] === "重新加载扩图原图")!.props.onClick(); view.render();
        expect(load).toHaveBeenCalledTimes(2); expect(release).toHaveBeenCalledTimes(1);
        load.mock.calls[1][1]("blob:retry"); view.render().find((node) => node.type === "img")!.props.onLoad(); expect(onReady).toHaveBeenLastCalledWith(true);
        view.props.image = undefined; expect(view.render().map(elementText).join(" ")).toContain("素材示例");
        expect(view.render().find((node) => node.type === "img")!.props.src).toBe("/extension/image-studio/images/mug-scene.jpg");
    });
    function expansionView(options: { ready?: boolean; locked?: boolean; unavailable?: boolean } = {}) {
        const view = imageEditHarness("expand", options), onEditSource = jest.fn();
        view.props.annotationTarget = {}; view.props.onEditSource = onEditSource;
        const preview = () => view.render().find((node) => node.type?.name === "ExpansionPreview")!.props;
        const radio = (label: string) => view.render().find((node) => node.props["aria-label"] === label)!;
        return { ...view, preview, radio, onEditSource };
    }
    it("submits default expansion layout only after protected source readiness and uses actual billing", async () => {
        const view = expansionView(); view.fill();
        expect(view.picker().dropzone).toBe(true); expect(view.picker().max).toBe(1);
        expect(view.submitButton().props.disabled).toBe(true); view.preview().onReady(true);
        expect(view.radio("原图占比 80%").props.checked).toBe(true);
        expect(view.radio("原图位置：居中").props.checked).toBe(true);
        expect(view.render().filter((node) => node.props.type === "radio")).toHaveLength(13);
        await view.submit();
        expect(view.onSubmit).toHaveBeenCalledWith({ tool: "expand", modelId, assetIds: [assetIds[0]], instructions: "", count: 1, ratio: "4:3", expansion: "surround", design: { expandScale: 80, expandPosition: "center" } });
        expect(view.billing).toHaveBeenLastCalledWith(modelId, 1, true);
        expect(elementText(view.submitButton())).toContain("立即扩图实际报价 2 积分");
    });
    it.each(workflow.EXPAND_POSITIONS)("places the complete uncropped source at $id", (position) => {
        const region = specialized.expansionRegion(400, 300, "1:1", 80, position.id)!;
        const index = workflow.EXPAND_POSITIONS.indexOf(position);
        expect(region.width).toBeCloseTo(.8); expect(region.height).toBeCloseTo(.6);
        expect(region.x).toBeCloseTo(.2 * (index % 3) / 2); expect(region.y).toBeCloseTo(.4 * Math.floor(index / 3) / 2);
        expect(region.x + region.width).toBeLessThanOrEqual(1); expect(region.y + region.height).toBeLessThanOrEqual(1);
        for (const ratio of workflow.TOOL_RATIOS) for (const scale of [1, 50, 60, 80, 100]) {
            const fitted = specialized.expansionRegion(300, 400, ratio, scale, position.id)!;
            const [width, height] = ratio.split(":").map(Number);
            expect(fitted.width * width / (fitted.height * height)).toBeCloseTo(300 / 400);
            expect(fitted.x).toBeGreaterThanOrEqual(0); expect(fitted.y).toBeGreaterThanOrEqual(0);
            expect(fitted.x + fitted.width).toBeLessThanOrEqual(1); expect(fitted.y + fitted.height).toBeLessThanOrEqual(1);
        }
    });
    it("passes custom scale, anchor, ratio and instructions into the real expansion prompt", async () => {
        const view = expansionView(); view.fill(); view.preview().onReady(true);
        view.field("expand-scale").props.onChange({ target: { value: "37" } });
        view.radio("原图位置：右下").props.onChange();
        view.field("ratio").props.onChange({ target: { value: "16:9" } });
        view.field("instructions").props.onChange({ target: { value: "Continue the kitchen countertop" } });
        expect(view.preview()).toEqual(expect.objectContaining({ scale: 37, position: "bottom-right", ratio: "16:9" }));
        await view.submit(); const request = view.onSubmit.mock.calls[0][0];
        expect(validateToolWorkflow(request)).toBeNull(); expect(toolWorkflowPrompt(request)).toContain("37%");
        expect(toolWorkflowPrompt(request)).toContain("bottom-right"); expect(toolWorkflowPrompt(request)).toContain("Continue the kitchen countertop");
        expect(view.onEditSource).toHaveBeenCalled();
    });
    it.each(["", "0", "-1", "100", "101", "1.5", "Infinity"])("rejects invalid custom expansion scale %p without making a task", async (value) => {
        const view = expansionView(); view.fill(); view.preview().onReady(true);
        view.field("expand-scale").props.onChange({ target: { value } });
        expect(view.submitButton().props.disabled).toBe(true); await view.submit(); expect(view.onSubmit).not.toHaveBeenCalled();
        view.radio("原图占比 100%").props.onChange(); expect(view.submitButton().props.disabled).toBe(false);
    });
    it.each([{ ready: false }, { locked: true }, { unavailable: true }])("gates expansion without hiding controls %p", async (options) => {
        const view = expansionView(options); view.fill(); view.preview().onReady(true);
        expect(view.render().filter((node) => node.props.type === "radio")).toHaveLength(13);
        expect(view.submitButton().props.disabled).toBe(true); await view.submit(); expect(view.onSubmit).not.toHaveBeenCalled();
    });
    it("preserves expansion layout after failed upload and resets it only on successful replacement", async () => {
        const view = expansionView(); view.fill(); view.preview().onReady(true);
        view.radio("原图占比 50%").props.onChange(); view.radio("原图位置：左上").props.onChange();
        const replace = () => view.render().find((node) => node.props["aria-label"] === "重新上传扩图原图")!.props.onChange({ target: { files: [{ type: "image/png", size: 10 }], value: "selected" } });
        view.upload.mockRejectedValueOnce(new Error("Upload failed")); replace(); await new Promise((resolve) => setImmediate(resolve));
        expect(view.picker().images).toEqual([images[0]]); expect(view.preview()).toEqual(expect.objectContaining({ scale: 50, position: "top-left" }));
        view.upload.mockResolvedValueOnce(images[1]); replace(); await new Promise((resolve) => setImmediate(resolve));
        expect(view.picker().images).toEqual([images[1]]); expect(view.preview()).toEqual(expect.objectContaining({ scale: 80, position: "center" }));
        expect(view.submitButton().props.disabled).toBe(true);
    });
    it("rejects a second source and ignores stale expansion callbacks after locking", () => {
        const view = expansionView(); view.fill(); view.preview().onReady(true);
        view.picker().onChange([images[0], images[1]]); expect(view.picker().images).toEqual([images[0]]);
        const oldScale = view.field("expand-scale"), oldPosition = view.radio("原图位置：左上");
        view.props.locked = true; view.render(); oldScale.props.onChange({ target: { value: "37" } }); oldPosition.props.onChange();
        expect(view.preview()).toEqual(expect.objectContaining({ scale: 80, position: "center" }));
        expect(view.onSubmit).not.toHaveBeenCalled();
    });
    function watermarkView() {
        const view = imageEditHarness("watermark"), onEditSource = jest.fn();
        view.props.annotationTarget = {}; view.props.onEditSource = onEditSource;
        view.picker().onChange([images[0]]);
        const editor = () => view.render().find((node) => node.type === "WatermarkCanvas")!.props;
        const mark = { id: "mark-1", region: { x: .1, y: .2, width: .3, height: .4 } };
        const fill = () => { editor().onChange([mark]); editor().onReady(true); view.field("rights").props.onChange({ target: { checked: true } }); };
        return { ...view, editor, mark, fill, onEditSource };
    }
    it("submits canvas marks with actual billing and requires image readiness and authorization", async () => {
        const view = watermarkView(); view.editor().onChange([view.mark]);
        view.field("rights").props.onChange({ target: { checked: true } });
        expect(view.submitButton().props.disabled).toBe(true);
        view.editor().onReady(true); expect(view.submitButton().props.disabled).toBe(false);
        await view.submit();
        expect(view.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tool: "watermark", count: 1, authorized: true, design: { watermarkRegions: [view.mark.region] } }));
        expect(view.billing).toHaveBeenLastCalledWith(modelId, 1, true);
        expect(view.render().some((node) => node.type === "SkuRegionEditor")).toBe(false);
    });
    it("records clear/undo/redo without model calls and resets history and rights on source change", () => {
        const view = watermarkView(); view.fill(); view.editor().onChange([]);
        view.editor().onHistory("undo"); expect(view.editor().history.marks).toEqual([view.mark]);
        view.editor().onHistory("redo"); expect(view.editor().history.marks).toEqual([]);
        view.editor().onHistory("undo"); view.picker().onChange([images[1]]);
        expect(view.editor().history).toEqual({ marks: [], past: [], future: [] });
        expect(view.field("rights").props.checked).toBe(false); expect(view.submitButton().props.disabled).toBe(true);
        expect(view.onEditSource).toHaveBeenCalled(); expect(view.onSubmit).not.toHaveBeenCalled();
    });
    it("retains original marks after a failed replacement upload and resets only after success", async () => {
        const view = watermarkView(); view.fill(); view.upload.mockRejectedValueOnce(new Error("Upload failed"));
        const replace = () => view.render().find((node) => node.props["aria-label"] === "重新上传水印原图")!.props.onChange({ target: { files: [{ type: "image/png", size: 10 }], value: "selected" } });
        replace(); await new Promise((resolve) => setImmediate(resolve));
        expect(view.picker().images).toEqual([images[0]]); expect(view.editor().history.marks).toEqual([view.mark]);
        expect(view.field("rights").props.checked).toBe(true);
        view.upload.mockResolvedValueOnce(images[1]); replace(); await new Promise((resolve) => setImmediate(resolve));
        expect(view.picker().images).toEqual([images[1]]); expect(view.editor().history.marks).toEqual([]);
        expect(view.field("rights").props.checked).toBe(false);
    });
    it("ignores stale canvas callbacks after the parent locks", () => {
        const view = watermarkView(); view.fill(); const oldEditor = view.editor();
        view.props.locked = true; view.render(); oldEditor.onChange([]); oldEditor.onHistory("undo");
        expect(view.editor().history.marks).toEqual([view.mark]); expect(view.submitButton().props.disabled).toBe(true);
    });
    it("offers all six retouch radio modes and passes the selection to the actual workflow prompt", async () => {
        const view = imageEditHarness("retouch");
        expect(view.picker().dropzone).toBe(true); expect(view.picker().max).toBe(1);
        const radios = () => view.render().filter((node) => node.type === "input" && node.props.type === "radio");
        expect(radios().map((node) => node.props["aria-label"])).toEqual(workflow.RETOUCH_MODES.map((mode) => mode.label));
        expect(radios().find((node) => node.props.checked)!.props.value).toBe("overall");
        view.fill(); radios().find((node) => node.props.value === "color")!.props.onChange();
        view.field("instructions").props.onChange({ target: { value: "Remove incidental dust" } });
        await view.submit(); const input = view.onSubmit.mock.calls[0][0];
        expect(input).toEqual({ tool: "retouch", modelId, assetIds: [assetIds[0]], instructions: "Remove incidental dust", count: 1, ratio: "4:3", design: { retouchMode: "color" } });
        expect(validateToolWorkflow(input)).toBeNull(); expect(toolWorkflowPrompt(input)).toContain("Correct white balance");
        expect(view.render().some((node) => node.props.id === "test-product")).toBe(false);
        expect(view.render().find((node) => node.type === "Popover")!.props.modal).toBe(false);
    });
    it.each([{ ready: false }, { locked: true }, { unavailable: true }])("gates retouch generation %p without hiding controls", async (options) => {
        const view = imageEditHarness("retouch", options); view.fill();
        expect(view.render().filter((node) => node.props.type === "radio")).toHaveLength(6);
        expect(view.submitButton().props.disabled).toBe(true); await view.submit(); expect(view.onSubmit).not.toHaveBeenCalled();
    });
    it("requires a watermark region and affirmative authorization, preserving error and retry inputs", async () => {
        const view = imageEditHarness("watermark"); view.picker().onChange([images[0]]);
        expect(view.submitButton().props.disabled).toBe(true);
        view.field("rights").props.onChange({ target: { checked: true } });
        expect(view.submitButton().props.disabled).toBe(true);
        view.selectRegion(); expect(view.submitButton().props.disabled).toBe(false);
        view.onSubmit.mockRejectedValueOnce(new Error("模型能力已变更，请刷新"));
        await expect(view.submit()).resolves.toBeUndefined();
        const input = view.onSubmit.mock.calls[0][0];
        expect(input).toEqual(expect.objectContaining({ tool: "watermark", modelId, assetIds: [assetIds[0]], count: 1, ratio: "4:3", authorized: true, design: { watermarkRegion: { x: .1, y: .2, width: .3, height: .4 } } }));
        expect(validateToolWorkflow(input)).toBeNull(); expect(toolWorkflowPrompt(input)).toContain(JSON.stringify(input.design.watermarkRegion));
        expect(view.render().some((node) => node.props.role === "alert" && elementText(node) === "模型能力已变更，请刷新")).toBe(true);
        expect(view.picker().previewRegion).toEqual(input.design.watermarkRegion);
        expect(view.submitButton().props.disabled).toBe(false);
    });
    it("sends the chosen translation language and subject protection into the existing prompt", async () => {
        const view = imageEditHarness("translate"); view.fill();
        expect(view.field("protect").props.checked).toBe(true);
        view.field("language").props.onChange({ target: { value: "日本語" } });
        view.field("protect").props.onChange({ target: { checked: false } });
        view.field("instructions").props.onChange({ target: { value: "Keep brand identifiers" } });
        view.field("ratio").props.onChange({ target: { value: "3:4" } });
        await view.submit();
        const input = view.onSubmit.mock.calls[0][0];
        expect(input).toEqual({ tool: "translate", modelId, assetIds: [assetIds[0]], count: 1, ratio: "3:4", instructions: "Keep brand identifiers", targetLanguage: "日本語", design: { protectSubject: false } });
        expect(validateToolWorkflow(input)).toBeNull(); expect(toolWorkflowPrompt(input)).toContain("on the product or packaging");
        expect(view.billing).toHaveBeenLastCalledWith(modelId, 1, true);
    });
    it("clears region and ownership approval when replacing images and can clear/reselect the region", () => {
        const view = imageEditHarness("watermark"); view.fill();
        view.render().find((node) => node.props["aria-label"] === "清除水印区域")!.props.onClick();
        expect(view.picker().previewRegion).toBeUndefined(); expect(view.submitButton().props.disabled).toBe(true);
        view.selectRegion(); expect(view.submitButton().props.disabled).toBe(false);
        view.picker().onChange([images[1]]);
        expect(view.picker().previewRegion).toBeUndefined(); expect(view.field("rights").props.checked).toBe(false);
        expect(view.submitButton().props.disabled).toBe(true);
    });
    it.each([{ ready: false }, { locked: true }, { unavailable: true }])("enforces billing, parent and capability gates %p", async (options) => {
        const view = imageEditHarness("translate", options); view.fill();
        expect(view.submitButton().props.disabled).toBe(true); await view.submit(); expect(view.onSubmit).not.toHaveBeenCalled();
    });
    it("uses controlled non-modal advanced settings anchored above its trigger", () => {
        const view = imageEditHarness("translate");
        const popover = () => view.render().find((node) => node.type === "Popover")!;
        expect(popover().props.modal).toBe(false); expect(popover().props.open).toBe(false);
        popover().props.onOpenChange(true); expect(popover().props.open).toBe(true);
        const content = view.render().find((node) => node.type === "PopoverContent")!;
        expect(content.props).toEqual(expect.objectContaining({ side: "top", align: "start", collisionPadding: 12 }));
        view.field("ratio").props.onChange({ target: { value: "16:9" } }); popover().props.onOpenChange(false);
        expect(view.field("ratio").props.value).toBe("16:9");
        expect(view.onSubmit).not.toHaveBeenCalled(); expect(view.render().some((node) => node.type === "dialog")).toBe(false);
    });
    it("prevents duplicate submissions while keeping the selected image", async () => {
        const view = imageEditHarness("translate"); view.fill(); let finish!: () => void;
        view.onSubmit.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
        const first = view.submit(); await view.submit(); expect(view.onSubmit).toHaveBeenCalledTimes(1);
        expect(view.picker().disabled).toBe(true); view.picker().onChange([]); expect(view.picker().images).toEqual([images[0]]);
        finish(); await first; expect(view.submitButton().props.disabled).toBe(false);
    });
    it("rejects oversized, unsupported and multi-file transfers without uploading", async () => {
        const view = imageEditHarness("translate");
        for (const files of [[{ type: "image/svg+xml", size: 10 }], [{ type: "image/png", size: 11 * 1024 * 1024 }], [{ type: "image/png", size: 10 }, { type: "image/png", size: 10 }]]) await view.picker().onFiles(files);
        expect(view.upload).not.toHaveBeenCalled(); expect(view.picker().images).toHaveLength(0);
    });
    it("selects uploaded images only if the model and parent state are still current", async () => {
        const view = imageEditHarness("translate"); let finish!: (image: typeof images[number]) => void;
        view.upload.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
        const pending = view.picker().onFiles([{ type: "image/png", size: 10 }]);
        view.props.locked = true; view.render(); finish(images[0]); await pending;
        expect(view.picker().images).toHaveLength(0); expect(view.upload).toHaveBeenCalledTimes(1);
        view.props.locked = false; view.upload.mockResolvedValueOnce(images[1]); await view.picker().onFiles([{ type: "image/png", size: 10 }]);
        expect(view.picker().images).toEqual([images[1]]); expect(view.picker().original).toBe(true);
    });
    it("keeps selections during material refresh failures and clears deleted images after a successful refresh", () => {
        const view = imageEditHarness("watermark"); view.fill();
        Object.assign(view.products, { data: [], isSuccess: false, isError: true }); view.render();
        expect(view.picker().images).toEqual([images[0]]);
        Object.assign(view.products, { isSuccess: true, isError: false }); view.render(); view.render();
        expect(view.picker().images).toHaveLength(0); expect(view.field("rights").props.checked).toBe(false); expect(view.picker().previewRegion).toBeUndefined();
    });
});

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
    it("reuses true image geometry for watermark previews and configurable region editor titles", () => {
        const region = { x: .1, y: .2, width: .3, height: .4 };
        const picker = renderHarness("specialized-components", "AssetRolePicker", { label: "待编辑图片", images: [images[0]], max: 1, disabled: false, original: true, previewRegion: region, onChange: jest.fn(), onFiles: jest.fn() });
        expect(picker.render().find((node) => typeof node.type === "function" && node.props.image)!.props.original).toBe(true);
        expect(picker.render().find((node) => node.props.className === "specialized-thumbnail")!.props.style.aspectRatio).toBe("400 / 300");
        expect(picker.render().find((node) => node.props.className === "specialized-region-rect")!.props.style).toEqual({ left: "10%", top: "20%", width: "30%", height: "40%" });
        const editor = renderHarness("specialized-components", "SkuRegionEditor", { image: images[0], title: "框选水印区域", disabled: false, onChange: jest.fn(), onClose: jest.fn() });
        expect(editor.render().find((node) => node.type === "MaterialDialog")!.props.title).toBe("框选水印区域");
    });
    it("provides all fifteen visual presets in two real categories with independent image sources", () => {
        const onSelect = jest.fn(); const view = renderHarness("specialized-components", "FusionPresetGallery", { selected: "print", onSelect });
        const nodes = view.render(); const pictures = nodes.filter((node) => node.type === "img");
        expect(pictures).toHaveLength(15); expect(new Set(pictures.map((node) => node.props.src)).size).toBe(15);
        expect(nodes.filter((node) => node.type === "h3").map(elementText)).toEqual(["表面附着", "空间摆放"]);
        expect(nodes.filter((node) => node.props.className === "specialized-preset-description").map(elementText)).toEqual(workflow.FUSION_PRESETS.map((preset) => preset.description));
        expect(nodes.filter((node) => node.type === "button" && node.props["aria-pressed"])).toHaveLength(1);
        view.props.disabled = true;
        expect(view.render().filter((node) => node.type === "button").every((node) => node.props.disabled)).toBe(true);
        nodes.find((node) => node.type === "button" && elementText(node).includes("礼盒组合"))!.props.onClick(); expect(onSelect).toHaveBeenCalledWith("gift");
    });
});