import { ExtensionWebController } from "@buildingai/core/decorators";
import type { UserPlayground } from "@buildingai/db";
import { Playground } from "@buildingai/decorators/playground.decorator";
import { SkipTransform } from "@buildingai/decorators/skip-transform.decorator";
import {
    Body,
    Delete,
    Get,
    Header,
    Param,
    ParseIntPipe,
    ParseUUIDPipe,
    Post,
    Query,
    StreamableFile,
    UploadedFile,
    UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { GenerateImageDto, MainImageDto, QueryGenerationDto } from "../../dto";
import { AnalyzeProductDto } from "../../dto/main-image.dto";
import { GenerationService } from "../../services/generation.service";
import type { ProductImageUpload } from "../../services/product-image.service";

@ExtensionWebController("generations")
export class GenerationController {
    /** 注入生成服务；各用户资源接口使用当前登录用户编号限定访问范围。 */
    constructor(private readonly generationService: GenerationService) {}

    /** 查询当前用户可消费的积分余额。 */
    @Get("billing/balance")
    async balance(@Playground() user: UserPlayground) {
        return this.generationService.balance(user.id);
    }

    /** 校验模型编号与整数数量，并返回生图积分报价。 */
    @Get("billing/quote")
    async quote(
        @Query("modelId", ParseUUIDPipe) modelId: string,
        @Query("count", ParseIntPipe) count: number,
    ) {
        return this.generationService.quote(modelId, count);
    }

    /** 接收单张不超过十 MiB 的商品图，不接受额外表单字段。 */
    @Post("product-images")
    @UseInterceptors(
        FileInterceptor("file", {
            limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 },
        }),
    )
    async uploadProductImage(
        @Playground() user: UserPlayground,
        @UploadedFile() file?: ProductImageUpload,
    ) {
        return this.generationService.uploadProductImage(user.id, file);
    }

    /** 读取当前用户商品图并直接返回 PNG 文件流，禁止缓存与内容类型嗅探。 */
    @Get("product-images/:id")
    @SkipTransform()
    @Header("X-Content-Type-Options", "nosniff")
    @Header("Cache-Control", "private, no-store")
    async productImage(@Playground() user: UserPlayground, @Param("id", ParseUUIDPipe) id: string) {
        const buffer = await this.generationService.readProductImage(user.id, id);
        return new StreamableFile(buffer, { type: "image/png", length: buffer.length });
    }

    /** 列出当前用户已上传商品图的元数据。 */
    @Get("product-images")
    async productImageList(@Playground() user: UserPlayground) {
        return this.generationService.listProductImages(user.id);
    }

    /** 删除当前用户未被生成记录引用的商品图。 */
    @Delete("product-images/:id")
    async removeProductImage(
        @Playground() user: UserPlayground,
        @Param("id", ParseUUIDPipe) id: string,
    ) {
        return this.generationService.removeProductImage(user.id, id);
    }

    /** 根据当前用户选中的参考图调用视觉模型生成商品描述。 */
    @Post("main/analyze")
    async analyzeProduct(@Playground() user: UserPlayground, @Body() input: AnalyzeProductDto) {
        return this.generationService.analyzeProduct(user.id, input);
    }

    /** 提交商品主图异步生成任务，创建任务时扣除相应积分。 */
    @Post("main/tasks")
    async submitMain(@Playground() user: UserPlayground, @Body() input: MainImageDto) {
        return this.generationService.submitMain(user.id, input);
    }

    /** 返回工具可用状态以及图片、参考图和视觉模型能力映射。 */
    @Get("capabilities")
    async capabilities() {
        return this.generationService.capabilities();
    }

    /** 返回已启用的图片生成模型列表。 */
    @Get("models")
    async listModels() {
        return this.generationService.listModels();
    }

    /** 分页查询当前用户的生成记录。 */
    @Get()
    async list(@Playground() user: UserPlayground, @Query() query: QueryGenerationDto) {
        return this.generationService.list(user.id, query);
    }

    /** 创建并扣费后提交普通生图任务，立即返回排队记录。 */
    @Post("tasks")
    async submit(@Playground() user: UserPlayground, @Body() input: GenerateImageDto) {
        return this.generationService.submit(user.id, input);
    }

    /** 查询属于当前用户的单条生成记录。 */
    @Get(":id")
    async get(@Playground() user: UserPlayground, @Param("id", ParseUUIDPipe) id: string) {
        return this.generationService.get(user.id, id);
    }

    /** 取消当前用户未结束的生成任务，并按任务计费状态退款。 */
    @Post(":id/cancel")
    async cancel(@Playground() user: UserPlayground, @Param("id", ParseUUIDPipe) id: string) {
        return this.generationService.cancel(user.id, id);
    }

    /** 按原记录参数创建独立计费的新队列任务，保留原记录。 */
    @Post(":id/retry-task")
    async retryTask(@Playground() user: UserPlayground, @Param("id", ParseUUIDPipe) id: string) {
        return this.generationService.retryTask(user.id, id);
    }

    /** 校验记录归属与零起始图片索引，直接返回禁止缓存的生成图文件流。 */
    @Get(":id/images/:index")
    @SkipTransform()
    @Header("X-Content-Type-Options", "nosniff")
    @Header("Cache-Control", "private, no-store")
    async image(
        @Playground() user: UserPlayground,
        @Param("id", ParseUUIDPipe) id: string,
        @Param("index", ParseIntPipe) index: number,
    ) {
        const image = await this.generationService.readImage(user.id, id, index);
        return new StreamableFile(image.buffer, {
            type: image.mediaType,
            length: image.buffer.length,
        });
    }

    /** 同步执行普通生图并返回结果，失败时由服务执行文件清理与退款。 */
    @Post()
    async generate(@Playground() user: UserPlayground, @Body() input: GenerateImageDto) {
        return this.generationService.generate(user.id, input);
    }

    /** 重试历史记录；普通图片同步生成，商品主图按原参数重新入队。 */
    @Post(":id/retry")
    async retry(@Playground() user: UserPlayground, @Param("id", ParseUUIDPipe) id: string) {
        return this.generationService.retry(user.id, id);
    }

    /** 删除当前用户已结束的生成记录及其生成图文件。 */
    @Delete(":id")
    async remove(@Playground() user: UserPlayground, @Param("id", ParseUUIDPipe) id: string) {
        return this.generationService.remove(user.id, id);
    }
}
