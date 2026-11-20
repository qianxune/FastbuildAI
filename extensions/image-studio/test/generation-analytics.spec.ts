import { readFileSync } from "node:fs";
import { join } from "node:path";

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { AnalyticsController } from "../src/api/modules/generation/controllers/console/analytics.controller";
import { QueryAnalyticsDto } from "../src/api/modules/generation/dto/query-analytics.dto";
import { GenerationAnalyticsService } from "../src/api/modules/generation/services/generation-analytics.service";
import {
    failureRate,
    fillAnalyticsPeriods,
    mergeModuleCatalog,
    normalizeAnalyticsMetrics,
    normalizeAnalyticsNumber,
} from "../src/api/modules/generation/services/generation-analytics.util";
import type {
    AnalyticsGranularity,
    GenerationAnalytics,
} from "../src/api/shared/analytics";
import "../src/api/shared/analytics";

jest.mock("@buildingai/errors", () => ({
    HttpErrorFactory: {
        badRequest: (message: string) => new Error(message),
    },
}));
jest.mock("@buildingai/core/decorators", () => ({
    ExtensionConsoleController: () => (target: unknown) => target,
}));
jest.mock("@buildingai/decorators/super-admin-only.decorator", () => ({
    SuperAdminOnly: () => (target: unknown) => target,
}));
jest.mock("../src/api/db/entities/image-generation.entity", () => ({
    ImageGeneration: class ImageGeneration {},
}));

describe("generation analytics contract", () => {
    describe("generation analytics console controller", () => {
        it("passes the validated query to the analytics service", async () => {
            const query = new QueryAnalyticsDto();
            query.startDate = "2026-11-01";
            query.endDate = "2026-11-30";
            query.toolKey = "main";
            const dashboard = { range: query };
            const getDashboard = jest.fn().mockResolvedValue(dashboard);
            const controller = new AnalyticsController({ getDashboard } as never);

            await expect(controller.getDashboard(query)).resolves.toBe(dashboard);
            expect(getDashboard).toHaveBeenCalledWith(query);
        });

        it("exposes a read-only super-admin route and is registered by the module", () => {
            const controllerSource = readFileSync(
                join(
                    __dirname,
                    "../src/api/modules/generation/controllers/console/analytics.controller.ts",
                ),
                "utf8",
            );
            const moduleSource = readFileSync(
                join(__dirname, "../src/api/modules/generation/generation.module.ts"),
                "utf8",
            );

            expect(controllerSource).toContain("@SuperAdminOnly()");
            expect(controllerSource).toContain(
                '@ExtensionConsoleController("analytics", "生图使用统计")',
            );
            expect(controllerSource).toMatch(
                /transform:\s*true,\s*whitelist:\s*true,\s*forbidNonWhitelisted:\s*true/,
            );
            expect(controllerSource).toMatch(/@Get\(\)/);
            expect(controllerSource).toMatch(
                /@Query\(analyticsValidation\)\s+query:\s*QueryAnalyticsDto/,
            );
            expect(controllerSource).not.toMatch(/@(Post|Put|Patch|Delete)\b/);
            expect(moduleSource).toMatch(
                /controllers:\s*\[[\s\S]*AnalyticsController[\s\S]*\]/,
            );
            expect(moduleSource).toMatch(
                /providers:\s*\[[\s\S]*GenerationAnalyticsService[\s\S]*\]/,
            );
        });
    });

    it("defines the full console analytics contract", () => {
        const granularity: AnalyticsGranularity = "day";
        const result: GenerationAnalytics = {
            range: {
                startDate: "2026-11-01",
                endDate: "2026-11-30",
                granularity,
                timezone: "Asia/Shanghai",
                toolKey: null,
            },
            summary: {
                tasks: 12,
                activeUsers: 3,
                requestedImages: 18,
                generatedImages: 15,
                completedTasks: 8,
                failedTasks: 2,
                cancelledTasks: 1,
                failureRate: 20,
                consumedCredits: 120,
                refundedCredits: 30,
            },
            trend: [
                {
                    period: "2026-11-01",
                    tasks: 4,
                    generatedImages: 5,
                    failedTasks: 1,
                    consumedCredits: 40,
                },
            ],
            modules: [
                {
                    toolKey: "main",
                    name: "商品主图",
                    category: "电商生图",
                    activeUsers: 2,
                    tasks: 4,
                    generatedImages: 5,
                    completedTasks: 3,
                    failedTasks: 1,
                    cancelledTasks: 0,
                    failureRate: 25,
                    consumedCredits: 40,
                    refundedCredits: 10,
                },
            ],
        };

        expect(result.range.granularity).toBe("day");
        expect(result.range.timezone).toBe("Asia/Shanghai");
        expect(result.summary).toMatchObject({
            tasks: 12,
            requestedImages: 18,
            generatedImages: 15,
            failureRate: 20,
            consumedCredits: 120,
            refundedCredits: 30,
        });
        expect(result.trend[0]).toMatchObject({
            period: "2026-11-01",
            tasks: 4,
            generatedImages: 5,
        });
        expect(result.modules[0]).toMatchObject({
            toolKey: "main",
            category: "电商生图",
            completedTasks: 3,
            failedTasks: 1,
            cancelledTasks: 0,
        });
    });

    describe("generation analytics service", () => {
        type FakeBuilderOptions = {
            one?: Record<string, unknown> | null;
            many?: Record<string, unknown>[];
        };

        class FakeQueryBuilder {
            readonly sql: string[] = [];
            readonly parameters: Record<string, unknown>[] = [];

            constructor(private readonly options: FakeBuilderOptions = {}) {}

            select(expression: string) {
                this.sql.push(`SELECT ${expression}`);
                return this;
            }

            addSelect(expression: string) {
                this.sql.push(`ADD SELECT ${expression}`);
                return this;
            }

            where(expression: string, parameters?: Record<string, unknown>) {
                this.sql.push(`WHERE ${expression}`);
                if (parameters) this.parameters.push(parameters);
                return this;
            }

            andWhere(expression: string, parameters?: Record<string, unknown>) {
                this.sql.push(`AND WHERE ${expression}`);
                if (parameters) this.parameters.push(parameters);
                return this;
            }

            groupBy(expression: string) {
                this.sql.push(`GROUP BY ${expression}`);
                return this;
            }

            addGroupBy(expression: string) {
                this.sql.push(`ADD GROUP BY ${expression}`);
                return this;
            }

            orderBy(expression: string) {
                this.sql.push(`ORDER BY ${expression}`);
                return this;
            }

            async getRawOne() {
                return this.options.one ?? null;
            }

            async getRawMany() {
                return this.options.many ?? [];
            }
        }

        function serviceWith(...builders: FakeQueryBuilder[]) {
            const createQueryBuilder = jest.fn(() => builders.shift());
            const repository = { createQueryBuilder };
            const service = new GenerationAnalyticsService(
                repository as never,
            );
            return { service, createQueryBuilder };
        }

        function populatedBuilders() {
            return [
                new FakeQueryBuilder({
                    one: {
                        tasks: "12",
                        activeUsers: "3",
                        requestedImages: "18",
                        generatedImages: "15",
                        completedTasks: "8",
                        failedTasks: "2",
                        cancelledTasks: "2",
                        consumedCredits: "120.5",
                        refundedCredits: "30",
                    },
                }),
                new FakeQueryBuilder({
                    many: [
                        {
                            period: "2026-11-01",
                            tasks: "12",
                            generatedImages: "15",
                            failedTasks: "2",
                            consumedCredits: "120.5",
                        },
                    ],
                }),
                new FakeQueryBuilder({
                    many: [
                        {
                            toolKey: "main",
                            activeUsers: "2",
                            tasks: "12",
                            generatedImages: "15",
                            completedTasks: "8",
                            failedTasks: "2",
                            cancelledTasks: "2",
                            consumedCredits: "120.5",
                            refundedCredits: "30",
                        },
                    ],
                }),
                new FakeQueryBuilder({
                    one: {
                        activeUsers: "1",
                        tasks: "3",
                        generatedImages: "2",
                        completedTasks: "1",
                        failedTasks: "0",
                        cancelledTasks: "2",
                        consumedCredits: "10",
                        refundedCredits: "20",
                    },
                }),
            ];
        }

        it.each([
            [{ startDate: "2026-11-01" }, "one-sided start"],
            [{ endDate: "2026-11-30" }, "one-sided end"],
            [{ startDate: "2026-11-30", endDate: "2026-11-01" }, "reversed"],
            [{ startDate: "2025-01-01", endDate: "2026-01-02" }, "367 days"],
            [{ startDate: "2024-01-01", endDate: "2026-01-31", granularity: "month" }, "25 months"],
        ])("rejects an invalid range: %s (%s)", async (query) => {
            const { service, createQueryBuilder } = serviceWith();
            await expect(service.getDashboard(query as QueryAnalyticsDto)).rejects.toThrow();
            expect(createQueryBuilder).not.toHaveBeenCalled();
        });

        it("defaults to the last 30 inclusive Shanghai calendar days", async () => {
            jest.useFakeTimers().setSystemTime(new Date("2026-11-20T15:00:00.000Z"));
            const builders = populatedBuilders();
            const { service } = serviceWith(...builders);

            const result = await service.getDashboard({});

            expect(result.range).toEqual({
                startDate: "2026-10-22",
                endDate: "2026-11-20",
                granularity: "day",
                timezone: "Asia/Shanghai",
                toolKey: null,
            });
            const dateParameters = builders.flatMap((builder) => builder.parameters);
            expect(dateParameters).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    startInclusive: "2026-10-21T16:00:00.000Z",
                }),
                expect.objectContaining({
                    endExclusive: "2026-11-20T16:00:00.000Z",
                }),
            ]));
            jest.useRealTimers();
        });

        it("normalizes aggregates and fills missing trend periods", async () => {
            const { service } = serviceWith(...populatedBuilders());

            const result = await service.getDashboard({
                startDate: "2026-11-01",
                endDate: "2026-11-03",
            });

            expect(result.summary).toEqual({
                tasks: 12,
                activeUsers: 3,
                requestedImages: 18,
                generatedImages: 15,
                completedTasks: 8,
                failedTasks: 2,
                cancelledTasks: 2,
                failureRate: 20,
                consumedCredits: 120.5,
                refundedCredits: 30,
            });
            expect(result.trend).toEqual([
                {
                    period: "2026-11-01",
                    tasks: 12,
                    generatedImages: 15,
                    failedTasks: 2,
                    consumedCredits: 120.5,
                },
                {
                    period: "2026-11-02",
                    tasks: 0,
                    generatedImages: 0,
                    failedTasks: 0,
                    consumedCredits: 0,
                },
                {
                    period: "2026-11-03",
                    tasks: 0,
                    generatedImages: 0,
                    failedTasks: 0,
                    consumedCredits: 0,
                },
            ]);
        });

        it("returns only the selected module and avoids an unknown query", async () => {
            const builders = populatedBuilders();
            const { service, createQueryBuilder } = serviceWith(...builders.slice(0, 3));

            const result = await service.getDashboard({
                startDate: "2026-11-01",
                endDate: "2026-11-03",
                toolKey: "main",
            });

            expect(createQueryBuilder).toHaveBeenCalledTimes(3);
            expect(result.modules.map((module) => module.toolKey)).toEqual(["main"]);
            expect(result.range.toolKey).toBe("main");
            expect(builders[0].sql.join("\n")).not.toContain("prompt");
        });

        it("uses one separately aggregated unknown row without summing overlaps", async () => {
            const { service } = serviceWith(...populatedBuilders());

            const result = await service.getDashboard({
                startDate: "2026-11-01",
                endDate: "2026-11-03",
            });

            expect(result.modules.at(-1)).toMatchObject({
                toolKey: "unknown",
                activeUsers: 1,
                tasks: 3,
            });
            expect(result.modules).toHaveLength(22);
        });

        it("omits an empty unknown aggregate", async () => {
            const builders = populatedBuilders();
            builders[3] = new FakeQueryBuilder({
                one: { tasks: "0", activeUsers: "0", consumedCredits: "0" },
            });
            const { service } = serviceWith(...builders);

            const result = await service.getDashboard({
                startDate: "2026-11-01",
                endDate: "2026-11-03",
            });

            expect(result.modules).toHaveLength(21);
        });

        it("uses aggregate-only PostgreSQL expressions and Shanghai grouping", async () => {
            const builders = populatedBuilders();
            const { service } = serviceWith(...builders);

            await service.getDashboard({
                startDate: "2026-11-01",
                endDate: "2026-11-03",
                granularity: "month",
            });

            const sql = builders.flatMap((builder) => builder.sql).join("\n");
            expect(sql).toContain("jsonb_array_length");
            expect(sql).toContain("billingStatus");
            expect(sql).toContain("'charged'");
            expect(sql).toContain("'refunded'");
            expect(sql).toContain("COUNT(DISTINCT");
            expect(sql).toContain("AT TIME ZONE 'Asia/Shanghai'");
            expect(sql).toContain("DATE_TRUNC('month'");
            expect(sql).toContain("YYYY-MM");
            expect(sql).not.toContain("generation.prompt");
            expect(sql).not.toContain("generation.error");
        });

        it("returns no PII fields in the dashboard result", async () => {
            const { service } = serviceWith(...populatedBuilders());
            const result = await service.getDashboard({
                startDate: "2026-11-01",
                endDate: "2026-11-03",
            });
            const serialized = JSON.stringify(result);

            expect(serialized).not.toMatch(/"userId"|"prompt"|"error"|"images"/);
        });
    });

    describe("generation analytics aggregation helpers", () => {
        it("normalizes PostgreSQL aggregate strings and invalid numbers", () => {
            expect(normalizeAnalyticsNumber("12.5")).toBe(12.5);
            expect(normalizeAnalyticsNumber(null)).toBe(0);
            expect(normalizeAnalyticsNumber("not-a-number")).toBe(0);
            expect(normalizeAnalyticsNumber(Infinity)).toBe(0);
        });

        it("keeps refunded credits separate from consumed credits", () => {
            expect(
                normalizeAnalyticsMetrics({
                    consumedCredits: "40",
                    refundedCredits: "12",
                }),
            ).toMatchObject({
                consumedCredits: 40,
                refundedCredits: 12,
            });
        });

        it("excludes cancellations from the failure-rate denominator", () => {
            expect(
                normalizeAnalyticsMetrics({
                    completedTasks: 8,
                    failedTasks: 2,
                    cancelledTasks: 50,
                }),
            ).toMatchObject({
                cancelledTasks: 50,
                failureRate: 20,
            });
        });

        it("returns zero for a failure rate with no terminal tasks", () => {
            expect(failureRate(0, 0)).toBe(0);
        });

        it("fills missing daily periods without shifting Shanghai calendar labels", () => {
            expect(
                fillAnalyticsPeriods("2026-11-01", "2026-11-03", "day", [
                    {
                        period: "2026-11-01",
                        tasks: "2",
                        generatedImages: "3",
                        failedTasks: "1",
                        consumedCredits: "20",
                    },
                    {
                        period: "2026-11-03",
                        tasks: "1",
                        generatedImages: "1",
                        failedTasks: "0",
                        consumedCredits: "10",
                    },
                ]),
            ).toEqual([
                {
                    period: "2026-11-01",
                    tasks: 2,
                    generatedImages: 3,
                    failedTasks: 1,
                    consumedCredits: 20,
                },
                {
                    period: "2026-11-02",
                    tasks: 0,
                    generatedImages: 0,
                    failedTasks: 0,
                    consumedCredits: 0,
                },
                {
                    period: "2026-11-03",
                    tasks: 1,
                    generatedImages: 1,
                    failedTasks: 0,
                    consumedCredits: 10,
                },
            ]);
        });

        it("fills missing monthly periods", () => {
            expect(
                fillAnalyticsPeriods("2026-10", "2026-12", "month", [
                    {
                        period: "2026-10",
                        tasks: 1,
                        generatedImages: 1,
                        failedTasks: 0,
                        consumedCredits: 5,
                    },
                    {
                        period: "2026-12",
                        tasks: 2,
                        generatedImages: 3,
                        failedTasks: 1,
                        consumedCredits: 15,
                    },
                ]),
            ).toEqual([
                {
                    period: "2026-10",
                    tasks: 1,
                    generatedImages: 1,
                    failedTasks: 0,
                    consumedCredits: 5,
                },
                {
                    period: "2026-11",
                    tasks: 0,
                    generatedImages: 0,
                    failedTasks: 0,
                    consumedCredits: 0,
                },
                {
                    period: "2026-12",
                    tasks: 2,
                    generatedImages: 3,
                    failedTasks: 1,
                    consumedCredits: 15,
                },
            ]);
        });

        it("uses pre-aggregated unknown active users without double-counting overlap", () => {
            const modules = mergeModuleCatalog(
                [
                    {
                        toolKey: "main",
                        activeUsers: "2",
                        tasks: "3",
                        generatedImages: "4",
                        completedTasks: "2",
                        failedTasks: "1",
                        cancelledTasks: "0",
                        consumedCredits: "30",
                        refundedCredits: "5",
                    },
                    {
                        toolKey: "legacy-a",
                        activeUsers: "1",
                    },
                    {
                        toolKey: "legacy-b",
                        activeUsers: "1",
                    },
                ],
                {
                    // The same user appears in both per-key rows above, so this separately
                    // aggregated value must be used instead of their sum.
                    activeUsers: "1",
                    tasks: "3",
                    generatedImages: "1",
                    completedTasks: "1",
                    failedTasks: "0",
                    cancelledTasks: "2",
                    consumedCredits: "10",
                    refundedCredits: "20",
                },
            );

            expect(modules[1]).toMatchObject({
                toolKey: "main",
                name: "商品主图",
                category: "电商生图",
                failureRate: 33.3,
                consumedCredits: 30,
                refundedCredits: 5,
            });
            expect(modules.at(-1)).toEqual({
                toolKey: "unknown",
                name: "未知功能",
                category: "基础生图",
                activeUsers: 1,
                tasks: 3,
                generatedImages: 1,
                completedTasks: 1,
                failedTasks: 0,
                cancelledTasks: 2,
                failureRate: 0,
                consumedCredits: 10,
                refundedCredits: 20,
            });
        });
    });

    describe("generation analytics query validation", () => {
        const validateQuery = (input: Record<string, unknown>) =>
            validate(plainToInstance(QueryAnalyticsDto, input));

        it("accepts an omitted range and applies the default granularity", async () => {
            const query = plainToInstance(QueryAnalyticsDto, {});

            expect(query.startDate).toBeUndefined();
            expect(query.endDate).toBeUndefined();
            expect(query.granularity).toBe("day");
            expect(query.toolKey).toBeUndefined();
            await expect(validate(query)).resolves.toHaveLength(0);
        });

        it.each(["day", "month"])("accepts %s granularity", async (granularity) => {
            await expect(validateQuery({ granularity })).resolves.toHaveLength(0);
        });

        it("accepts an exact date range and supported tool", async () => {
            await expect(
                validateQuery({
                    startDate: "2026-11-01",
                    endDate: "2026-11-30",
                    toolKey: "main",
                }),
            ).resolves.toHaveLength(0);
        });

        it("does not reject a one-sided date range", async () => {
            await expect(validateQuery({ startDate: "2026-11-01" })).resolves.toHaveLength(0);
            await expect(validateQuery({ endDate: "2026-11-30" })).resolves.toHaveLength(0);
        });

        it.each(["2026/11/01", "2026-1-01", "01-11-2026"])(
            "rejects invalid date syntax %s",
            async (date) => {
                await expect(validateQuery({ startDate: date })).resolves.not.toHaveLength(0);
                await expect(validateQuery({ endDate: date })).resolves.not.toHaveLength(0);
            },
        );

        it.each(["2026-02-30", "2026-13-01", "2026-00-10", "2025-02-29"])(
            "rejects invalid calendar date %s",
            async (date) => {
                await expect(validateQuery({ startDate: date })).resolves.not.toHaveLength(0);
                await expect(validateQuery({ endDate: date })).resolves.not.toHaveLength(0);
            },
        );

        it("accepts a valid leap day", async () => {
            await expect(
                validateQuery({ startDate: "2024-02-29", endDate: "2024-02-29" }),
            ).resolves.toHaveLength(0);
        });

        it("rejects invalid granularity", async () => {
            await expect(validateQuery({ granularity: "week" })).resolves.not.toHaveLength(0);
        });

        it("rejects an unsupported or non-string tool", async () => {
            await expect(validateQuery({ toolKey: "unknown" })).resolves.not.toHaveLength(0);
            await expect(validateQuery({ toolKey: 42 })).resolves.not.toHaveLength(0);
        });
    });
});
