import { ExtensionConsoleController } from "@buildingai/core/decorators";
import { SuperAdminOnly } from "@buildingai/decorators/super-admin-only.decorator";
import { Get, Query, ValidationPipe } from "@nestjs/common";

import { QueryAnalyticsDto } from "../../dto/query-analytics.dto";
import { GenerationAnalyticsService } from "../../services/generation-analytics.service";

const analyticsValidation = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
});

@SuperAdminOnly()
@ExtensionConsoleController("analytics", "生图使用统计")
export class AnalyticsController {
    constructor(private readonly analyticsService: GenerationAnalyticsService) {}

    @Get()
    getDashboard(@Query(analyticsValidation) query: QueryAnalyticsDto) {
        return this.analyticsService.getDashboard(query);
    }
}
