import { BaseController } from "@buildingai/base";
import { WebController } from "@common/decorators/controller.decorator";
import { Body, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";

import {
    CreatePromptTemplateDto,
    CreatePromptTemplateGroupDto,
    QueryPromptTemplatesDto,
    UpdatePromptTemplateDto,
    UpdatePromptTemplateGroupDto,
} from "../../dto";
import { XhsPromptTemplateService } from "../../services/xhs-prompt-template.service";

@WebController("xhs")
export class XhsPromptTemplateWebController extends BaseController {
    constructor(private readonly promptTemplateService: XhsPromptTemplateService) {
        super();
    }

    // ======================== 分组接口 ========================

    @Get("prompt-template-groups")
    async listGroups() {
        return this.promptTemplateService.findAllGroups();
    }

    @Post("prompt-template-groups")
    async createGroup(@Body() dto: CreatePromptTemplateGroupDto) {
        return this.promptTemplateService.createGroup(dto);
    }

    @Put("prompt-template-groups/:id")
    async updateGroup(
        @Param("id") id: string,
        @Body() dto: UpdatePromptTemplateGroupDto,
    ) {
        return this.promptTemplateService.updateGroup(id, dto);
    }

    @Delete("prompt-template-groups/:id")
    async deleteGroup(@Param("id") id: string) {
        await this.promptTemplateService.deleteGroup(id);
        return { message: "分组已删除" };
    }

    // ======================== 模板接口 ========================

    /**
     * 注意：此路由必须在 prompt-templates/:id 前定义
     */
    @Get("prompt-templates")
    async listTemplates(@Query() query: QueryPromptTemplatesDto) {
        return this.promptTemplateService.findAllWithGroups(query);
    }

    @Get("prompt-templates/:id")
    async getTemplate(@Param("id") id: string) {
        return this.promptTemplateService.findById(id);
    }

    @Post("prompt-templates")
    async createTemplate(@Body() dto: CreatePromptTemplateDto) {
        return this.promptTemplateService.createTemplate(dto);
    }

    @Put("prompt-templates/:id")
    async updateTemplate(
        @Param("id") id: string,
        @Body() dto: UpdatePromptTemplateDto,
    ) {
        return this.promptTemplateService.updateTemplate(id, dto);
    }

    @Delete("prompt-templates/:id")
    async deleteTemplate(@Param("id") id: string) {
        await this.promptTemplateService.deleteTemplate(id);
        return { message: "模板已删除" };
    }

    @Put("prompt-templates/:id/set-default")
    async setDefault(@Param("id") id: string) {
        return this.promptTemplateService.setDefault(id);
    }
}
