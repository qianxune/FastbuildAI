import { BaseController } from "@buildingai/base";
import { WebController } from "@common/decorators/controller.decorator";
import { Body, Post, Res } from "@nestjs/common";
import type { Response } from "express";

import { GenerateNoteDto } from "../../dto";
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
    async generate(
        @Body() dto: GenerateNoteDto,
        @Res() res: Response,
    ): Promise<void> {
        await this.xhsNoteService.generateStream(dto, res);
    }
}