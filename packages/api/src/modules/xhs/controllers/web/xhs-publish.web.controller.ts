import { BaseController } from "@buildingai/base";
import { type UserPlayground } from "@buildingai/db";
import { Playground } from "@buildingai/decorators/playground.decorator";
import { WebController } from "@common/decorators/controller.decorator";
import { Body, Post, Get, Param } from "@nestjs/common";

import { PublishNoteDto } from "../../dto/publish-note.dto";
import { XhsPublishService } from "../../services/xhs-publish.service";
import { XhsNoteService } from "../../services/xhs-note.service";

/**
 * 小红书发布Web控制器
 * 处理笔记发布到小红书平台的API请求
 */
@WebController("xhs")
export class XhsPublishWebController extends BaseController {
    constructor(
        private readonly xhsPublishService: XhsPublishService,
        private readonly xhsNoteService: XhsNoteService,
    ) {
        super();
    }

    /**
     * 检查小红书登录状态
     *
     * @returns 登录状态
     */
    @Get("publish/login-status")
    async checkLoginStatus() {
        const result = await this.xhsPublishService.checkLoginStatus();
        return result;
    }

    /**
     * 获取小红书登录二维码
     *
     * @returns 登录二维码
     */
    @Get("publish/login-qrcode")
    async getLoginQrCode() {
        const result = await this.xhsPublishService.getLoginQrCode();
        return result;
    }

    /**
     * 直接发布内容到小红书
     *
     * @param dto 发布内容DTO
     * @returns 发布结果
     */
    @Post("publish")
    async publishContent(@Body() dto: PublishNoteDto) {
        const result = await this.xhsPublishService.publishContent({
            title: dto.title,
            content: dto.content,
            images: dto.images,
        });

        return result;
    }

    /**
     * 发布已保存的笔记到小红书
     *
     * @param id 笔记ID
     * @param user 当前用户
     * @returns 发布结果
     */
    @Post("publish/note/:id")
    async publishNoteById(@Param("id") id: string, @Playground() user: UserPlayground) {
        // 获取笔记详情
        const note = await this.xhsNoteService.findById(id, user.id);

        if (!note) {
            return {
                success: false,
                message: "笔记不存在",
            };
        }

        // 发布笔记
        const result = await this.xhsPublishService.publishContent({
            title: note.title,
            content: note.content,
            images: note.coverImages,
        });

        // 如果发布成功，更新笔记的发布状态
        if (result.success) {
            await this.xhsNoteService.updatePublishStatus(id, user.id, {
                isPublished: true,
                publishedAt: new Date(),
                xhsNoteId: result.noteId,
                xhsNoteUrl: result.noteUrl,
            });
        }

        return result;
    }
}