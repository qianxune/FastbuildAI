import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import * as ts from "typescript";
import { TOOL_REGISTRY, type ToolKey } from "../src/api/shared/tools";
import * as workflow from "../src/api/shared/tool-workflow";
import * as specializedWorkflow from "../src/web/pages/specialized-workflow";

type Node = { type: any; props: Record<string, any> };
const modelId = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";

function harness(tool: ToolKey = "expand", options: { ready?: boolean; locked?: boolean; unavailable?: boolean; assetCount?: number; observer?: unknown; legacy?: boolean } = {}) {
    const state: any[] = [];
    const refs: any[] = [];
    const effects: Array<() => unknown> = [];
    let cursor = 0;
    let refCursor = 0;
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const analyze = jest.fn().mockResolvedValue({ suggestions: "Visible evidence only" });
    const upload = jest.fn();
    const load = jest.fn().mockReturnValue(jest.fn());
    const originalLoad = jest.fn();
    const assets = Array.from({ length: options.assetCount ?? 1 }, (_value, index) => ({
        id: index === 0 ? assetId : `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`, width: 100, height: 100,
    }));
    const billing = jest.fn().mockReturnValue({ ready: options.ready ?? true, costText: "2 积分" });
    const exports: any = {};
    const source = readFileSync(path.join(__dirname, "../src/web/pages/tool-form.tsx"), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } });
    expect(compiled.diagnostics ?? []).toHaveLength(0);
    const jsx = (type: unknown, props: Node["props"]) => ({ type, props });
    runInNewContext(compiled.outputText, {
        exports, Error, IntersectionObserver: options.observer,
        require: (name: string) => {
            if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
            if (name === "react") return {
                useState: (initial: unknown) => { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], (value: any) => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; },
                useRef: (initial: unknown) => refs[refCursor++] ?? (refs[refCursor - 1] = { current: initial }),
                useEffect: (effect: () => unknown) => effects.push(effect), useId: () => "test",
            };
            if (name === "../../api/shared/tool-workflow") return workflow;
            if (name === "./specialized-workflow") return specializedWorkflow;
            if (name === "./specialized-tool-form") return { default: (props: Node["props"]) => jsx("specialized-form", props) };
            if (name === "./sku-tool-form") return { default: (props: Node["props"]) => jsx("specialized-form", props) };
            if (name === "./image-edit-form") return { default: (props: Node["props"]) => jsx("image-edit-form", props) };
            if (name === "../../api/shared/tools") return { TOOL_REGISTRY };
            if (name === "../services/generation") return {
                loadProductThumbnail: load, loadProductImage: originalLoad, useGenerationBilling: billing,
                useProductImagesQuery: () => ({ data: assets, isFetching: false, refetch: jest.fn() }),
                useUploadProductImageMutation: () => ({ mutateAsync: upload, isPending: false }),
            };
            if (name === "../services/tool-generation") return { useToolSuggestionsMutation: () => ({ mutateAsync: analyze, isPending: false }) };
            return new Proxy({}, { get: (_target, key) => key });
        },
    });
    function render() {
        cursor = 0;
        refCursor = 0;
        const outer = exports.default({ tool, capabilities: { tools: [{ key: tool, status: tool === "cutout" || options.unavailable ? "unavailable" : "available", requiredCapabilities: TOOL_REGISTRY[tool].requiredCapabilities, modelIdsByCapability: { "reference-image": [modelId], "multi-image": [modelId], vision: [modelId] } }], models: [{ id: modelId, name: "Seedream", capabilities: ["reference-image", "multi-image", "vision"], maxReferenceImages: 5 }] }, locked: options.locked ?? false, onSubmit });
        const root = tool === "expand" && options.legacy !== false ? exports.ToolWorkspace(outer.props) : typeof outer.type === "function" ? outer.type(outer.props) : outer;
        const nodes: Node[] = [];
        const visit = (value: any) => {
            if (Array.isArray(value)) return value.forEach(visit);
            if (value && typeof value === "object" && "props" in value) { nodes.push(value); visit(value.props.children); }
        };
        visit(root);
        return nodes;
    }
    const field = (suffix: string) => render().find((node) => node.props.id === `test-${suffix}`)!;
    const button = () => render().find((node) => node.props.type === "submit")!;
    const select = () => render().find((node) => node.props["aria-label"] === `参考图片 ${assetId}`)!.props.onClick();
    const fill = () => { field("product").props.onChange({ target: { value: "Product" } }); select(); };
    const submit = () => render().find((node) => node.type === "form")!.props.onSubmit({ preventDefault: jest.fn() });
    function mountThumbnail() {
        const thumbnail = render().find((node) => typeof node.type === "function" && node.props.id === assetId)!;
        const stateOffset = cursor;
        const refOffset = refCursor;
        const renderThumbnail = (id = assetId) => {
            cursor = stateOffset;
            refCursor = refOffset;
            return thumbnail.type({ ...thumbnail.props, id });
        };
        const node = renderThumbnail();
        const target = {};
        node.props.ref.current = target;
        const cleanup = effects.at(-1)!() as () => void;
        return { target, cleanup, renderThumbnail };
    }
    return { render, field, button, select, fill, submit, onSubmit, analyze, billing, load, originalLoad, effects, assets, mountThumbnail };
}

describe("tool form contracts", () => {
    it("selects protected live assets and passes typed tool input to the parent", async () => {
        const view = harness();
        expect(view.button().props.disabled).toBe(true);
        view.fill();
        view.field("count").props.onChange({ target: { value: "3" } });
        view.field("ratio").props.onChange({ target: { value: "4:3" } });
        expect(view.button().props.disabled).toBe(false);
        await view.submit();
        expect(view.onSubmit).toHaveBeenCalledWith({ tool: "expand", modelId, assetIds: [assetId], productName: "Product", instructions: "", count: 3, ratio: "4:3", expansion: "surround" });
        const thumbnail = view.render().find((node) => typeof node.type === "function" && node.props.id === assetId)!;
        thumbnail.type(thumbnail.props);
        const dispose = view.effects.at(-1)!();
        expect(view.load).toHaveBeenCalledWith(assetId, expect.any(Function), expect.any(Function));
        expect(typeof dispose).toBe("function");
    });
    it.each([{ ready: false }, { locked: true }])("gates submission on billing and parent locks %p", async (options) => {
        const view = harness("expand", options);
        view.fill();
        expect(view.button().props.disabled).toBe(true);
        await view.submit();
        expect(view.onSubmit).not.toHaveBeenCalled();
    });
    it.each(["watermark", "translate", "retouch", "recolor"] as const)("dispatches %s to the dedicated single-image form", (tool) => {
        const view = harness(tool, { locked: true });
        expect(view.render().find((node) => node.type === "image-edit-form")!.props).toEqual(expect.objectContaining({ tool, locked: true, onSubmit: view.onSubmit }));
    });
    it("dispatches expansion to the dedicated form while preserving legacy workspace tests", () => {
        const view = harness("expand", { locked: true, legacy: false });
        expect(view.render().find((node) => node.type === "image-edit-form")!.props).toEqual(expect.objectContaining({ tool: "expand", locked: true, onSubmit: view.onSubmit }));
    });
    it.each(["detail", "replica", "creative", "fusion", "sku"] as const)("dispatches %s to the specialized form with the parent contract", (tool) => {
        const view = harness(tool, { locked: true });
        const specialized = view.render().find((node) => node.type === "specialized-form")!;
        expect(specialized.props).toEqual(expect.objectContaining({ tool, locked: true, onSubmit: view.onSubmit }));
        expect(view.render().some((node) => node.type === "form")).toBe(false);
    });
    it("only analyzes suggestions after explicit submission, with no image task or billing gate", async () => {
        const view = harness("suggest", { ready: false });
        view.fill();
        expect(view.analyze).not.toHaveBeenCalled();
        expect(view.billing).toHaveBeenLastCalledWith(modelId, 1, false);
        expect(view.button().props.disabled).toBe(false);
        await view.submit();
        expect(view.analyze).toHaveBeenCalledWith({ modelId, assetIds: [assetId], productName: "Product", language: "简体中文" });
        expect(view.onSubmit).not.toHaveBeenCalled();
        expect(view.render().some((node) => node.type === "output" && node.props.children === "Visible evidence only")).toBe(true);
        view.field("product").props.onChange({ target: { value: "Another product" } });
        view.render();
        view.effects.at(-1)!();
        expect(view.render().some((node) => node.type === "output")).toBe(false);
    });
    it("prevents repeated submissions while a request is unresolved", async () => {
        const view = harness(); view.fill();
        let finish!: () => void;
        view.onSubmit.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
        const first = view.submit();
        await view.submit();
        expect(view.onSubmit).toHaveBeenCalledTimes(1);
        finish(); await first;
    });
    it("leaves transparent cutout unavailable", () => {
        const view = harness("cutout");
        expect(view.render().some((node) => node.type === "form")).toBe(false);
        expect(view.analyze).not.toHaveBeenCalled();
        expect(view.onSubmit).not.toHaveBeenCalled();
    });
    it("keeps expected edit controls visible without a capable model and refuses submission", async () => {
        const view = harness("expand", { unavailable: true });
        view.fill();
        expect(view.field("model")).toBeDefined();
        expect(view.field("instructions")).toBeDefined();
        expect(view.button().props.disabled).toBe(true);
        await view.submit();
        expect(view.onSubmit).not.toHaveBeenCalled();
    });
});

describe("bounded tool asset picker", () => {
    function observerHarness() {
        let notify!: (entries: Array<{ target: object; isIntersecting: boolean }>) => void;
        const observe = jest.fn();
        const disconnect = jest.fn();
        const observer = jest.fn().mockImplementation((callback: typeof notify) => {
            notify = callback;
            return { observe, disconnect };
        });
        const view = harness("expand", { observer });
        const thumbnail = view.mountThumbnail();
        const intersect = (isIntersecting: boolean, target = thumbnail.target) => notify([{ target, isIntersecting }]);
        return { view, thumbnail, observer, observe, disconnect, intersect };
    }

    it("does not request offscreen assets or originals, and releases on exit and unmount", () => {
        const { view, thumbnail, observer, observe, disconnect, intersect } = observerHarness();
        expect(observer).toHaveBeenCalledWith(expect.any(Function), { rootMargin: "0px", threshold: 0 });
        expect(observe).toHaveBeenCalledWith(thumbnail.target);
        expect(view.load).not.toHaveBeenCalled();
        intersect(false);
        intersect(true, {});
        expect(view.load).not.toHaveBeenCalled();
        intersect(true);
        intersect(true);
        expect(view.load).toHaveBeenCalledTimes(1);
        expect(view.load).toHaveBeenCalledWith(assetId, expect.any(Function), expect.any(Function));
        view.load.mock.calls[0][1]("blob:thumbnail");
        expect(thumbnail.renderThumbnail().props.children.props.src).toBe("blob:thumbnail");
        const firstRelease = view.load.mock.results[0].value;
        intersect(false);
        expect(firstRelease).toHaveBeenCalledTimes(1);
        expect(thumbnail.renderThumbnail().props.children.type).not.toBe("img");
        const nextRelease = jest.fn();
        view.load.mockReturnValueOnce(nextRelease);
        intersect(true);
        expect(view.load).toHaveBeenCalledTimes(2);
        thumbnail.cleanup();
        expect(disconnect).toHaveBeenCalledTimes(1);
        expect(nextRelease).toHaveBeenCalledTimes(1);
        intersect(false);
        intersect(true);
        expect(view.load).toHaveBeenCalledTimes(2);
        expect(view.originalLoad).not.toHaveBeenCalled();
    });

    it("clears failed state on exit and can reload on re-entry", () => {
        const { view, thumbnail, intersect } = observerHarness();
        intersect(true);
        view.load.mock.calls[0][2]();
        expect(thumbnail.renderThumbnail().props.children).toBe("加载失败");
        intersect(false);
        expect(thumbnail.renderThumbnail().props.children).not.toBe("加载失败");
        intersect(true);
        expect(view.load).toHaveBeenCalledTimes(2);
        thumbnail.cleanup();
    });

    it("disposes the old asset before observing a changed id", () => {
        const { view, thumbnail, intersect } = observerHarness();
        intersect(true);
        thumbnail.cleanup();
        expect(view.load.mock.results[0].value).toHaveBeenCalledTimes(1);
        const changedId = "33333333-3333-4333-8333-333333333333";
        thumbnail.renderThumbnail(changedId);
        const cleanup = view.effects.at(-1)!() as () => void;
        expect(view.load).toHaveBeenCalledTimes(1);
        intersect(true);
        expect(view.load).toHaveBeenLastCalledWith(changedId, expect.any(Function), expect.any(Function));
        cleanup();
    });

    it.each([undefined, jest.fn().mockImplementation(() => { throw new Error("unsupported observer"); })])(
        "falls back to at most eight thumbnails when observation is unavailable", (observer) => {
            const view = harness("expand", { assetCount: 40, observer });
            const thumbnails = view.render().filter((node) => typeof node.type === "function" && node.props.id);
            expect(thumbnails).toHaveLength(8);
            const cleanups = thumbnails.map((thumbnail) => {
                const node = thumbnail.type(thumbnail.props);
                node.props.ref.current = {};
                return view.effects.at(-1)!() as () => void;
            });
            expect(view.load).toHaveBeenCalledTimes(8);
            expect(view.originalLoad).not.toHaveBeenCalled();
            cleanups.forEach((cleanup) => cleanup());
            expect(view.load.mock.results[0].value).toHaveBeenCalledTimes(8);
        },
    );

    it("disconnects and falls back when observe itself fails", () => {
        const disconnect = jest.fn();
        const observer = jest.fn().mockImplementation(() => ({
            observe: () => { throw new Error("observation failed"); }, disconnect,
        }));
        const view = harness("expand", { observer });
        const thumbnail = view.mountThumbnail();
        expect(disconnect).toHaveBeenCalledTimes(1);
        expect(view.load).toHaveBeenCalledTimes(1);
        thumbnail.cleanup();
        expect(view.load.mock.results[0].value).toHaveBeenCalledTimes(1);
    });

    it("preserves ordered selection across pages and clamps pagination after assets disappear", async () => {
        const view = harness("expand", { assetCount: 40 });
        const thumbnails = () => view.render().filter((node) => typeof node.type === "function" && node.props.id);
        const pageButton = (label: string) => view.render().find((node) => node.props["aria-label"] === label)!;
        expect(thumbnails().map((node) => node.props.id)).toEqual(view.assets.slice(0, 8).map((asset) => asset.id));
        expect(pageButton("上一页").props.disabled).toBe(true);
        view.fill();
        pageButton("下一页").props.onClick();
        const secondId = view.assets[8].id;
        expect(thumbnails().map((node) => node.props.id)).toEqual(view.assets.slice(8, 16).map((asset) => asset.id));
        view.render().find((node) => node.props["aria-label"] === `参考图片 ${secondId}`)!.props.onClick();
        pageButton("上一页").props.onClick();
        expect(view.render().find((node) => node.props["aria-label"] === `参考图片 ${assetId}`)!.props["aria-pressed"]).toBe(true);
        await view.submit();
        expect(view.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ assetIds: [assetId, secondId] }));
        for (let page = 1; page < 5; page++) pageButton("下一页").props.onClick();
        expect(thumbnails()).toHaveLength(8);
        expect(pageButton("下一页").props.disabled).toBe(true);
        view.assets.splice(9);
        expect(thumbnails()).toHaveLength(1);
        expect(thumbnails()[0].props.id).toBe(secondId);
        pageButton("上一页").props.onClick();
        view.assets.splice(0);
        expect(thumbnails()).toHaveLength(0);
        expect(view.button().props.disabled).toBe(true);
        expect(view.load).not.toHaveBeenCalled();
    });

    it("keeps the existing five-reference limit across pages", () => {
        const view = harness("expand", { assetCount: 40 });
        for (const asset of view.assets.slice(0, 5)) {
            view.render().find((node) => node.props["aria-label"] === `参考图片 ${asset.id}`)!.props.onClick();
        }
        view.render().find((node) => node.props["aria-label"] === "下一页")!.props.onClick();
        const unselected = view.render().find((node) => node.props["aria-label"] === `参考图片 ${view.assets[8].id}`)!;
        expect(unselected.props.disabled).toBe(true);
    });
});

describe("tool request hooks", () => {
    it("uses isolated routes and invalidates history and billing after generation only", async () => {
        const exports: any = {};
        const post = jest.fn().mockResolvedValue({ id: "task" });
        const invalidateQueries = jest.fn().mockResolvedValue(undefined);
        const source = readFileSync(path.join(__dirname, "../src/web/services/tool-generation.ts"), "utf8");
        runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
            exports, require: (name: string) => name === "./base" ? { apiHttpClient: { post } } : {
                useMutation: (definition: unknown) => definition, useQueryClient: () => ({ invalidateQueries }),
            },
        });
        const mutation = exports.useGenerateToolMutation();
        await mutation.mutationFn({ tool: "retouch" });
        expect(post).toHaveBeenCalledWith("/generations/tools/tasks", { tool: "retouch" });
        await mutation.onSettled();
        expect(invalidateQueries.mock.calls.map(([value]) => value.queryKey)).toEqual([
            ["image-studio", "generations"], ["image-studio", "credit-balance"], ["image-studio", "credit-quote"],
        ]);
        const suggestions = exports.useToolSuggestionsMutation();
        expect(suggestions.retry).toBe(false);
        expect(suggestions.onSettled).toBeUndefined();
        await suggestions.mutationFn({ modelId });
        expect(post).toHaveBeenLastCalledWith("/generations/tools/suggest", { modelId }, { timeout: 120000 });
    });
});