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
});
