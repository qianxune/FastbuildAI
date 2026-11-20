import { useQuery } from "@tanstack/react-query";

import type { AnalyticsGranularity, GenerationAnalytics } from "../../api/shared/analytics";
import { consoleHttpClient } from "./base";

export interface AnalyticsFilter {
    startDate?: string;
    endDate?: string;
    granularity?: AnalyticsGranularity;
    toolKey?: string;
}

export function analyticsRequestParams(filter: AnalyticsFilter): AnalyticsFilter {
    const params: AnalyticsFilter = {};
    if (filter.startDate !== undefined) params.startDate = filter.startDate;
    if (filter.endDate !== undefined) params.endDate = filter.endDate;
    if (filter.granularity !== undefined) params.granularity = filter.granularity;
    if (filter.toolKey !== undefined) params.toolKey = filter.toolKey;
    return params;
}

export function analyticsQueryKey(filter: AnalyticsFilter) {
    return [
        "image-studio",
        "console",
        "analytics",
        filter.startDate ?? null,
        filter.endDate ?? null,
        filter.granularity ?? "day",
        filter.toolKey ?? null,
    ] as const;
}

export function useGenerationAnalyticsQuery(filter: AnalyticsFilter = {}) {
    return useQuery({
        queryKey: analyticsQueryKey(filter),
        queryFn: () =>
            consoleHttpClient.get<GenerationAnalytics>("/analytics", {
                params: analyticsRequestParams(filter),
            }),
        staleTime: 30_000,
    });
}
