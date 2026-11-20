import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { Repository, type SelectQueryBuilder } from "@buildingai/db/typeorm";
import { HttpErrorFactory } from "@buildingai/errors";
import { Injectable } from "@nestjs/common";

import { ImageGeneration } from "../../../db/entities/image-generation.entity";
import type {
    AnalyticsGranularity,
    GenerationAnalytics,
} from "../../../shared/analytics";
import { PRICING_KEYS } from "../../../shared/pricing";
import type { QueryAnalyticsDto } from "../dto/query-analytics.dto";
import {
    fillAnalyticsPeriods,
    mergeModuleCatalog,
    normalizeAnalyticsMetrics,
    normalizeAnalyticsNumber,
    type RawAnalyticsModuleRow,
    type RawAnalyticsTrendRow,
    type RawAnalyticsUnknownRow,
} from "./generation-analytics.util";

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAY_RANGE = 366;
const MAX_MONTH_RANGE = 24;
const KNOWN_TOOL_KEYS = [...PRICING_KEYS];

type AnalyticsRange = {
    startDate: string;
    endDate: string;
    granularity: AnalyticsGranularity;
    startInclusive: string;
    endExclusive: string;
};

function utcDateLabel(timestamp: number): string {
    return new Date(timestamp).toISOString().slice(0, 10);
}

function dateTimestamp(date: string): number | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

    const timestamp = Date.parse(`${date}T00:00:00.000Z`);
    if (!Number.isFinite(timestamp)) return null;
    return utcDateLabel(timestamp) === date ? timestamp : null;
}

function addCalendarDays(date: string, days: number): string {
    const timestamp = dateTimestamp(date);
    if (timestamp === null) {
        throw HttpErrorFactory.badRequest("统计日期无效");
    }
    return utcDateLabel(timestamp + days * ONE_DAY_MS);
}

function shanghaiToday(): string {
    return utcDateLabel(Date.now() + SHANGHAI_OFFSET_MS);
}

function monthIndex(date: string): number {
    return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
}

function normalizeRange(query: QueryAnalyticsDto): AnalyticsRange {
    const hasStart = query.startDate !== undefined;
    const hasEnd = query.endDate !== undefined;
    if (hasStart !== hasEnd) {
        throw HttpErrorFactory.badRequest("开始日期和结束日期必须同时提供");
    }

    let startDate = query.startDate;
    let endDate = query.endDate;
    if (!startDate && !endDate) {
        endDate = shanghaiToday();
        startDate = addCalendarDays(endDate, -29);
    }

    const startTimestamp = dateTimestamp(startDate!);
    const endTimestamp = dateTimestamp(endDate!);
    if (startTimestamp === null || endTimestamp === null) {
        throw HttpErrorFactory.badRequest("统计日期无效");
    }
    if (endTimestamp < startTimestamp) {
        throw HttpErrorFactory.badRequest("结束日期不能早于开始日期");
    }

    const granularity = query.granularity ?? "day";
    if (granularity !== "day" && granularity !== "month") {
        throw HttpErrorFactory.badRequest("统计粒度无效");
    }
    if (granularity === "day") {
        const dayCount = Math.floor((endTimestamp - startTimestamp) / ONE_DAY_MS) + 1;
        if (dayCount > MAX_DAY_RANGE) {
            throw HttpErrorFactory.badRequest(`日统计范围不能超过 ${MAX_DAY_RANGE} 天`);
        }
    } else {
        const monthCount = monthIndex(endDate!) - monthIndex(startDate!) + 1;
        if (monthCount > MAX_MONTH_RANGE) {
            throw HttpErrorFactory.badRequest(`月统计范围不能超过 ${MAX_MONTH_RANGE} 个月`);
        }
    }

    const endExclusiveDate = addCalendarDays(endDate!, 1);
    return {
        startDate: startDate!,
        endDate: endDate!,
        granularity,
        startInclusive: new Date(`${startDate}T00:00:00+08:00`).toISOString(),
        endExclusive: new Date(`${endExclusiveDate}T00:00:00+08:00`).toISOString(),
    };
}

const SUMMARY_SELECTS = [
    `COUNT(*) AS "tasks"`,
    `COUNT(DISTINCT generation.userId) AS "activeUsers"`,
    `COALESCE(SUM(generation.count), 0) AS "requestedImages"`,
    `COALESCE(SUM(jsonb_array_length(generation.images::jsonb)), 0) AS "generatedImages"`,
    `COUNT(*) FILTER (WHERE generation.status = 'completed') AS "completedTasks"`,
    `COUNT(*) FILTER (WHERE generation.status = 'failed') AS "failedTasks"`,
    `COUNT(*) FILTER (WHERE generation.status = 'cancelled') AS "cancelledTasks"`,
    `COALESCE(SUM(CASE WHEN generation.billingStatus = 'charged' THEN generation.billingAmount ELSE 0 END), 0) AS "consumedCredits"`,
    `COALESCE(SUM(CASE WHEN generation.billingStatus = 'refunded' THEN generation.billingAmount ELSE 0 END), 0) AS "refundedCredits"`,
] as const;

const MODULE_SELECTS = SUMMARY_SELECTS.filter((_, index) => index !== 2);

@Injectable()
export class GenerationAnalyticsService {
    constructor(
        @InjectRepository(ImageGeneration)
        private readonly generationRepository: Repository<ImageGeneration>,
    ) {}

    async getDashboard(query: QueryAnalyticsDto): Promise<GenerationAnalytics> {
        const range = normalizeRange(query);
        const toolKey = query.toolKey ?? null;
        const summaryQuery = this.baseQuery(range, toolKey);
        this.selectAll(summaryQuery, SUMMARY_SELECTS);

        const periodUnit = range.granularity === "day" ? "day" : "month";
        const periodFormat = range.granularity === "day" ? "YYYY-MM-DD" : "YYYY-MM";
        const periodExpression =
            `TO_CHAR(DATE_TRUNC('${periodUnit}', generation.createdAt ` +
            `AT TIME ZONE 'Asia/Shanghai'), '${periodFormat}')`;
        const trendQuery = this.baseQuery(range, toolKey)
            .select(`${periodExpression} AS "period"`)
            .addSelect(`COUNT(*) AS "tasks"`)
            .addSelect(
                `COALESCE(SUM(jsonb_array_length(generation.images::jsonb)), 0) AS "generatedImages"`,
            )
            .addSelect(
                `COUNT(*) FILTER (WHERE generation.status = 'failed') AS "failedTasks"`,
            )
            .addSelect(
                `COALESCE(SUM(CASE WHEN generation.billingStatus = 'charged' THEN generation.billingAmount ELSE 0 END), 0) AS "consumedCredits"`,
            )
            .groupBy(periodExpression)
            .orderBy('"period"', "ASC");

        const modulesQuery = this.baseQuery(range, toolKey);
        if (!toolKey) {
            modulesQuery.andWhere("generation.toolKey IN (:...knownToolKeys)", {
                knownToolKeys: KNOWN_TOOL_KEYS,
            });
        }
        modulesQuery.select(`generation.toolKey AS "toolKey"`);
        this.addAll(modulesQuery, MODULE_SELECTS);
        modulesQuery.groupBy("generation.toolKey").orderBy("generation.toolKey", "ASC");

        const unknownQuery = toolKey ? null : this.baseQuery(range, null)
            .andWhere(
                "(generation.toolKey IS NULL OR generation.toolKey NOT IN (:...knownToolKeys))",
                { knownToolKeys: KNOWN_TOOL_KEYS },
            );
        if (unknownQuery) this.selectAll(unknownQuery, MODULE_SELECTS);

        const [rawSummary, rawTrend, rawModules, rawUnknown] = await Promise.all([
            summaryQuery.getRawOne(),
            trendQuery.getRawMany<RawAnalyticsTrendRow>(),
            modulesQuery.getRawMany<RawAnalyticsModuleRow>(),
            unknownQuery?.getRawOne<RawAnalyticsUnknownRow>() ?? Promise.resolve(null),
        ]);
        const hasUnknown = normalizeAnalyticsNumber(rawUnknown?.tasks) > 0;
        const modules = mergeModuleCatalog(rawModules, hasUnknown ? rawUnknown : null);
        const trendStart = range.granularity === "month"
            ? range.startDate.slice(0, 7)
            : range.startDate;
        const trendEnd = range.granularity === "month"
            ? range.endDate.slice(0, 7)
            : range.endDate;

        return {
            range: {
                startDate: range.startDate,
                endDate: range.endDate,
                granularity: range.granularity,
                timezone: "Asia/Shanghai",
                toolKey,
            },
            summary: normalizeAnalyticsMetrics(rawSummary ?? {}),
            trend: fillAnalyticsPeriods(trendStart, trendEnd, range.granularity, rawTrend),
            modules: toolKey
                ? modules.filter((module) => module.toolKey === toolKey)
                : modules,
        };
    }

    private baseQuery(
        range: AnalyticsRange,
        toolKey: string | null,
    ): SelectQueryBuilder<ImageGeneration> {
        const query = this.generationRepository
            .createQueryBuilder("generation")
            .where("generation.createdAt >= :startInclusive", {
                startInclusive: range.startInclusive,
            })
            .andWhere("generation.createdAt < :endExclusive", {
                endExclusive: range.endExclusive,
            });
        if (toolKey) {
            query.andWhere("generation.toolKey = :toolKey", { toolKey });
        }
        return query;
    }

    private selectAll(
        query: SelectQueryBuilder<ImageGeneration>,
        expressions: readonly string[],
    ): SelectQueryBuilder<ImageGeneration> {
        query.select(expressions[0]);
        return this.addAll(query, expressions.slice(1));
    }

    private addAll(
        query: SelectQueryBuilder<ImageGeneration>,
        expressions: readonly string[],
    ): SelectQueryBuilder<ImageGeneration> {
        for (const expression of expressions) query.addSelect(expression);
        return query;
    }
}
