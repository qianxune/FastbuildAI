import type { PricingCategory } from "./pricing";

export type AnalyticsGranularity = "day" | "month";

export type GenerationAnalyticsRange = {
    startDate: string;
    endDate: string;
    granularity: AnalyticsGranularity;
    timezone: "Asia/Shanghai";
    toolKey: string | null;
};

export type GenerationAnalyticsSummary = {
    tasks: number;
    activeUsers: number;
    requestedImages: number;
    generatedImages: number;
    completedTasks: number;
    failedTasks: number;
    cancelledTasks: number;
    failureRate: number;
    consumedCredits: number;
    refundedCredits: number;
};

export type GenerationAnalyticsTrendItem = {
    period: string;
    tasks: number;
    generatedImages: number;
    failedTasks: number;
    consumedCredits: number;
};

export type GenerationAnalyticsModuleItem = {
    toolKey: string;
    name: string;
    category: PricingCategory;
    activeUsers: number;
    tasks: number;
    generatedImages: number;
    completedTasks: number;
    failedTasks: number;
    cancelledTasks: number;
    failureRate: number;
    consumedCredits: number;
    refundedCredits: number;
};

export type GenerationAnalytics = {
    range: GenerationAnalyticsRange;
    summary: GenerationAnalyticsSummary;
    trend: GenerationAnalyticsTrendItem[];
    modules: GenerationAnalyticsModuleItem[];
};
