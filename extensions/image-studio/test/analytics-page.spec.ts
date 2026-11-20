import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import * as ts from "typescript";

jest.mock("../src/web/services/base", () => ({
    consoleHttpClient: { get: jest.fn() },
}));
jest.mock("@tanstack/react-query", () => ({
    useQuery: jest.fn(),
}));

import { useQuery } from "@tanstack/react-query";
import { consoleHttpClient } from "../src/web/services/base";
import {
    analyticsQueryKey,
    analyticsRequestParams,
    useGenerationAnalyticsQuery,
} from "../src/web/services/analytics";

type ElementNode = {
    type: unknown;
    props: Record<string, unknown>;
};

type QueryResult = {
    data?: unknown;
    isLoading?: boolean;
    isError?: boolean;
    refetch?: jest.Mock;
};

const pageSource = () =>
    readFileSync(path.join(__dirname, "../src/web/pages/console/analytics.tsx"), "utf8");

function loadAnalyticsPage(queryState: QueryResult) {
    const state: unknown[] = [];
    let cursor = 0;
    let page: (() => ElementNode) | null = null;
    let tree: ElementNode;
    const filters: unknown[] = [];

    const render = () => {
        cursor = 0;
        if (page) tree = page();
        return tree!;
    };
    const react = {
        useState: (initial: unknown) => {
            const index = cursor++;
            if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
            return [
                state[index],
                (next: unknown) => {
                    state[index] = typeof next === "function" ? next(state[index]) : next;
                    render();
                },
            ];
        },
        useMemo: (factory: () => unknown) => factory(),
    };
    const jsx = (type: unknown, props: Record<string, unknown>, key?: unknown): ElementNode => {
        const componentProps = { ...(props ?? {}), ...(key === undefined ? {} : { key }) };
        if (typeof type === "function") return type(componentProps) as ElementNode;
        return { type, props: componentProps };
    };
    const catalog = [
        { key: "creative", name: "创意生图", category: "基础生图" },
        { key: "main", name: "商品主图", category: "电商生图" },
    ];
    const code = ts.transpileModule(pageSource(), {
        compilerOptions: {
            esModuleInterop: true,
            jsx: ts.JsxEmit.ReactJSX,
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
    }).outputText;
    const module = { exports: {} as Record<string, unknown> };

    runInNewContext(code, {
        module,
        exports: module.exports,
        require: (name: string) => {
            if (name === "react") return react;
            if (name === "react/jsx-runtime") return { Fragment: "Fragment", jsx, jsxs: jsx };
            if (name.endsWith(".css")) return {};
            if (name === "../services/analytics" || name.endsWith("/services/analytics")) {
                return {
                    useGenerationAnalyticsQuery: (filter: unknown) => {
                        filters.push(filter);
                        return queryState;
                    },
                };
            }
            if (name.includes("shared/pricing")) return { PRICING_CATALOG: catalog };
            if (name === "@buildingai/ui/components/ui/chart") {
                return Object.fromEntries(
                    [
                        "ChartContainer",
                        "ChartTooltip",
                        "ChartLegend",
                        "ChartTooltipContent",
                        "ChartLegendContent",
                    ].map((key) => [key, key]),
                );
            }
            if (name === "recharts") {
                return Object.fromEntries(
                    ["Area", "AreaChart", "CartesianGrid", "XAxis", "YAxis"].map((key) => [
                        key,
                        key,
                    ]),
                );
            }
            if (name === "lucide-react") return { RefreshCw: "RefreshCw" };
            throw new Error(`Unexpected analytics page dependency: ${name}`);
        },
    });

    const component = (module.exports.default ?? module.exports.AnalyticsPage) as () => ElementNode;
    page = component;
    tree = render();
    return {
        exports: module.exports,
        filters,
        get tree() {
            return tree;
        },
    };
}

function childNodes(value: unknown): ElementNode[] {
    if (Array.isArray(value)) return value.flatMap(childNodes);
    if (!value || typeof value !== "object" || !("type" in value) || !("props" in value)) return [];
    const node = value as ElementNode;
    return [node, ...childNodes(node.props.children)];
}

function textContent(value: unknown): string {
    if (Array.isArray(value)) return value.map(textContent).join("");
    if (value === null || value === undefined || typeof value === "boolean") return "";
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (typeof value === "object" && "props" in value) {
        return textContent((value as ElementNode).props.children);
    }
    return "";
}

function findNode(
    tree: ElementNode,
    predicate: (node: ElementNode) => boolean,
): ElementNode | undefined {
    return childNodes(tree).find(predicate);
}

const analyticsData = {
    range: {
        startDate: "2026-10-22",
        endDate: "2026-11-20",
        granularity: "day",
        timezone: "Asia/Shanghai",
        toolKey: null,
    },
    summary: {
        tasks: 1234,
        activeUsers: 45,
        requestedImages: 2000,
        generatedImages: 1888,
        completedTasks: 1100,
        failedTasks: 152,
        cancelledTasks: 5,
        failureRate: 0.1232,
        consumedCredits: 98765,
        refundedCredits: 321,
    },
    trend: [
        {
            period: "2026-11-20",
            tasks: 12,
            generatedImages: 10,
            failedTasks: 2,
            consumedCredits: 400,
        },
    ],
    modules: [
        {
            toolKey: "main",
            name: "商品主图",
            category: "电商生图",
            activeUsers: 30,
            tasks: 1200,
            generatedImages: 1800,
            completedTasks: 1050,
            failedTasks: 150,
            cancelledTasks: 0,
            failureRate: 0.125,
            consumedCredits: 90000,
            refundedCredits: 300,
        },
        {
            toolKey: "creative",
            name: "创意生图",
            category: "基础生图",
            activeUsers: 15,
            tasks: 34,
            generatedImages: 88,
            completedTasks: 30,
            failedTasks: 2,
            cancelledTasks: 2,
            failureRate: 0.0588,
            consumedCredits: 8765,
            refundedCredits: 21,
        },
    ],
};

describe("generation analytics query hook", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("omits undefined filters from the analytics request", () => {
        expect(analyticsRequestParams({})).toEqual({});
        expect(
            analyticsRequestParams({
                startDate: "2026-11-01",
                endDate: undefined,
                granularity: undefined,
                toolKey: "main",
            }),
        ).toEqual({
            startDate: "2026-11-01",
            toolKey: "main",
        });
    });

    describe("analytics dashboard page", () => {
        it("builds inclusive Shanghai calendar ranges and chart labels", () => {
            const { exports } = loadAnalyticsPage({});
            const recentDateRange = exports.recentDateRange as (
                days: number,
                now?: Date,
            ) => { startDate: string; endDate: string };
            const formatAnalyticsDate = exports.formatAnalyticsDate as (
                value: string,
                granularity: string,
            ) => string;

            expect(recentDateRange(30, new Date("2026-11-19T16:30:00.000Z"))).toEqual({
                startDate: "2026-10-22",
                endDate: "2026-11-20",
            });
            expect(formatAnalyticsDate("2026-11-20", "day")).toBe("11月20日");
            expect(formatAnalyticsDate("2026-11", "month")).toBe("2026年11月");
        });

        it("renders six localized metric cards and both trend charts", () => {
            const harness = loadAnalyticsPage({ data: analyticsData });
            const cards = childNodes(harness.tree).filter(
                (node) => node.props.className === "studio-analytics__metric-card",
            );

            expect(cards).toHaveLength(6);
            expect(cards.map((card) => textContent(card)).join(" ")).toContain("1,234");
            expect(cards.map((card) => textContent(card)).join(" ")).toContain("12.3%");
            expect(cards.map((card) => textContent(card)).join(" ")).toContain("98,765");
            expect(childNodes(harness.tree).filter((node) => node.type === "AreaChart")).toHaveLength(2);
        });

        it("updates date, granularity and module query filters from controls", () => {
            const harness = loadAnalyticsPage({ data: analyticsData });
            const preset = findNode(harness.tree, (node) => textContent(node) === "最近 7 天");
            const month = findNode(
                harness.tree,
                (node) => node.type === "button" && textContent(node) === "按月",
            );
            const module = findNode(harness.tree, (node) => node.props["aria-label"] === "功能模块");

            (preset?.props.onClick as () => void)();
            (month?.props.onClick as () => void)();
            (module?.props.onChange as (event: { target: { value: string } }) => void)({
                target: { value: "main" },
            });

            expect(harness.filters.at(-1)).toEqual({
                startDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
                endDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
                granularity: "month",
                toolKey: "main",
            });
        });

        it("shows error retry and an honest empty state", () => {
            const refetch = jest.fn();
            const error = loadAnalyticsPage({ isError: true, refetch });
            const retry = findNode(error.tree, (node) => textContent(node) === "重试");
            (retry?.props.onClick as () => void)();

            expect(refetch).toHaveBeenCalledTimes(1);

            const empty = loadAnalyticsPage({
                data: { ...analyticsData, summary: { ...analyticsData.summary, tasks: 0 } },
            });
            expect(textContent(empty.tree)).toContain("当前筛选条件下暂无生成任务");
            expect(textContent(empty.tree)).not.toContain("环比");
        });

        it("shows pending status, skeletons and a disabled refresh while loading", () => {
            const loading = loadAnalyticsPage({ isLoading: true, refetch: jest.fn() });
            const status = findNode(
                loading.tree,
                (node) => node.props.role === "status" && node.props["aria-label"] === "加载统计",
            );
            const refresh = findNode(
                loading.tree,
                (node) => node.type === "button" && textContent(node).includes("刷新"),
            );
            const skeletons = childNodes(loading.tree).filter(
                (node) => node.props.className === "studio-analytics__skeleton",
            );

            expect(status).toBeDefined();
            expect(textContent(status)).toContain("正在加载使用统计");
            expect(refresh?.props.disabled).toBe(true);
            expect(skeletons).toHaveLength(6);
        });

        it("sorts module rows immutably and exposes aria-sort", () => {
            const harness = loadAnalyticsPage({ data: analyticsData });
            const sortAnalyticsModules = harness.exports.sortAnalyticsModules as (
                rows: typeof analyticsData.modules,
                key: "tasks",
                direction: "asc" | "desc",
            ) => typeof analyticsData.modules;
            const original = analyticsData.modules.map((row) => row.toolKey);

            expect(sortAnalyticsModules(analyticsData.modules, "tasks", "asc").map((row) => row.toolKey))
                .toEqual(["creative", "main"]);
            expect(analyticsData.modules.map((row) => row.toolKey)).toEqual(original);

            const nameSort = findNode(harness.tree, (node) =>
                Boolean(node.props.onClick) && node.type === "button" && textContent(node) === "功能",
            );
            (nameSort?.props.onClick as () => void)();
            const sortedHeader = findNode(
                harness.tree,
                (node) => node.type === "th" && node.props["aria-sort"] === "ascending",
            );

            expect(sortedHeader).toBeDefined();
            expect(textContent(sortedHeader)).toContain("功能");
        });
    });

    it("builds filter-specific stable query keys with normalized defaults", () => {
        expect(analyticsQueryKey({})).toEqual([
            "image-studio",
            "console",
            "analytics",
            null,
            null,
            "day",
            null,
        ]);
        expect(
            analyticsQueryKey({
                startDate: "2026-11-01",
                endDate: "2026-11-20",
                granularity: "month",
                toolKey: "retouch",
            }),
        ).toEqual([
            "image-studio",
            "console",
            "analytics",
            "2026-11-01",
            "2026-11-20",
            "month",
            "retouch",
        ]);
    });

    it("requests analytics with the current filters and correct cache policy", async () => {
        const response = { range: {}, summary: {}, trend: [], modules: [] };
        (consoleHttpClient.get as jest.Mock).mockResolvedValue(response);
        const filter = {
            startDate: "2026-11-01",
            endDate: "2026-11-20",
            granularity: "month" as const,
            toolKey: "main",
        };

        useGenerationAnalyticsQuery(filter);

        const options = (useQuery as jest.Mock).mock.calls[0][0];
        expect(options.queryKey).toEqual(analyticsQueryKey(filter));
        expect(options.staleTime).toBe(30_000);
        await expect(options.queryFn()).resolves.toBe(response);
        expect(consoleHttpClient.get).toHaveBeenCalledWith("/analytics", {
            params: filter,
        });
    });

    it("keeps absent filters out of the hook request input", async () => {
        useGenerationAnalyticsQuery({ granularity: undefined, toolKey: undefined });

        const options = (useQuery as jest.Mock).mock.calls[0][0];
        await options.queryFn();
        expect(consoleHttpClient.get).toHaveBeenCalledWith("/analytics", { params: {} });
    });

    it("exports the console client from the real base service module", () => {
        const source = readFileSync(path.join(__dirname, "../src/web/services/base.ts"), "utf8");
        const code = ts.transpileModule(source, {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2022,
            },
        }).outputText;
        const api = { kind: "api" };
        const console = { kind: "console" };
        const module = { exports: {} as Record<string, unknown> };

        runInNewContext(code, {
            module,
            exports: module.exports,
            require: (name: string) => {
                if (name === "@buildingai/services") {
                    return {
                        createPluginHttpClients: () => ({
                            apiHttpClient: api,
                            consoleHttpClient: console,
                        }),
                    };
                }
                throw new Error(`Unexpected base service dependency: ${name}`);
            },
        });

        expect(module.exports).toEqual({
            apiHttpClient: api,
            consoleHttpClient: console,
        });
    });
});
