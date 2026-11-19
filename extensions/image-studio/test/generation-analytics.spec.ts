import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { QueryAnalyticsDto } from "../src/api/modules/generation/dto/query-analytics.dto";
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

        it("rejects invalid granularity", async () => {
            await expect(validateQuery({ granularity: "week" })).resolves.not.toHaveLength(0);
        });

        it("rejects an unsupported or non-string tool", async () => {
            await expect(validateQuery({ toolKey: "unknown" })).resolves.not.toHaveLength(0);
            await expect(validateQuery({ toolKey: 42 })).resolves.not.toHaveLength(0);
        });
    });
});
