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
