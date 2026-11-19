import { IsIn, IsOptional, IsString, Matches } from "class-validator";

import type { AnalyticsGranularity } from "../../../shared/analytics";
import { PRICING_KEYS } from "../../../shared/pricing";

export class QueryAnalyticsDto {
    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    startDate?: string;

    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    endDate?: string;

    @IsOptional()
    @IsIn(["day", "month"])
    granularity: AnalyticsGranularity = "day";

    @IsOptional()
    @IsString()
    @IsIn([...PRICING_KEYS])
    toolKey?: string;
}
