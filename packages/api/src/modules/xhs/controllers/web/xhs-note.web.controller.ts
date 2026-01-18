import { BaseController } from "@buildingai/base";
import { type UserPlayground } from "@buildingai/db";
import { Playground } from "@buildingai/decorators/playground.decorator";
import { HttpErrorFactory } from "@buildingai/errors";
import { WebController } from "@common/decorators/controller.decorator";
import { Body, Post, Res, Get, Put, Delete, Param, Query } from "@nestjs/common";
import type { Response } from "express";

import {
    GenerateNoteDto,
    CreateNoteDto,
    UpdateNoteDto,
    QueryNoteDto,
    SearchNoteDto,
    BatchNoteDto,
    BatchActionType,
} from "../../dto";
import { XhsNoteService } from "../../services/xhs-note.service";

/**
 * 小红书笔记Web控制器
 * 处理笔记相关的Web API请求
 */
@WebController("xhs")
export class XhsNoteWebController extends BaseController {
    constructor(private readonly xhsNoteService: XhsNoteService) {
        super();
    }

    /**
     * 生成笔记内容（流式）
     *
     * @param dto 生成笔记DTO
     * @param res Express响应对象
     */
    @Post("generate")
    async generate(@Body() dto: GenerateNoteDto, @Res() res: Response): Promise<void> {
        await this.xhsNoteService.generateStream(dto, res);
    }

    /**
     * 诊断模型配置 - 用于调试
     *
     * @param modelId 模型ID
     */
    @Get("debug/model/:modelId")
    async debugModel(@Param("modelId") modelId: string) {
        try {
            const model = await this.xhsNoteService["aiModelService"].findOne({
                where: { id: modelId, isActive: true },
                relations: ["provider"],
            });

            if (!model) {
                return {
                    success: false,
                    message: `模型ID ${modelId} 不存在或未激活`,
                    modelId,
                };
            }

            return {
                success: true,
                model: {
                    id: model.id,
                    name: model.name,
                    model: model.model,
                    isActive: model.isActive,
                    provider: model.provider
                        ? {
                              id: model.provider.id,
                              name: model.provider.name,
                              provider: model.provider.provider,
                              isActive: model.provider.isActive,
                              bindSecretId: model.provider.bindSecretId,
                          }
                        : null,
                },
            };
        } catch (error) {
            return {
                success: false,
                message: `查询模型失败: ${error.message}`,
                modelId,
            };
        }
    }

    /**
     * 搜索笔记
     * 注意：此路由必须在 notes/:id 之前定义，否则 "search" 会被当作 :id 参数
     *
     * @param searchDto 搜索参数
     * @param user 当前用户
     * @returns 搜索结果
     */
    @Get("notes/search")
    async searchNotes(@Query() searchDto: SearchNoteDto, @Playground() user: UserPlayground) {
        const result = await this.xhsNoteService.search(user.id, searchDto);
        return result;
    }

    /**
     * 批量操作笔记
     * 注意：此路由必须在 notes/:id 之前定义，否则 "batch" 会被当作 :id 参数
     *
     * @param dto 批量操作DTO
     * @param user 当前用户
     * @returns 操作结果
     */
    @Post("notes/batch")
    async batchOperateNotes(@Body() dto: BatchNoteDto, @Playground() user: UserPlayground) {
        let affected = 0;
        let message = "";

        switch (dto.action) {
            case BatchActionType.DELETE:
                affected = await this.xhsNoteService.batchDelete(dto.ids, user.id);
                message = `成功删除 ${affected} 个笔记`;
                break;

            case BatchActionType.MOVE:
                if (!dto.groupId) {
                    throw HttpErrorFactory.badRequest("移动操作需要指定目标分组ID");
                }
                affected = await this.xhsNoteService.batchMove(dto.ids, dto.groupId, user.id);
                message = `成功移动 ${affected} 个笔记`;
                break;

            default:
                throw HttpErrorFactory.badRequest("不支持的操作类型");
        }

        return {
            success: true,
            affected,
            message,
        };
    }

    /**
     * 创建笔记
     *
     * @param dto 创建笔记DTO
     * @param user 当前用户
     * @returns 创建的笔记
     */
    @Post("notes")
    async createNote(@Body() dto: CreateNoteDto, @Playground() user: UserPlayground) {
        const note = await this.xhsNoteService.createNote(dto, user.id);
        return note;
    }

    /**
     * 获取笔记列表
     *
     * @param query 查询参数
     * @param user 当前用户
     * @returns 分页的笔记列表
     */
    @Get("notes")
    async getNotes(@Query() query: QueryNoteDto, @Playground() user: UserPlayground) {
        const result = await this.xhsNoteService.findByUser(user.id, query);
        return result;
    }

    /**
     * 获取笔记详情
     *
     * @param id 笔记ID
     * @param user 当前用户
     * @returns 笔记详情
     */
    @Get("notes/:id")
    async getNoteById(@Param("id") id: string, @Playground() user: UserPlayground) {
        const note = await this.xhsNoteService.findById(id, user.id);
        return note;
    }

    /**
     * 更新笔记
     *
     * @param id 笔记ID
     * @param dto 更新数据
     * @param user 当前用户
     * @returns 更新后的笔记
     */
    @Put("notes/:id")
    async updateNote(
        @Param("id") id: string,
        @Body() dto: UpdateNoteDto,
        @Playground() user: UserPlayground,
    ) {
        const note = await this.xhsNoteService.updateNote(id, dto, user.id);
        return note;
    }

    /**
     * 删除笔记
     *
     * @param id 笔记ID
     * @param user 当前用户
     * @returns 删除结果
     */
    @Delete("notes/:id")
    async deleteNote(@Param("id") id: string, @Playground() user: UserPlayground) {
        await this.xhsNoteService.deleteNote(id, user.id);
        return { message: "笔记删除成功" };
    }
}
