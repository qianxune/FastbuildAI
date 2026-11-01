import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import * as ts from "typescript";
import { unzipSync } from "fflate";
import type { ProductImage } from "../src/web/services/types";

const image = (index = 1, overrides: Partial<ProductImage> = {}): ProductImage => ({
    id: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`, mediaType: "image/png",
    name: `Product ${index}`, group: "", width: 64, height: 64, size: 100,
    createdAt: "2026-10-31T12:00:00", ...overrides,
});

function loadModule(filename: string, imports: Record<string, unknown>, globals: Record<string, unknown> = {}) {
    const source = readFileSync(path.join(__dirname, "../src/web", filename), "utf8").replaceAll("import.meta.env", "({})");
    const exports: Record<string, any> = {};
    runInNewContext(ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
    } }).outputText, {
        exports, Blob, Uint8Array, AbortController, Error, Set, Date, ...globals,
        require: (name: string) => {
            if (name in imports) return imports[name];
            if (name === "fflate") return require("fflate");
            if (name === "lucide-react") return new Proxy({}, { get: () => "mock-icon" });
            if (name.endsWith(".css")) return {};
            throw new Error(`Unexpected dependency ${name}`);
        },
    });
    return exports;
}

const api = { instance: { get: jest.fn() }, get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() };
const helpers = loadModule("services/materials.ts", { "./base": { apiHttpClient: api }, "@tanstack/react-query": {} });

describe("materials helpers", () => {
    it("filters by durable name, group and local date without changing the source order", () => {
        const images = [image(1, { name: "Front", group: "Shop" }), image(2, { name: "Back", createdAt: "2026-10-30T12:00:00" })];
        expect(helpers.filterMaterials(images, { search: " FRONT ", group: "Shop", date: "2026-10-31" })).toEqual([images[0]]);
        expect(helpers.filterMaterials(images, { search: "", group: "", date: "2026-10-31" })).toEqual([]);
        expect(images.map((entry) => entry.id)).toEqual([image(1).id, image(2).id]);
        expect(helpers.materialName(image(1, { name: undefined }))).toBe("素材-11111111");
    });
    it("deduplicates missing IDs and enforces the selection limit", () => {
        expect(helpers.reconcileMaterialIds([image(1).id, "missing", image(1).id], [image(1)])).toEqual([image(1).id]);
        expect(helpers.toggleMaterialId(["one"], "two", 1)).toEqual(["one"]);
        expect(helpers.toggleMaterialId(["one"], "one", 1)).toEqual([]);
        expect(helpers.toggleMaterialId([], "one", 1)).toEqual(["one"]);
        expect(helpers.validMaterialLabel("../escape")).toBe(false);
        expect(helpers.validMaterialLabel("Normal")).toBe(true);
    });
    it("uploads sequentially, continues after failure and reports each rejected file", async () => {
        const files = ["good", "bad", "later", "invalid"].map((name) => ({ name, size: 100, type: name === "invalid" ? "text/plain" : "image/png" }));
        let active = 0;
        const upload = jest.fn(async (file: { name: string }) => {
            active += 1; expect(active).toBe(1); await Promise.resolve(); active -= 1;
            if (file.name === "bad") throw new Error("offline");
            return image();
        });
        const progress = jest.fn();
        const result = await helpers.uploadMaterials(files, 0, upload, undefined, progress);
        expect(upload.mock.calls.map(([file]) => file.name)).toEqual(["good", "bad", "later"]);
        expect(result.uploaded).toHaveLength(2);
        expect(result.errors).toEqual(["bad：offline", "invalid：仅支持 10 MB 以内 PNG、JPEG、WebP"]);
        expect(progress).toHaveBeenLastCalledWith(4, 4);
    });
    it("enforces the cap and stops only subsequent uploads after cancellation", async () => {
        const file = { name: "image.png", size: 100, type: "image/png" };
        const upload = jest.fn(async () => image());
        const result = await helpers.uploadMaterials([file, file], 39, upload);
        expect(upload).toHaveBeenCalledTimes(1);
        expect(result.errors[0]).toContain("40 张上限");
        const controller = new AbortController();
        upload.mockClear().mockImplementationOnce(async () => { controller.abort(); return image(); });
        const stopped = await helpers.uploadMaterials([file, file], 0, upload, controller.signal);
        expect(upload).toHaveBeenCalledTimes(1);
        expect(stopped.uploaded).toHaveLength(1);
        expect(stopped.errors).toContain("上传已停止；已上传的素材保留");
    });
    it("preserves server reference refusal and continues deleting independent assets", async () => {
        const remove = jest.fn(async (id: string) => { if (id === image(1).id) throw new Error("商品图已用于生成记录，请先删除相关记录"); });
        const result = await helpers.deleteMaterials([image(1), image(2)], remove);
        expect(remove.mock.calls).toEqual([[image(1).id], [image(2).id]]);
        expect(result.removed).toEqual([image(2).id]);
        expect(result.errors[0]).toContain("商品图已用于生成记录");
    });
    it("counts deleted originals with pending metadata cleanup as removed, not retained", async () => {
        const targets = [image(1), image(2), image(3)];
        const remove = jest.fn(async (id: string) => {
            if (id === image(2).id) throw new Error("Original deletion denied");
            return id === image(1).id ? { success: true, metadataCleanupPending: true } : { success: true };
        });
        const result = await helpers.deleteMaterials(targets, remove);
        expect(remove.mock.calls).toEqual(targets.map((target) => [target.id]));
        expect(result.removed).toEqual([image(1).id, image(3).id]);
        expect(targets.length - result.removed.length).toBe(1);
        expect(result.errors).toEqual(["Product 2：Original deletion denied"]);
    });
    it("creates a ZIP containing the selected original bytes only", async () => {
        const fetchOriginal = jest.fn(async (id: string) => new Blob([id], { type: "image/png" }));
        const archive = await helpers.materialsZip([image(2), image(3, { name: "../unsafe" })], fetchOriginal);
        const contents = unzipSync(new Uint8Array(await archive.arrayBuffer()));
        expect(Object.values(contents).map((bytes) => Buffer.from(bytes).toString())).toEqual([image(2).id, image(3).id]);
        expect(Object.keys(contents).every((name) => !name.includes("/"))).toBe(true);
        expect(fetchOriginal.mock.calls.map(([id]) => id)).toEqual([image(2).id, image(3).id]);
        await expect(helpers.materialsZip([], fetchOriginal)).rejects.toThrow("1-40");
        await expect(helpers.materialsZip(Array.from({ length: 41 }, () => image()), fetchOriginal)).rejects.toThrow("1-40");
    });
    it("bounds ZIP bytes and honors cancellation before fetching", async () => {
        const large = jest.fn(async () => ({ size: 101 * 1024 * 1024 }));
        await expect(helpers.materialsZip([image()], large)).rejects.toThrow("100 MB");
        const controller = new AbortController(); controller.abort();
        const fetchOriginal = jest.fn();
        await expect(helpers.materialsZip([image()], fetchOriginal, controller.signal)).rejects.toThrow();
        expect(fetchOriginal).not.toHaveBeenCalled();
    });
    it("fetches originals through the protected route and rejects unexpected bytes", async () => {
        const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])], { type: "image/png" });
        api.instance.get.mockResolvedValueOnce({ data: png });
        expect(await helpers.fetchMaterialOriginal(image().id)).toBe(png);
        expect(api.instance.get).toHaveBeenLastCalledWith(`/image-studio/api/generations/product-images/${image().id}`, expect.objectContaining({ responseType: "blob" }));
        await expect(helpers.fetchMaterialOriginal("../escape")).rejects.toThrow("编号无效");
        api.instance.get.mockResolvedValueOnce({ data: new Blob(["bad"], { type: "image/png" }) });
        await expect(helpers.fetchMaterialOriginal(image().id)).rejects.toThrow("格式无效");
    });
});

interface Node { type: any; props: Record<string, any> }
function uiHarness(initial: ProductImage[] = [image()], overrides: Record<string, unknown> = {}) {
    const query = { data: initial, isSuccess: true, isPending: false, isError: false, isFetching: false, refetch: jest.fn(), ...overrides };
    const groups = { data: ["Shop"], isSuccess: true, isError: false, isFetching: false, refetch: jest.fn() };
    const upload = jest.fn(async () => image());
    const remove = jest.fn(async (): Promise<unknown> => undefined);
    const metadata = jest.fn(async () => undefined);
    const cleanupThumbnail = jest.fn();
    const cleanupOriginal = jest.fn();
    const loadThumbnail = jest.fn(() => cleanupThumbnail);
    const loadOriginal = jest.fn(() => cleanupOriginal);
    const download = jest.fn();
    const zip = jest.fn(async () => new Blob(["zip"]));
    const fetchOriginal = jest.fn(async () => new Blob(["png"]));
    let active = "";
    let cursor = 0;
    let dirty = false;
    let root: (props: any) => unknown;
    let rootProps: any;
    const slots = new Map<string, any>();
    const effects = new Map<string, { deps: unknown[]; cleanup?: () => void }>();
    let scheduled: Array<() => void> = [];
    let visited = new Set<string>();
    const elements = new Map<string, any>();
    let nodes: Node[] = [];
    const previous = { isConnected: true, focus: jest.fn() };
    const document = { activeElement: previous, body: { style: { overflow: "auto" } } };
    const observers: Array<{ callback: (entries: any[]) => void; disconnect: jest.Mock; observe: jest.Mock }> = [];
    const react = {
        useState: (initialState: any) => {
            const key = `${active}:${cursor++}`;
            if (!slots.has(key)) slots.set(key, typeof initialState === "function" ? initialState() : initialState);
            return [slots.get(key), (next: any) => {
                const value = typeof next === "function" ? next(slots.get(key)) : next;
                if (!Object.is(value, slots.get(key))) { slots.set(key, value); dirty = true; }
            }];
        },
        useRef: (initialValue: any) => {
            const key = `${active}:${cursor++}`;
            if (!slots.has(key)) slots.set(key, { current: initialValue });
            return slots.get(key);
        },
        useId: () => `${active}-${cursor++}`,
        useEffect: (effect: () => any, deps: unknown[]) => {
            const key = `${active}:${cursor++}`; visited.add(key);
            const current = effects.get(key);
            if (!current || deps.some((entry, index) => !Object.is(entry, current.deps[index]))) {
                scheduled.push(() => { current?.cleanup?.(); effects.set(key, { deps, cleanup: effect() }); });
            }
        },
    };
    const jsx = (type: unknown, props: Node["props"], key?: string) => ({ type, props: { ...props, key } });
    const imports = {
        react, "react/jsx-runtime": { jsx, jsxs: jsx },
        "../services/generation": {
            useProductImagesQuery: () => query, useUploadProductImageMutation: () => ({ mutateAsync: upload }),
            useDeleteProductImageMutation: () => ({ mutateAsync: remove }), loadProductThumbnail: loadThumbnail, loadProductImage: loadOriginal,
        },
        "../services/materials": { ...helpers, useMaterialGroupsQuery: () => groups,
            useMaterialMetadataMutation: () => ({ mutateAsync: metadata }), useMaterialGroupMutation: () => ({ mutateAsync: metadata }),
            materialsZip: zip, fetchMaterialOriginal: fetchOriginal, downloadMaterialBlob: download,
        },
    };
    const globals = { document, IntersectionObserver: class {
        disconnect = jest.fn(); observe = jest.fn();
        constructor(public callback: (entries: any[]) => void) { observers.push(this); }
    } };
    const picker = loadModule("pages/material-picker.tsx", imports, globals);
    const view = loadModule("pages/materials.tsx", { ...imports, "./material-picker": picker }, globals);
    const render = () => {
        for (let attempt = 0; attempt < 8; attempt += 1) {
            dirty = false; nodes = []; visited = new Set(); scheduled = [];
            const components = new Set<string>();
            function visit(value: any, location: string) {
                if (Array.isArray(value)) { value.forEach((entry, index) => visit(entry, `${location}/${entry?.props?.key ?? index}`)); return; }
                if (!value || typeof value !== "object" || !value.props) return;
                if (typeof value.type === "function") {
                    active = `${location}/${value.type.name}`; cursor = 0;
                    components.add(active);
                    visit(value.type(value.props), `${active}/body`); return;
                }
                nodes.push(value);
                if (value.props.ref) {
                    if (!elements.has(location)) elements.set(location, { showModal: jest.fn(), close: jest.fn(), focus: jest.fn(), click: jest.fn() });
                    value.props.ref.current = elements.get(location);
                }
                visit(value.props.children, `${location}/children`);
            }
            visit(jsx(root, rootProps), "root");
            for (const key of slots.keys()) if (![...components].some((component) => key.startsWith(`${component}:`))) slots.delete(key);
            for (const [key, effect] of effects) if (!visited.has(key)) { effect.cleanup?.(); effects.delete(key); }
            scheduled.forEach((effect) => effect());
            if (!dirty) break;
        }
        return nodes;
    };
    return {
        query, groups, upload, remove, metadata, loadThumbnail, loadOriginal, cleanupThumbnail, cleanupOriginal, download, zip, fetchOriginal,
        previous, document, observers, picker, view, nodes: () => nodes,
        mount: (component: (props: any) => unknown, props: any = {}) => { root = component; rootProps = props; return render(); },
        render, find: (label: string) => nodes.find((node) => node.props["aria-label"] === label)!,
        text: () => nodes.flatMap((node) => [node.props.children].flat(Infinity)).filter((entry) => typeof entry === "string").join(" "),
        unmount: () => { effects.forEach((effect) => effect.cleanup?.()); effects.clear(); },
    };
}

describe("materials views", () => {
    it("paginates originals at twenty-four without fetching full images and resets filters to page one", () => {
        const harness = uiHarness(Array.from({ length: 30 }, (_, index) => image(index + 1)));
        harness.mount(harness.view.default);
        expect(harness.nodes().filter((node) => node.type === "article")).toHaveLength(24);
        expect(harness.loadOriginal).not.toHaveBeenCalled();
        expect(harness.fetchOriginal).not.toHaveBeenCalled();
        harness.find("下一页素材").props.onClick(); harness.render();
        expect(harness.nodes().filter((node) => node.type === "article")).toHaveLength(6);
        harness.find("搜索素材名称").props.onChange({ target: { value: "Product 1" } }); harness.render();
        expect(harness.nodes().filter((node) => node.type === "article")).toHaveLength(11);
        harness.find("清空筛选").props.onClick(); harness.render();
        expect(harness.nodes().filter((node) => node.type === "article")).toHaveLength(24);
        harness.unmount();
    });
    it("renders distinct loading, error, empty and filtered-empty states with retry", () => {
        const harness = uiHarness([], { isSuccess: false, isPending: true }); harness.mount(harness.view.default);
        expect(harness.text()).toContain("正在加载素材");
        Object.assign(harness.query, { isPending: false, isError: true }); harness.render();
        expect(harness.text()).toContain("素材加载失败");
        harness.nodes().find((node) => node.type === "button" && node.props.children?.[1] === "重新加载")!.props.onClick();
        expect(harness.query.refetch).toHaveBeenCalled();
        Object.assign(harness.query, { isError: false, isSuccess: true }); harness.render();
        expect(harness.text()).toContain("素材库暂无图片");
        harness.query.data = [image()]; harness.render();
        harness.find("搜索素材名称").props.onChange({ target: { value: "missing" } }); harness.render();
        expect(harness.text()).toContain("没有符合条件的素材"); harness.unmount();
    });
    it("keeps picker drafts isolated until confirmation and enforces max", () => {
        const harness = uiHarness([image(1), image(2)]); const onChange = jest.fn();
        harness.mount(harness.picker.default, { selectedIds: [image(1).id], onChange, max: 1 });
        expect(harness.query.refetch).not.toHaveBeenCalled();
        harness.nodes().find((node) => node.type === "button")!.props.onClick(); harness.render();
        expect(harness.find(`选择 ${image(2).name}`).props.disabled).toBe(true);
        harness.find(`选择 ${image(1).name}`).props.onChange(); harness.render();
        harness.find(`选择 ${image(2).name}`).props.onChange(); harness.render();
        harness.find("关闭").props.onClick(); harness.render(); expect(onChange).not.toHaveBeenCalled();
        harness.nodes().find((node) => node.type === "button")!.props.onClick(); harness.render();
        harness.nodes().find((node) => node.type === "button" && node.props.className === "materials-primary")!.props.onClick();
        expect(onChange).toHaveBeenCalledWith([image(1).id], [image(1)]); harness.unmount();
    });
    it("prunes missing IDs only after successful list data, never on a failed list", () => {
        const harness = uiHarness([], { isSuccess: false, isError: true }); const onChange = jest.fn();
        harness.mount(harness.picker.default, { selectedIds: [image(1).id], onChange, max: 2 });
        harness.nodes().find((node) => node.type === "button")!.props.onClick(); harness.render();
        const confirm = () => harness.nodes().find((node) => node.type === "button" && node.props.className === "materials-primary")!;
        expect(confirm().props.disabled).toBe(true); expect(harness.text()).toContain("选择未被清除");
        expect(onChange).not.toHaveBeenCalled();
        Object.assign(harness.query, { isSuccess: true, isError: false, data: [image(2)] }); harness.render();
        confirm().props.onClick(); expect(onChange).toHaveBeenCalledWith([], []); harness.unmount();
    });
    it("resets a removed group only after a successful groups refresh", () => {
        const harness = uiHarness();
        harness.mount(harness.picker.default, { selectedIds: [], onChange: jest.fn(), max: 2 });
        harness.nodes().find((node) => node.type === "button")!.props.onClick(); harness.render();
        harness.find("筛选素材分组").props.onChange({ target: { value: "Shop" } }); harness.render();
        Object.assign(harness.groups, { isSuccess: false, isError: true, data: [] }); harness.render();
        expect(harness.find("筛选素材分组").props.value).toBe("Shop");
        Object.assign(harness.groups, { isSuccess: true, isError: false }); harness.render();
        expect(harness.find("筛选素材分组").props.value).toBe("*");
        expect(harness.nodes().filter((node) => node.type === "article")).toHaveLength(1); harness.unmount();
    });
    it("keeps picker pages bounded to twelve", () => {
        const harness = uiHarness(Array.from({ length: 30 }, (_, index) => image(index + 1)));
        harness.mount(harness.picker.default, { selectedIds: [], onChange: jest.fn(), max: 40 });
        harness.nodes().find((node) => node.type === "button")!.props.onClick(); harness.render();
        expect(harness.nodes().filter((node) => node.type === "article")).toHaveLength(12); harness.unmount();
    });
    it("observes thumbnails lazily and cleans up observer, request and focus on unmount", () => {
        const harness = uiHarness();
        harness.mount(harness.picker.default, { selectedIds: [], onChange: jest.fn(), max: 2 });
        harness.nodes().find((node) => node.type === "button")!.props.onClick(); harness.render();
        expect(harness.loadThumbnail).not.toHaveBeenCalled();
        harness.observers[0].callback([{ isIntersecting: true }]); harness.render();
        expect(harness.loadThumbnail).toHaveBeenCalledWith(image().id, expect.any(Function), expect.any(Function));
        expect(harness.document.body.style.overflow).toBe("hidden");
        harness.unmount();
        expect(harness.cleanupThumbnail).toHaveBeenCalledTimes(1);
        expect(harness.observers[0].disconnect).toHaveBeenCalled();
        expect(harness.previous.focus).toHaveBeenCalledTimes(1);
        expect(harness.document.body.style.overflow).toBe("auto");
    });
    it("loads originals for explicit preview only and releases them on close", () => {
        const harness = uiHarness(); harness.mount(harness.view.default);
        harness.find(`预览 ${image().name}`).props.onClick(); harness.render();
        expect(harness.loadOriginal).toHaveBeenCalledTimes(1);
        harness.find("关闭").props.onClick(); harness.render();
        expect(harness.cleanupOriginal).toHaveBeenCalledTimes(1); harness.unmount();
    });
    it("never reports a deleted original as retained when metadata cleanup is pending", async () => {
        const harness = uiHarness(); harness.mount(harness.view.default);
        harness.remove.mockResolvedValueOnce({ success: true, metadataCleanupPending: true });
        harness.find(`删除 ${image().name}`).props.onClick(); harness.render();
        harness.nodes().find((node) => node.type === "button" && node.props.children?.[1] === "确认删除")!.props.onClick();
        await new Promise(setImmediate); harness.render();
        expect(harness.remove).toHaveBeenCalledWith(image().id);
        expect(harness.text()).toContain("已删除 1 张；保留 0 张");
        expect(harness.text()).not.toContain("删除失败");
        harness.unmount();
    });
    it("downloads selected ZIP only after action and exposes sequential partial upload failures", async () => {
        const harness = uiHarness(); harness.mount(harness.view.default);
        harness.find(`选择 ${image().name}`).props.onChange(); harness.render();
        expect(harness.zip).not.toHaveBeenCalled();
        harness.nodes().find((node) => node.type === "button" && node.props.children?.[1] === "下载 ZIP (")!.props.onClick();
        await new Promise(setImmediate); harness.render();
        expect(harness.zip).toHaveBeenCalledWith([image()], harness.fetchOriginal, expect.any(AbortSignal));
        expect(harness.download).toHaveBeenCalledWith(expect.any(Blob), "image-studio-materials.zip");
        harness.upload.mockRejectedValueOnce(new Error("offline"));
        const target = { files: [{ name: "bad.png", size: 100, type: "image/png" }, { name: "good.png", size: 100, type: "image/png" }], value: "old" };
        harness.find("上传素材文件").props.onChange({ target });
        await new Promise(setImmediate); harness.render();
        expect(target.value).toBe(""); expect(harness.upload).toHaveBeenCalledTimes(2);
        expect(harness.text()).toContain("bad.png：offline"); expect(harness.text()).toContain("已上传 1 张素材"); harness.unmount();
    });
});