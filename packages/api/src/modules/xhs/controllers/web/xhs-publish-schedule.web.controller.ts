import { Body, Get, Param, Post, Query } from "@nestjs/common";
import { WebController } from "@common/decorators/controller.decorator";
import { Playground } from "@buildingai/decorators/playground.decorator";
import { BaseController } from "@buildingai/base";
import type { UserPlayground } from "@buildingai/db";
import { XhsPublishScheduleService } from "../../services/xhs-publish-schedule.service";
import { CreatePublishScheduleDto } from "../../dto/create-publish-schedule.dto";
import { QueryPublishScheduleDto } from "../../dto/query-publish-schedule.dto";

@WebController("xhs")
export class XhsPublishScheduleWebController extends BaseController {
    constructor(private readonly scheduleService: XhsPublishScheduleService) {
        super();
    }

    /**
     * 创建发布计划
     */
    @Post("publish-schedule")
    async createSchedule(
        @Playground() user: UserPlayground,
        @Body() dto: CreatePublishScheduleDto,
    ) {
        return this.scheduleService.createSchedule(user.id, dto);
    }

    /**
     * 获取发布计划列表
     */
    @Get("publish-schedule")
    async getSchedules(
        @Playground() user: UserPlayground,
        @Query() query: QueryPublishScheduleDto,
    ) {
        return this.scheduleService.getSchedules(user.id, query);
    }

    /**
     * 获取发布计划详情
     */
    @Get("publish-schedule/:id")
    async getScheduleDetail(@Playground() user: UserPlayground, @Param("id") scheduleId: string) {
        return this.scheduleService.getScheduleDetail(user.id, scheduleId);
    }

    /**
     * 暂停发布计划
     */
    @Post("publish-schedule/:id/pause")
    async pauseSchedule(@Playground() user: UserPlayground, @Param("id") scheduleId: string) {
        return this.scheduleService.pauseSchedule(user.id, scheduleId);
    }

    /**
     * 恢复发布计划
     */
    @Post("publish-schedule/:id/resume")
    async resumeSchedule(@Playground() user: UserPlayground, @Param("id") scheduleId: string) {
        return this.scheduleService.resumeSchedule(user.id, scheduleId);
    }

    /**
     * 取消发布计划
     */
    @Post("publish-schedule/:id/cancel")
    async cancelSchedule(@Playground() user: UserPlayground, @Param("id") scheduleId: string) {
        return this.scheduleService.cancelSchedule(user.id, scheduleId);
    }

    /**
     * 重试失败的笔记
     */
    @Post("publish-schedule/:id/retry")
    async retryFailedItems(
        @Playground() user: UserPlayground,
        @Param("id") scheduleId: string,
        @Body("itemIds") itemIds: string[],
    ) {
        return this.scheduleService.retryFailedItems(user.id, scheduleId, itemIds);
    }
}
