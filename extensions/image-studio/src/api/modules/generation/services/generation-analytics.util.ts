import type {
    AnalyticsGranularity,
    GenerationAnalyticsModuleItem,
    GenerationAnalyticsSummary,
    GenerationAnalyticsTrendItem,
} from "../../../shared/analytics";
import {
    PRICING_CATALOG,
    PRICING_KEYS,
    type PricingCategory,
} from "../../../shared/pricing";

// PricingCategory has no unknown value; legacy tools use a stable neutral fallback.
const UNKNOWN_ANALYTICS_CATEGORY: PricingCategory = "基础生图";

export type RawAnalyticsMetrics = {
    tasks?: unknown;
    activeUsers?: unknown;
    requestedImages?: unknown;
    generatedImages?: unknown;
    completedTasks?: unknown;
    failedTasks?: unknown;
    cancelledTasks?: unknown;
    consumedCredits?: unknown;
    refundedCredits?: unknown;
};

export type RawAnalyticsTrendRow = {
    period: unknown;
    tasks?: unknown;
    generatedImages?: unknown;
    failedTasks?: unknown;
    consumedCredits?: unknown;
};

export type RawAnalyticsModuleRow = RawAnalyticsMetrics & {
    toolKey: unknown;
};

export type RawAnalyticsUnknownRow = RawAnalyticsMetrics;

export function normalizeAnalyticsNumber(value: unknown): number {
    if (typeof value === "string" && value.trim() === "") return 0;

    const parsed =
        typeof value === "number" || typeof value === "string"
            ? Number(value)
            : 0;
    return Number.isFinite(parsed) ? parsed : 0;
}

export function failureRate(completedTasks: number, failedTasks: number): number {
    const completed = normalizeAnalyticsNumber(completedTasks);
    const failed = normalizeAnalyticsNumber(failedTasks);
    const terminalTasks = completed + failed;
    if (terminalTasks <= 0) return 0;

    return Math.round((failed / terminalTasks) * 1000) / 10;
}

export function normalizeAnalyticsMetrics(raw: RawAnalyticsMetrics): GenerationAnalyticsSummary {
    const completedTasks = normalizeAnalyticsNumber(raw.completedTasks);
    const failedTasks = normalizeAnalyticsNumber(raw.failedTasks);

    return {
        tasks: normalizeAnalyticsNumber(raw.tasks),
        activeUsers: normalizeAnalyticsNumber(raw.activeUsers),
        requestedImages: normalizeAnalyticsNumber(raw.requestedImages),
        generatedImages: normalizeAnalyticsNumber(raw.generatedImages),
        completedTasks,
        failedTasks,
        cancelledTasks: normalizeAnalyticsNumber(raw.cancelledTasks),
        failureRate: failureRate(completedTasks, failedTasks),
        consumedCredits: normalizeAnalyticsNumber(raw.consumedCredits),
        refundedCredits: normalizeAnalyticsNumber(raw.refundedCredits),
    };
}

function formatUtcDay(timestamp: number): string {
    const date = new Date(timestamp);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function periodLabels(
    startPeriod: string,
    endPeriod: string,
    granularity: AnalyticsGranularity,
): string[] {
    const labels: string[] = [];

    if (granularity === "month") {
        const start = /^(\d{4})-(\d{2})$/.exec(startPeriod);
        const end = /^(\d{4})-(\d{2})$/.exec(endPeriod);
        if (!start || !end) return labels;

        const startMonth = Number(start[1]) * 12 + Number(start[2]) - 1;
        const endMonth = Number(end[1]) * 12 + Number(end[2]) - 1;
        if (Number(start[2]) < 1 || Number(start[2]) > 12 || Number(end[2]) < 1 || Number(end[2]) > 12) {
            return labels;
        }

        for (let monthIndex = startMonth; monthIndex <= endMonth; monthIndex += 1) {
            const year = Math.floor(monthIndex / 12);
            const month = String((monthIndex % 12) + 1).padStart(2, "0");
            labels.push(`${year}-${month}`);
        }
        return labels;
    }

    const startDate = Date.parse(`${startPeriod}T00:00:00.000Z`);
    const endDate = Date.parse(`${endPeriod}T00:00:00.000Z`);
    if (
        !Number.isFinite(startDate) ||
        !Number.isFinite(endDate) ||
        formatUtcDay(startDate) !== startPeriod ||
        formatUtcDay(endDate) !== endPeriod
    ) {
        return labels;
    }

    const oneDay = 24 * 60 * 60 * 1000;
    for (let timestamp = startDate; timestamp <= endDate; timestamp += oneDay) {
        labels.push(formatUtcDay(timestamp));
    }
    return labels;
}

function normalizeTrendRow(
    period: string,
    row?: RawAnalyticsTrendRow,
): GenerationAnalyticsTrendItem {
    return {
        period,
        tasks: normalizeAnalyticsNumber(row?.tasks),
        generatedImages: normalizeAnalyticsNumber(row?.generatedImages),
        failedTasks: normalizeAnalyticsNumber(row?.failedTasks),
        consumedCredits: normalizeAnalyticsNumber(row?.consumedCredits),
    };
}

export function fillAnalyticsPeriods(
    startPeriod: string,
    endPeriod: string,
    granularity: AnalyticsGranularity,
    rows: readonly RawAnalyticsTrendRow[],
): GenerationAnalyticsTrendItem[] {
    const rowsByPeriod = new Map<string, RawAnalyticsTrendRow>();
    for (const row of rows) {
        if (typeof row.period !== "string") continue;
        rowsByPeriod.set(row.period, row);
    }

    return periodLabels(startPeriod, endPeriod, granularity).map((period) =>
        normalizeTrendRow(period, rowsByPeriod.get(period)),
    );
}

function addModuleMetrics(
    target: GenerationAnalyticsModuleItem,
    raw: RawAnalyticsMetrics,
): void {
    const metrics = normalizeAnalyticsMetrics(raw);
    target.activeUsers += metrics.activeUsers;
    target.tasks += metrics.tasks;
    target.generatedImages += metrics.generatedImages;
    target.completedTasks += metrics.completedTasks;
    target.failedTasks += metrics.failedTasks;
    target.cancelledTasks += metrics.cancelledTasks;
    target.consumedCredits += metrics.consumedCredits;
    target.refundedCredits += metrics.refundedCredits;
}

function emptyModule(
    toolKey: string,
    name: string,
    category: PricingCategory,
): GenerationAnalyticsModuleItem {
    return {
        toolKey,
        name,
        category,
        activeUsers: 0,
        tasks: 0,
        generatedImages: 0,
        completedTasks: 0,
        failedTasks: 0,
        cancelledTasks: 0,
        failureRate: 0,
        consumedCredits: 0,
        refundedCredits: 0,
    };
}

export function mergeModuleCatalog(
    knownRows: readonly RawAnalyticsModuleRow[],
    unknownRow?: RawAnalyticsUnknownRow | null,
): GenerationAnalyticsModuleItem[] {
    const modules = PRICING_CATALOG.map((entry) =>
        emptyModule(entry.key, entry.name, entry.category),
    );
    const modulesByTool = new Map(modules.map((module) => [module.toolKey, module]));

    for (const row of knownRows) {
        const toolKey = typeof row.toolKey === "string" ? row.toolKey : "";
        if (!PRICING_KEYS.has(toolKey)) continue;

        addModuleMetrics(modulesByTool.get(toolKey)!, row);
    }

    if (unknownRow) {
        const unknownModule = emptyModule(
            "unknown",
            "未知功能",
            UNKNOWN_ANALYTICS_CATEGORY,
        );
        addModuleMetrics(unknownModule, unknownRow);
        modules.push(unknownModule);
    }

    return modules.map((module) => ({
        ...module,
        failureRate: failureRate(module.completedTasks, module.failedTasks),
    }));
}
