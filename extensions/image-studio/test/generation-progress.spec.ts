/// <reference types="jest" />
import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import * as ts from "typescript";
import * as specializedWorkflow from "../src/web/pages/specialized-workflow";

interface ElementNode {
    type: unknown;
    props: Record<string, unknown> & { children?: unknown };
}

describe("per-image generation progress", () => {
    const source = readFileSync(path.join(__dirname, "../src/web/pages/index.tsx"), "utf8");
    const { outputText } = ts.transpileModule(source.replaceAll("import.meta.env", "({})"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    });

    function render(status: string | null, count: number, submitting?: "creative" | "main" | "tool", imageCount = 0) {
        const selectedTool = submitting === "creative" ? "creative" : submitting === "tool" ? "retouch" : "main";
        const record = status === null ? null : { id: "task-id", toolKey: "main", status, count, images: Array.from({ length: imageCount }, () => ({})), modelName: "Test", prompt: "Product" };
        const variants = ["white", "scene", "selling", "other"].slice(0, count);
        const mutation = { isPending: false };
        const services = {
            isGenerationActive: (item: typeof record | null) => item?.status === "queued" || item?.status === "processing",
            useGenerationQuery: () => ({ data: record }),
            useGenerationHistoryQuery: () => ({ data: { items: [], total: 0 } }),
            useGenerationCapabilitiesQuery: () => ({ data: { tools: [], models: [] } }),
            useCreditBalanceQuery: () => ({ data: { balance: 100 } }),
            useGenerateMainImageMutation: () => ({ isPending: submitting === "main", variables: {} }),
            useRetryGenerationMutation: () => mutation,
            useCancelGenerationMutation: () => mutation,
            useDeleteGenerationMutation: () => mutation,
        };
        const exports: { default?: () => unknown } = {};
        const jsx = (type: unknown, props: ElementNode["props"]) => ({ type, props });
        const fallback = new Proxy({ __esModule: true, default: "mock-component" }, {
            get: (target, key) => key in target ? target[key as keyof typeof target] : () => undefined,
        });
        runInNewContext(outputText, {
            exports,
            require: (name: string) => {
                if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
                if (name === "react") return {
                    useState: (initial: unknown) => [initial === "main" ? selectedTool : initial, () => undefined],
                    useRef: (initial: unknown) => ({ current: initial }),
                    useEffect: () => undefined,
                };
                if (name === "../services/generation") return services;
                if (name === "../services/tool-generation") return { useGenerateToolMutation: () => ({ isPending: submitting === "tool" || submitting === "creative", variables: { tool: submitting === "creative" ? "creative" : "retouch", count } }) };
                if (name === "./specialized-workflow") return specializedWorkflow;
                if (name === "./workspace-preferences") return { useWorkspacePreferences: () => ({ value: { count: 1, quality: "standard" } }) };
                if (name === "./workspace-navigation") return { TOOL_LABELS: { creative: "创意生图", main: "商品主图" } };
                if (name === "../../api/shared/main-image") return {
                    mainImageVariants: () => variants,
                    MAIN_IMAGE_TYPES: { white: "白底图", scene: "场景图", selling: "卖点图", other: "其他" },
                };
                return fallback;
            },
        });
        const nodes: ElementNode[] = [];
        function visit(value: unknown) {
            if (Array.isArray(value)) return value.forEach(visit);
            if (value && typeof value === "object" && "props" in value) {
                const node = value as ElementNode;
                nodes.push(node);
                visit(node.props.children);
            }
        }
        visit(exports.default!());
        return nodes;
    }

    it("shows the preview placeholder before any task exists", () => {
        const nodes = render(null, 1);
        expect(nodes.find((node) => String(node.props.className).includes("preview-empty-state"))).toBeDefined();
        expect(nodes.find((node) => node.type === "h3" && node.props.children === "效果图预览")).toBeDefined();
        expect(nodes.find((node) => node.type === "p" && node.props.children === "提交任务后，生成结果将在此处展示")).toBeDefined();
        expect(nodes.find((node) => node.props.className === "preview-empty-art")?.props["aria-hidden"]).toBe("true");
    });

    it.each(["queued", "processing", "completed", "failed", "cancelled"])("keeps the existing %s task view instead of the initial placeholder", (status) => {
        expect(render(status, 1).some((node) => String(node.props.className).includes("preview-empty-state"))).toBe(false);
    });

    it("keeps generated images in the result view", () => {
        const nodes = render("completed", 1, undefined, 1);
        expect(nodes.some((node) => String(node.props.className).includes("preview-empty-state"))).toBe(false);
        expect(nodes.some((node) => node.props.generationId === "task-id" && node.props.imageIndex === 0)).toBe(true);
    });

    it.each([1, 2, 3, 4])("renders %i independent indeterminate progress bars", (count) => {
        for (const [status, caption] of [["queued", "等待生成"], ["processing", "生成中"]]) {
            const nodes = render(status, count);
            const tiles = nodes.filter((node) => String(node.props.className).includes("rtile generation-placeholder"));
            const bars = nodes.filter((node) => node.type === "progress" &&
                String(node.props.className).includes("generation-image-progress"));
            expect(tiles).toHaveLength(count);
            expect(bars).toHaveLength(count);
            bars.forEach((bar, index) => {
                expect(bar.props["aria-label"]).toBe(`图片 ${index + 1}生成进度`);
                expect(bar.props["aria-valuetext"]).toBe(caption);
                expect(bar.props).not.toHaveProperty("value");
                expect(bar.props).not.toHaveProperty("aria-valuenow");
                expect((tiles[index].props.children as unknown[])).toContain(bar);
            });
        }
    });

    it.each(["creative", "main", "tool"] as const)("shows submit status for every pending %s image", (kind) => {
        const bars = render("completed", 3, kind).filter((node) => node.type === "progress" &&
            String(node.props.className).includes("generation-image-progress"));
        expect(bars).toHaveLength(3);
        bars.forEach((bar) => expect(bar.props["aria-valuetext"]).toBe("提交中"));
    });

    it.each(["completed", "failed", "cancelled"])("removes pending image progress when task is %s", (status) => {
        expect(render(status, 4).filter((node) => node.type === "progress" &&
            String(node.props.className).includes("generation-image-progress"))).toHaveLength(0);
    });
});