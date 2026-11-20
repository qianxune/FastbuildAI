export type AnalyticsModuleCategory =
    | "基础生图"
    | "电商生图"
    | "AI 修图"
    | "服饰穿戴";

export const ANALYTICS_MODULE_CATALOG = [
    { key: "creative", name: "创意生图", category: "基础生图" },
    { key: "main", name: "商品主图", category: "电商生图" },
    { key: "detail", name: "商品详情", category: "电商生图" },
    { key: "replica", name: "爆款复刻", category: "电商生图" },
    { key: "fusion", name: "多图融合", category: "电商生图" },
    { key: "sku", name: "商品SKU图", category: "电商生图" },
    { key: "retouch", name: "产品精修", category: "AI 修图" },
    { key: "recolor", name: "商品换色", category: "AI 修图" },
    { key: "redraw", name: "局部重绘", category: "AI 修图" },
    { key: "cutout", name: "一键抠图", category: "AI 修图" },
    { key: "watermark", name: "去除水印", category: "AI 修图" },
    { key: "expand", name: "智能扩图", category: "AI 修图" },
    { key: "translate", name: "图片翻译", category: "AI 修图" },
    { key: "tryon", name: "模特试穿", category: "服饰穿戴" },
    { key: "model_swap", name: "换模特", category: "服饰穿戴" },
    { key: "outfit", name: "服饰穿搭", category: "服饰穿戴" },
    { key: "fabric", name: "材料到服装", category: "服饰穿戴" },
    { key: "apparel_sku", name: "服饰SKU变体", category: "服饰穿戴" },
    { key: "ugc_outfit", name: "种草穿搭", category: "服饰穿戴" },
    { key: "nail_tryon", name: "美甲上手", category: "服饰穿戴" },
    { key: "dewrinkle", name: "服装去皱", category: "服饰穿戴" },
] as const satisfies readonly {
    key: string;
    name: string;
    category: AnalyticsModuleCategory;
}[];

export const ANALYTICS_MODULE_KEYS: ReadonlySet<string> = new Set(
    ANALYTICS_MODULE_CATALOG.map((entry) => entry.key),
);

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
    category: AnalyticsModuleCategory;
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
