import { IsDateString, IsIn, IsOptional, IsString, Matches } from "class-validator";

import type { AnalyticsGranularity } from "../../../shared/analytics";
import { ANALYTICS_MODULE_KEYS } from "../../../shared/analytics";

export class QueryAnalyticsDto {
    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    @IsDateString({ strict: true })
    startDate?: string;

    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    @IsDateString({ strict: true })
    endDate?: string;

    @IsOptional()
    @IsIn(["day", "month"])
    granularity: AnalyticsGranularity = "day";

    @IsOptional()
    @IsString()
    @IsIn([...ANALYTICS_MODULE_KEYS])
    toolKey?: string;
}
