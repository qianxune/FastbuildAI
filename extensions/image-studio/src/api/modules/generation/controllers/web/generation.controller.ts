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
import { GenerationService } from "../../services/generation.service";
import type { ProductImageUpload } from "../../services/product-image.service";

@ExtensionWebController("generations")
export class GenerationController {
    constructor(private readonly generationService: GenerationService) {}

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

    @Get("product-images/:id")
    @SkipTransform()
    @Header("X-Content-Type-Options", "nosniff")
    @Header("Cache-Control", "private, no-store")
    async productImage(@Playground() user: UserPlayground, @Param("id", ParseUUIDPipe) id: string) {
        const buffer = await this.generationService.readProductImage(user.id, id);
        return new StreamableFile(buffer, { type: "image/png", length: buffer.length });
    }

    @Get("product-images")
    async productImageList(@Playground() user: UserPlayground) {
        return this.generationService.listProductImages(user.id);
    }

    @Delete("product-images/:id")
    async removeProductImage(
        @Playground() user: UserPlayground,
        @Param("id", ParseUUIDPipe) id: string,
    ) {
        return this.generationService.removeProductImage(user.id, id);
    }

    @Post("main/tasks")
    async submitMain(@Playground() user: UserPlayground, @Body() input: MainImageDto) {
        return this.generationService.submitMain(user.id, input);
    }

    @Get("capabilities")
    async capabilities() {
        return this.generationService.capabilities();
    }

    @Get("models")
    async listModels() {
        return this.generationService.listModels();
    }

    @Get()
    async list(@Playground() user: UserPlayground, @Query() query: QueryGenerationDto) {
        return this.generationService.list(user.id, query);
    }

    @Post("tasks")
    async submit(@Playground() user: UserPlayground, @Body() input: GenerateImageDto) {
        return this.generationService.submit(user.id, input);
    }

    @Get(":id")
    async get(@Playground() user: UserPlayground, @Param("id", ParseUUIDPipe) id: string) {
        return this.generationService.get(user.id, id);
    }

    @Post(":id/cancel")
    async cancel(@Playground() user: UserPlayground, @Param("id", ParseUUIDPipe) id: string) {
        return this.generationService.cancel(user.id, id);
    }

    @Post(":id/retry-task")
    async retryTask(@Playground() user: UserPlayground, @Param("id", ParseUUIDPipe) id: string) {
        return this.generationService.retryTask(user.id, id);
    }

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

    @Post()
    async generate(@Playground() user: UserPlayground, @Body() input: GenerateImageDto) {
        return this.generationService.generate(user.id, input);
    }

    @Post(":id/retry")
    async retry(@Playground() user: UserPlayground, @Param("id", ParseUUIDPipe) id: string) {
        return this.generationService.retry(user.id, id);
    }

    @Delete(":id")
    async remove(@Playground() user: UserPlayground, @Param("id", ParseUUIDPipe) id: string) {
        return this.generationService.remove(user.id, id);
    }
}
