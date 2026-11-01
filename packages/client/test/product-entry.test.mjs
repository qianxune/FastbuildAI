import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath, URL, URLSearchParams } from "node:url";
import { runInNewContext } from "node:vm";

const require = createRequire(new URL("../package.json", import.meta.url));
const ts = require("typescript");
const filename = fileURLToPath(new URL("../src/pages/apps/entry-path.ts", import.meta.url));
const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const exports = {};
runInNewContext(outputText, { exports });
const { toAppPath } = exports;

const jsx = (type, props) => ({ type, props });
function loadComponent(relativePath, modules = {}, globals = {}) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8")
    .replaceAll("import.meta.env", "({ DEV: false })");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const exports = {};
  runInNewContext(outputText, {
    exports,
    require: (name) => name === "react/jsx-runtime" ? { jsx, jsxs: jsx } :
      modules[name] ?? { __esModule: true, default: name, LoginPage: "LoginPage", OAuthCallbackPage: "OAuthCallbackPage" },
    ...globals,
  });
  return exports;
}

const { router } = loadComponent("../src/router/index.tsx", {
  "react-router-dom": { createBrowserRouter: (routes) => routes },
});
const mainRoutes = router[0].children;
function findRoute(path, routes = mainRoutes, ancestors = []) {
  for (const route of routes) {
    if (route.path === path) return { route, ancestors };
    const found = findRoute(path, route.children ?? [], [...ancestors, route]);
    if (found) return found;
  }
}

test("product landing and studio paths stay at the product root", () => {
  for (const pathname of ["/", "/studio", "/studio/", "/studio/history"]) {
    assert.equal(toAppPath("image-studio", pathname, true), pathname);
  }
});

test("generic application navigation retains the original application prefix", () => {
  assert.equal(toAppPath("image-studio", "/studio", false), "/apps/image-studio/studio");
  assert.equal(toAppPath("simple-blog", "/posts/one", false), "/apps/simple-blog/posts/one");
});

test("non-product extension routes still use their original application entry", () => {
  assert.equal(toAppPath("image-studio", "/console/studio", true), "/apps/image-studio/console/studio");
  assert.equal(toAppPath("image-studio", "/studio-other", true), "/apps/image-studio/studio-other");
  assert.equal(toAppPath("simple-blog", "/", true), "/apps/simple-blog/");
});

test("invalid navigation messages cannot become parent routes", () => {
  for (const pathname of [undefined, null, {}, "https://example.test", "//example.test", "studio", "/\\example.test", "/studio?x=1", "/studio#x", "/studio/../console", "/studio/%2e%2e/console", "/studio/%2f%2fother", "/studio/%invalid"]) {
    assert.equal(toAppPath("image-studio", pathname, true), null);
  }
});

test("the public homepage uses product mode without the generic site shell or an auth guard", () => {
  const { route, ancestors } = findRoute("/");
  assert.equal(ancestors.length, 0);
  assert.equal(route.element.type, "../pages/apps/[identifier]");
  assert.equal(route.element.props.productEntry, true);
});

test("the studio uses the shared auth guard outside the generic site shell", () => {
  const { route, ancestors } = findRoute("/studio/*");
  assert.equal(ancestors.length, 0);
  assert.equal(route.element.type, "@buildingai/ui/components/auth/auth-guard");
  assert.equal(route.element.props.children.props.productEntry, true);
});

test("legacy apps, chat and protected console routes remain available", () => {
  const { route, ancestors } = findRoute("/apps/:identifier/*");
  assert.equal(ancestors[0].element.type, "@buildingai/ui/layouts/styles/default/index");
  assert.equal(route.element.type, "@buildingai/ui/components/auth/auth-guard");
  assert.equal(route.element.props.children.props.productEntry, undefined);
  for (const path of ["/chat", "/chat/:id", "/c/:id", "/login", "/login/oauth-callback"]) {
    assert.ok(findRoute(path), path);
  }
  assert.equal(findRoute("/console/*").ancestors[0].element.type, "@buildingai/ui/components/auth/auth-guard");
});

test("anonymous studio entry preserves query/hash in the shared login return URL", () => {
  const { default: AuthGuard } = loadComponent("../../@buildingai/web/ui/src/components/auth/auth-guard.tsx", {
    "@buildingai/stores": { useAuthStore: (selector) => selector({ authActions: { isLogin: () => false } }) },
    "react-router-dom": {
      useLocation: () => ({ pathname: "/studio", search: "?tool=main", hash: "#history" }),
      Navigate: "Navigate",
    },
  }, { window: { location: { pathname: "/studio" } } });
  const result = AuthGuard({});
  assert.equal(result.type, "Navigate");
  assert.equal(result.props.to.pathname, "/login");
  assert.equal(new URLSearchParams(result.props.to.search).get("redirect"), "/studio?tool=main#history");
});

function renderLogin(consoleAccess, redirect = "") {
  const { LoginPage } = loadComponent("../src/pages/login/index.tsx", {
    "@buildingai/services/shared": {
      hasConsoleAccess: () => consoleAccess,
      getFirstConsoleMenuPath: () => "/console/dashboard",
      WEB_HOME_PATH: "/",
    },
    "@buildingai/stores": {
      useAuthStore: (selector) => selector({ auth: { userInfo: { menus: [] } }, authActions: { isLogin: () => true } }),
      useConfigStore: (selector) => selector({ config: {} }),
    },
    "react-router-dom": {
      useSearchParams: () => [new URLSearchParams({ redirect })],
      Navigate: "Navigate",
    },
  });
  return LoginPage();
}

test("logged-in regular users and administrators both honor explicit product redirects", () => {
  for (const consoleAccess of [false, true]) {
    assert.equal(renderLogin(consoleAccess, "/studio?tool=main#history").props.to, "/studio?tool=main#history");
  }
});

test("direct administrator login retains its backend default and regular users cannot target the console", () => {
  assert.equal(renderLogin(true).props.to, "/console/dashboard");
  assert.equal(renderLogin(false, "/console/dashboard").props.to, "/");
});

function renderIframe(productEntry, pathname, search = "?tool=main") {
  const effects = [];
  const messages = [];
  const navigations = [];
  const listeners = new Map();
  const refs = [];
  const states = [];
  let stateIndex = 0;
  let refIndex = 0;
  const location = { pathname, search, hash: "#history" };
  const contentWindow = { postMessage: (...args) => messages.push(args) };
  const { default: AppIframePage } = loadComponent("../src/pages/apps/[identifier].tsx", {
    "./entry-path": { toAppPath },
    "@tanstack/react-query": { useQuery: () => ({ data: {}, isLoading: false, error: null }) },
    react: {
      useEffect: (effect) => effects.push(effect),
      useMemo: (compute) => compute(),
      useRef: (value) => refs[refIndex++] ?? (refs[refIndex - 1] = { current: value === null ? { contentWindow } : value }),
      useState: (initial) => {
        const index = stateIndex++;
        if (!(index in states)) states[index] = initial;
        return [states[index], (next) => { states[index] = next; }];
      },
    },
    "react-router-dom": {
      useParams: () => ({ identifier: "image-studio", "*": "studio" }),
      useLocation: () => location,
      useNavigate: () => (...args) => navigations.push(args),
    },
  }, {
    window: {
      location: { origin: "http://localhost:4090" },
      addEventListener: (name, handler) => listeners.set(name, handler),
      removeEventListener: () => {},
    },
    URL,
    URLSearchParams,
    requestAnimationFrame: (callback) => callback(),
  });
  const getIframe = (result) => Array.isArray(result.props.children) ? result.props.children[0] : result;
  const getAccountRequest = (result) => Array.isArray(result.props.children)
    ? result.props.children[1]?.props?.children?.props.request ?? null : null;
  let tree = AppIframePage({ productEntry });
  const result = getIframe(tree);
  effects.forEach((effect) => effect());
  return {
    result, messages, navigations, contentWindow, receive: listeners.get("message"),
    request: () => getAccountRequest(tree),
    tree: () => tree,
    replayEffects: () => effects.forEach((effect) => effect()),
    rerender: (nextLocation) => {
      Object.assign(location, nextLocation);
      refIndex = 0;
      stateIndex = 0;
      effects.length = 0;
      tree = AppIframePage({ productEntry });
      effects.forEach((effect) => effect());
      return getIframe(tree);
    },
  };
}

test("iframe boot and browser navigation preserve extension path, query/hash and origin", () => {
  for (const [pathname, extensionPath] of [["/", ""], ["/studio", "/studio"]]) {
    const { result, messages } = renderIframe(true, pathname);
    assert.equal(result.type, "iframe");
    assert.equal(result.props.src, `http://localhost:4090/extension/image-studio${extensionPath}?tool=main#history`);
    assert.equal(messages[0][0].type, "parent-navigate");
    assert.equal(messages[0][0].path, extensionPath || "/");
    assert.equal(messages[0][0].search, "?tool=main");
    assert.equal(messages[0][0].hash, "#history");
    assert.equal(messages[0][1], "http://localhost:4090");
  }
});

test("only the expected iframe source and origin may sync product navigation", () => {
  const { receive, navigations, contentWindow } = renderIframe(true, "/studio");
  const event = {
    source: contentWindow,
    origin: "http://localhost:4090",
    data: { type: "extension-navigate", path: "/", search: "?from=studio", hash: "#pricing" },
  };
  receive({ ...event, origin: "https://example.test" });
  receive({ ...event, source: {} });
  receive({ ...event, data: { ...event.data, path: "//example.test" } });
  assert.equal(navigations.length, 0);
  receive(event);
  assert.equal(navigations[0][0], "/?from=studio#pricing");
});

test("legacy iframe messages keep their apps prefix and product not-found messages stay canonical", () => {
  const legacy = renderIframe(false, "/apps/image-studio/studio");
  legacy.receive({ source: legacy.contentWindow, origin: "http://localhost:4090", data: { type: "extension-navigate", path: "/" } });
  assert.equal(legacy.navigations[0][0], "/apps/image-studio/");
  const product = renderIframe(true, "/studio");
  product.receive({ source: product.contentWindow, origin: "http://localhost:4090", data: { type: "extension-not-found", path: "/studio/missing", search: "?x=1" } });
  assert.equal(product.navigations[0][0], "/studio/missing?x=1");
});

test("all landing workspace links navigate to the top-level product entry", () => {
  const source = readFileSync(new URL("../../../extensions/image-studio/src/web/pages/landing.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("landing.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let links = 0;
  function visit(node) {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(ast) === "a") {
      const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
      const href = attributes.find((attr) => attr.name.getText(ast) === "href");
      if (href?.initializer?.getText(ast) === "{studioUrl}") {
        const target = attributes.find((attr) => attr.name.getText(ast) === "target");
        assert.equal(target?.initializer?.text, "_top");
        links++;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(links >= 10);
  assert.match(source, /const studioUrl = "\/studio"/);
});

test("product location updates do not reload the iframe, while legacy iframe URLs remain reactive", () => {
  const product = renderIframe(true, "/studio");
  assert.equal(product.rerender({ hash: "#new", search: "?tool=detail" }).props.src, product.result.props.src);
  const legacy = renderIframe(false, "/apps/image-studio/studio");
  assert.equal(legacy.rerender({ hash: "#new", search: "?tool=detail" }).props.src,
    "http://localhost:4090/extension/image-studio/studio?tool=detail#new");
});

test("account actions require the product workspace, exact iframe owner, origin and whitelist", () => {
  const product = renderIframe(true, "/studio");
  const event = { source: product.contentWindow, origin: "http://localhost:4090", data: { type: "image-studio:account", action: "profile" } };
  for (const invalid of [{ ...event, source: {} }, { ...event, origin: "https://other.test" }, { ...event, data: { ...event.data, action: "general" } }]) {
    product.receive(invalid);
    product.rerender({});
    assert.equal(product.request(), null);
  }
  for (const action of ["profile", "wallet", "subscribe", "credits"]) {
    product.receive({ ...event, data: { ...event.data, action } });
    assert.equal(product.rerender({}).props.src, product.result.props.src);
    assert.equal(product.request().action, action);
  }
  for (const [mode, path] of [[false, "/apps/image-studio/studio"], [true, "/"]]) {
    const entry = renderIframe(mode, path);
    entry.receive({ ...event, source: entry.contentWindow });
    entry.rerender({});
    assert.equal(entry.request(), null);
  }
});

test("standalone account query is consumed once and removed without changing iframe identity", () => {
  for (const action of ["profile", "wallet", "subscribe", "credits", "unsupported"]) {
    const entry = renderIframe(true, "/studio", `?tool=main&account=${action}`);
    assert.equal(entry.result.props.src, "http://localhost:4090/extension/image-studio/studio?tool=main#history");
    assert.equal(entry.messages[0][0].search, "?tool=main");
    assert.equal(entry.navigations[0][0], "/studio?tool=main#history");
    assert.equal(entry.navigations[0][1].replace, true);
    entry.replayEffects();
    entry.rerender({});
    assert.equal(entry.request()?.action ?? null, action === "unsupported" ? null : action);
    const request = entry.request();
    assert.equal(entry.navigations.length, 1);
    assert.equal(entry.rerender({ search: "?tool=main" }).props.src, entry.result.props.src);
    assert.equal(entry.request(), request);
    assert.equal(entry.navigations.length, 1);
  }
});

test("landing and workspace keep the same iframe reconciliation position and use the real host provider", () => {
  const entry = renderIframe(true, "/");
  const landing = entry.tree();
  assert.ok(Array.isArray(landing.props.children));
  assert.equal(landing.props.children[0].type, "iframe");
  assert.equal(landing.props.children[1], false);
  entry.rerender({ pathname: "/studio" });
  const workspace = entry.tree();
  assert.equal(workspace.type, landing.type);
  assert.equal(workspace.props.children[0].type, "iframe");
  assert.equal(workspace.props.children[0].props.src, entry.result.props.src);
  const controls = workspace.props.children[1].props.children;
  controls.props.onClosed();
  assert.equal(entry.messages.at(-1)[0].type, "image-studio:account-updated");
  assert.deepEqual(Object.keys(entry.messages.at(-1)[0]), ["type"]);
  assert.equal(entry.messages.at(-1)[1], "http://localhost:4090");
  const source = readFileSync(new URL("../src/pages/apps/[identifier].tsx", import.meta.url), "utf8");
  assert.match(source, /import \{ SettingsDialogProvider \} from "\.\.\/\.\.\/components\/settings-dialog"/);
  assert.match(source, /<SettingsDialogProvider>/);
});

function accountControls() {
  const classes = new Set(["dark"]);
  const root = { classList: {
    contains: (name) => classes.has(name),
    add: (name) => classes.add(name), remove: (name) => classes.delete(name),
    toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
  }, style: { colorScheme: "dark" } };
  const observers = [];
  class Observer {
    disconnected = false;
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  let membership = false, settingsOpen = false, theme = "dark", systemDark = false;
  const opened = [], closed = [], notifications = [];
  const open = (page) => { opened.push(page); settingsOpen = true; };
  const close = () => { closed.push(true); settingsOpen = false; };
  const states = [], refs = [], effects = [];
  let stateIndex = 0, refIndex = 0, effectIndex = 0, pending = [], replay = [];
  const react = {
    useState: (initial) => {
      const index = stateIndex++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (next) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
    },
    useRef: (initial) => refs[refIndex++] ?? (refs[refIndex - 1] = { current: initial }),
    useEffect: (run, deps) => {
      const index = effectIndex++;
      if (!effects[index] || deps.some((value, position) => !Object.is(value, effects[index].deps[position]))) pending.push({ index, run, deps });
    },
  };
  const loaded = loadComponent("../src/pages/apps/[identifier].tsx", {
    react,
    "@buildingai/hooks": { useSettingsDialog: () => ({ open, close, isOpen: settingsOpen }) },
    "@buildingai/ui/components/theme-provider": { useTheme: () => ({ theme }) },
    "@buildingai/stores": { useConfigStore: (selector) => selector({ config: { websiteConfig: { features: { membership } } } }) },
    "../../components/settings-dialog/settings-items/power-detail-dialog": { PowerDetailDialog: "PowerDetailDialog" },
  }, { document: { documentElement: root }, MutationObserver: Observer,
    window: { matchMedia: () => ({ matches: systemDark }) } });
  const onClosed = () => notifications.push(true);
  function render(request = null, component = loaded.ProductAccountControls) {
    stateIndex = refIndex = effectIndex = 0;
    pending = [];
    const tree = component({ request, onClosed });
    replay = pending;
    pending.forEach(({ index, run, deps }) => {
      effects[index]?.cleanup?.();
      effects[index] = { deps, cleanup: run() };
    });
    return tree;
  }
  return { render, opened, closed, notifications, classes, root, observers, loaded,
    replay: () => replay.forEach(({ run }) => run()),
    membership: (value) => { membership = value; },
    setTheme: (value) => { theme = value; },
    setSystemDark: (value) => { systemDark = value; },
    closeSettings: () => { settingsOpen = false; },
    dispose: () => effects.forEach((effect) => effect?.cleanup?.()),
  };
}

test("account controls gate membership, consume each request once and reopen new requests", () => {
  const view = accountControls();
  const request = { action: "subscribe" };
  view.render(request); view.replay();
  assert.deepEqual(view.opened, ["wallet"]);
  view.render(request);
  assert.equal(view.opened.length, 1);
  view.membership(true);
  view.render({ action: "subscribe" });
  view.render({ action: "profile" });
  view.render({ action: "profile" });
  assert.deepEqual(view.opened, ["wallet", "subscribe", "profile", "profile"]);
});

test("credits and shared settings are mutually exclusive and notify only after closure", () => {
  const view = accountControls();
  const profile = { action: "profile" };
  view.render(profile); view.render(profile);
  const credits = { action: "credits" };
  view.render(credits);
  let tree = view.render(credits);
  assert.equal(view.closed.length, 1);
  assert.equal(tree.type, "PowerDetailDialog");
  assert.equal(tree.props.open, true);
  assert.equal(view.notifications.length, 0);
  tree.props.onOpenChange(false);
  view.render(credits); view.render(credits);
  assert.equal(view.notifications.length, 1);
  const wallet = { action: "wallet" };
  view.render(wallet);
  tree = view.render(wallet);
  assert.equal(tree.props.open, false);
  view.closeSettings(); view.render(wallet);
  assert.equal(view.notifications.length, 2);
});

test("product account theme observes external classes, restores state and never persists a theme", () => {
  const view = accountControls();
  view.render(null, () => view.loaded.useProductAccountTheme(false));
  assert.equal(view.observers.length, 0);
  view.render(null, () => view.loaded.useProductAccountTheme(true));
  assert.deepEqual([...view.classes], ["light"]);
  assert.equal(view.root.style.colorScheme, "light");
  view.classes.add("dark"); view.classes.delete("light");
  view.observers[0].callback();
  assert.deepEqual([...view.classes], ["light"]);
  view.dispose();
  assert.equal(view.observers[0].disconnected, true);
  assert.deepEqual([...view.classes], ["dark"]);
  assert.equal(view.root.style.colorScheme, "dark");
});

test("account theme cleanup honors a new light preference even when forced classes already look light", () => {
  const view = accountControls();
  const activeTheme = () => view.loaded.useProductAccountTheme(true);
  view.render(null, activeTheme);
  view.setTheme("light");
  view.render(null, activeTheme);
  view.dispose();
  assert.deepEqual([...view.classes], ["light"]);
  assert.equal(view.root.style.colorScheme, "light");
});

test("account theme cleanup resolves the latest system appearance", () => {
  for (const dark of [true, false]) {
    const view = accountControls();
    const activeTheme = () => view.loaded.useProductAccountTheme(true);
    view.render(null, activeTheme);
    view.setTheme("system");
    view.setSystemDark(dark);
    view.render(null, activeTheme);
    view.dispose();
    assert.deepEqual([...view.classes], [dark ? "dark" : "light"]);
  }
});