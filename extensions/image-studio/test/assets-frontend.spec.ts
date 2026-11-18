import { validateCreativeAsset, type CreativeAsset } from "../src/api/shared/assets";
import { customModelPrompt, MODEL_ATTRIBUTES } from "../src/api/shared/custom-model";
import { assetDraftSnapshot, assetFormDirty, confirmAssetReplacement } from "../src/web/pages/asset-draft";
import type { GenerationCapabilities } from "../src/api/shared/tools";
import type { ProductImage } from "../src/web/services/types";
import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const ids = Array.from({ length: 5 }, (_, index) => `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`);
const asset: CreativeAsset = { id: ids[4], kind: "reference", name: "参考", prompt: "", imageIds: ids.slice(0, 2), version: 1, createdAt: "2026-11-06", updatedAt: "2026-11-06" };
const images = ids.map((id) => ({ id, name: id, mediaType: "image/png", size: 100, width: 64, height: 64 })) as ProductImage[];
const capabilities = { tools: [{ key: "creative", status: "available", modelIdsByCapability: { "reference-image": [ids[0]] }, limits: { maxInputImages: 5 } }], models: [{ id: ids[0], capabilities: ["reference-image"], maxReferenceImages: 5 }] } as unknown as GenerationCapabilities;

describe("asset frontend draft boundaries", () => {
    it("validates optional prompt, safe names and distinct image limits", () => {
        const { kind, name, prompt, imageIds } = asset;
        expect(validateCreativeAsset({ kind, name, prompt, imageIds })).toBeNull();
        for (const invalid of [{ name: "../bad" }, { name: "" }, { name: "a".repeat(121) }, { imageIds: [] }, { imageIds: [ids[0], ids[0]] }]) {
            expect(validateCreativeAsset({ kind, name, prompt, imageIds, ...invalid })).toBeTruthy();
        }
    });
    it("copies role-bearing instructions and references without changing the asset", () => {
        const snapshot = assetDraftSnapshot(asset, images, capabilities, "");
        expect(snapshot.instructions).toContain("style");
        expect(snapshot.references.map((image) => image.id)).toEqual(asset.imageIds);
        expect(assetDraftSnapshot({ ...asset, kind: "model", imageIds: [ids[0]] }, images, capabilities, "").instructions).toContain("person");
        snapshot.references[0].name = "changed";
        expect(images[0].name).toBe(ids[0]);
        expect(asset.prompt).toBe("");
    });
    it("refuses five images, missing files, unavailable models and unsafe prompt budgets", () => {
        expect(() => assetDraftSnapshot({ ...asset, imageIds: ids }, images, capabilities, "")).toThrow("4 张");
        expect(() => assetDraftSnapshot(asset, [], capabilities, "")).toThrow("不存在");
        expect(() => assetDraftSnapshot(asset, images, capabilities, "missing")).toThrow("模型");
        expect(() => assetDraftSnapshot({ ...asset, prompt: "a".repeat(1500) }, images, capabilities, "")).toThrow("1500");
    });
    it("refusal leaves the owning draft unchanged and confirms only dirty forms", () => {
        const confirm = jest.fn(() => false);
        expect(confirmAssetReplacement(true, confirm)).toBe(false);
        expect(confirmAssetReplacement(false, confirm)).toBe(true);
        expect(confirm).toHaveBeenCalledTimes(1);
        expect(assetFormDirty(asset, asset)).toBe(false);
        expect(assetFormDirty({ ...asset, prompt: "changed" }, asset)).toBe(true);
    });
});

describe("asset metadata service", () => {
    const post = jest.fn(), patch = jest.fn(), remove = jest.fn(), get = jest.fn();
    const query = jest.fn((options) => options), mutation = jest.fn((options) => options), invalidate = jest.fn(), setQueryData = jest.fn();
    const exports: any = {};
    const source = readFileSync(path.join(__dirname, "../src/web/services/assets.ts"), "utf8");
    runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
        exports, Error, require: (name: string) => {
            if (name === "./base") return { apiHttpClient: { post, patch, delete: remove, get } };
            if (name === "../../api/shared/assets") return { validateCreativeAsset };
            if (name === "./materials") return { validMaterialLabel: (value: string) => Boolean(value && value !== "." && value !== "..") };
            return { useQuery: query, useMutation: mutation, useQueryClient: () => ({ invalidateQueries: invalidate, setQueryData }) };
        },
    });
    beforeEach(() => jest.clearAllMocks());
    it("saves full metadata and optimistic versions without billing or generation calls", async () => {
        const input = { kind: asset.kind, name: asset.name, prompt: "", imageIds: [...asset.imageIds] };
        post.mockResolvedValue(asset); patch.mockResolvedValue({ ...asset, version: 2 });
        await exports.saveCreativeAsset({ input });
        expect(post).toHaveBeenCalledWith("/assets", input);
        await exports.saveCreativeAsset({ input, original: asset });
        expect(patch).toHaveBeenCalledWith(`/assets/${asset.id}`, { ...input, expectedVersion: 1 });
        post.mockRejectedValue(new Error("quota"));
        await expect(exports.saveCreativeAsset({ input })).rejects.toThrow("quota");
        expect(input.imageIds).toEqual(asset.imageIds);
        await expect(exports.saveCreativeAsset({ input: { ...input, imageIds: [] } })).rejects.toThrow();
    });
    it("queries the honest official catalog and deletes metadata only", async () => {
        await exports.useOfficialModelsQuery().queryFn();
        expect(get).toHaveBeenCalledWith("/assets/official-models");
        await exports.useAssetsQuery().queryFn();
        expect(get).toHaveBeenCalledWith("/assets");
        const deletion = exports.useDeleteAssetMutation();
        await deletion.mutationFn(asset.id); deletion.onSuccess({ success: true }, asset.id);
        expect(remove).toHaveBeenCalledWith(`/assets/${asset.id}`);
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ["image-studio", "assets"] });
        expect(setQueryData.mock.calls[0][1]({ items: [asset], limit: 40 }).items).toEqual([]);
        exports.useSaveAssetMutation().onSuccess({ ...asset, version: 2 });
        expect(setQueryData.mock.calls[1][1]({ items: [asset], limit: 40 }).items).toEqual([{ ...asset, version: 2 }]);
    });
    it("sends explicit photo consent or generated provenance separately from asset metadata", async () => {
        const input = { kind: "model" as const, name: "Model", prompt: "", imageIds: [ids[0]] };
        post.mockResolvedValue({ ...asset, ...input });
        await exports.saveCreativeAsset({ input, faceConsent: true });
        expect(post).toHaveBeenLastCalledWith("/assets", { ...input, faceConsent: true });
        await exports.saveCreativeAsset({ input, generatedFrom: ids[3] });
        expect(post).toHaveBeenLastCalledWith("/assets", { ...input, generatedFrom: ids[3] });
        expect(input).not.toHaveProperty("faceConsent");
        expect(input).not.toHaveProperty("generatedFrom");
    });
});

type AssetNode = { type: any; props: Record<string, any> };
const assetText = (node: any): string => Array.isArray(node) ? node.map(assetText).join("") : node && typeof node === "object" ? assetText(node.props?.children) : String(node ?? "");
const settleAssetUi = async () => { for (let turn = 0; turn < 12; turn++) await Promise.resolve(); };

function assetUiHarness(editor: boolean | "custom" = true, overrides: Record<string, any> = {}) {
    const state: any[] = [], refs: any[] = [];
    const effectDeps: any[][] = [], effects: Array<() => void> = [], cleanups: Array<(() => void) | undefined> = [];
    let stateCursor = 0, refCursor = 0, effectCursor = 0;
    const props: Record<string, any> = { kind: "reference", active: true, locked: false, limitReached: false, onBusyChange: jest.fn(), onDirtyChange: jest.fn(), onClose: jest.fn(), onSaved: jest.fn(), onUse: jest.fn(async () => true), onUseImage: jest.fn(), ...overrides };
    const products = { data: images, isSuccess: true, isPending: false, isError: false, isFetching: false, refetch: jest.fn() };
    const official = { data: [], isPending: false, isError: false, isFetching: false, refetch: jest.fn() };
    const catalog = { data: { items: [asset], limit: 40 }, isSuccess: true, isPending: false, isError: false, isFetching: false, refetch: jest.fn() };
    const save = { isPending: false, mutateAsync: jest.fn(async ({ input, original }) => ({ ...asset, ...input, version: (original?.version ?? 0) + 1 })) };
    const upload = { isPending: false, mutateAsync: jest.fn() };
    const models = { data: [{ id: ids[0], name: "Image model" }], isSuccess: true, isPending: false, isError: false, isFetching: false, refetch: jest.fn() };
    const billing = { ready: true, costText: "1 积分 · 1 积分/张" };
    const generated = { id: ids[3], status: "queued", images: [] };
    const generation = { mutateAsync: jest.fn(async () => generated) };
    const taskQuery = { data: undefined as any, isError: false, isFetching: false, refetch: jest.fn() };
    const fetchImage = jest.fn(async () => new Blob(["image"], { type: "image/png" }));
    const remove = { mutateAsync: jest.fn(async (id: string) => { catalog.data.items = catalog.data.items.filter((item) => item.id !== id); return { success: true }; }) };
    const confirm = jest.fn(() => true);
    const materialExports: any = {};
    const materialSource = readFileSync(path.join(__dirname, "../src/web/services/materials.ts"), "utf8").replaceAll("import.meta.env", "({})");
    runInNewContext(ts.transpileModule(materialSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
        exports: materialExports, Error, require: () => ({}),
    });
    const exports: any = {};
    const jsx = (type: any, childProps: any) => ({ type, props: childProps });
    const source = readFileSync(path.join(__dirname, editor === "custom" ? "../src/web/pages/custom-model.tsx" : "../src/web/pages/assets.tsx"), "utf8").replaceAll("import.meta.env", "({})");
    runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, {
        exports, Error, AbortController, Blob, File, window: { confirm }, require: (name: string) => {
            if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
            if (name === "react") return {
                useState: (initial: any) => { const index = stateCursor++; if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
                    return [state[index], (value: any) => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; },
                useRef: (initial: any) => { const index = refCursor++; return refs[index] ?? (refs[index] = { current: initial }); },
                useEffect: (effect: () => (() => void) | void, deps: any[]) => {
                    if (editor !== "custom") return;
                    const index = effectCursor++;
                    if (!effectDeps[index] || deps.some((value, position) => !Object.is(value, effectDeps[index][position]))) {
                        effectDeps[index] = deps;
                        effects.push(() => { cleanups[index]?.(); cleanups[index] = effect() || undefined; });
                    }
                },
            };
            if (name === "../../api/shared/assets") return { validateCreativeAsset };
            if (name === "../../api/shared/custom-model") return { customModelPrompt, MODEL_ATTRIBUTES };
            if (name === "../services/materials") return materialExports;
            if (name === "./asset-draft") return { assetFormDirty };
            if (name === "../services/assets") return { useAssetsQuery: () => catalog, useOfficialModelsQuery: () => official, useSaveAssetMutation: () => save, useDeleteAssetMutation: () => remove };
            if (name === "../services/generation") return {
                useProductImagesQuery: () => products, useUploadProductImageMutation: () => upload,
                useImageModelsQuery: () => models, useGenerationBilling: () => billing,
                useGenerateImageMutation: () => generation, useGenerationQuery: () => taskQuery,
                isGenerationActive: (task: any) => task?.status === "queued" || task?.status === "processing", fetchGenerationImage: fetchImage,
            };
            if (name === "./material-picker") return { MaterialDialog: "MaterialDialog", MaterialThumbnail: "MaterialThumbnail", MaterialPagination: "MaterialPagination" };
            if (name === "./materials") return { default: "MaterialsView", MaterialPreview: "MaterialPreview" };
            return {};
        },
    });
    function render() {
        stateCursor = 0; refCursor = 0; effectCursor = 0;
        const nodes: AssetNode[] = [];
        function walk(node: any) { if (Array.isArray(node)) node.forEach(walk); else if (node && typeof node === "object" && "props" in node) { nodes.push(node); walk(node.props.children); } }
        walk((editor === "custom" || !editor ? exports.default : exports.AssetEditor)(props));
        effects.splice(0).forEach((effect) => effect());
        return nodes;
    }
    const field = (label: string) => render().find((node) => node.props["aria-label"] === label)!;
    const button = (label: string) => render().find((node) => node.type === "button" && (assetText(node) === label || node.props["aria-label"] === label))!;
    const set = (label: string, value: string) => field(label).props.onChange({ target: { value } });
    function fill() { set("资产名称", "Saved style"); field(`选择 ${ids[0]}`).props.onChange(); }
    return { render, field, button, set, fill, props, products, official, catalog, save, upload, remove, confirm,
        models, billing, generation, generated, taskQuery, fetchImage, customModelPrompt: exports.customModelPrompt, unmount: () => cleanups.forEach((cleanup) => cleanup?.()) };
}

describe("custom model generation and persistence", () => {
    const submit = (view: ReturnType<typeof assetUiHarness>) => view.render().find((node) => node.type === "form")!.props.onSubmit({ preventDefault() {} });
    const complete = async (view: ReturnType<typeof assetUiHarness>) => {
        view.set("定制模特名称", "My Model"); submit(view); await settleAssetUi();
        view.taskQuery.data = { ...view.generated, status: "completed", images: [{ url: "protected", mediaType: "image/png" }] };
        view.render();
    };
    it("requires a safe name, available model, quote, loaded materials and asset quota", () => {
        const view = assetUiHarness("custom");
        expect(view.button("生成").props.disabled).toBe(true);
        view.set("定制模特名称", "My Model"); expect(view.button("生成").props.disabled).toBe(false);
        for (const label of ["性别", "外观特征", "年龄段", "人设", "体型"]) expect(view.field(label).props.required).toBe(true);
        view.set("定制模特名称", "../bad"); submit(view); expect(view.generation.mutateAsync).not.toHaveBeenCalled();
        view.set("定制模特名称", "My Model");
        view.billing.ready = false; submit(view); expect(view.generation.mutateAsync).not.toHaveBeenCalled(); view.billing.ready = true;
        view.props.locked = true; submit(view); expect(view.generation.mutateAsync).not.toHaveBeenCalled(); view.props.locked = false;
        view.products.isFetching = true; submit(view); expect(view.generation.mutateAsync).not.toHaveBeenCalled(); view.products.isFetching = false;
        view.props.limitReached = true; submit(view); expect(view.generation.mutateAsync).not.toHaveBeenCalled(); view.props.limitReached = false;
        view.models.isFetching = true; submit(view); expect(view.generation.mutateAsync).not.toHaveBeenCalled();
        view.props.active = false; expect(view.render().find((node) => node.type === "form")!.props.hidden).toBe(true);
    });
    it("generates and saves a model with more than forty historical materials", async () => {
        const view = assetUiHarness("custom");
        view.products.data = Array(41).fill(images[0]);
        await complete(view);
        expect(view.generation.mutateAsync).toHaveBeenCalledTimes(1);
        view.upload.mutateAsync.mockResolvedValue(images[0]);
        expect(view.button("保存模特").props.disabled).toBe(false);
        view.button("保存模特").props.onClick(); await settleAssetUi();
        expect(view.upload.mutateAsync).toHaveBeenCalledTimes(1);
        expect(view.save.mutateAsync).toHaveBeenCalledTimes(1);
    });
    it("sends one attribute-based fictional clothed upper-body model and blocks duplicate/active submissions", async () => {
        const view = assetUiHarness("custom"); view.set("定制模特名称", "My Model"); view.set("性别", "男"); view.set("体型", "健壮");
        submit(view); submit(view); await settleAssetUi();
        expect(view.generation.mutateAsync).toHaveBeenCalledTimes(1);
        const input = view.generation.mutateAsync.mock.calls[0][0] as any;
        expect(input).toMatchObject({ modelId: ids[0], size: "1024x1536", quality: "standard", style: "natural", count: 1 });
        expect(input.prompt).toContain("性别：男"); expect(input.prompt).toContain("体型：健壮"); expect(input.prompt).toContain("虚构人物"); expect(input.prompt).toContain("得体");
        expect(input.prompt).toContain("上半身正面肖像"); expect(input.prompt).toContain("腰部以上"); expect(input.prompt).toContain("头部和双肩完整入镜");
        expect(input.prompt).toContain("不展示腿部或双脚"); expect(input.prompt).not.toContain("全身正面"); expect(input.prompt).not.toContain("头部和双脚完整入镜");
        expect(view.props.onBusyChange).toHaveBeenLastCalledWith(true);
        expect(view.field("性别").props.disabled).toBe(true); submit(view); expect(view.generation.mutateAsync).toHaveBeenCalledTimes(1);
        expect(view.props.onDirtyChange).toHaveBeenLastCalledWith(true);
    });
    it("rejects injected options before submitting", async () => {
        const view = assetUiHarness("custom"); view.set("定制模特名称", "My Model"); view.set("性别", "injected instruction");
        submit(view); await settleAssetUi(); expect(view.generation.mutateAsync).not.toHaveBeenCalled();
        expect(view.render().map(assetText).join("")).toContain("有效的模特属性");
    });
    it("shows indeterminate progress for submission, queue and processing only", async () => {
        const view = assetUiHarness("custom"); view.set("定制模特名称", "My Model");
        const progress = () => view.render().find((node) => node.props.role === "progressbar");
        expect(progress()).toBeUndefined();
        submit(view); expect(progress()?.props["aria-valuetext"]).toBe("正在提交任务");
        await settleAssetUi(); expect(progress()?.props["aria-valuetext"]).toBe("模特生成排队中");
        view.taskQuery.data = { ...view.generated, status: "processing", images: [] };
        expect(progress()?.props["aria-valuetext"]).toBe("正在生成模特");
        expect(progress()?.props["aria-valuenow"]).toBeUndefined();
        view.taskQuery.isError = true; expect(progress()).toBeUndefined();
        view.taskQuery.isError = false;
        for (const status of ["completed", "failed", "cancelled"]) {
            view.taskQuery.data = { ...view.generated, status, images: status === "completed" ? [{ url: "protected", mediaType: "image/png" }] : [] };
            expect(progress()).toBeUndefined();
        }
        view.taskQuery.data.status = "completed"; submit(view);
        expect(progress()?.props["aria-valuetext"]).toBe("正在提交任务");
        expect(view.render().some((node) => node.props.task?.status === "completed")).toBe(false);
        await settleAssetUi();
    });
    it("keeps completed output and uploaded material after save failure without regenerating/reuploading", async () => {
        const view = assetUiHarness("custom"); await complete(view);
        view.upload.mutateAsync.mockResolvedValue(images[0]); view.save.mutateAsync.mockRejectedValueOnce(new Error("save unavailable"));
        view.button("保存模特").props.onClick(); view.button("保存模特").props.onClick(); await settleAssetUi(); view.render();
        expect(view.upload.mutateAsync).toHaveBeenCalledTimes(1); expect(view.save.mutateAsync).toHaveBeenCalledTimes(1);
        expect(view.render().map(assetText).join("")).toContain("save unavailable"); expect(view.props.onClose).not.toHaveBeenCalled();
        view.products.data = Array(40).fill(images[0]);
        view.button("保存模特").props.onClick(); await settleAssetUi();
        expect(view.upload.mutateAsync).toHaveBeenCalledTimes(1); expect(view.fetchImage).toHaveBeenCalledTimes(1);
        expect(view.generation.mutateAsync).toHaveBeenCalledTimes(1);
        expect(view.save.mutateAsync).toHaveBeenLastCalledWith({ input: { kind: "model", name: "My Model", prompt: expect.stringContaining("虚构人物"), imageIds: [ids[0]] }, generatedFrom: view.generated.id });
        expect(view.save.mutateAsync.mock.calls[1][0].input.prompt).toBe(view.generation.mutateAsync.mock.calls[0][0].prompt);
        expect(view.save.mutateAsync.mock.calls[1][0].input.prompt).toContain("腰部以上");
        expect(view.props.onSaved).toHaveBeenCalledTimes(1); expect(view.props.onClose).toHaveBeenCalledTimes(1);
    });
    it("retries failed uploads separately and rejects oversized results without writes", async () => {
        const view = assetUiHarness("custom"); await complete(view);
        view.fetchImage.mockResolvedValueOnce(new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: "image/png" }));
        view.button("保存模特").props.onClick(); await settleAssetUi();
        expect(view.upload.mutateAsync).not.toHaveBeenCalled(); expect(view.save.mutateAsync).not.toHaveBeenCalled();
        view.upload.mutateAsync.mockRejectedValueOnce(new Error("upload unavailable")).mockResolvedValueOnce(images[0]);
        view.button("保存模特").props.onClick(); await settleAssetUi();
        view.button("保存模特").props.onClick(); await settleAssetUi();
        expect(view.upload.mutateAsync).toHaveBeenCalledTimes(2); expect(view.generation.mutateAsync).toHaveBeenCalledTimes(1); expect(view.save.mutateAsync).toHaveBeenCalledTimes(1);
    });
    it("requires refresh after unknown task state, exposes failure and confirms paid replacement", async () => {
        const view = assetUiHarness("custom"); await complete(view);
        view.confirm.mockReturnValue(false); submit(view); expect(view.generation.mutateAsync).toHaveBeenCalledTimes(1);
        view.taskQuery.data = { ...view.generated, status: "processing", images: [] }; view.taskQuery.isError = true;
        view.button("刷新状态").props.onClick(); expect(view.taskQuery.refetch).toHaveBeenCalledTimes(1);
        submit(view); expect(view.generation.mutateAsync).toHaveBeenCalledTimes(1);
        view.taskQuery.isError = false; view.taskQuery.data = { ...view.generated, status: "failed", error: "provider unavailable" };
        expect(view.render().map(assetText).join("")).toContain("provider unavailable");
        submit(view); await settleAssetUi(); expect(view.generation.mutateAsync).toHaveBeenCalledTimes(2);
    });
    it("ignores a late image read after unmount", async () => {
        const view = assetUiHarness("custom"); await complete(view);
        let resolveImage!: (blob: Blob) => void;
        view.fetchImage.mockImplementation(() => new Promise((resolve) => { resolveImage = resolve; }));
        view.button("保存模特").props.onClick(); view.unmount(); resolveImage(new Blob(["image"], { type: "image/png" })); await settleAssetUi();
        expect(view.upload.mutateAsync).not.toHaveBeenCalled(); expect(view.save.mutateAsync).not.toHaveBeenCalled();
    });
});

describe("asset editor interactions", () => {
    it("preserves custom dirty/busy guards across source changes", () => {
        const view = assetUiHarness(true, { kind: "model" });
        const custom = () => view.render().find((node) => node.props.onBusyChange)!;
        const dialog = () => view.render().find((node) => node.type === "MaterialDialog")!;
        custom().props.onDirtyChange(true);
        view.button("官方模特").props.onClick();
        expect(custom().props.active).toBe(false);
        view.confirm.mockReturnValue(false); dialog().props.onClose();
        expect(view.confirm).toHaveBeenCalledTimes(1); expect(view.props.onClose).not.toHaveBeenCalled();
        custom().props.onBusyChange(true);
        expect(dialog().props.busy).toBe(true);
        expect(view.button("上传模特").props.disabled).toBe(true);
        view.button("上传模特").props.onClick();
        expect(custom().props.active).toBe(false);
        dialog().props.onClose(); expect(view.confirm).toHaveBeenCalledTimes(1);
        custom().props.onBusyChange(false); view.confirm.mockReturnValue(true);
        dialog().props.onClose(); expect(view.props.onClose).toHaveBeenCalledTimes(1);
    });
    it("keeps existing model editing on the upload path without a custom generator", () => {
        const view = assetUiHarness(true, { kind: "model", original: { ...asset, kind: "model", imageIds: [ids[0]] } });
        expect(view.render().filter((node) => node.props.role === "tab").map(assetText)).toEqual(["官方模特", "上传模特"]);
        expect(view.button("上传模特").props["aria-selected"]).toBe(true);
        expect(view.field("资产名称").props.value).toBe(asset.name);
        expect(view.render().some((node) => node.props.onBusyChange)).toBe(false);
    });
    it("defaults to custom models and preserves honest empty/error official states", () => {
        const view = assetUiHarness(true, { kind: "model" });
        expect(view.render().filter((node) => node.props.role === "tab").map(assetText)).toEqual(["定制模特", "官方模特", "上传模特"]);
        expect(view.render().find((node) => node.props.role === "tab" && node.props["aria-selected"])?.props.children).toBe("定制模特");
        view.button("官方模特").props.onClick();
        expect(view.render().map(assetText).join("")).toContain("暂无可用的授权官方模特");
        view.official.isError = true; view.button("重试").props.onClick(); expect(view.official.refetch).toHaveBeenCalledTimes(1);
        view.render().find((node) => node.props.role === "tab" && assetText(node) === "上传模特")!.props.onClick();
        view.set("资产名称", "Model"); view.field(`选择 ${ids[0]}`).props.onChange();
        expect(view.field(`选择 ${ids[1]}`).props.disabled).toBe(true);
        expect(view.button("保存").props.disabled).toBe(true);
        view.field("同意照片检测").props.onChange({ target: { checked: true } });
        expect(view.button("保存").props.disabled).toBe(false);
    });
    it("binds consent to the selected photo and blocks unchecked submissions even through the form handler", async () => {
        const view = assetUiHarness(true, { kind: "model" });
        view.button("上传模特").props.onClick();
        view.set("资产名称", "Model"); view.field(`选择 ${ids[0]}`).props.onChange();
        view.render().find((node) => node.type === "form")!.props.onSubmit({ preventDefault() {} });
        await settleAssetUi();
        expect(view.save.mutateAsync).not.toHaveBeenCalled();
        view.field("同意照片检测").props.onChange({ target: { checked: true } });
        expect(view.button("保存").props.disabled).toBe(false);
        view.button("移除图片 1").props.onClick();
        view.field(`选择 ${ids[1]}`).props.onChange();
        expect(view.field("同意照片检测").props.checked).toBe(false);
        expect(view.button("保存").props.disabled).toBe(true);
        expect(view.render().map(assetText).join("")).not.toContain("保存时将照片发送腾讯云");
        expect(assetText(view.field("模特照片检测说明"))).toContain("同意将照片发送腾讯云进行人脸检测");
    });
    it("shows detection in flight, prevents duplicate saves and preserves a rejected photo and form", async () => {
        const view = assetUiHarness(true, { kind: "model" });
        view.button("上传模特").props.onClick();
        view.set("资产名称", "Model"); view.field(`选择 ${ids[0]}`).props.onChange();
        view.field("同意照片检测").props.onChange({ target: { checked: true } });
        let reject!: (reason: Error) => void;
        view.save.mutateAsync.mockImplementation(() => new Promise((_resolve, rejectSave) => { reject = rejectSave; }));
        const form = view.render().find((node) => node.type === "form")!;
        form.props.onSubmit({ preventDefault() {} }); form.props.onSubmit({ preventDefault() {} });
        expect(view.save.mutateAsync).toHaveBeenCalledTimes(1);
        expect(view.save.mutateAsync).toHaveBeenCalledWith({ input: { kind: "model", name: "Model", prompt: "", imageIds: [ids[0]] }, original: undefined, faceConsent: true });
        expect(view.render().some((node) => node.props.role === "status" && assetText(node).includes("正在检测并保存"))).toBe(true);
        expect(view.field("同意照片检测").props.disabled).toBe(true);
        expect(view.button("保存").props.disabled).toBe(true);
        reject(new Error("未成年风险")); await settleAssetUi();
        expect(view.field("资产名称").props.value).toBe("Model");
        expect(view.field(`选择 ${ids[0]}`).props.checked).toBe(true);
        expect(view.render().map(assetText).join("")).toContain("未成年风险");
        expect(view.props.onClose).not.toHaveBeenCalled();
        expect(view.props.onSaved).not.toHaveBeenCalled();
    });
    it("renames an existing model without consent or a repeated cloud check", async () => {
        const original = { ...asset, kind: "model" as const, imageIds: [ids[0]] };
        const view = assetUiHarness(true, { kind: "model", original });
        view.set("资产名称", "Renamed");
        expect(view.field("同意照片检测")).toBeUndefined();
        view.render().find((node) => node.type === "form")!.props.onSubmit({ preventDefault() {} });
        await settleAssetUi();
        expect(view.save.mutateAsync).toHaveBeenCalledWith({ input: { kind: "model", name: "Renamed", prompt: "", imageIds: [ids[0]] }, original });
    });
    it("enforces required safe name, optional prompt, five references and metadata quota", () => {
        const view = assetUiHarness(); expect(view.button("保存").props.disabled).toBe(true);
        view.fill(); expect(view.button("保存").props.disabled).toBe(false);
        view.set("资产名称", "../bad"); expect(view.button("保存").props.disabled).toBe(true);
        view.set("资产名称", "Valid");
        for (const id of ids.slice(1)) view.field(`选择 ${id}`).props.onChange();
        expect(view.render().filter((node) => node.type === "input" && node.props.type === "checkbox" && node.props.checked)).toHaveLength(5);
        view.props.limitReached = true; expect(view.button("保存").props.disabled).toBe(true);
        view.props.limitReached = false; view.products.isFetching = true; expect(view.button("保存").props.disabled).toBe(true);
    });
    it("keeps dirty inputs on save conflict and blocks duplicate writes and closing in flight", async () => {
        const view = assetUiHarness(true, { original: asset }); view.set("资产名称", "Edited");
        let rejectSave!: (reason: Error) => void;
        view.save.mutateAsync.mockImplementation(() => new Promise((_resolve, reject) => { rejectSave = reject; }));
        const form = view.render().find((node) => node.type === "form")!;
        form.props.onSubmit({ preventDefault() {} }); form.props.onSubmit({ preventDefault() {} });
        view.render().find((node) => node.type === "MaterialDialog")!.props.onClose();
        expect(view.save.mutateAsync).toHaveBeenCalledTimes(1); expect(view.props.onClose).not.toHaveBeenCalled();
        expect(view.save.mutateAsync).toHaveBeenCalledWith({ input: { kind: "reference", name: "Edited", prompt: "", imageIds: asset.imageIds }, original: asset });
        rejectSave(new Error("version conflict")); await settleAssetUi();
        expect(view.field("资产名称").props.value).toBe("Edited");
        expect(view.render().map(assetText).join("")).toContain("version conflict");
        view.confirm.mockReturnValue(false); view.button("取消").props.onClick(); expect(view.props.onClose).not.toHaveBeenCalled();
    });
    it.each(["cancel", "error"])("saves before use and retains saved metadata after application %s", async (outcome) => {
        const view = assetUiHarness(); view.fill();
        view.props.onUse.mockImplementation(async () => {
            expect(view.props.onSaved).toHaveBeenCalledTimes(1);
            if (outcome === "error") throw new Error("unsupported model");
            return false;
        });
        view.button("保存并使用").props.onClick(); await settleAssetUi();
        expect(view.save.mutateAsync).toHaveBeenCalledTimes(1); expect(view.props.onClose).not.toHaveBeenCalled();
        expect(view.render().map(assetText).join("")).toContain(outcome === "error" ? "已保存，未能使用" : "已保存；已取消替换草稿");
        view.button("保存并使用").props.onClick(); await settleAssetUi(); expect(view.save.mutateAsync).toHaveBeenCalledTimes(1);
    });
    it("retains successful uploads, reports progress and retries only failed mutations", async () => {
        const view = assetUiHarness(); view.products.data = [];
        const first = { name: "first.png", type: "image/png", size: 10 }, second = { name: "second.png", type: "image/png", size: 10 };
        view.upload.mutateAsync.mockResolvedValueOnce(images[0]).mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(images[1]);
        const uploadField = () => view.render().find((node) => node.type === "input" && node.props.type === "file")!;
        uploadField().props.onChange({ target: { files: [first, second], value: "files" } }); await settleAssetUi();
        expect(view.render().filter((node) => node.type === "MaterialThumbnail" && node.props.image.id === ids[0]).length).toBeGreaterThan(0);
        expect(view.field("资产图片上传进度").props.value).toBe(2);
        view.button("重试失败上传（1）").props.onClick(); await settleAssetUi();
        expect(view.upload.mutateAsync.mock.calls.map(([file]) => file.name)).toEqual(["first.png", "second.png", "second.png"]);
        view.set("资产名称", "Uploads"); expect(view.button("保存").props.disabled).toBe(false);
        uploadField().props.onChange({ target: { files: Array(4).fill(first), value: "files" } }); await settleAssetUi();
        expect(view.upload.mutateAsync).toHaveBeenCalledTimes(3);
        expect(view.render().map(assetText).join("")).toContain("最多可上传并选择 3 张");
    });
    it("rejects invalid files but allows uploads beyond forty historical materials", async () => {
        const view = assetUiHarness();
        const file = view.render().find((node) => node.type === "input" && node.props.type === "file")!;
        file.props.onChange({ target: { files: [{ name: "bad.svg", type: "image/svg+xml", size: 10 }], value: "file" } }); await settleAssetUi();
        expect(view.upload.mutateAsync).not.toHaveBeenCalled();
        view.products.data = Array(41).fill(images[0]);
        view.upload.mutateAsync.mockResolvedValue(images[1]);
        expect(view.render().find((node) => node.props.className === "image-upload-zone")!.props.disabled).toBe(false);
        view.render().find((node) => node.type === "input" && node.props.type === "file")!.props.onChange({ target: { files: [{ name: "good.png", type: "image/png", size: 10 }], value: "file" } }); await settleAssetUi();
        expect(view.upload.mutateAsync).toHaveBeenCalledTimes(1);
        expect(view.render().map(assetText).join("")).not.toContain("40 张上限");
    });
});

describe("asset library interactions", () => {
    it("hides only the library content while keeping an in-progress editor mounted outside it", () => {
        const view = assetUiHarness(false);
        view.button("新建创作参考").props.onClick();
        view.props.active = false;
        const section = view.render().find((node) => node.type === "section" && node.props["aria-label"] === "资产库")!;
        expect(section.props.hidden).toBe(true);
        const editor = view.render().find((node) => typeof node.type === "function" && node.type.name === "AssetEditor");
        expect(editor).toBeDefined();
        expect(section.props.children).not.toContain(editor);
    });

    it("places creation controls in the first grid item, never in the heading", () => {
        const view = assetUiHarness(false);
        const header = view.render().find((node) => node.props.className === "assets-heading")!;
        expect(assetText(header)).toBe("资产库");
        for (const [tab, label] of [["我的模特", "新建专属模特"], ["创作参考", "新建创作参考"]]) {
            view.button(tab).props.onClick();
            const grid = view.render().find((node) => node.props.className === "assets-grid")!;
            expect(grid.props.children[0].props.className).toBe("asset-create-card");
            expect(assetText(grid.props.children[0])).toContain(label);
            view.button(label).props.onClick();
            expect(view.render().some((node) => typeof node.type === "function" && node.type.name === "AssetEditor")).toBe(true);
        }
    });

    it("keeps four tabs, recent mixed records sorted and name/type filtering", () => {
        const view = assetUiHarness(false);
        view.catalog.data.items = [asset, { ...asset, id: ids[3], name: "Portrait", kind: "model", imageIds: [ids[0]], updatedAt: "2026-11-07" }];
        expect(view.render().filter((node) => node.props.role === "tab").map(assetText)).toEqual(["最近保存", "创作参考", "我的模特", "图片素材"]);
        const headings = () => view.render().filter((node) => node.props.className === "asset-card-body").map((node) => assetText(node.props.children.find((child: AssetNode) => child?.type === "h3")));
        expect(headings().slice(0, 2)).toEqual(["Portrait", "参考"]);
        expect(headings()).toHaveLength(7);
        view.button(`预览 ${ids[0]}`).props.onClick();
        expect(view.render().find((node) => node.type === "MaterialPreview")!.props.image.id).toBe(ids[0]);
        const imageCard = view.render().find((node) => node.type === "article" && assetText(node).includes(ids[0]))!;
        imageCard.props.children[1].props.children[3].props.children[0].props.onClick();
        expect(view.props.onUseImage).toHaveBeenCalledWith(images[0]);
        view.button("我的模特").props.onClick(); expect(headings()).toEqual(["Portrait"]);
        view.set("搜索资产名称", "missing"); expect(headings()).toEqual([]);
        view.button("图片素材").props.onClick(); expect(view.render().find((node) => node.type === "MaterialsView")!.props.onUse).toBe(view.props.onUseImage);
    });
    it("deletes metadata only and retains records when deletion fails", async () => {
        const view = assetUiHarness(false); view.button("创作参考").props.onClick(); view.button("删除 参考").props.onClick();
        view.remove.mutateAsync.mockRejectedValueOnce(new Error("delete failed"));
        await view.button("删除资料").props.onClick();
        expect(view.render().filter((node) => node.props.className === "asset-card")).toHaveLength(1);
        await view.button("删除资料").props.onClick();
        expect(view.remove.mutateAsync).toHaveBeenLastCalledWith(asset.id);
        expect(view.render().filter((node) => node.props.className === "asset-card")).toHaveLength(0);
        expect(view.products.data).toBe(images);
        expect(view.render().map(assetText).join("")).toContain("原图片保留");
    });
});