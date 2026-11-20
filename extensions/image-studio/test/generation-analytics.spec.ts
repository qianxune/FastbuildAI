import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { QueryAnalyticsDto } from "../src/api/modules/generation/dto/query-analytics.dto";
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

describe("generation analytics contract", () => {
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

        it("merges the catalog and groups unknown historical tools after known modules", () => {
            const modules = mergeModuleCatalog([
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
                    tasks: "2",
                    generatedImages: "0",
                    completedTasks: "0",
                    failedTasks: "0",
                    cancelledTasks: "2",
                    consumedCredits: "0",
                    refundedCredits: "20",
                },
                {
                    toolKey: "legacy-b",
                    activeUsers: "1",
                    tasks: "1",
                    generatedImages: "1",
                    completedTasks: "1",
                    failedTasks: "0",
                    cancelledTasks: "0",
                    consumedCredits: "10",
                    refundedCredits: "0",
                },
            ]);

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
                activeUsers: 2,
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
