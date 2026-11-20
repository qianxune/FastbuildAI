import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import * as ts from "typescript";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import * as main from "../src/api/shared/main-image";
import * as workflow from "../src/api/shared/tool-workflow";
import * as specializedWorkflow from "../src/web/pages/specialized-workflow";
import * as apparelContract from "../src/api/shared/apparel-workflow";
import * as apparelWorkflow from "../src/web/pages/apparel-workflow";
import { TOOL_REGISTRY, LOCAL_CUTOUT_MODEL_ID } from "../src/api/shared/tools";

type Node = { type: any; props: Record<string, any>; key?: string };
const modelId = "11111111-1111-4111-8111-111111111111";
const image = (index: number) => ({ id: `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`, mediaType: "image/png", width: 100, height: 100, size: 100 });
const input = () => ({ modelId, assetIds: [image(1).id], productName: "Product", brand: "", platform: main.MAIN_PLATFORMS[0], language: main.MAIN_LANGUAGES[0], ratio: "1:1", resolution: "2K", counts: { white: 1, scene: 0, selling: 0, other: 0 }, instructions: "" });

describe("workspace drawer positioning", () => {
    it.each(apparelContract.APPAREL_KEYS)("dispatches %s to its actual independent form component", (tool) => {
        const view = harness("tool-form");
        const props = { tool, capabilities: { tools: [], models: [] }, locked: true, onSubmit: jest.fn(), annotationTarget: null, taskSnapshot: null };
        const rendered = view.render(props);
        expect(rendered.type).toBe(tool === "apparel_sku" ? "./sku-tool-form" : "./apparel-tool-form");
        expect(rendered.key).toBe(tool); expect(rendered.props).toEqual(props);
    });
    it("adds the apparel group with eight independent entries in desktop and mobile navigation", () => {
        const apparel = ["tryon", "model_swap", "outfit", "fabric", "apparel_sku", "ugc_outfit", "nail_tryon", "dewrinkle"];
        const labels = ["模特试穿", "换模特", "服饰穿搭", "材料到服装", "服饰SKU变体", "种草穿搭", "美甲上手", "服装去皱"];
        const view = harness("workspace-navigation");
        const onNavigate = jest.fn(), onMobileOpenChange = jest.fn();
        const tree = nodes(view.render({ view: "create", tool: "tryon", mobileOpen: true, onNavigate, onMobileOpenChange }));
        const contents = tree.filter((node) => typeof node.type === "function" && node.type.name === "NavigationContent");
        expect(contents).toHaveLength(2);
        for (const content of contents) {
            const navigation = nodes(content.type(content.props));
            const groups = navigation.filter((node) => node.type === "details");
            expect(groups.map((node) => text(node.props.children[0]))).toEqual(["电商生图", "AI 修图", "服饰穿戴"]);
            const entries = nodes(groups[2]).filter((node) => node.type === "button");
            expect(entries.map(text)).toEqual(labels);
            entries.forEach((entry, index) => {
                entry.props.onClick();
                expect(onNavigate).toHaveBeenLastCalledWith("create", apparel[index]);
                expect(onMobileOpenChange).toHaveBeenLastCalledWith(false);
                expect(view.exports.TOOL_LABELS[apparel[index]]).toBe(labels[index]);
                expect(view.exports.TOOL_ICONS[apparel[index]]).toBeTruthy();
            });
            expect(navigation.filter((node) => node.props["aria-current"] === "true").map(text)).toEqual([labels[0]]);
            expect(nodes(groups[0]).filter((node) => node.type === "button")).toHaveLength(6);
            expect(nodes(groups[1]).filter((node) => node.type === "button")).toHaveLength(7);
        }
    });
    it("preserves task query and fragment through shared and plugin login redirects", async () => {
        const source = readFileSync(path.resolve(__dirname, "../../../packages/@buildingai/web/services/src/base.ts"), "utf8");
        const code = ts.transpileModule(source.replace(/import\.meta\.env/g, "({DEV:false})"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
        const clients: any[] = [];
        const logout = jest.fn().mockResolvedValue(undefined);
        const location = { pathname: "/extension/image-studio/studio", search: "?task=33333333-3333-4333-8333-333333333333", hash: "#result", replace: jest.fn() };
        const module = { exports: {} as any };
        runInNewContext(code, { module, exports: module.exports, location, encodeURIComponent, require: (name: string) => {
            if (name === "@buildingai/http") return { createHttpClient: (options: any) => { clients.push(options); return options; }, createStandardApiParser: () => ({}) };
            if (name === "@buildingai/stores") return { useAuthStore: { getState: () => ({ authActions: { logout } }) } };
            if (name === "sonner") return { toast: { error: jest.fn() } };
            if (name === "./shared/console-access") return {};
            throw new Error(`Unexpected import: ${name}`);
        } });
        const destination = `/login?redirect=${encodeURIComponent(location.pathname + location.search + location.hash)}`;
        await clients[0].hooks.onAuthError();
        expect(location.replace).toHaveBeenLastCalledWith(destination);
        module.exports.createPluginHttpClients("image-studio");
        await clients[2].hooks.onAuthError();
        expect(location.replace).toHaveBeenLastCalledWith(destination);
        location.pathname = "/login";
        location.replace.mockClear();
        await clients[0].hooks.onAuthError();
        expect(location.replace).not.toHaveBeenCalled();
        expect(logout).toHaveBeenCalledTimes(3);
    });
    it("switches landing navigation with the shared login state without changing studio links", () => {
        const auth: any = { token: undefined, userInfo: { username: "stale-user" } };
        const view = harness("landing", {
            "@buildingai/stores": { useAuthStore: (select: any) => select({ auth }) },
            "react-router-dom": { useLocation: () => ({ hash: "" }) },
        });
        const navigation = () => nodes(view.render()).find((node) => node.props.className === "nav-right")!;
        const links = () => nodes(navigation()).filter((node) => node.type === "a");
        expect(links().map(text)).toEqual(["登录", "免费开始"]);
        auth.token = "test-session";
        auth.userInfo = { username: "seller", nickname: "Seller nickname" };
        expect(links().map(text)).toEqual(["控制台", "seller"]);
        expect(links().map((node) => [node.props.href, node.props.target])).toEqual([["/studio", "_top"], ["/studio", "_top"]]);
        auth.userInfo = { username: "seller".repeat(50) };
        expect(links()[1].props.title).toBe(auth.userInfo.username);
        expect(links()[1].props.style.maxWidth).toBe(160);
        auth.userInfo = { nickname: "Nickname" };
        expect(links().map(text)).toEqual(["控制台", "Nickname"]);
        auth.userInfo = undefined;
        expect(links().map(text)).toEqual(["控制台", "我的账户"]);
        auth.token = undefined;
        expect(links().map(text)).toEqual(["登录", "免费开始"]);
    });
    it("filters the featured landing workshops while retaining the remaining tool entrances", () => {
        const view = harness("landing", { "react-router-dom": { useLocation: () => ({ hash: "" }) } });
        const render = () => nodes(view.render());
        expect(render().filter((node) => node.props.className === "lp-tool")).toHaveLength(12);
        const more = () => nodes(render().find((node) => node.props.className === "lp-more-grid")).filter((node) => node.type === "a");
        expect(more()).toHaveLength(9);
        render().find((node) => node.type === "button" && text(node) === "服装与模特换装")!.props.onClick();
        const cards = render().filter((node) => node.props.className === "lp-tool");
        expect(cards).toHaveLength(4);
        expect(more()).toHaveLength(4);
        expect(cards.every((node) => node.props.href === "/studio" && node.props.target === "_top")).toBe(true);
        expect(render().filter((node) => node.props["aria-pressed"] === true).map(text)).toContain("服装与模特换装");
        render().find((node) => node.type === "button" && text(node).includes("全部工坊"))!.props.onClick();
        expect(render().filter((node) => node.props.className === "lp-tool")).toHaveLength(12);
        expect(more()).toHaveLength(9);
    });
    it("switches landing pricing modes without presenting an invented recharge package", () => {
        const view = harness("landing", { "react-router-dom": { useLocation: () => ({ hash: "" }) } });
        const render = () => nodes(view.render());
        expect(render().filter((node) => node.type === "article" && String(node.props.className).startsWith("price-card"))).toHaveLength(5);
        render().find((node) => node.type === "button" && text(node) === "加油包")!.props.onClick();
        const panel = render().find((node) => node.props.className === "lp-pack-panel")!;
        expect(text(panel)).toContain("账户中心实时提供");
        expect(nodes(panel).find((node) => node.type === "a")?.props.href).toBe("/studio?account=wallet");
        expect(render().some((node) => String(node.props.className).startsWith("price-card"))).toBe(false);
        render().find((node) => node.type === "button" && text(node).startsWith("订阅套餐"))!.props.onClick();
        expect(render().filter((node) => node.type === "article" && String(node.props.className).startsWith("price-card"))).toHaveLength(5);
    });
    it("lets the landing comparison reveal either complete panel with accessible endpoint values", () => {
        const view = harness("landing");
        const render = () => nodes(view.render({}, view.exports.HeroComparison));
        for (const position of [0, 25, 50, 75, 100]) {
            render().find((node) => node.props.type === "range")!.props.onChange({ target: { value: String(position) } });
            expect(render().find((node) => node.props.className === "lp-comparison")?.props.style["--compare-position"]).toBe(`${position}%`);
            expect(render().find((node) => node.props.className === "lp-comparison-before")?.props.style.clipPath).toBe(`inset(0 ${100 - position}% 0 0)`);
            expect(render().find((node) => node.props.type === "range")?.props["aria-valuetext"]).toBe(`日常场景 ${position}%，商业光影 ${100 - position}%`);
            expect(render().find((node) => node.props.className === "lp-comparison-label before")?.props.hidden).toBe(position === 0);
            expect(render().find((node) => node.props.className === "lp-comparison-label after")?.props.hidden).toBe(position === 100);
        }
    });
    it("shows an explicitly labeled interactive retouch example instead of pretending it is a generated result", () => {
        const view = harness("image-edit-form");
        const render = () => nodes(view.render({}, view.exports.RetouchPreview));
        expect(render().filter((node) => node.type === "img").map((node) => node.props.alt)).toEqual(["香水瓶精修效果示例", "香水瓶原图示例"]);
        const slider = render().find((node) => node.props.type === "range")!;
        expect(slider.props["aria-label"]).toBe("原图与精修示例对比");
        slider.props.onChange({ target: { value: "25" } });
        expect(render().find((node) => node.props.alt === "香水瓶原图示例")!.props.style.clipPath).toBe("inset(0 75% 0 0)");
        render().find((node) => node.type === "img")!.props.onError();
        expect(render().some((node) => node.type === "img")).toBe(false);
        expect(render().some((node) => node.type === "h3")).toBe(true);
    });
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
describe("analytics console wiring", () => {
    it("shows analytics in both navigation surfaces only for a super administrator", () => {
        const auth: any = { token: "test-session", userInfo: undefined };
        const file = path.relative(path.resolve(__dirname, "../src/web/pages"),
            path.resolve(__dirname, "../../../packages/@buildingai/web/ui/src/layouts/extension/console/index"));
        const view = harness(file, { "@buildingai/stores": { useAuthStore: (select: any) => select({ auth }) } });
        const menus = [
            { title: "studio", path: "/studio" },
            { title: "pricing", path: "/pricing", superAdminOnly: true },
            { title: "analytics", path: "/analytics", superAdminOnly: true },
            { title: "group", path: "/group", children: [
                { title: "public", path: "/public" },
                { title: "private", path: "/private", superAdminOnly: true },
            ] },
        ];
        const navigation = () => nodes(view.render({ menus })).filter((node) => Array.isArray(node.props.menus));
        for (const role of [undefined, 0, 1]) {
            auth.userInfo = role === undefined ? undefined : { isRoot: role };
            const surfaces = navigation();
            expect(surfaces).toHaveLength(2);
            for (const surface of surfaces) {
                expect(surface.props.menus.map((menu: any) => menu.title))
                    .toEqual(role === 1 ? ["studio", "pricing", "analytics", "group"] : ["studio", "group"]);
                expect(surface.props.menus.at(-1).children.map((menu: any) => menu.title))
                    .toEqual(role === 1 ? ["public", "private"] : ["public"]);
            }
        }
    });

    it("registers the analytics page only in the restricted console route tree", () => {
        const view = harness("../routes", {
            "@buildingai/web-core": { defineRouteOption: (option: any) => option },
            "./../../package.json": { __esModule: true, default: { name: "image-studio" } },
            "./pages": { __esModule: true, default: "ImageStudioPage" },
            "./pages/landing": { __esModule: true, default: "LandingPage" },
            "./pages/login-redirect": { __esModule: true, default: "LoginRedirect" },
            "./pages/console/pricing": { __esModule: true, default: "PricingPage" },
            "./pages/console/analytics": { __esModule: true, default: "AnalyticsPage" },
        });
        expect(view.exports.routeOption.consoleMenus).toContainEqual({
            title: "使用统计",
            path: "/analytics",
            icon: "chart-no-axes-combined",
            superAdminOnly: true,
        });
        expect(view.exports.routeOption.consoleRoutes).toContainEqual({
            path: "analytics",
            element: { type: "AnalyticsPage", props: {}, key: undefined },
        });
        expect(view.exports.routeOption.routes.some((route: any) => route.path === "analytics")).toBe(false);
    });
});

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
    runInNewContext(compiled.outputText + (file === "index" ? "\nexports.ResultTile = ResultTile;" : ""), {
        exports, Error, setTimeout: jest.fn(), clearTimeout: jest.fn(),
        require: (name: string) => {
            if (name === "react") return react;
            if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
            if (name === "../../api/shared/main-image") return main;
            if (name === "../../api/shared/tool-workflow") return workflow;
            if (name === "@buildingai/stores" && !modules[name]) return { useAuthStore: (select: any) => select({ auth: { userInfo: { id: "owner" } } }) };
            if (name === "../services/generation") return {
                clearGenerationThumbnails: jest.fn(), setGenerationThumbnailAccount: jest.fn(),
                loadWhenVisible: (_target: any, load: () => any) => load(), ...modules[name],
            };
            if (name === "./specialized-workflow") return specializedWorkflow;
            if (name === "../../api/shared/apparel-workflow") return apparelContract;
            if (name === "./apparel-workflow") return apparelWorkflow;
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
    const billing = jest.fn(() => ({ ready: true, costText: "2", quote: {}, balance: {} }));
    const view = harness("main-image-form", { "../services/generation": {
        useUploadProductImageMutation: () => ({ mutateAsync: upload }),
        useProductImagesQuery: () => catalog,
        useAnalyzeProductMutation: () => ({ mutateAsync: analyze, isPending: false }),
        useGenerationBilling: billing,
    } });
    const props: any = { models: [{ id: modelId }], available: true, locked: false, onSubmit: jest.fn(), onMaterialConsumed: consumed };
    const render = () => nodes(view.render(props));
    const picker = () => render().find((node) => node.type === "./material-picker")!;
    const thumbnails = () => render().filter((node) => typeof node.type === "function" && node.props.image);
    const drop = (count: number) => render().find((node) => node.props.onDrop)!.props.onDrop({ preventDefault: jest.fn(), dataTransfer: { files: Array.from({ length: count }, () => ({ type: "image/png", size: 100 })) } });
    return { ...view, props, render, picker, thumbnails, drop, upload, analyze, consumed, catalog, billing };
}

function account() {
    const listeners = new Map<string, (event: any) => void>();
    const postMessage = jest.fn(), assign = jest.fn(), refresh = jest.fn();
    const logout = jest.fn().mockResolvedValue(undefined), confirm = jest.fn().mockResolvedValue(undefined);
    const onNavigate = jest.fn();
    const config = { membership: false, recharge: false };
    const profile = {
        nickname: "Test User", username: "account", avatar: "/avatar.png", phone: "13812345678",
        isRoot: 0, permissions: 0, menus: [] as any[],
    };
    const window: any = { parent: { postMessage }, top: { location: { assign } }, location: { origin: "https://studio.test", assign },
        addEventListener: (name: string, callback: (event: any) => void) => listeners.set(name, callback),
        removeEventListener: (name: string) => listeners.delete(name),
    };
    const view = harness("workspace-account", {
        "@buildingai/stores": {
            useAuthStore: (selector: any) => selector({ auth: { userInfo: { nickname: "Cached" } }, authActions: { logout } }),
            useConfigStore: (selector: any) => selector({ config: { websiteConfig: { features: { membership: config.membership } } } }),
        },
        "@buildingai/services/shared": {
            useUserInfoQuery: () => ({ data: profile, refetch: refresh }),
            hasConsoleAccess: (info: any) => info?.isRoot === 1 || info?.permissions === 1,
            getFirstConsoleMenuPath: (menus: any[]) => menus.length ? `/console/${menus[0].path}` : "/console/dashboard",
        },
        "@buildingai/services/web": { useRechargeCenterQuery: () => ({ data: { rechargeStatus: config.recharge } }) },
        "@buildingai/ui/hooks/use-alert-dialog": { useAlertDialog: () => ({ confirm }) },
        "../services/generation": { useCreditBalanceQuery: () => ({ isSuccess: true, data: { balance: 1234 } }) },
    }, { window });
    const props = { onNavigate, locked: false };
    const render = () => nodes(view.render(props));
    return { ...view, window, listeners, postMessage, assign, refresh, logout, confirm, onNavigate, config, profile, props, render };
}

describe("main selling layout selection", () => {
    it("submits uploaded product images without name or brand fields", async () => {
        const view = form();
        view.picker().props.onChange([image(1).id], [image(1)]);
        expect(view.render().some((node) => ["test-name", "test-brand"].includes(node.props.id))).toBe(false);
        expect(view.render().find((node) => node.props.type === "submit")!.props.disabled).toBe(false);
        await view.render().find((node) => node.type === "form")!.props.onSubmit({ preventDefault: jest.fn() });
        expect(view.props.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ assetIds: [image(1).id], productName: "", brand: "" }));
    });
    it("offers the sample compositions and never applies more than four layouts", async () => {
        const view = form();
        const all = () => view.render();
        const choose = (name: string) => all().find((node) => node.props["aria-label"] === name)!;
        all().find((node) => node.type === "dialog")!.props.ref.current = { showModal: jest.fn(), close: jest.fn() };
        all().find((node) => node.props.className === "selling-layout-trigger")!.props.onClick();
        for (const name of ["色卡陈列", "侧栏卖点", "模块拼贴", "拱窗细节"]) choose(name).props.onClick();
        expect(text(all().find((node) => node.props.className === "selling-layout-selection-heading"))).toContain("4/4");
        expect(choose("竖栏大字").props.disabled).toBe(true);
        choose("竖栏大字").props.onClick();
        expect(choose("竖栏大字").props["aria-pressed"]).toBe(false);
        expect(all().some((node) => node.props.layout?.id === "color-swatches")).toBe(true);
        all().find((node) => node.type === "button" && text(node) === "应用 4 个版式")!.props.onClick();
        view.picker().props.onChange([image(1).id], [image(1)]);
        await all().find((node) => node.type === "form")!.props.onSubmit({ preventDefault: jest.fn() });
        expect(view.props.onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ sellingLayouts: ["color-swatches", "sidebar-features", "block-collage", "arched-details"], counts: { white: 1, scene: 1, selling: 4, other: 0 } }));
        expect(view.billing).toHaveBeenLastCalledWith(modelId, 6, true, "main");
        expect(text(all())).toContain("共 6/10 张");
        expect(choose("增加卖点图").props.disabled).toBe(false);
        const sellingCount = all().find((node) => node.props.id === "test-selling")!;
        expect(sellingCount.props.max).toBe(8);
        sellingCount.props.onChange({ target: { value: "8" } });
        all().find((node) => node.props.className === "selling-layout-trigger")!.props.onClick();
        all().find((node) => node.type === "button" && text(node) === "应用 4 个版式")!.props.onClick();
        expect(text(all())).toContain("共 10/10 张");
        expect(choose("增加卖点图").props.disabled).toBe(true);
        choose("增加卖点图").props.onClick();
        all().find((node) => node.props.id === "test-selling")!.props.onChange({ target: { value: "9" } });
        await all().find((node) => node.type === "form")!.props.onSubmit({ preventDefault: jest.fn() });
        expect(view.props.onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ counts: { white: 1, scene: 1, selling: 8, other: 0 } }));
        expect(view.billing).toHaveBeenLastCalledWith(modelId, 10, true, "main");
    });
    it("blocks overflowing layout Apply without shrinking other outputs and preserves ten selling images", async () => {
        const view = form();
        const all = () => view.render();
        const count = (type: string, value: number) => all().find((node) => node.props.id === `test-${type}`)!.props.onChange({ target: { value: String(value) } });
        const trigger = () => all().find((node) => node.props.className === "selling-layout-trigger")!;
        const selectFour = () => {
            trigger().props.onClick();
            for (const name of ["标题与细节", "材质特写", "多卖点分区", "场景与卖点"])
                all().find((node) => node.props["aria-label"] === name)!.props.onClick();
        };
        all().find((node) => node.type === "dialog")!.props.ref.current = { showModal: jest.fn(), close: jest.fn() };
        view.picker().props.onChange([image(1).id], [image(1)]);
        count("scene", 0);
        count("white", 9);
        expect(trigger().props.disabled).toBe(false);
        selectFour();
        expect(text(all().find((node) => node.props.role === "alert"))).toContain("套图最多 10 张");
        const apply = all().find((node) => node.type === "button" && text(node) === "应用 4 个版式")!;
        expect(apply.props.disabled).toBe(true);
        apply.props.onClick();
        all().find((node) => node.type === "button" && text(node) === "取消")!.props.onClick();
        await all().find((node) => node.type === "form")!.props.onSubmit({ preventDefault: jest.fn() });
        expect(view.props.onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ sellingLayouts: [], counts: { white: 9, scene: 0, selling: 1, other: 0 } }));
        count("white", 0);
        count("selling", 10);
        selectFour();
        const validApply = all().find((node) => node.type === "button" && text(node) === "应用 4 个版式")!;
        expect(validApply.props.disabled).toBe(false);
        validApply.props.onClick();
        await all().find((node) => node.type === "form")!.props.onSubmit({ preventDefault: jest.fn() });
        expect(view.props.onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ sellingLayouts: ["headline-detail", "split-detail", "feature-grid", "scene-caption"], counts: { white: 0, scene: 0, selling: 10, other: 0 } }));
        expect(view.billing).toHaveBeenLastCalledWith(modelId, 10, true, "main");
    });
    it("uses an empty full-width upload area and transactional layout selection", async () => {
        const view = form();
        const all = () => view.render();
        const trigger = () => all().find((node) => node.props.className === "selling-layout-trigger")!;
        const dialog = all().find((node) => node.type === "dialog")!;
        dialog.props.ref.current = { showModal: jest.fn(), close: jest.fn() };
        expect(all().find((node) => node.props.onDrop)!.props.className).toContain("main-upload-zone");
        expect(text(all().find((node) => node.props.className === "product-upload-row"))).not.toContain("上传图片");
        expect(text(all())).toContain("商品卖点与生成要求");
        const choose = (name: string) => all().find((node) => node.props["aria-label"] === name)!;
        trigger().props.onClick();
        choose("标题与细节").props.onClick();
        expect(choose("标题与细节").props["aria-pressed"]).toBe(true);
        expect(choose("材质特写").props.disabled).toBe(false);
        all().find((node) => node.type === "button" && text(node) === "取消")!.props.onClick();
        expect(text(trigger())).toBe("选择卖点图版式");
        trigger().props.onClick();
        expect(choose("标题与细节").props["aria-pressed"]).toBe(false);
        choose("材质特写").props.onClick();
        all().find((node) => node.type === "button" && text(node) === "应用 1 个版式")!.props.onClick();
        expect(text(trigger())).toBe("已选 1 个卖点图版式");
        view.picker().props.onChange([image(1).id], [image(1)]);
        await all().find((node) => node.type === "form")!.props.onSubmit({ preventDefault: jest.fn() });
        expect(view.props.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ sellingLayouts: ["split-detail"], counts: { white: 1, scene: 1, selling: 1, other: 0 } }));
        trigger().props.onClick();
        choose("移除材质特写").props.onClick();
        all().find((node) => node.type === "button" && text(node) === "应用 0 个版式")!.props.onClick();
        expect(text(trigger())).toBe("选择卖点图版式");
    });
    it("replaces the main dropzone with thumbnails and an add tile, restoring it after the last removal", () => {
        const view = form();
        const empty = () => view.render().find((node) => node.props.className === "image-upload-area");
        const add = () => view.render().find((node) => node.props["aria-label"] === "继续添加图片");
        expect(empty()).toBeDefined();
        const initial = view.render();
        const library = initial.find((node) => node.props.className === "image-upload-library")!;
        expect(initial.find((node) => node.props.className === "image-upload-heading")!.props.children).toContain(library);
        view.picker().props.onChange([image(1).id], [image(1)]);
        expect(empty()).toBeUndefined();
        expect(view.thumbnails()).toHaveLength(1);
        const click = jest.fn();
        view.render().find((node) => node.props.type === "file")!.props.ref.current = { click };
        add()!.props.onClick();
        expect(click).toHaveBeenCalledTimes(1);
        view.picker().props.onChange([1, 2, 3, 4, 5].map((id) => image(id).id), [1, 2, 3, 4, 5].map(image));
        expect(add()).toBeUndefined();
        for (const thumbnail of view.thumbnails()) thumbnail.props.onDelete();
        expect(empty()).toBeDefined();
        expect(add()).toBeUndefined();
    });
    it("trims selections when the selling count falls to zero and ignores locked count changes", () => {
        const view = form();
        const all = () => view.render();
        const trigger = () => all().find((node) => node.props.className === "selling-layout-trigger")!;
        all().find((node) => node.type === "dialog")!.props.ref.current = { showModal: jest.fn(), close: jest.fn() };
        trigger().props.onClick();
        all().find((node) => node.props["aria-label"] === "标题与细节")!.props.onClick();
        all().find((node) => node.type === "button" && text(node) === "应用 1 个版式")!.props.onClick();
        view.props.locked = true;
        all().find((node) => node.props["aria-label"] === "减少卖点图")!.props.onClick();
        expect(text(trigger())).toBe("已选 1 个卖点图版式");
        view.props.locked = false;
        all().find((node) => node.props["aria-label"] === "减少卖点图")!.props.onClick();
        expect(trigger().props.disabled).toBe(false);
        expect(text(trigger())).toBe("选择卖点图版式");
    });
    it("applies multiple layouts and grows selling output only on confirmation within ten outputs", async () => {
        const view = form();
        const all = () => view.render();
        const trigger = () => all().find((node) => node.props.className === "selling-layout-trigger")!;
        const choose = (name: string) => all().find((node) => node.props["aria-label"] === name)!;
        all().find((node) => node.type === "dialog")!.props.ref.current = { showModal: jest.fn(), close: jest.fn() };
        trigger().props.onClick();
        choose("标题与细节").props.onClick();
        choose("材质特写").props.onClick();
        expect(choose("标题与细节").props["aria-pressed"]).toBe(true);
        expect(choose("材质特写").props["aria-pressed"]).toBe(true);
        expect(choose("多卖点分区").props.disabled).toBe(false);
        choose("多卖点分区").props.onClick();
        expect(choose("多卖点分区").props["aria-pressed"]).toBe(true);
        choose("多卖点分区").props.onClick();
        expect(choose("多卖点分区").props["aria-pressed"]).toBe(false);
        expect(text(all())).toContain("应用后卖点图 2 张，套图共 4 张，按新张数计费");
        all().find((node) => node.type === "button" && text(node) === "取消")!.props.onClick();
        view.picker().props.onChange([image(1).id], [image(1)]);
        await all().find((node) => node.type === "form")!.props.onSubmit({ preventDefault: jest.fn() });
        expect(view.props.onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ sellingLayouts: [], counts: { white: 1, scene: 1, selling: 1, other: 0 } }));
        trigger().props.onClick();
        expect(choose("标题与细节").props["aria-pressed"]).toBe(false);
        choose("材质特写").props.onClick();
        choose("标题与细节").props.onClick();
        all().find((node) => node.type === "button" && text(node) === "应用 2 个版式")!.props.onClick();
        expect(text(trigger())).toBe("已选 2 个卖点图版式");
        await all().find((node) => node.type === "form")!.props.onSubmit({ preventDefault: jest.fn() });
        expect(view.props.onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ sellingLayouts: ["split-detail", "headline-detail"], counts: { white: 1, scene: 1, selling: 2, other: 0 } }));
        choose("减少卖点图").props.onClick();
        choose("减少卖点图").props.onClick();
        trigger().props.onClick();
        choose("多卖点分区").props.onClick();
        all().find((node) => node.type === "button" && text(node) === "应用 1 个版式")!.props.onClick();
        await all().find((node) => node.type === "form")!.props.onSubmit({ preventDefault: jest.fn() });
        expect(view.props.onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ sellingLayouts: ["feature-grid"], counts: { white: 1, scene: 1, selling: 1, other: 0 } }));
        choose("增加白底图").props.onClick();
        choose("增加白底图").props.onClick();
        choose("减少卖点图").props.onClick();
        choose("增加白底图").props.onClick();
        expect(trigger().props.disabled).toBe(false);
    });
});

describe("workspace account", () => {
    it("keeps explicit hooks for portaled menu spacing and a separate identity header", () => {
        const rendered = account().render();
        const menu = rendered.find((node) => node.type === "DropdownMenuContent");
        expect(menu?.props.className).toBe("workspace-account-menu");
        expect(menu?.props.align).toBe("end");
        expect(menu?.props.sideOffset).toBe(8);
        const profile = rendered.find((node) => node.props.className === "workspace-account-profile");
        expect(profile?.type).toBe("DropdownMenuLabel");
        expect(text(profile)).toContain("Test User");
        expect(text(profile)).toContain("138****5678");
    });
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
    it("shows the administrator workbench only for console users and leaves the iframe", () => {
        const view = account();
        const adminItem = () => view.render().find((node) =>
            node.type === "DropdownMenuItem" && text(node).includes("管理员工作台"));
        expect(adminItem()).toBeUndefined();
        view.profile.permissions = 1;
        view.profile.menus = [{ path: "system/user" }];
        adminItem()!.props.onSelect();
        expect(view.assign).toHaveBeenCalledWith("/console/system/user");
        view.profile.permissions = 0;
        view.profile.isRoot = 1;
        view.profile.menus = [];
        adminItem()!.props.onSelect();
        expect(view.assign).toHaveBeenLastCalledWith("/console/dashboard");
        view.profile.isRoot = 0;
        expect(adminItem()).toBeUndefined();
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

describe("main image advanced settings", () => {
    it("uses an anchored non-modal popover without a native dialog or confirmation step", () => {
        const view = form();
        const rendered = view.render();
        const popover = rendered.find((node) => node.type === "Popover")!;
        const panel = rendered.find((node) => node.type === "PopoverContent")!;
        expect(popover.props.open).toBe(false);
        expect(popover.props.modal).not.toBe(true);
        expect(panel.props).toEqual(expect.objectContaining({
            className: "main-settings-popover", side: "top", align: "start", sideOffset: 8, collisionPadding: 12,
        }));
        expect(rendered.filter((node) => node.type === "dialog").map((node) => node.props.className)).toEqual(["selling-layout-dialog"]);
        expect(rendered.some((node) => node.props.className === "settings-confirm")).toBe(false);
        expect(rendered.find((node) => node.type === "PopoverTrigger")!.props.asChild).toBe(true);
        popover.props.onOpenChange(true);
        expect(view.render().find((node) => node.type === "Popover")!.props.open).toBe(true);
        view.render().find((node) => node.props["aria-label"] === "关闭高级设置")!.props.onClick();
        expect(view.render().find((node) => node.type === "Popover")!.props.open).toBe(false);
    });
    it("applies ratio and resolution immediately and retains them after closing and reopening", () => {
        const view = form();
        const rendered = view.render();
        expect(rendered.find((node) => node.props.className === "main-segmented settings-ratios")!.props.children).toHaveLength(main.MAIN_RATIOS.length);
        expect(rendered.find((node) => node.props.className === "main-segmented settings-resolutions")!.props.children).toHaveLength(main.MAIN_RESOLUTIONS.length);
        const choose = (value: string) => view.render().find((node) => node.type === "label" && text(node) === value)!.props.children[0].props.onChange();
        choose("16:9"); choose("4K");
        view.render().find((node) => node.type === "Popover")!.props.onOpenChange(false);
        view.render().find((node) => node.type === "Popover")!.props.onOpenChange(true);
        expect(text(view.render().find((node) => node.props.className === "advanced-settings-trigger"))).toContain("比例 16:9清晰度 4K");
        for (const value of ["16:9", "4K"]) {
            expect(view.render().find((node) => node.type === "label" && text(node) === value)!.props.children[0].props.checked).toBe(true);
        }
        expect(view.props.onSubmit).not.toHaveBeenCalled();
        expect(view.analyze).not.toHaveBeenCalled();
    });
    it("preserves fieldset locks and mounts the portal in the workspace theme", () => {
        const view = form();
        const workspace = {};
        const closest = jest.fn().mockReturnValue(workspace);
        view.render().find((node) => node.props.className === "advanced-settings-trigger")!.props.ref.current = { closest };
        view.props.locked = true;
        const rendered = view.render();
        expect(rendered.find((node) => node.props.className === "advanced-settings-trigger")!.props.disabled).toBe(true);
        const panel = rendered.find((node) => node.type === "PopoverContent")!;
        expect(panel.props.container).toBe(workspace);
        expect(closest).toHaveBeenCalledWith(".studio-app");
        expect(nodes(panel).find((node) => node.type === "fieldset")!.props.disabled).toBe(true);
    });
});

describe("workspace selection", () => {
    it("counts selected assets instead of retained thumbnails and preserves local metadata", async () => {
        const view = form();
        const images = Array.from({ length: 5 }, (_, index) => ({ ...image(index + 1), name: "Original", group: "Local" }));
        view.picker().props.onChange(images.map((entry) => entry.id), images);
        expect(view.render().find((node) => node.props["aria-label"] === "继续添加图片")).toBeUndefined();
        view.thumbnails()[0].props.onToggle();
        expect(view.thumbnails()).toHaveLength(5);
        expect(view.render().find((node) => node.props["aria-label"] === "继续添加图片")!.props.disabled).toBe(false);
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
    it("selects the overview independently of the active creation tool", () => {
        const view = harness("workspace-navigation");
        const props = { view: "overview", tool: "main", mobileOpen: false, onMobileOpenChange: jest.fn(), onNavigate: jest.fn(), onPreferences: jest.fn(), onHelp: jest.fn() };
        const content = nodes(view.render(props)).find((node) => typeof node.type === "function")!;
        const rendered = nodes(content.type(content.props));
        const home = rendered.find((node) => node.type === "button" && text(node) === "创作工作台")!;
        expect(home.props["aria-current"]).toBe("page");
        expect(rendered.filter((node) => node.props["aria-current"] === "true")).toHaveLength(0);
        home.props.onClick();
        expect(props.onNavigate).toHaveBeenLastCalledWith("overview", undefined);
        rendered.find((node) => node.type === "button" && text(node) === "商品主图")!.props.onClick();
        expect(props.onNavigate).toHaveBeenLastCalledWith("create", "main");
    });
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
            expect(rendered.filter((node) => node.type === "details")).toHaveLength(3);
            expect(rendered.filter((node) => node.type === "details").every((node) => node.props.open)).toBe(true);
            for (const key of Object.keys(TOOL_REGISTRY)) {
                const button = rendered.find((node) => node.type === "button" && text(node) === view.exports.TOOL_LABELS[key])!;
                button.props.onClick();
                expect(props.onNavigate).toHaveBeenLastCalledWith("create", key);
                expect(props.onMobileOpenChange).toHaveBeenLastCalledWith(false);
            }
            for (const [label, next] of [["我的作品", "works"], ["资产库", "materials"], ["生成历史", "history"]]) {
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

function workspace(search = "", enterCreation = true) {
    const environment = theme();
    const active: any = { id: "active", status: "queued", count: 1, images: [], modelName: "Test", toolKey: "main", mainInput: input() };
    const items: any[] = [];
    const query = jest.fn((id?: string) => ({ data: id ? active : undefined }));
    const mutation = { isPending: false, mutateAsync: jest.fn().mockResolvedValue(active) };
    const toolMutation = { isPending: false, mutateAsync: jest.fn().mockImplementation(async (payload: workflow.ToolWorkflowInput) => { active.toolKey = payload.tool; return active; }) };
    const retryMutation = { isPending: false, mutateAsync: jest.fn().mockResolvedValue(active) };
    const quote = jest.fn().mockResolvedValue({ total: 2 });
    const confirm = jest.fn().mockReturnValue(true);
    const open = jest.fn();
    const replaceState = jest.fn();
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
    }, { ...environment.globals, URLSearchParams, window: { confirm, open, location: { search, pathname: "/extension/image-studio/studio" }, history: { replaceState } } });
    const render = () => nodes(view.render());
    if (enterCreation && !search) render().find((node) => node.type === "Navigation")!.props.onNavigate("create", "main");
    return { ...view, ...environment, render, capability, capabilityQuery, active, items, query, mutation, toolMutation, retryMutation, quote, confirm, open, replaceState, preferences };
}

describe("workspace asset application routing", () => {
    const record = { id: image(4).id, kind: "model", name: "Portrait", prompt: "", imageIds: [image(1).id], version: 1, createdAt: "2026-11-06", updatedAt: "2026-11-06" };
    const assetView = (view: ReturnType<typeof workspace>) => view.render().find((node) => node.type === "./assets")!;
    const creativeForm = (view: ReturnType<typeof workspace>) => view.render().find((node) => node.type === "./tool-form" && node.props.tool === "creative")!;
    it("copies requests to creative only, settles once, and never submits automatically", async () => {
        const view = workspace();
        const candidate = { ...record, imageIds: [...record.imageIds] };
        const pending = assetView(view).props.onUse(candidate);
        candidate.imageIds.length = 0;
        const form = creativeForm(view);
        expect(form.props.requestedAsset.asset.imageIds).toEqual(record.imageIds);
        expect(view.render().filter((node) => node.type === "./tool-form" && node.props.tool !== "creative").every((node) => !node.props.requestedAsset)).toBe(true);
        form.props.onAssetConsumed(form.props.requestedAsset.requestId, true);
        form.props.onAssetConsumed(form.props.requestedAsset.requestId, false, "late failure");
        await expect(pending).resolves.toBe(true);
        expect(creativeForm(view).props.requestedAsset).toBeNull();
        expect(view.mutation.mutateAsync).not.toHaveBeenCalled(); expect(view.toolMutation.mutateAsync).not.toHaveBeenCalled();
    });
    it("settles navigation cancellation and owning-form rejection while preserving image-to-main routing", async () => {
        const view = workspace();
        const pending = assetView(view).props.onUse(record);
        view.render().find((node) => node.type === "Navigation")!.props.onNavigate("materials");
        await expect(pending).resolves.toBe(false);
        const failed = assetView(view).props.onUse(record);
        const rejection = expect(failed).rejects.toThrow("missing image");
        const form = creativeForm(view);
        form.props.onAssetConsumed(form.props.requestedAsset.requestId, false, "missing image");
        await rejection;
        expect(view.render().some((node) => node.props.role === "status" && text(node).includes("missing image"))).toBe(true);
        assetView(view).props.onUseImage(image(2));
        const mainForm = view.render().find((node) => node.type === "./main-image-form")!;
        expect(mainForm.props.requestedMaterial.image.id).toBe(image(2).id);
    });
    it("rejects unsettled capabilities and releases a pending request on unmount", async () => {
        const view = workspace(); view.capabilityQuery.isFetching = true;
        await expect(assetView(view).props.onUse(record)).rejects.toThrow("能力尚未就绪");
        view.capabilityQuery.isFetching = false; view.render(); view.commit();
        const pending = assetView(view).props.onUse(record); view.dispose();
        await expect(pending).resolves.toBe(false);
    });
});

describe("workspace overview data", () => {
    function overview() {
        const navigation = harness("workspace-navigation").exports;
        const profile = { data: { nickname: "Test seller", avatar: "/avatar.png" }, refetch: jest.fn() };
        const balance: any = { isSuccess: true, data: { balance: 95 }, refetch: jest.fn() };
        const ledger: any = { isSuccess: true, data: { items: [
            { id: "expense", action: 2, changeAmount: 5, consumeSourceDesc: "Image Studio", createdAt: "2026-11-05T12:00:00Z" },
            { id: "income", action: 1, changeAmount: 100, accountTypeDesc: "Recharge", createdAt: "2026-11-04T12:00:00Z" },
        ] }, refetch: jest.fn() };
        const recent: any = { isSuccess: true, data: { items: [{ id: "saved", toolKey: "main", count: 1, status: "completed", images: [{ url: "never-use-public-url" }], createdAt: "2026-11-05T12:00:00Z" }] }, refetch: jest.fn() };
        const config = { membership: false, recharge: false };
        const history = jest.fn(() => recent), load = jest.fn().mockReturnValue(jest.fn()), action = jest.fn();
        const view = harness("workspace-overview", {
            "./workspace-navigation": navigation,
            "./workspace-account": { requestAccountAction: action },
            "@buildingai/services/shared": { useUserInfoQuery: () => profile },
            "@buildingai/services/web": { useUserAccountLogQuery: () => ledger, useRechargeCenterQuery: () => ({ data: { rechargeStatus: config.recharge } }) },
            "@buildingai/stores": { useAuthStore: (selector: any) => selector({ auth: { userInfo: { id: "owner" } } }), useConfigStore: (selector: any) => selector({ config: { websiteConfig: { features: { membership: config.membership } } } }) },
            "../services/generation": { useCreditBalanceQuery: () => balance, useGenerationHistoryQuery: history, loadGenerationThumbnail: load },
        });
        const props = { onNavigate: jest.fn(), onOpenTask: jest.fn() };
        const render = () => nodes(view.render(props));
        return { ...view, profile, balance, ledger, recent, config, history, load, action, props, renderComponent: view.render, render };
    }
    it("uses existing tool and account routes with real balance and correctly signed ledger data", () => {
        const view = overview();
        const cards = view.render().filter((node) => node.type === "button" && node.props.className?.startsWith("overview-tool "));
        expect(cards).toHaveLength(21);
        for (const card of cards) { card.props.onClick(); expect(view.props.onNavigate).toHaveBeenLastCalledWith("create", card.key); }
        expect(view.render().filter((node) => node.props.role === "status").map(text)).toEqual(["95", "5"]);
        expect(text(view.render())).toContain("+100"); expect(text(view.render())).toContain("-5");
        expect(text(view.render())).toContain("最近 2 条积分变动");
        view.render().find((node) => node.type === "button" && text(node).includes("编辑资料"))!.props.onClick();
        view.render().find((node) => node.type === "button" && text(node).includes("积分明细"))!.props.onClick();
        view.render().find((node) => node.type === "button" && text(node).includes("查看钱包"))!.props.onClick();
        expect(view.action.mock.calls).toEqual([["profile"], ["credits"], ["wallet"]]);
        expect(view.render().some((node) => node.props.src === "never-use-public-url")).toBe(false);
    });
    it("filters the tool matrix without changing direct creation routes or account data", () => {
        const view = overview();
        const cards = () => view.render().filter((node) => node.type === "button" && node.props.className?.startsWith("overview-tool "));
        const filter = (name: string) => view.render().find((node) => node.type === "button" && node.props["aria-pressed"] !== undefined && text(node).startsWith(name))!;
        for (const [group, count] of [["电商生图", 6], ["AI 修图", 7], ["服饰穿戴", 8], ["全部工具", 21]] as const) {
            filter(group).props.onClick();
            expect(cards()).toHaveLength(count);
            expect(filter(group).props["aria-pressed"]).toBe(true);
            for (const card of cards()) {
                card.props.onClick();
                expect(view.props.onNavigate).toHaveBeenLastCalledWith("create", card.key);
            }
            expect(view.render().filter((node) => node.props.role === "status").map(text)).toEqual(["95", "5"]);
        }
    });
    it("opens the existing main image workflow from the quick creation shortcut", () => {
        const view = overview();
        view.render().find((node) => node.type === "button" && node.props.className === "overview-quick-create")!.props.onClick();
        expect(view.props.onNavigate).toHaveBeenCalledWith("create", "main");
        expect(view.props.onOpenTask).not.toHaveBeenCalled();
    });
    it("keeps recent history on page one and opens details without creating a task", () => {
        const view = overview();
        const task = view.render().find((node) => node.props.className === "overview-task")!;
        task.props.onClick(); expect(view.props.onOpenTask).toHaveBeenCalledWith(view.recent.data.items[0]);
        expect(view.history).toHaveBeenLastCalledWith(1, 5);
        view.render().find((node) => node.type === "button" && text(node).includes("查看全部"))!.props.onClick();
        expect(view.props.onNavigate).toHaveBeenLastCalledWith("history");
        for (const status of ["queued", "processing", "completed", "failed", "cancelled"]) {
            view.recent.data.items[0].status = status;
            expect(view.render().find((node) => node.props.className === `overview-task-status ${status}`)).toBeDefined();
        }
    });
    it("provides all eight apparel overview entries with domain media, labels and direct routes", () => {
        const view = overview();
        const cards = view.render().filter((node) => apparelContract.APPAREL_KEYS.includes(node.key as apparelContract.ApparelToolKey));
        expect(cards.map((node) => node.key)).toEqual(apparelContract.APPAREL_KEYS);
        for (const card of cards) {
            expect(text(card)).toContain("服饰穿戴");
            expect(card.props["aria-label"]).toBe(harness("workspace-navigation").exports.TOOL_LABELS[card.key!]);
            const image = card.key === "dewrinkle" ? apparelWorkflow.APPAREL_PREVIEW_IMAGES.dewrinkle : `/extension/image-studio/images/console-${card.key}.jpg`;
            expect(nodes(card).filter((node) => node.type === "img").map((node) => node.props.src)).toEqual([image]);
            card.props.onClick(); expect(view.props.onNavigate).toHaveBeenLastCalledWith("create", card.key);
        }
    });
    it("distinguishes loading, errors and empty results rather than displaying invented zero values", () => {
        const view = overview();
        view.balance.isSuccess = view.ledger.isSuccess = view.recent.isSuccess = false;
        expect(view.render().filter((node) => node.type === "strong" && node.props.role === "status").map(text)).toEqual(["加载中", "加载中"]);
        expect(text(view.render())).toContain("正在加载最近任务");
        view.balance.isError = view.ledger.isError = view.recent.isError = true;
        expect(view.render().filter((node) => node.props.role === "alert")).toHaveLength(2);
        view.render().find((node) => node.type === "button" && text(node).includes("重新查询"))!.props.onClick();
        expect(view.balance.refetch).toHaveBeenCalledTimes(1);
        view.render().filter((node) => node.type === "button" && text(node).includes("重新加载")).forEach((node) => node.props.onClick());
        expect(view.ledger.refetch).toHaveBeenCalledTimes(1); expect(view.recent.refetch).toHaveBeenCalledTimes(1);
        view.ledger.isError = view.recent.isError = false; view.ledger.isSuccess = view.recent.isSuccess = true;
        view.ledger.data.items = []; view.recent.data.items = [];
        expect(text(view.render())).toContain("暂无积分变动"); expect(text(view.render())).toContain("暂无创作任务");
    });
    it("only exposes membership and recharge actions when enabled", () => {
        const view = overview();
        expect(text(view.render())).not.toContain("查看会员");
        view.config.membership = true;
        view.render().find((node) => node.type === "button" && text(node).includes("查看会员"))!.props.onClick();
        expect(view.action).toHaveBeenLastCalledWith("subscribe");
        view.config.membership = false; view.config.recharge = true;
        view.render().find((node) => node.type === "button" && text(node).includes("积分充值"))!.props.onClick();
        expect(view.action).toHaveBeenLastCalledWith("wallet");
        expect(view.exports.overviewTime("invalid")).toBe("时间未知");
    });
    it("cleans up protected thumbnails and never shows a previous task image", () => {
        const view = overview();
        const task = view.recent.data.items[0];
        const render = () => nodes(view.renderComponent({ task }, view.exports.RecentTaskImage));
        render(); view.commit();
        expect(view.load).toHaveBeenCalledWith("saved", 0, "api", expect.any(Function), expect.any(Function), "owner");
        view.load.mock.calls[0][3]({ url: "blob:owned" });
        expect(render().find((node) => node.type === "img")!.props.src).toBe("blob:owned");
        const images = task.images; task.images = [];
        expect(render().some((node) => node.type === "img")).toBe(false);
        task.images = images;
        task.id = "other"; expect(render().some((node) => node.type === "img")).toBe(false);
        view.commit(); expect(view.load.mock.results[0].value).toHaveBeenCalledTimes(1);
        view.load.mock.calls[1][4]();
        expect(render().find((node) => node.props["aria-label"] === "图片加载失败")).toBeDefined();
        task.images = []; render(); view.commit(); expect(view.load).toHaveBeenCalledTimes(2);
        view.dispose();
    });
});

describe("workspace integration", () => {
    it("defaults to the overview but preserves direct task entry and creation navigation", () => {
        const view = workspace("", false);
        expect(view.render().find((node) => node.type === "Navigation")!.props.view).toBe("overview");
        const overview = view.render().find((node) => node.type === "./workspace-overview")!;
        expect(view.render().find((node) => node.type === "./main-image-form")!.props.locked).toBe(true);
        overview.props.onNavigate("create", "redraw");
        expect(view.render().find((node) => node.type === "Navigation")!.props).toEqual(expect.objectContaining({ view: "create", tool: "redraw" }));
        view.render().find((node) => node.type === "Navigation")!.props.onNavigate("overview");
        view.render().find((node) => node.type === "./workspace-overview")!.props.onOpenTask({ id: "selected-task" });
        expect(view.open).toHaveBeenCalledWith("/extension/image-studio/studio?task=selected-task", "_blank", "noopener,noreferrer");
        expect(view.render().find((node) => node.type === "Navigation")!.props.view).toBe("overview");
        expect(view.mutation.mutateAsync).not.toHaveBeenCalled();
        expect(view.toolMutation.mutateAsync).not.toHaveBeenCalled();
        expect(workspace("?task=33333333-3333-4333-8333-333333333333", false).render().find((node) => node.type === "Navigation")!.props.view).toBe("create");
    });
    it.each(["main", "creative", "redraw", "cutout"])("opens the selected %s work in a separate page without changing the original workbench", (toolKey) => {
        const view = workspace();
        const generation = { ...view.active, id: "older-work", toolKey, status: "completed", prompt: "Selected work prompt",
            size: "1024x1024", billingStatus: "free", images: [{ url: "protected" }] };
        view.render().find((node) => node.type === "Navigation")!.props.onNavigate("works");
        const gallery = view.render().find((node) => node.type === "./works")!;
        const tile = gallery.props.renderImage({ generation, index: 0 });
        expect(tile.props.generationId).toBe("older-work");
        expect(tile.props.imageIndex).toBe(0);
        tile.props.onDetails();
        const rendered = view.render();
        expect(view.open).toHaveBeenCalledWith("/extension/image-studio/studio?task=older-work", "_blank", "noopener,noreferrer");
        expect(rendered.find((node) => node.type === "Navigation")!.props).toEqual(expect.objectContaining({ view: "works", tool: "main" }));
        expect(rendered.some((node) => node.props.className === "result-prompt")).toBe(false);
        expect(rendered.some((node) => node.props.className === "regional-canvas-host")).toBe(false);
        expect(view.query).toHaveBeenLastCalledWith(undefined);
        expect(view.mutation.mutateAsync).not.toHaveBeenCalled();
        expect(view.toolMutation.mutateAsync).not.toHaveBeenCalled();
    });

    it("loads a direct task independently of history and rejects invalid task IDs", () => {
        const id = "33333333-3333-4333-8333-333333333333";
        const view = workspace(`?task=${id}`);
        const generation = { ...view.active, id, toolKey: "cutout", status: "completed", prompt: "Saved task", images: [{ url: "protected" }], billingStatus: "free" };
        view.query.mockReturnValue({ data: generation });
        view.render(); view.commit();
        expect(view.query).toHaveBeenLastCalledWith(id);
        expect(view.render().some((node) => node.props.className === "result-prompt")).toBe(false);
        expect(text(view.render())).not.toContain("Saved task");
        expect(view.render().find((node) => node.type === "Navigation")!.props.tool).toBe("cutout");
        expect(view.render().find((node) => node.type === "./tool-form" && node.props.tool === "cutout")!.props.taskSnapshot).toBe(generation);
        const stage = view.render().find((node) => node.props.className === "res-grid result-image-stage")!;
        expect(nodes(stage).find((node) => node.props.generationId === id)!.props.previewSize).toBe(generation.size);
        expect(view.items).toHaveLength(0);
        view.render().find((node) => node.type === "button" && text(node) === "返回创作")!.props.onClick();
        expect(view.replaceState).toHaveBeenCalledWith(null, "", "/extension/image-studio/studio");
        view.render(); expect(view.query).toHaveBeenLastCalledWith(undefined);
        const invalid = workspace("?task=../private");
        expect(text(invalid.render())).toContain("任务链接无效");
        expect(invalid.query).toHaveBeenLastCalledWith(undefined);
        expect(view.toolMutation.mutateAsync).not.toHaveBeenCalled();
    });

    it("shows direct-detail loading, missing and error states without using unrelated history", async () => {
        const id = "33333333-3333-4333-8333-333333333333";
        const view = workspace(`?task=${id}`);
        view.query.mockReturnValue({ data: undefined, isPending: true } as any);
        expect(text(view.render())).toContain("正在加载任务详情");
        view.query.mockReturnValue({ data: undefined, isSuccess: true } as any);
        expect(text(view.render())).toContain("任务不存在或已删除");
        view.query.mockReturnValue({ data: undefined, isError: true } as any);
        expect(text(view.render())).toContain("任务状态加载失败");
        const generation = { ...view.active, id, status: "completed", toolKey: "creative", prompt: "Owned task", images: [{ url: "protected" }] };
        view.query.mockReturnValue({ data: generation }); view.render(); view.commit();
        await view.render().find((node) => node.props["aria-label"] === "删除记录")!.props.onClick();
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(view.mutation.mutateAsync).toHaveBeenCalledWith(id);
        view.render(); expect(view.query).toHaveBeenLastCalledWith(undefined);
        expect(view.replaceState).toHaveBeenCalledWith(null, "", "/extension/image-studio/studio");
    });

    it("uses the loaded protected image for explicit work preview, supports closing, and preserves task access on image failure", () => {
        const load = jest.fn().mockReturnValue(jest.fn());
        const view = harness("index", { "../services/generation": { loadGenerationImage: load } });
        const props = { generationId: "work", imageIndex: 1, caption: "2", onDetails: jest.fn(), onDownload: jest.fn() };
        const render = () => nodes(view.render(props, view.exports.ResultTile));
        const preview = () => render().find((node) => node.type === "button" && text(node) === "预览大图")!;
        render().find((node) => node.props.onMouseEnter)!.props.onMouseEnter();
        expect(render().find((node) => node.props.onMouseEnter)!.props.className).toBe("rtile peek");
        expect(preview().props.disabled).toBe(true);
        const dialog = { showModal: jest.fn(), close: jest.fn() };
        render().find((node) => node.type === "dialog")!.props.ref.current = dialog;
        view.commit();
        expect(load).toHaveBeenCalledWith("work", 1, "api", expect.any(Function), expect.any(Function));
        load.mock.calls[0][3]({ blob: {}, url: "blob:owned-image" });
        expect(preview().props.disabled).toBe(false);
        preview().props.onClick();
        expect(dialog.showModal).toHaveBeenCalledTimes(1);
        render().find((node) => node.props["aria-label"] === "关闭预览")!.props.onClick();
        expect(dialog.close).toHaveBeenCalledTimes(1);
        expect(load).toHaveBeenCalledTimes(1);
        props.generationId = "failed-work";
        render(); view.commit(); load.mock.calls[1][4]();
        expect(preview().props.disabled).toBe(true);
        render().find((node) => node.type === "button" && text(node) === "任务详情")!.props.onClick();
        expect(props.onDetails).toHaveBeenCalledTimes(1);
        expect(props.onDownload).not.toHaveBeenCalled();
        view.dispose();
    });

    it("defers list images until visible and downloads the separately requested original, never the thumbnail", () => {
        const thumbnail = jest.fn().mockReturnValue(jest.fn());
        const original = jest.fn().mockReturnValue(jest.fn());
        let start: () => () => void;
        let release: (() => void) | undefined;
        const view = harness("index", { "../services/generation": {
            loadGenerationThumbnail: thumbnail, loadGenerationImage: original,
            loadWhenVisible: (_target: any, load: () => () => void) => { start = () => (release = load()); return () => release?.(); },
        } });
        const props = { thumbnail: true, generationId: "work", imageIndex: 1, caption: "2", onDownload: jest.fn() };
        const render = () => nodes(view.render(props, view.exports.ResultTile));
        const dialog = { showModal: jest.fn(), close: jest.fn() };
        render().find((node) => node.type === "dialog")!.props.ref.current = dialog;
        view.commit(); expect(thumbnail).not.toHaveBeenCalled(); expect(original).not.toHaveBeenCalled();
        start!(); expect(thumbnail).toHaveBeenCalledTimes(1);
        const small = { blob: { size: 100 }, url: "blob:thumbnail" };
        thumbnail.mock.calls[0][3](small);
        render().find((node) => node.props.title === "下载")!.props.onClick();
        render(); view.commit(); expect(original).toHaveBeenCalledTimes(1);
        expect(props.onDownload).not.toHaveBeenCalled();
        const full = { blob: { size: 5000000 }, url: "blob:original" };
        original.mock.calls[0][3](full);
        expect(props.onDownload).toHaveBeenCalledWith(full.blob, full.url);
        expect(props.onDownload).not.toHaveBeenCalledWith(small.blob, small.url);
        const image = render().find((node) => node.props.className === "result-preview")!;
        image.props.onClick(); expect(dialog.showModal).toHaveBeenCalledTimes(1);
        expect(render().filter((node) => node.type === "img").map((node) => node.props.src)).toEqual(["blob:thumbnail", "blob:original"]);
        view.dispose(); expect(thumbnail.mock.results[0].value).toHaveBeenCalledTimes(1);
        expect(original.mock.results[0].value).toHaveBeenCalledTimes(1);
    });

    it("quotes and retries ten SKU outputs only when the stored regional contract is valid", async () => {
        const view = workspace();
        view.capability.tools.push({ key: "sku", status: "available", requiredCapabilities: ["reference-image"], modelIdsByCapability: { "reference-image": [modelId] }, limits: { maxInputImages: 5 } });
        const toolInput: workflow.ToolWorkflowInput = { tool: "sku", modelId, count: 10, assetIds: [image(1).id], instructions: "", ratio: "1:1", design: {
            skuRegions: [{ id: "region-1", region: { x: .1, y: .1, width: .2, height: .2 } }],
            skuVariants: Array.from({ length: 10 }, (_value, index) => ({ name: `SKU ${index + 1}`, instruction: "", edits: [{ regionId: "region-1", instruction: "Make green" }] })),
        } };
        Object.assign(view.active, { toolKey: "sku", toolInput, modelId, count: 10, status: "failed" }); view.items.push(view.active);
        view.render().find((node) => node.type === "Navigation")!.props.onNavigate("history", "sku");
        const retry = () => view.render().find((node) => node.type === "button" && text(node) === "重试")!;
        expect(retry().props.disabled).toBe(false);
        view.active.toolInput = { ...toolInput, count: 1 }; expect(retry().props.disabled).toBe(true);
        view.active.toolInput = toolInput; expect(retry().props.disabled).toBe(false);
        retry().props.onClick(); await new Promise<void>((resolve) => setImmediate(resolve));
        expect(view.quote).toHaveBeenCalledWith(modelId, 10, "sku");
        expect(view.retryMutation.mutateAsync).toHaveBeenCalledWith("active");
    });

    it.each(["watermark", "expand", "sku", "redraw", "cutout", "recolor"] as const)("returns to %s editing on submission failure, but opens history as a result", async (tool) => {
        const view = workspace();
        const selectedModel = tool === "cutout" ? LOCAL_CUTOUT_MODEL_ID : modelId;
        const required = tool === "cutout" ? "segmentation" : "reference-image";
        if (tool === "cutout") view.capability.models.push({ id: selectedModel, capabilities: [required], maxReferenceImages: 1 });
        view.capability.tools.push({ key: tool, status: "available", requiredCapabilities: [required],
            modelIdsByCapability: { [required]: [selectedModel] }, limits: { maxInputImages: 1 } });
        view.render().find((node) => node.type === "Navigation")!.props.onNavigate("create", tool);
        const host = tool === "expand" ? "expansion-canvas-host" : tool === "sku" ? "sku-canvas-host" : tool === "redraw" || tool === "cutout" || tool === "recolor" ? "regional-canvas-host" : "watermark-canvas-host";
        const form = () => view.render().find((node) => node.type === "./tool-form" && node.props.tool === tool)!;
        const payload: workflow.ToolWorkflowInput = { tool, modelId: selectedModel, assetIds: [image(1).id], instructions: tool === "redraw" ? "Change to black" : "", count: 1, ratio: "1:1",
            ...(tool === "recolor" ? { design: { productColor: "#a52639" } } : tool === "redraw" ? { design: { redrawRegions: [{ x: .1, y: .1, width: .2, height: .2 }] } } : tool === "cutout" ? { design: { backgroundColor: null } } : tool === "sku" ? { design: { skuRegions: [{ id: "region-1", region: { x: .1, y: .1, width: .2, height: .2 } }], skuVariants: [{ name: "Green", instruction: "", edits: [{ regionId: "region-1", instruction: "Make green" }] }] } } :
                tool === "expand" ? { expansion: "surround", design: { expandScale: 80, expandPosition: "center" } } : { authorized: true, design: { watermarkRegions: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.2 }] } }) };
        view.active.status = "completed";
        await form().props.onSubmit(payload);
        expect(view.render().some((node) => node.props.className === host)).toBe(false);
        form().props.onEditSource();
        expect(view.render().some((node) => node.props.className === host)).toBe(true);
        view.toolMutation.mutateAsync.mockRejectedValueOnce(new Error("Submit failed"));
        await expect(form().props.onSubmit(payload)).rejects.toThrow("Submit failed");
        expect(view.render().some((node) => node.props.className === host)).toBe(true);
        view.items.push({ ...view.active, status: "completed", prompt: "Watermark history" });
        view.render().find((node) => node.type === "Navigation")!.props.onNavigate("history");
        view.render().find((node) => node.props.className === "history-open")!.props.onClick();
        view.render().find((node) => node.type === "Navigation")!.props.onNavigate("create", tool);
        expect(view.render().some((node) => node.props.className === host)).toBe(false);
    });
    it.each(["detail", "replica", "creative", "fusion", "sku", "retouch", "redraw", "cutout", "recolor"])("does not carry main results into the %s column", async (tool) => {
        const view = workspace();
        view.active.status = "completed";
        view.active.images = [{}];
        view.active.prompt = "Main result only";
        await view.render().find((node) => node.type === "./main-image-form")!.props.onSubmit(input());
        const navigate = (nextTool: string) => view.render().find((node) => node.type === "Navigation")!.props.onNavigate("create", nextTool);
        expect(view.render().some((node) => node.props.generationId === "active")).toBe(true);
        navigate(tool);
        const rendered = view.render();
        expect(rendered.some((node) => node.props.generationId === "active")).toBe(false);
        expect(rendered.some((node) => node.props.className === "result-prompt")).toBe(false);
        expect(rendered.some((node) => tool === "retouch" ? node.type === "RetouchPreview" : tool === "sku" ? node.props.className === "sku-canvas-host" : tool === "redraw" || tool === "cutout" || tool === "recolor" ? node.props.className === "regional-canvas-host" : String(node.props.className).includes("preview-empty-state"))).toBe(true);
        expect(rendered.find((node) => node.props.className === "canvas")!.props["data-empty"]).toBe(true);
        navigate("main");
        expect(view.render().some((node) => node.props.generationId === "active")).toBe(true);
    });
    it.each(["queued", "processing"])("tracks a %s task without showing its progress in another column", async (status) => {
        const view = workspace();
        view.active.status = status;
        await view.render().find((node) => node.type === "./main-image-form")!.props.onSubmit(input());
        view.render().find((node) => node.type === "Navigation")!.props.onNavigate("create", "detail");
        let rendered = view.render();
        expect(view.query).toHaveBeenLastCalledWith("active");
        expect(rendered.some((node) => String(node.props.className).includes("generation-placeholder"))).toBe(false);
        expect(rendered.some((node) => String(node.props.className).includes("preview-empty-state"))).toBe(true);
        expect(rendered.find((node) => node.type === "./tool-form" && node.props.tool === "detail")!.props.locked).toBe(true);
        rendered.find((node) => node.props.className === "workspace-active-task")!.props.onClick();
        rendered = view.render();
        expect(rendered.find((node) => node.type === "Navigation")!.props.tool).toBe("main");
        expect(rendered.some((node) => String(node.props.className).includes("generation-placeholder"))).toBe(true);
        view.render().find((node) => node.type === "Navigation")!.props.onNavigate("create", "detail");
        view.active.status = "completed";
        view.active.images = [{}];
        rendered = view.render();
        expect(rendered.some((node) => node.props.generationId === "active")).toBe(false);
        expect(rendered.find((node) => node.type === "./tool-form" && node.props.tool === "detail")!.props.locked).toBe(false);
    });
    it.each(["completed", "failed", "cancelled"])("opens a %s historical result in its owning column", (status) => {
        const view = workspace();
        view.items.push({ ...view.active, id: "detail-history", toolKey: "detail", status, prompt: "Detail result only" });
        view.render().find((node) => node.type === "Navigation")!.props.onNavigate("history");
        view.render().find((node) => node.props.className === "history-open")!.props.onClick();
        let rendered = view.render();
        expect(rendered.find((node) => node.type === "Navigation")!.props.tool).toBe("detail");
        expect(rendered.some((node) => node.props.className === "result-prompt")).toBe(false);
        expect(text(rendered)).not.toContain("Detail result only");
        rendered.find((node) => node.type === "Navigation")!.props.onNavigate("create", "main");
        rendered = view.render();
        expect(rendered.some((node) => node.props.className === "result-prompt")).toBe(false);
        expect(rendered.some((node) => String(node.props.className).includes("preview-empty-state"))).toBe(true);
    });
    it("keeps legacy records in the creative column rather than leaking into main", () => {
        const view = workspace();
        view.items.push({ ...view.active, toolKey: undefined, status: "completed", prompt: "Legacy creative" });
        view.render().find((node) => node.type === "Navigation")!.props.onNavigate("history");
        view.render().find((node) => node.props.className === "history-open")!.props.onClick();
        expect(view.render().find((node) => node.type === "Navigation")!.props.tool).toBe("creative");
        expect(view.render().some((node) => node.props.className === "result-prompt")).toBe(false);
        expect(text(view.render())).not.toContain("Legacy creative");
    });
    it("keeps a late main submission result out of the newly selected column", async () => {
        const view = workspace();
        let finish!: (value: any) => void;
        view.mutation.mutateAsync.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
        const submission = view.render().find((node) => node.type === "./main-image-form")!.props.onSubmit(input());
        view.mutation.isPending = true;
        view.render().find((node) => node.type === "Navigation")!.props.onNavigate("create", "detail");
        let rendered = view.render();
        expect(rendered.some((node) => String(node.props.className).includes("generation-placeholder"))).toBe(false);
        expect(rendered.some((node) => node.props.className === "workspace-active-task")).toBe(true);
        view.active.status = "completed";
        view.active.images = [{}];
        view.mutation.isPending = false;
        finish(view.active);
        await submission;
        rendered = view.render();
        expect(view.query).toHaveBeenLastCalledWith("active");
        expect(rendered.some((node) => node.props.generationId === "active")).toBe(false);
        expect(rendered.some((node) => String(node.props.className).includes("preview-empty-state"))).toBe(true);
    });
    it("selects the owning column when retrying directly from history", async () => {
        const view = workspace();
        view.items.push({ ...view.active, status: "failed", size: "2048x2048", modelId, prompt: "Retry main" });
        view.render().find((node) => node.type === "Navigation")!.props.onNavigate("history", "creative");
        view.render().find((node) => node.type === "button" && text(node) === "重试")!.props.onClick();
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(view.retryMutation.mutateAsync).toHaveBeenCalledWith("active");
        expect(view.render().find((node) => node.type === "Navigation")!.props.tool).toBe("main");
        expect(view.render().some((node) => String(node.props.className).includes("generation-placeholder"))).toBe(true);
    });
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
        find("./assets").props.onUseImage(image(1));
        const first = find("./main-image-form").props.requestedMaterial;
        find("Navigation").props.onNavigate("materials");
        find("./assets").props.onUseImage(image(2));
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
        expect(supports({ ...record, count: 10, mainInput: { ...input(), counts: { white: 1, scene: 1, selling: 8, other: 0 } } })).toBe(true);
        expect(supports({ ...record, count: 11, mainInput: { ...input(), counts: { white: 1, scene: 1, selling: 9, other: 0 } } })).toBe(false);
        expect(supports({ ...record, count: Number.MAX_SAFE_INTEGER + 1, mainInput: { ...input(), counts: { white: Number.MAX_SAFE_INTEGER + 1, scene: 0, selling: 0, other: 0 } } })).toBe(false);
        for (const productName of ["", " "]) expect(supports({ ...record, mainInput: { ...input(), productName } })).toBe(true);
        for (const change of [{ counts: undefined }, { counts: { white: -1, scene: 2, selling: 0, other: 0 } }, { counts: { white: 1.5, scene: 0, selling: 0, other: 0 } }, { assetIds: [] }, { assetIds: ["invalid"] }, { assetIds: [image(1).id, image(1).id] }, { modelId: "other" }, { productName: null }, { productName: "x".repeat(101) }, { resolution: "8K" }, { ratio: "bad" }]) expect(supports({ ...record, mainInput: { ...input(), ...change } })).toBe(false);
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

describe("owning-page apparel integration", () => {
    function apparelPage(tool: apparelContract.ApparelToolKey) {
        const view = creativeWorkspace();
        view.capability.models[0].capabilities.push("multi-image");
        view.capability.tools.push(...apparelContract.APPAREL_KEYS.map((key) => ({ key, status: "available", requiredCapabilities: TOOL_REGISTRY[key].requiredCapabilities,
            modelIdsByCapability: { "reference-image": [modelId], "multi-image": [modelId] }, limits: { maxInputImages: 5 } })));
        view.navigate("create", tool);
        const payload: workflow.ToolWorkflowInput = tool === "apparel_sku" ? { tool, modelId, count: 10, assetIds: [image(1).id], instructions: "", ratio: "1:1", design: {
            apparel: { sourceAssetIds: [image(1).id] },
            skuRegions: [{ id: "region-1", region: { x: .1, y: .1, width: .2, height: .2 } }],
            skuVariants: Array.from({ length: 10 }, (_value, index) => ({ name: `SKU ${index + 1}`, instruction: "", edits: [{ regionId: "region-1", instruction: "Make green" }] })),
        } } : apparelWorkflow.buildApparelInput({ ...apparelWorkflow.createApparelDraft(tool), modelId, sourceAssetIds: [image(1).id], instructions: "Apparel request",
            ...(tool === "fabric" ? { category: "Shirt", garmentDescription: "Long sleeves" } : {}),
            ...(["tryon", "model_swap"].includes(tool) ? { target: { modelAssetId: image(9).id, modelImageId: image(2).id } } : {}),
        }, view.capability, [{ id: image(9).id, kind: "model", name: "Saved", imageIds: [image(2).id] }] as any, [image(1), image(2)] as any);
        Object.assign(view.active, { toolKey: tool, toolInput: payload, count: payload.count, modelId });
        const form = () => view.form(tool);
        const host = tool === "apparel_sku" ? "sku-canvas-host" : "apparel-canvas-host";
        return { ...view, form, payload, host };
    }
    it.each(apparelContract.APPAREL_KEYS)("keeps %s originals, result, edits and active-task locks in their owning column", async (tool) => {
        const view = apparelPage(tool), target = {};
        view.render().find((node) => node.props.className === view.host)!.props.ref(target);
        expect(view.form().props.annotationTarget).toBe(target);
        expect(view.render().filter((node) => node.type === "./tool-form" && node.props.tool !== tool && node.props.annotationTarget)).toHaveLength(0);
        await view.form().props.onSubmit(view.payload); expect(view.toolMutation.mutateAsync).toHaveBeenCalledWith(view.payload);
        expect(view.form().props.locked).toBe(true); expect(view.query).toHaveBeenCalledWith("active");
        expect(view.render().some((node) => String(node.props.className).includes("generation-placeholder"))).toBe(true);
        view.navigate("create", "main");
        expect(view.render().some((node) => String(node.props.className).includes("generation-placeholder"))).toBe(false);
        expect(view.form().props.annotationTarget).toBeNull(); expect(view.render().some((node) => node.props.className === "workspace-active-task")).toBe(true);
        view.active.status = "completed"; view.active.images = [{}]; view.navigate("create", tool);
        expect(view.form().props.taskSnapshot).toBe(view.active); expect(view.render().some((node) => node.props.className === "result-prompt")).toBe(false);
        view.form().props.onEditSource(); expect(view.render().some((node) => node.props.className === view.host)).toBe(true);
        expect(view.render().some((node) => node.props.className === "result-prompt")).toBe(false);
        view.form().props.onOpenAssets(); expect(view.render().find((node) => node.type === "Navigation")!.props.view).toBe("materials");
        expect(view.form().props.locked).toBe(true); expect(view.form().props.annotationTarget).toBeNull();
        expect(view.toolMutation.mutateAsync).toHaveBeenCalledTimes(1);
    });
    it.each(apparelContract.APPAREL_KEYS)("opens %s history with only its matching snapshot and retains explicit retry billing", async (tool) => {
        const view = apparelPage(tool);
        const record = { ...view.active, toolKey: tool, toolInput: view.payload, status: "failed", count: view.payload.count, modelId, prompt: "Saved apparel" };
        view.items.push(record); view.navigate("history", tool); expect(view.retryButton().props.disabled).toBe(false);
        view.retryButton().props.onClick(); await new Promise<void>((resolve) => setImmediate(resolve));
        expect(view.quote).toHaveBeenCalledWith(modelId, view.payload.count, ...(tool === "apparel_sku" ? ["apparel_sku"] : []));
        expect(view.retryMutation.mutateAsync).toHaveBeenCalledWith(record.id);
        view.active.status = "failed"; view.navigate("history", tool);
        view.render().find((node) => node.props.className === "history-open")!.props.onClick();
        expect(view.form().props.taskSnapshot).toBe(record); expect(view.render().some((node) => node.props.className === "result-prompt")).toBe(false);
        expect(view.render().filter((node) => node.type === "./tool-form" && node.props.tool !== tool && node.props.taskSnapshot)).toHaveLength(0);
        view.navigate("create", "main"); expect(view.form().props.taskSnapshot).toBeNull();
    });
    it.each(["count", "discriminator", "geometry", "authorization"])("blocks malformed apparel SKU %s at the owning retry boundary", (reason) => {
        const view = apparelPage("apparel_sku"), payload = view.payload;
        if (reason === "count") payload.count = 1;
        if (reason === "discriminator") payload.tool = "sku";
        if (reason === "geometry") payload.design!.skuRegions![0].region.width = 0;
        if (reason === "authorization") view.capability.models[0].capabilities = [];
        view.items.push({ ...view.active, toolKey: "apparel_sku", toolInput: payload, status: "failed", count: 10, modelId }); view.navigate("history");
        expect(view.retryButton().props.disabled).toBe(true); view.retryButton().props.onClick(); expect(view.quote).not.toHaveBeenCalled();
    });
    it("restores apparel editing after submission failure without manufacturing a result", async () => {
        const view = apparelPage("tryon"); view.toolMutation.mutateAsync.mockRejectedValueOnce(new Error("Rejected task"));
        await expect(view.form().props.onSubmit(view.payload)).rejects.toThrow("Rejected task");
        expect(view.render().some((node) => node.props.className === view.host)).toBe(true);
        expect(view.render().some((node) => node.props.className === "result-prompt")).toBe(false);
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
    it("keeps late tool submission errors scoped to their original column", async () => {
        const view = creativeWorkspace();
        view.navigate("create", "creative");
        let reject!: (error: Error) => void;
        view.toolMutation.mutateAsync.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
        const submission = view.form().props.onSubmit(creativeInput());
        view.toolMutation.isPending = true;
        Object.assign(view.toolMutation, { variables: creativeInput() });
        view.navigate("create", "main");
        expect(view.render().some((node) => String(node.props.className).includes("generation-placeholder"))).toBe(false);
        expect(view.render().some((node) => node.props.className === "workspace-active-task")).toBe(true);
        view.toolMutation.isPending = false;
        reject(new Error("Creative submission failed"));
        await expect(submission).rejects.toThrow("Creative submission failed");
        expect(view.render().some((node) => node.props.role === "alert" && text(node).includes("Creative submission failed"))).toBe(false);
        expect(view.render().some((node) => String(node.props.className).includes("preview-empty-state"))).toBe(true);
        view.navigate("create", "creative");
        expect(view.render().some((node) => node.props.className === "result-prompt")).toBe(false);
    });
    it("keeps legacy and apparel keyed form slots stable across tools and workspace views", () => {
        const view = creativeWorkspace();
        const slots = () => view.render().filter((node) => node.props.className === "workspace-tool-form");
        const identity = slots().map((node) => [node.type, node.key, node.props.children.type, node.props.children.props.tool]);
        expect(identity.map((entry) => entry[1])).toEqual([...specializedWorkflow.SPECIALIZED_TOOLS, ...apparelContract.APPAREL_KEYS]);
        for (const [next, tool] of [...specializedWorkflow.SPECIALIZED_TOOLS.map((tool) => ["create", tool]), ...apparelContract.APPAREL_KEYS.map((tool) => ["create", tool]),
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