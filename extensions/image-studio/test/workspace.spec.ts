import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import * as ts from "typescript";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import * as main from "../src/api/shared/main-image";
import * as workflow from "../src/api/shared/tool-workflow";
import * as specializedWorkflow from "../src/web/pages/specialized-workflow";
import { TOOL_REGISTRY } from "../src/api/shared/tools";

type Node = { type: any; props: Record<string, any>; key?: string };
const modelId = "11111111-1111-4111-8111-111111111111";
const image = (index: number) => ({ id: `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`, mediaType: "image/png", width: 100, height: 100, size: 100 });
const input = () => ({ modelId, assetIds: [image(1).id], productName: "Product", brand: "", platform: main.MAIN_PLATFORMS[0], language: main.MAIN_LANGUAGES[0], ratio: "1:1", resolution: "2K", counts: { white: 1, scene: 0, selling: 0, other: 0 }, instructions: "" });

describe("workspace drawer positioning", () => {
    it("resets the shared dialog translate without CSS build-time folding", () => {
        const view = harness("workspace-navigation");
        const tree = nodes(view.render({ view: "create", tool: "main", mobileOpen: true }));
        const drawer = tree.find((node) => node.props.className === "workspace-drawer");
        expect(drawer?.props.style).toEqual({ translate: "0 0" });
    });
});

function nodes(value: any): Node[] {
    if (Array.isArray(value)) return value.flatMap(nodes);
    return value && typeof value === "object" && "props" in value ? [value, ...nodes(value.props.children)] : [];
}
function text(value: any): string {
    if (Array.isArray(value)) return value.map(text).join("");
    return value && typeof value === "object" ? text(value.props?.children) : typeof value === "string" || typeof value === "number" ? String(value) : "";
}
function theme() {
    const classes = new Set(["dark"]);
    const root = { classList: {
        contains: (name: string) => classes.has(name),
        add: (...names: string[]) => names.forEach((name) => classes.add(name)),
        remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
        toggle: (name: string, enabled: boolean) => enabled ? classes.add(name) : classes.delete(name),
    }, style: { colorScheme: "dark" } };
    const observers: any[] = [];
    class Observer {
        observe = jest.fn();
        disconnect = jest.fn();
        constructor(public callback: () => void) { observers.push(this); }
    }
    return { classes, root, observers, globals: { document: { documentElement: root }, MutationObserver: Observer } };
}
function harness(file: string, modules: Record<string, any> = {}, globals: Record<string, any> = {}) {
    const state: any[] = [], refs: any[] = [], effects: any[] = [];
    let cursor = 0, refCursor = 0, effectCursor = 0;
    let pending: any[] = [], replay: any[] = [];
    const react = {
        useState: (initial: any) => {
            const index = cursor++;
            if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
            return [state[index], (next: any) => { state[index] = typeof next === "function" ? next(state[index]) : next; }];
        },
        useRef: (initial: any) => refs[refCursor++] ?? (refs[refCursor - 1] = { current: initial }),
        useId: () => "test",
        useEffect: (run: () => any, deps?: any[]) => {
            const index = effectCursor++;
            const old = effects[index];
            if (!old || !deps || deps.some((value, position) => !Object.is(value, old.deps?.[position]))) pending.push({ index, run, deps });
        },
    };
    const exports: any = {};
    const source = readFileSync(path.join(__dirname, `../src/web/pages/${file.endsWith(".ts") ? file : `${file}.tsx`}`), "utf8").replaceAll("import.meta.env", "({})");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } });
    expect(compiled.diagnostics ?? []).toHaveLength(0);
    const jsx = (type: any, props: any, key?: string) => ({ type, props, key });
    runInNewContext(compiled.outputText, {
        exports, Error, setTimeout: jest.fn(), clearTimeout: jest.fn(),
        require: (name: string) => {
            if (name === "react") return react;
            if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
            if (name === "../../api/shared/main-image") return main;
            if (name === "../../api/shared/tool-workflow") return workflow;
            if (name === "./specialized-workflow") return specializedWorkflow;
            if (name === "../../api/shared/tools") return { TOOL_REGISTRY };
            return modules[name] ?? new Proxy({ __esModule: true, default: name }, { get: (target, key) => key in target ? target[key as keyof typeof target] : key });
        }, ...globals,
    });
    return {
        exports,
        render: (props: any = {}, component = exports.default) => {
            cursor = refCursor = effectCursor = 0;
            pending = [];
            return component(props);
        },
        commit: () => {
            replay = pending;
            pending.forEach(({ index, run, deps }) => {
                effects[index]?.cleanup?.();
                effects[index] = { deps, cleanup: run() };
            });
        },
        replay: () => replay.forEach(({ run }) => run()),
        dispose: () => effects.forEach((effect) => effect?.cleanup?.()),
    };
}

function form() {
    const upload = jest.fn().mockResolvedValue(image(6));
    const catalog: { data: any[]; isSuccess: boolean; isFetching: boolean } = { data: [], isSuccess: false, isFetching: false };
    const analyze = jest.fn();
    const consumed = jest.fn();
    const view = harness("main-image-form", { "../services/generation": {
        useUploadProductImageMutation: () => ({ mutateAsync: upload }),
        useProductImagesQuery: () => catalog,
        useAnalyzeProductMutation: () => ({ mutateAsync: analyze, isPending: false }),
        useGenerationBilling: () => ({ ready: true, costText: "2", quote: {}, balance: {} }),
    } });
    const props: any = { models: [{ id: modelId }], available: true, locked: false, onSubmit: jest.fn(), onMaterialConsumed: consumed };
    const render = () => nodes(view.render(props));
    const picker = () => render().find((node) => node.type === "./material-picker")!;
    const thumbnails = () => render().filter((node) => typeof node.type === "function" && node.props.image);
    const drop = (count: number) => render().find((node) => node.props.onDrop)!.props.onDrop({ preventDefault: jest.fn(), dataTransfer: { files: Array.from({ length: count }, () => ({ type: "image/png", size: 100 })) } });
    return { ...view, props, render, picker, thumbnails, drop, upload, analyze, consumed, catalog };
}

function account() {
    const listeners = new Map<string, (event: any) => void>();
    const postMessage = jest.fn(), assign = jest.fn(), refresh = jest.fn();
    const logout = jest.fn().mockResolvedValue(undefined), confirm = jest.fn().mockResolvedValue(undefined);
    const onNavigate = jest.fn();
    const config = { membership: false, recharge: false };
    const profile = { nickname: "Test User", username: "account", avatar: "/avatar.png", phone: "13812345678" };
    const window: any = { parent: { postMessage }, top: { location: { assign } }, location: { origin: "https://studio.test", assign },
        addEventListener: (name: string, callback: (event: any) => void) => listeners.set(name, callback),
        removeEventListener: (name: string) => listeners.delete(name),
    };
    const view = harness("workspace-account", {
        "@buildingai/stores": {
            useAuthStore: (selector: any) => selector({ auth: { userInfo: { nickname: "Cached" } }, authActions: { logout } }),
            useConfigStore: (selector: any) => selector({ config: { websiteConfig: { features: { membership: config.membership } } } }),
        },
        "@buildingai/services/shared": { useUserInfoQuery: () => ({ data: profile, refetch: refresh }) },
        "@buildingai/services/web": { useRechargeCenterQuery: () => ({ data: { rechargeStatus: config.recharge } }) },
        "@buildingai/ui/hooks/use-alert-dialog": { useAlertDialog: () => ({ confirm }) },
        "../services/generation": { useCreditBalanceQuery: () => ({ isSuccess: true, data: { balance: 1234 } }) },
    }, { window });
    const props = { onNavigate, locked: false };
    const render = () => nodes(view.render(props));
    return { ...view, window, listeners, postMessage, assign, refresh, logout, confirm, onNavigate, config, profile, props, render };
}

describe("workspace account", () => {
    it("only sends approved same-origin actions and redirects standalone actions to the host", () => {
        const view = account();
        for (const action of ["profile", "wallet", "subscribe", "credits"]) view.exports.requestAccountAction(action);
        view.exports.requestAccountAction("admin");
        expect(view.postMessage.mock.calls).toEqual(["profile", "wallet", "subscribe", "credits"].map((action) => [{ type: "image-studio:account", action }, "https://studio.test"]));
        view.window.top = view.window;
        view.exports.requestAccountAction("credits");
        expect(view.assign).toHaveBeenCalledWith("/studio?account=credits");
    });
    it("refreshes identity only for the parent at the exact origin and removes its listener", () => {
        const view = account();
        view.render(); view.commit();
        const receive = view.listeners.get("message")!;
        const valid = { source: view.window.parent, origin: view.window.location.origin, data: { type: "image-studio:account-updated" } };
        receive({ ...valid, source: {} });
        receive({ ...valid, origin: "https://other.test" });
        receive({ ...valid, data: { type: "other" } });
        expect(view.refresh).not.toHaveBeenCalled();
        receive(valid);
        expect(view.refresh).toHaveBeenCalledTimes(1);
        view.dispose();
        expect(view.listeners.size).toBe(0);
    });
    it("renders real masked identity, balance and gated menus with working navigation", () => {
        const view = account();
        let rendered = view.render();
        expect(text(rendered)).toContain(view.profile.nickname);
        expect(text(rendered)).toContain("138****5678");
        expect(text(rendered)).not.toContain(view.profile.phone);
        expect(text(rendered)).toContain("1,234");
        expect(rendered.find((node) => node.type === "AvatarImage")!.props.src).toBe(view.profile.avatar);
        const items = () => view.render().filter((node) => node.type === "DropdownMenuItem");
        expect(items().some((node) => text(node).includes("积分充值"))).toBe(false);
        expect(items().some((node) => text(node).includes("会员订阅"))).toBe(false);
        view.config.membership = view.config.recharge = true;
        rendered = items();
        for (const node of rendered.filter((entry) => !text(entry).includes("退出登录"))) node.props.onSelect();
        expect(view.onNavigate.mock.calls).toEqual([["works"], ["materials"]]);
        expect(view.postMessage.mock.calls.map(([message]) => message.action)).toEqual(["profile", "credits", "wallet", "wallet", "subscribe"]);
    });
    it("requires logout confirmation, respects locks and redirects the top window only after logout", async () => {
        const view = account();
        const select = () => view.render().find((node) => node.type === "DropdownMenuItem" && text(node).includes("退出登录"))!.props.onSelect();
        view.confirm.mockRejectedValueOnce(new Error("cancel"));
        select(); await new Promise<void>((resolve) => setImmediate(resolve));
        expect(view.logout).not.toHaveBeenCalled();
        expect(view.assign).not.toHaveBeenCalled();
        view.props.locked = true; select();
        expect(view.confirm).toHaveBeenCalledTimes(1);
        view.props.locked = false;
        let finish!: () => void;
        view.logout.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
        select(); await new Promise<void>((resolve) => setImmediate(resolve));
        expect(view.logout).toHaveBeenCalledTimes(1);
        expect(view.assign).not.toHaveBeenCalled();
        finish(); await new Promise<void>((resolve) => setImmediate(resolve));
        expect(view.assign).toHaveBeenCalledWith("/login?redirect=%2Fstudio");
    });
});

describe("workspace selection", () => {
    it("counts selected assets instead of retained thumbnails and preserves local metadata", async () => {
        const view = form();
        const images = Array.from({ length: 5 }, (_, index) => ({ ...image(index + 1), name: "Original", group: "Local" }));
        view.picker().props.onChange(images.map((entry) => entry.id), images);
        expect(view.render().find((node) => node.props.onDrop)!.props.disabled).toBe(true);
        view.thumbnails()[0].props.onToggle();
        expect(view.thumbnails()).toHaveLength(5);
        expect(view.render().find((node) => node.props.onDrop)!.props.disabled).toBe(false);
        view.drop(2);
        expect(view.upload).not.toHaveBeenCalled();
        view.drop(1);
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(view.upload).toHaveBeenCalledTimes(1);
        expect(view.picker().props.selectedIds).toHaveLength(5);
        expect(view.thumbnails()).toHaveLength(6);
        view.thumbnails()[0].props.onToggle();
        expect(view.picker().props.selectedIds).toHaveLength(5);
        view.picker().props.onChange([images[0].id], [{ ...images[0], name: "Summary", group: undefined }]);
        expect(view.thumbnails().find((node) => node.props.image.id === images[0].id)!.props.image).toBe(images[0]);
        expect(view.analyze).not.toHaveBeenCalled();
    });
    it("removes deleted selections only after a successful material-list refresh", () => {
        const view = form();
        view.picker().props.onChange([image(1).id, image(2).id], [image(1), image(2)]);
        view.render(); view.commit();
        expect(view.picker().props.selectedIds).toHaveLength(2);
        view.catalog.isSuccess = true;
        view.catalog.isFetching = true;
        view.render(); view.commit();
        expect(view.picker().props.selectedIds).toHaveLength(2);
        view.catalog.data = [image(1)];
        view.catalog.isFetching = false;
        view.render(); view.commit();
        expect(view.picker().props.selectedIds).toEqual([image(1).id]);
        expect(view.thumbnails()).toHaveLength(1);
        view.catalog.data = [];
        view.catalog.isSuccess = false;
        view.render(); view.commit();
        expect(view.picker().props.selectedIds).toEqual([image(1).id]);
        view.catalog.isSuccess = true;
        view.render(); view.commit();
        expect(view.picker().props.selectedIds).toHaveLength(0);
        expect(view.thumbnails()).toHaveLength(0);
    });
    it("does not reuse a pre-upload initial list request or prune the newly uploaded selection", async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const key = ["image-studio", "product-images"];
        const uploaded = image(1);
        let finishInitial!: (value: any[]) => void;
        const fetchList = jest.fn()
            .mockImplementationOnce(() => new Promise<any[]>((resolve) => { finishInitial = resolve; }))
            .mockResolvedValue([uploaded]);
        const observer = new QueryObserver(client, { queryKey: key, queryFn: fetchList });
        const unsubscribe = observer.subscribe(() => undefined);
        try {
            expect(fetchList).toHaveBeenCalledTimes(1);
            const service = harness("../services/generation.ts", {
                "@tanstack/react-query": { useQueryClient: () => client, useMutation: (options: any) => options },
            });
            const mutation = service.exports.useUploadProductImageMutation();
            await mutation.onSuccess(uploaded);
            await mutation.onSettled();
            expect(fetchList).toHaveBeenCalledTimes(2);
            finishInitial([]);
            await new Promise<void>((resolve) => setImmediate(resolve));
            expect(client.getQueryData(key)).toEqual([uploaded]);
            const view = form();
            view.picker().props.onChange([uploaded.id], [uploaded]);
            view.catalog.data = client.getQueryData(key)!;
            view.catalog.isSuccess = true;
            view.render(); view.commit();
            expect(view.picker().props.selectedIds).toEqual([uploaded.id]);
        } finally {
            unsubscribe();
            client.clear();
        }
    });
    it("bounds picker selections and ignores locked callbacks", () => {
        const view = form();
        const images = Array.from({ length: 7 }, (_, index) => image(index));
        view.picker().props.onChange([...images.map((entry) => entry.id), images[0].id], images);
        expect(view.picker().props.selectedIds).toHaveLength(5);
        expect(new Set(view.picker().props.selectedIds).size).toBe(5);
        view.props.locked = true;
        view.picker().props.onChange([], []);
        expect(view.picker().props.selectedIds).toHaveLength(5);
    });
    it("consumes a material once under effect replay and permits a new request ID", () => {
        const view = form();
        view.props.requestedMaterial = { image: image(1), requestId: 1 };
        view.render(); view.commit(); view.replay();
        expect(view.consumed).toHaveBeenCalledTimes(1);
        view.thumbnails()[0].props.onToggle();
        view.render(); view.commit();
        expect(view.picker().props.selectedIds).toHaveLength(0);
        expect(view.consumed).toHaveBeenCalledTimes(1);
        view.props.requestedMaterial = { image: image(1), requestId: 2 };
        view.render(); view.commit();
        expect(view.picker().props.selectedIds).toEqual([image(1).id]);
        expect(view.consumed).toHaveBeenLastCalledWith(2);
    });
    it("defers locked material requests and consumes full-selection rejection only once", () => {
        const view = form();
        view.props.locked = true;
        view.props.requestedMaterial = { image: image(1), requestId: 1 };
        view.render(); view.commit();
        expect(view.consumed).not.toHaveBeenCalled();
        view.props.locked = false;
        view.render(); view.commit();
        expect(view.consumed).toHaveBeenCalledTimes(1);
        const images = Array.from({ length: 5 }, (_, index) => image(index + 1));
        view.picker().props.onChange(images.map((entry) => entry.id), images);
        view.props.requestedMaterial = { image: image(6), requestId: 2 };
        view.render(); view.commit(); view.replay();
        expect(view.picker().props.selectedIds).toHaveLength(5);
        expect(view.thumbnails()).toHaveLength(5);
        expect(view.consumed.mock.calls).toEqual([[1], [2]]);
        expect(view.render().some((node) => node.props.role === "alert")).toBe(true);
    });
    it("rejects asynchronous duplicate uploads before a rerender", async () => {
        const view = form();
        let finish!: (value: any) => void;
        view.upload.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
        view.drop(1); view.drop(1);
        expect(view.upload).toHaveBeenCalledTimes(1);
        finish(image(1)); await new Promise<void>((resolve) => setImmediate(resolve));
        expect(view.picker().props.selectedIds).toEqual([image(1).id]);
    });
});

describe("workspace preferences and navigation", () => {
    it("normalizes malformed, oversized and out-of-range preferences", () => {
        const values = new Map<string, string>();
        const view = harness("workspace-preferences", { "@buildingai/stores": { useAuthStore: () => "a" } }, { localStorage: { getItem: (key: string) => values.get(key) } });
        for (const candidate of [null, { count: 0 }, { count: 5 }, { count: 1.5 }, { count: "4", quality: "invalid" }]) expect(view.exports.normalizePreferences(candidate)).toEqual({ count: 1, quality: "standard" });
        for (const stored of ["{broken", " ".repeat(256) + '{"count":4,"quality":"hd"}']) {
            values.set("image-studio:preferences:a", stored);
            const fresh = harness("workspace-preferences", { "@buildingai/stores": { useAuthStore: () => "a" } }, { localStorage: { getItem: (key: string) => values.get(key) } });
            expect(fresh.render({}, fresh.exports.useWorkspacePreferences).value).toEqual({ count: 1, quality: "standard" });
        }
    });
    it("isolates user switches before effects, anonymous storage and denied persistence", () => {
        let userId: string | undefined = "a";
        const values = new Map([["image-studio:preferences:b", '{"count":2,"quality":"hd"}']]);
        const storage = { getItem: (key: string) => values.get(key), setItem: jest.fn((key: string, value: string) => { values.set(key, value); }) };
        const view = harness("workspace-preferences", { "@buildingai/stores": { useAuthStore: () => userId } }, { localStorage: storage });
        const render = () => view.render({}, view.exports.useWorkspacePreferences);
        render(); view.commit(); render().update({ count: 4, quality: "hd" });
        userId = "b";
        expect(render().value).toEqual({ count: 2, quality: "hd" });
        view.commit(); userId = undefined;
        expect(render().value).toEqual({ count: 1, quality: "standard" });
        view.commit(); render().update({ count: 3, quality: "hd" });
        expect(storage.setItem).toHaveBeenCalledTimes(1);
        userId = "a"; render(); view.commit();
        storage.setItem.mockImplementation(() => { throw new Error("denied"); });
        render().update({ count: 2, quality: "standard" });
        expect(render().value.count).toBe(2);
        expect(render().error).not.toBe("");
    });
    it("executes desktop and mobile navigation, groups, help and preferences", () => {
        const view = harness("workspace-navigation");
        const props = { view: "create", tool: "main", mobileOpen: true, onMobileOpenChange: jest.fn(), onNavigate: jest.fn(), onPreferences: jest.fn(), onHelp: jest.fn() };
        const outer = nodes(view.render(props));
        const contents = outer.filter((node) => typeof node.type === "function");
        expect(contents).toHaveLength(2);
        for (const content of contents) {
            const rendered = nodes(content.type(content.props));
            expect(rendered.filter((node) => node.type === "details")).toHaveLength(2);
            expect(rendered.filter((node) => node.type === "details").every((node) => node.props.open)).toBe(true);
            for (const key of Object.keys(TOOL_REGISTRY)) {
                const button = rendered.find((node) => node.type === "button" && text(node) === view.exports.TOOL_LABELS[key])!;
                button.props.onClick();
                expect(props.onNavigate).toHaveBeenLastCalledWith("create", key);
                expect(props.onMobileOpenChange).toHaveBeenLastCalledWith(false);
            }
            for (const [label, next] of [["我的作品", "works"], ["素材库", "materials"], ["生成历史", "history"]]) {
                rendered.find((node) => node.type === "button" && text(node) === label)!.props.onClick();
                expect(props.onNavigate).toHaveBeenLastCalledWith(next, undefined);
            }
            rendered.find((node) => node.type === "button" && text(node) === "偏好设置")!.props.onClick();
            rendered.find((node) => node.type === "button" && text(node) === "帮助与反馈")!.props.onClick();
        }
        expect(props.onPreferences).toHaveBeenCalledTimes(2);
        expect(props.onHelp).toHaveBeenCalledTimes(2);
        expect(outer.find((node) => node.type === "Dialog")!.props.open).toBe(true);
    });
});

function workspace() {
    const environment = theme();
    const active: any = { id: "active", status: "queued", count: 1, images: [], modelName: "Test", toolKey: "main", mainInput: input() };
    const items: any[] = [];
    const query = jest.fn((id?: string) => ({ data: id ? active : undefined }));
    const mutation = { isPending: false, mutateAsync: jest.fn().mockResolvedValue(active) };
    const toolMutation = { isPending: false, mutateAsync: jest.fn().mockResolvedValue(active) };
    const retryMutation = { isPending: false, mutateAsync: jest.fn().mockResolvedValue(active) };
    const quote = jest.fn().mockResolvedValue({ total: 2 });
    const confirm = jest.fn().mockReturnValue(true);
    const preferences = { value: { count: 1, quality: "standard" }, update: jest.fn() };
    const capability: any = { models: [{ id: modelId, capabilities: ["reference-image", "multi-image"], maxReferenceImages: 5 }], tools: [{ key: "main", status: "available", requiredCapabilities: ["reference-image"], modelIdsByCapability: { "reference-image": [modelId] }, limits: { maxInputImages: 5 } }] };
    const capabilityQuery = { data: capability, isSuccess: true, isFetching: false };
    const view = harness("index", {
        "@buildingai/hooks": { useDocumentHead: jest.fn() },
        "./workspace-preferences": { useWorkspacePreferences: () => preferences, WorkspacePreferencesDialog: "WorkspacePreferencesDialog" },
        "./workspace-navigation": { __esModule: true, default: "Navigation", TOOL_LABELS: { main: "Main" } },
        "../services/tool-generation": { useGenerateToolMutation: () => toolMutation },
        "../services/generation": {
            useGenerationQuery: query, isGenerationActive: (item: any) => ["queued", "processing"].includes(item?.status),
            useGenerationCapabilitiesQuery: () => capabilityQuery,
            useGenerationHistoryQuery: () => ({ data: { items, total: items.length }, isSuccess: true }),
            useGenerateMainImageMutation: () => mutation, fetchGenerationQuote: quote,
            useRetryGenerationMutation: () => retryMutation, useCancelGenerationMutation: () => mutation, useDeleteGenerationMutation: () => mutation,
        },
    }, { ...environment.globals, window: { confirm } });
    const render = () => nodes(view.render());
    return { ...view, ...environment, render, capability, capabilityQuery, active, items, query, mutation, toolMutation, retryMutation, quote, confirm, preferences };
}

describe("workspace integration", () => {
    it("resumes polling and cancellation when opening an active historical task after reload", () => {
        const view = workspace();
        view.items.push(view.active);
        view.render().find((node) => node.type === "Navigation")!.props.onNavigate("history");
        view.render().find((node) => node.props.className === "history-open")!.props.onClick();
        const rendered = view.render();
        expect(view.query).toHaveBeenLastCalledWith("active");
        expect(rendered.find((node) => node.type === "./main-image-form")!.props.locked).toBe(true);
        expect(rendered.some((node) => node.type === "button" && text(node) === "取消生成")).toBe(true);
        view.active.status = "completed";
        expect(view.render().find((node) => node.type === "./main-image-form")!.props.locked).toBe(false);
    });
    it("forces light without persisting and restores root theme after observer cleanup", () => {
        const view = workspace();
        view.render(); view.commit();
        expect(view.classes.has("light")).toBe(true);
        expect(view.classes.has("dark")).toBe(false);
        view.classes.add("dark"); view.classes.delete("light");
        view.observers[0].callback();
        expect(view.classes.has("dark")).toBe(false);
        expect(view.classes.has("studio-workspace-theme")).toBe(true);
        view.dispose();
        expect(view.observers[0].disconnect).toHaveBeenCalledTimes(1);
        expect([...view.classes]).toEqual(["dark"]);
        expect(view.root.style.colorScheme).toBe("dark");
    });
    it("retains the active task and locks while navigating history, and consumes handoff IDs safely", async () => {
        const view = workspace();
        const find = (type: string) => view.render().find((node) => node.type === type)!;
        await find("./main-image-form").props.onSubmit(input());
        find("Navigation").props.onNavigate("history");
        expect(find("./main-image-form").props.locked).toBe(true);
        expect(view.query).toHaveBeenLastCalledWith("active");
        expect(view.render().some((node) => node.props.className === "workspace-active-task" && text(node).includes("等待生成"))).toBe(true);
        view.active.status = "completed";
        find("Navigation").props.onNavigate("materials");
        find("./materials").props.onUse(image(1));
        const first = find("./main-image-form").props.requestedMaterial;
        find("Navigation").props.onNavigate("materials");
        find("./materials").props.onUse(image(2));
        const second = find("./main-image-form").props.requestedMaterial;
        expect(second.requestId).toBeGreaterThan(first.requestId);
        find("./main-image-form").props.onMaterialConsumed(first.requestId);
        expect(find("./main-image-form").props.requestedMaterial).toBe(second);
        find("./main-image-form").props.onMaterialConsumed(second.requestId);
        expect(find("./main-image-form").props.requestedMaterial).toBeNull();
    });
    it("requires real main retry inputs, matching counts, reference mapping and model limits", () => {
        const view = workspace();
        const record = { ...view.active, size: "2048x2048", modelId };
        const supports = (item: any, capabilities = view.capability) => view.exports.supportsMainRetry(item, capabilities);
        expect(supports(record)).toBe(true);
        for (const change of [{ counts: undefined }, { counts: { white: -1, scene: 2, selling: 0, other: 0 } }, { counts: { white: 1.5, scene: 0, selling: 0, other: 0 } }, { assetIds: [] }, { assetIds: ["invalid"] }, { assetIds: [image(1).id, image(1).id] }, { modelId: "other" }, { productName: " " }, { resolution: "8K" }, { ratio: "bad" }]) expect(supports({ ...record, mainInput: { ...input(), ...change } })).toBe(false);
        expect(supports({ ...record, count: 2 })).toBe(false);
        expect(supports({ ...record, size: "1024x1024" })).toBe(false);
        view.capability.tools[0].modelIdsByCapability["reference-image"] = [];
        expect(supports(record)).toBe(false);
        view.capability.tools[0].modelIdsByCapability["reference-image"] = [modelId];
        view.capability.models[0].maxReferenceImages = undefined;
        expect(supports({ ...record, mainInput: { ...input(), assetIds: [image(1).id, image(2).id] } })).toBe(false);
    });
    it("defaults unknown tool reference limits to one, not five", () => {
        const view = workspace();
        const toolInput = { tool: "retouch", modelId, assetIds: [image(1).id], productName: "Product", instructions: "", count: 1, ratio: "1:1" };
        view.capability.models[0].maxReferenceImages = undefined;
        view.capability.tools[0].key = "retouch";
        expect(view.exports.supportsToolInput(toolInput, view.capability)).toBe(true);
        expect(view.exports.supportsToolInput({ ...toolInput, assetIds: [image(1).id, image(2).id] }, view.capability)).toBe(false);
    });
});

const creativeInput = (): workflow.ToolWorkflowInput => ({ tool: "creative", modelId, assetIds: [], instructions: "User creative prompt", count: 1, ratio: "1:1" });
function creativeWorkspace() {
    const view = workspace();
    view.capability.models[0].capabilities.push("text-to-image");
    view.capability.tools.push({ key: "creative", status: "available", requiredCapabilities: ["text-to-image"],
        modelIdsByCapability: { "text-to-image": [modelId], "reference-image": [modelId] }, limits: { maxInputImages: 5, sizes: ["1024x1024"] } });
    const navigate = (next: string, tool?: string) => view.render().find((node) => node.type === "Navigation")!.props.onNavigate(next, tool);
    const form = (tool = "creative") => view.render().find((node) => node.type === "./tool-form" && node.props.tool === tool)!;
    const retryButton = () => view.render().find((node) => node.type === "button" && text(node) === "重试")!;
    return { ...view, navigate, form, retryButton };
}

describe("owning-page specialized integration", () => {
    it("keeps all five keyed form slots and child types stable across tools and workspace views", () => {
        const view = creativeWorkspace();
        const slots = () => view.render().filter((node) => node.props.className === "workspace-tool-form");
        const identity = slots().map((node) => [node.type, node.key, node.props.children.type, node.props.children.props.tool]);
        expect(identity.map((entry) => entry[1])).toEqual(specializedWorkflow.SPECIALIZED_TOOLS);
        for (const [next, tool] of [...specializedWorkflow.SPECIALIZED_TOOLS.map((tool) => ["create", tool]),
            ["works", "creative"], ["materials", "creative"], ["history", "creative"], ["create", "retouch"], ["create", "creative"]]) {
            view.navigate(next, tool);
            expect(slots().map((node) => [node.type, node.key, node.props.children.type, node.props.children.props.tool])).toEqual(identity);
            for (const slot of slots()) {
                const inactive = next !== "create" || slot.props["data-tool-form"] !== tool;
                expect(slot.props.hidden).toBe(inactive);
                expect(slot.props.inert).toBe(inactive);
                expect(slot.props.children.props.locked).toBe(inactive);
            }
            expect(view.render().filter((node) => node.type === "./main-image-form")).toHaveLength(1);
        }
        expect(view.render().filter((node) => node.type === "form")).toHaveLength(0);
    });
    it("forwards current count preferences without replacing form keys or submit handlers", () => {
        const view = creativeWorkspace(); view.navigate("create", "creative");
        expect(view.form().props.defaultCount).toBe(1);
        view.preferences.value.count = 4;
        expect(view.form().props.defaultCount).toBe(4);
        const next = { count: 2, quality: "standard" };
        view.render().find((node) => node.type === "WorkspacePreferencesDialog")!.props.onChange(next);
        expect(view.preferences.update).toHaveBeenCalledWith(next);
    });
    it.each(specializedWorkflow.SPECIALIZED_TOOLS)("wires the preferred workspace width for %s", (tool) => {
        const view = creativeWorkspace(); view.navigate("create", tool);
        const root = view.render().find((node) => node.props["data-tool"] === tool)!;
        expect(root.props.className).toContain(specializedWorkflow.SPECIALIZED_WORKSPACE_LAYOUT[tool].className);
        expect(root.props.style["--workspace-form-width"]).toBe(`${({ detail: 480, replica: 440, creative: 440, fusion: 640, sku: 480 })[tool]}px`);
        expect(view.render().find((node) => node.props.className === "canvas")!.props["data-empty"]).toBe(true);
    });
    it("forwards the original tool payload and restores polling after a successful submission", async () => {
        const view = creativeWorkspace(); view.navigate("create", "creative");
        const payload = creativeInput();
        await view.form().props.onSubmit(payload);
        expect(view.toolMutation.mutateAsync).toHaveBeenCalledWith(payload);
        expect(view.toolMutation.mutateAsync.mock.calls[0][0]).toBe(payload);
        expect(view.mutation.mutateAsync).not.toHaveBeenCalled();
        expect(view.render().find((node) => node.props.className === "canvas")!.props["data-empty"]).toBe(false);
        expect(view.query).toHaveBeenLastCalledWith("active");
    });
    it.each(["invalid", "unavailable", "fetching", "loading", "wrong-tool", "history", "locked"])("rejects %s submission to the child without calling the provider", async (reason) => {
        const view = creativeWorkspace(); view.navigate("create", "creative");
        const payload = creativeInput();
        if (reason === "invalid") payload.count = 0;
        if (reason === "unavailable") view.capability.tools[1].status = "unavailable";
        if (reason === "fetching") view.capabilityQuery.isFetching = true;
        if (reason === "loading") view.capabilityQuery.isSuccess = false;
        if (reason === "wrong-tool") view.navigate("create", "replica");
        if (reason === "history") view.navigate("history");
        if (reason === "locked") view.mutation.isPending = true;
        await expect(view.form().props.onSubmit(payload)).rejects.toThrow();
        expect(view.toolMutation.mutateAsync).not.toHaveBeenCalled();
        expect(view.render().some((node) => node.props.role === "alert")).toBe(true);
    });
    it("sets the page error and rethrows the exact provider failure", async () => {
        const view = creativeWorkspace(); view.navigate("create", "creative");
        const failure = new Error("Provider unavailable");
        view.toolMutation.mutateAsync.mockRejectedValueOnce(failure);
        await expect(view.form().props.onSubmit(creativeInput())).rejects.toBe(failure);
        expect(view.render().some((node) => node.props.role === "alert" && text(node).includes(failure.message))).toBe(true);
    });
    it.each([1, 2, 3, 4])("accepts text-only creative count %i even with a zero reference limit", (count) => {
        const view = creativeWorkspace(); view.capability.models[0].maxReferenceImages = 0;
        expect(view.exports.supportsToolInput({ ...creativeInput(), count }, view.capability)).toBe(true);
    });
    it("requires actual reference support and nullish approved-ID fallback, not an empty-list fallback", () => {
        const view = creativeWorkspace();
        const payload = { ...creativeInput(), assetIds: [image(1).id] };
        expect(view.exports.supportsToolInput(payload, view.capability)).toBe(true);
        delete view.capability.tools[1].modelIdsByCapability["reference-image"];
        expect(view.exports.supportsToolInput(payload, view.capability)).toBe(true);
        view.capability.tools[1].modelIdsByCapability["reference-image"] = [];
        expect(view.exports.supportsToolInput(payload, view.capability)).toBe(false);
        delete view.capability.tools[1].modelIdsByCapability["reference-image"];
        view.capability.models[0].capabilities = ["text-to-image"];
        expect(view.exports.supportsToolInput(payload, view.capability)).toBe(false);
    });
    it("enforces unknown model reference max one, availability limits, model identity and counts", () => {
        const view = creativeWorkspace();
        delete view.capability.models[0].maxReferenceImages;
        const payload = { ...creativeInput(), assetIds: [image(1).id] };
        expect(view.exports.supportsToolInput(payload, view.capability)).toBe(true);
        expect(view.exports.supportsToolInput({ ...payload, assetIds: [image(1).id, image(2).id] }, view.capability)).toBe(false);
        for (const count of [0, 5, 1.5]) expect(view.exports.supportsToolInput({ ...payload, count }, view.capability)).toBe(false);
        expect(view.exports.supportsToolInput({ ...payload, modelId: image(9).id }, view.capability)).toBe(false);
        view.capability.tools[1].limits.maxInputImages = 0;
        expect(view.exports.supportsToolInput(payload, view.capability)).toBe(false);
        view.capability.tools[1].status = "unavailable";
        expect(view.exports.supportsToolInput(creativeInput(), view.capability)).toBe(false);
    });
    it.each([undefined, null, creativeInput()])("retries legacy or typed creative records using the original server ID: %p", async (toolInput) => {
        const view = creativeWorkspace();
        const record = { id: "original-record", status: "failed", images: [], toolKey: "creative", toolInput, modelId,
            count: 1, prompt: "Stored creative prompt", size: toolInput ? "2048x2048" : "1024x1024" };
        view.items.push(record); view.navigate("history");
        expect(view.retryButton().props.disabled).toBe(false);
        view.retryButton().props.onClick();
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(view.quote).toHaveBeenCalledWith(modelId, 1);
        expect(view.confirm).toHaveBeenCalledTimes(1);
        expect(view.retryMutation.mutateAsync).toHaveBeenCalledWith(record.id);
        expect(record.toolInput).toBe(toolInput);
    });
    it.each([{}, [], "bad", { ...creativeInput(), tool: "unknown" }, { ...creativeInput(), tool: "retouch", assetIds: [image(1).id], productName: "Product" },
        { ...creativeInput(), modelId: image(9).id }, { ...creativeInput(), count: 2 }, { ...creativeInput(), unknown: true }])("rejects malformed or inconsistent metadata without legacy fallback: %p", (toolInput) => {
        const view = creativeWorkspace();
        view.items.push({ id: "bad", status: "failed", images: [], toolKey: "creative", toolInput, modelId, count: 1, prompt: "Legacy-looking prompt", size: "1024x1024" });
        view.navigate("history"); expect(view.retryButton().props.disabled).toBe(true);
        view.retryButton().props.onClick(); expect(view.quote).not.toHaveBeenCalled();
    });
    it("never routes unknown tools or invalid legacy counts through creative retry", () => {
        const view = creativeWorkspace();
        const record = { id: "unknown", status: "failed", images: [], toolKey: "unknown", modelId, count: 1, prompt: "Stored prompt", size: "1024x1024" };
        view.items.push(record); view.navigate("history");
        expect(view.retryButton().props.disabled).toBe(true);
        record.toolKey = "creative"; record.count = 5;
        expect(view.retryButton().props.disabled).toBe(true);
        record.count = 1; view.capabilityQuery.isFetching = true;
        expect(view.retryButton().props.disabled).toBe(true);
    });
});