/// <reference types="jest" />
import { collectGenerations, filterWorks } from "../src/web/services/works";
import type { ImageGeneration } from "../src/web/services/types";
import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import * as ts from "typescript";
import { unzipSync } from "fflate";
import { TOOL_KEYS, type ToolKey } from "../src/api/shared/tools";

const record = (id: string, count = 2, toolKey: ToolKey = "creative"): ImageGeneration => ({
    id, toolKey, prompt: id, modelId: "model", modelName: "Model", size: "1024x1024",
    quality: "standard", style: "vivid", count, status: "completed", billingAmount: 0,
    billingStatus: "free", createdAt: "2026-10-31T12:00:00", updatedAt: "2026-10-31T12:00:00",
    images: Array.from({ length: count }, () => ({ url: "protected", mediaType: "image/png" })),
});

describe("My Works collection", () => {
    it("collects every history page using the server page size", async () => {
        const fetchPage = jest.fn(async (page: number) => ({
            items: [record(String(page))], total: 3, limit: 1, page,
        }));
        expect(await collectGenerations(fetchPage)).toHaveLength(3);
        expect(fetchPage.mock.calls).toEqual([[1], [2], [3]]);
    });
    it("accepts an empty history", async () => {
        expect(await collectGenerations(async () => ({ items: [], total: 0, page: 1, limit: 30 }))).toEqual([]);
    });
    it("fails rather than silently truncating stalled pagination", async () => {
        await expect(collectGenerations(async () => ({ items: [record("same")], total: 3, page: 1, limit: 1 })))
            .rejects.toThrow("作品列表未完整加载");
    });
    it("propagates a later page error instead of presenting partial results", async () => {
        await expect(collectGenerations(async (page) => {
            if (page === 2) throw new Error("offline");
            return { items: [record("first")], total: 2, page, limit: 1 };
        })).rejects.toThrow("offline");
    });
    it("flattens every image and excludes tasks without output", () => {
        expect(filterWorks([record("first", 4), record("empty", 0)], { tools: [], date: "", task: "all" })
            .map((item) => item.key)).toEqual(["first:0", "first:1", "first:2", "first:3"]);
    });
    it("applies type, local date and task filters across all pages", () => {
        const records = [record("creative"), record("main", 3, "main")];
        expect(filterWorks(records, { tools: ["main"], date: "2026-10-31", task: "main" })).toHaveLength(3);
        expect(filterWorks(records, { tools: ["main"], date: "2026-10-30", task: "all" })).toHaveLength(0);
        expect(filterWorks(records, { tools: ["creative"], date: "", task: "main" })).toHaveLength(0);
    });
    it("includes legacy creative images and sorts newest first", () => {
        const older = { ...record("older"), toolKey: undefined, createdAt: "2026-10-30T12:00:00" };
        expect(filterWorks([older, record("newer")], { tools: ["creative"], date: "", task: "all" })
            .map((item) => item.key)).toEqual(["newer:0", "newer:1", "older:0", "older:1"]);
    });
    it("matches any selected business type while retaining date and task constraints", () => {
        const records = [record("main", 1, "main"), record("edit", 1, "retouch"), record("creative", 1)];
        expect(filterWorks(records, { tools: ["main", "retouch"], date: "", task: "all" }).map((work) => work.key))
            .toEqual(["main:0", "edit:0"]);
        expect(filterWorks(records, { tools: ["main", "retouch"], date: "2026-10-31", task: "edit" }).map((work) => work.key))
            .toEqual(["edit:0"]);
        expect(filterWorks(records, { tools: ["main", "retouch"], date: "2026-10-30", task: "all" })).toEqual([]);
    });
});

describe("My Works view", () => {
    interface Node { type: unknown; props: Record<string, any> }
    const textOf = (value: unknown): string => Array.isArray(value) ? value.map(textOf).join("")
        : value && typeof value === "object" && "props" in value ? textOf((value as Node).props.children)
        : typeof value === "string" || typeof value === "number" ? String(value) : "";
    const navigation = { TOOL_LABELS: {} as Record<ToolKey, string>, TOOL_GROUPS: [] as { name: string; tools: ToolKey[] }[] };
    runInNewContext(ts.transpileModule(readFileSync(path.join(__dirname, "../src/web/pages/workspace-navigation.tsx"), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText, { exports: navigation, require: () => new Proxy({}, { get: () => "mock-component" }) });
    const source = readFileSync(path.join(__dirname, "../src/web/pages/works.tsx"), "utf8");
    const { outputText } = ts.transpileModule(source.replaceAll("import.meta.env", "({})"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    });
    function render(records: ImageGeneration[], state: Record<number, unknown> = {}, query = {}) {
        let stateIndex = 0;
        const nodes: Node[] = [];
        const renderedImages: string[] = [];
        const exports: { default?: (props: unknown) => unknown } = {};
        const jsx = (type: unknown, props: Node["props"]) => ({ type, props });
        let archive: Blob | undefined;
        const anchor = { href: "", download: "", click: jest.fn(), remove: jest.fn() };
        const fetchImage = jest.fn(async () => new Blob(["preview-image"], { type: "image/png" }));
        runInNewContext(outputText, {
            exports,
            Blob,
            Uint8Array,
            URL: { createObjectURL: (blob: Blob) => { archive = blob; return "blob:archive"; }, revokeObjectURL: jest.fn() },
            document: { createElement: () => anchor, body: { append: jest.fn() } },
            window: { setTimeout: (callback: () => void) => callback() },
            require: (name: string) => {
                if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
                if (name === "react") return {
                    useRef: () => ({ current: null }),
                    useState: (initial: unknown) => {
                        const index = stateIndex++;
                        return [state[index] ?? initial, (value: unknown) => {
                            state[index] = typeof value === "function" ? value(state[index] ?? initial) : value;
                        }];
                    },
                };
                if (name === "@buildingai/ui/components/ui/popover") return { Popover: "Popover", PopoverTrigger: "PopoverTrigger", PopoverContent: "PopoverContent" };
                if (name === "../services/generation") return {
                    useWorksQuery: () => ({ data: records, ...query }), fetchGenerationImage: fetchImage,
                };
                if (name === "../services/works") return { filterWorks };
                if (name === "../../api/shared/tools") return { TOOL_KEYS };
                if (name === "./workspace-navigation") return navigation;
                if (name === "fflate") return require("fflate");
                return new Proxy({}, { get: () => "mock-icon" });
            },
        });
        function visit(value: unknown) {
            if (Array.isArray(value)) return value.forEach(visit);
            if (value && typeof value === "object" && "props" in value) {
                const node = value as Node;
                nodes.push(node);
                visit(node.props.children);
            }
        }
        visit(exports.default!({ renderImage: (work: { key: string }) => { renderedImages.push(work.key); return null; } }));
        const text = nodes.flatMap((node) => [node.props.children].flat(Infinity)).filter((value) => typeof value === "string").join(" ");
        return { nodes, text, renderedImages, anchor, fetchImage, archive: () => archive, rerender: () => render(records, state, query) };
    }
    it("renders an actionable gallery and paginates individual images", () => {
        const records = Array.from({ length: 14 }, (_,index) => record(String(index)));
        const first = render(records);
        expect(first.renderedImages).toHaveLength(24);
        expect(first.nodes.some((node) => node.props["aria-label"] === "作品分页")).toBe(true);
        const second = render(records, { 4: 2 });
        expect(second.renderedImages).toEqual(["12:0", "12:1", "13:0", "13:1"]);
    });
    it("labels and filters instruction-edit images by their real tool", () => {
        const result = render([record("edit", 1, "retouch"), record("creative")], { 0: ["retouch"] });
        expect(result.text).toContain("产品精修");
        expect(result.renderedImages).toEqual(["edit:0"]);
        expect(result.nodes.filter((node) => node.props.role === "checkbox").map((node) => node.props["aria-label"]))
            .toEqual(expect.arrayContaining(TOOL_KEYS.filter((key) => key !== "suggest").map((key) => navigation.TOOL_LABELS[key])));
    });
    it("renders the empty state only when loading succeeds without images", () => {
        expect(render([]).text).toContain("还没有作品");
        expect(render([], {}, { isPending: true }).text).toContain("正在加载作品");
        expect(render([], {}, { isPending: true }).text).not.toContain("还没有作品");
        expect(render([], {}, { isError: true }).text).toContain("作品加载失败");
    });
    it("distinguishes no matching images from an empty collection", () => {
        expect(render([record("creative")], { 0: ["main"] }).text).toContain("没有符合条件的作品");
    });
    it("toggles grouped types immediately, keeps the popover open and restores all types", () => {
        let view = render([record("main", 1, "main"), record("edit", 1, "retouch"), record("creative", 1)], { 9: "tool" });
        const toggle = (label: string) => {
            view.nodes.find((node) => node.props.role === "checkbox" && node.props["aria-label"] === label)!.props.onClick();
            view = view.rerender();
        };
        expect(view.nodes.filter((node) => node.type === "legend").map(textOf)).toEqual(["电商生图", "AI 修图", "服饰穿戴"]);
        toggle("商品主图"); toggle("产品精修");
        expect(view.renderedImages).toEqual(["main:0", "edit:0"]);
        expect(view.nodes.find((node) => node.type === "Popover")!.props.open).toBe(true);
        toggle("商品主图"); expect(view.renderedImages).toEqual(["edit:0"]);
        toggle("产品精修"); expect(view.renderedImages).toEqual(["main:0", "edit:0", "creative:0"]);
        toggle("商品主图"); toggle("全部业务类型");
        expect(view.renderedImages).toEqual(["main:0", "edit:0", "creative:0"]);
    });
    it("resets pagination and download selection when business types change", () => {
        let view = render([record("main", 26, "main"), record("edit", 1, "retouch")], { 4: 2, 5: true, 6: new Set(["main:25"]) });
        view.nodes.find((node) => node.props.role === "checkbox" && node.props["aria-label"] === "商品主图")!.props.onClick();
        view = view.rerender();
        expect(view.renderedImages[0]).toBe("main:0");
        expect(view.renderedImages).toHaveLength(24);
        expect(view.nodes.filter((node) => node.type === "input" && node.props.type === "checkbox").every((node) => !node.props.checked)).toBe(true);
    });
    it("searches tasks by full ID or name, keeps all tasks available and selects one", () => {
        let view = render([{ ...record("task-ABC", 1, "main"), prompt: "夏日香水" }, { ...record("task-DEF", 1, "retouch"), prompt: "白色背景" }], { 9: "task" });
        const search = (value: string) => {
            view.nodes.find((node) => node.props["aria-label"] === "搜索任务 ID 或任务名称")!.props.onChange({ target: { value } });
            view = view.rerender();
        };
        const options = () => view.nodes.filter((node) => node.props.className === "works-task-option");
        search("  TASK-abc "); expect(options().map(textOf)).toEqual([expect.stringContaining("task-ABC")]);
        expect(view.renderedImages).toHaveLength(2);
        search("白色"); expect(options().map(textOf)).toEqual([expect.stringContaining("task-DEF")]);
        options()[0].props.onClick(); view = view.rerender();
        expect(view.renderedImages).toEqual(["task-DEF:0"]);
        expect(view.nodes.filter((node) => node.type === "Popover")[1].props.open).toBe(false);
        search("missing"); expect(view.text).toContain("未找到匹配任务");
        view.nodes.find((node) => node.props.className === "works-task-option works-task-all")!.props.onClick();
        view = view.rerender(); expect(view.renderedImages).toHaveLength(2);
    });
    it("clears every filter without retaining a hidden download selection", () => {
        let view = render([record("main", 1, "main"), record("creative", 1)], {
            0: ["main"], 1: "2026-10-31", 2: "main", 3: "completed", 5: true, 6: new Set(["main:0"]), 10: "search",
        });
        view.nodes.find((node) => node.props["aria-label"] === "清空筛选")!.props.onClick();
        view = view.rerender();
        expect(view.renderedImages).toEqual(["main:0", "creative:0"]);
        expect(view.nodes.some((node) => node.props["aria-label"] === "清空筛选")).toBe(false);
        expect(view.nodes.find((node) => node.props["aria-label"] === "搜索任务 ID 或任务名称")!.props.value).toBe("");
        expect(view.nodes.filter((node) => node.type === "input" && node.props.type === "checkbox").every((node) => !node.props.checked)).toBe(true);
    });
    it("renders one accessible selection checkbox per visible image", () => {
        const result = render([record("selected")], { 5: true, 6: new Set(["selected:1"]) });
        const boxes = result.nodes.filter((node) => node.type === "input" && node.props.type === "checkbox");
        expect(boxes).toHaveLength(2);
        expect(boxes.map((node) => node.props.checked)).toEqual([false, true]);
    });
    it("never renders unprotected generated URLs directly", () => {
        const result = render([record("protected")]);
        expect(result.renderedImages).toEqual(["protected:0", "protected:1"]);
        expect(result.nodes.some((node) => node.type === "img" && node.props.src === "protected")).toBe(false);
    });
    it("builds a ZIP containing only the selected protected images", async () => {
        const result = render([record("first"), record("second")], { 5: true, 6: new Set(["first:1", "second:0"]) });
        const button = result.nodes.find((node) => node.type === "button" &&
            String(node.props.className).includes("btn-lime"));
        button!.props.onClick();
        for (let attempt = 0; attempt < 5 && !result.archive(); attempt += 1) {
            await new Promise(setImmediate);
        }
        expect(result.fetchImage.mock.calls).toEqual([["first", 1, "api"], ["second", 0, "api"]]);
        expect(result.anchor.download).toBe("image-studio-works.zip");
        expect(result.anchor.click).toHaveBeenCalledTimes(1);
        const contents = unzipSync(new Uint8Array(await result.archive()!.arrayBuffer()));
        expect(Object.keys(contents)).toEqual(["first-2.png", "second-1.png"]);
        expect(Buffer.from(contents["first-2.png"]).toString()).toBe("preview-image");
    });
});