import {
    Post,
    Get,
    Body,
    Query,
    UseInterceptors,
    UploadedFile,
    ParseIntPipe,
    Logger,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { WebController } from '@common/decorators/controller.decorator'
import { BaseController } from '@buildingai/base'
import { Playground } from '@buildingai/decorators/playground.decorator'
import { type UserPlayground } from '@buildingai/db'
import { HttpErrorFactory } from '@buildingai/errors'
import { XhsImageService } from '../../services/xhs-image.service'
import { DownloadImageDto } from '../../dto/download-image.dto'

/**
 * 小红书图片管理控制器
 * 处理图片上传、自动配图和历史图片查询
 */
@WebController("xhs")
export class XhsImageWebController extends BaseController {
    protected readonly logger = new Logger(XhsImageWebController.name)

    constructor(private readonly xhsImageService: XhsImageService) {
        super();
    }

    /**
     * 上传图片
     * POST /api/web/xhs/images/upload
     */
    @Post("images/upload")
    @UseInterceptors(FileInterceptor("file"))
    async upload(
        @UploadedFile() file: Express.Multer.File,
        @Playground() playground: UserPlayground,
    ) {
        if (!file) {
            throw HttpErrorFactory.badRequest("请选择要上传的图片");
        }

        const image = await this.xhsImageService.upload(file, playground.id);

        return {
            success: true,
            data: image,
            message: "图片上传成功",
        };
    }

    /**
     * AI自动配图
     * POST /api/web/xhs/images/auto
     */
    @Post("images/auto")
    async autoGenerate(
        @Body("content") content: string,
        @Body("modelId") modelId: string | undefined,
        @Playground() playground: UserPlayground,
    ) {
        if (!content || content.trim().length === 0) {
            throw HttpErrorFactory.badRequest("请提供笔记内容");
        }

        const image = await this.xhsImageService.generateAuto(content, playground.id, modelId);

        return {
            success: true,
            data: image,
            message: "自动配图成功",
        };
    }

    /**
     * 获取历史图片
     * GET /api/web/xhs/images/history?page=1&limit=20
     */
    @Get("images/history")
    async getHistory(
        @Playground() playground: UserPlayground,
        @Query("page", new ParseIntPipe({ optional: true })) page: number = 1,
        @Query("limit", new ParseIntPipe({ optional: true })) limit: number = 20,
    ) {
        const result = await this.xhsImageService.findHistory(playground.id, page, limit);

        return {
            success: true,
            data: result,
        };
    }

    /**
     * 下载外部图片到本地
     * POST /api/web/xhs/images/download
     */
    @Post('images/download')
    async downloadImage(@Body() dto: DownloadImageDto, @Playground() playground: UserPlayground) {
        try {
            const localPath = await this.xhsImageService.downloadExternalImage(
                dto.imageUrl,
                playground.id,
            )

            return {
                success: true,
                localPath,
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '未知错误'
            this.logger.error(`❌ 图片下载控制器错误: ${errorMessage}`, error instanceof Error ? error.stack : '')
            
            // 返回错误而不是抛出异常，这样前端能收到详细的错误信息
            return {
                success: false,
                error: errorMessage,
            }
        }
    }

    /**
     * 获取图片模板
     * GET /api/web/xhs/images/templates
     */
    @Get("images/templates")
    async getTemplates() {
        // TODO: Implement image templates
        return {
            success: true,
            data: {
                items: [],
            },
        };
    }
}
