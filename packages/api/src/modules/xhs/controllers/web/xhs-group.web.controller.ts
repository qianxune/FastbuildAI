import { BaseController } from "@buildingai/base";
import { type UserPlayground } from "@buildingai/db";
import { Playground } from "@buildingai/decorators/playground.decorator";
import { XhsGroup } from "@buildingai/db/entities";
import { WebController } from "@common/decorators/controller.decorator";
import { Body, Delete, Get, Param, Post, Put } from "@nestjs/common";

import { CreateGroupDto, UpdateGroupDto } from "../../dto";
import { XhsGroupService } from "../../services/xhs-group.service";

/**
 * 小红书笔记分组Web控制器
 * 提供分组管理的RESTful API
 */
@WebController("xhs")
export class XhsGroupWebController extends BaseController {
    constructor(private readonly xhsGroupService: XhsGroupService) {
        super();
    }

    /**
     * 获取用户所有分组
     * GET /api/web/xhs/groups
     */
    @Get("groups")
    async getGroups(@Playground() user: UserPlayground): Promise<{ items: XhsGroup[] }> {
        // 确保用户有默认分组
        await this.xhsGroupService.ensureDefaultGroup(user.id);

        const groups = await this.xhsGroupService.findByUser(user.id);

        return { items: groups };
    }

    /**
     * 创建分组
     * POST /api/web/xhs/groups
     */
    @Post("groups")
    async createGroup(
        @Body() dto: CreateGroupDto,
        @Playground() user: UserPlayground,
    ): Promise<XhsGroup> {
        return await this.xhsGroupService.createGroup(dto, user.id);
    }

    /**
     * 更新分组
     * PUT /api/web/xhs/groups/:id
     */
    @Put("groups/:id")
    async updateGroup(
        @Param("id") id: string,
        @Body() dto: UpdateGroupDto,
        @Playground() user: UserPlayground,
    ): Promise<XhsGroup> {
        return await this.xhsGroupService.updateGroup(id, dto.name, user.id);
    }

    /**
     * 删除分组
     * DELETE /api/web/xhs/groups/:id
     * 删除前将该分组下的所有笔记移动到默认分组
     */
    @Delete("groups/:id")
    async deleteGroup(
        @Param("id") id: string,
        @Playground() user: UserPlayground,
    ): Promise<{ success: boolean }> {
        await this.xhsGroupService.deleteGroup(id, user.id);
        return { success: true };
    }
}
