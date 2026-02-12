import { ExtensionWebController } from "@buildingai/core/decorators";
import type { UserPlayground } from "@buildingai/db";
import { Playground } from "@buildingai/decorators/playground.decorator";
import { Body, Delete, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";

import { GenerateImageDto, QueryGenerationDto } from "../../dto";
import { GenerationService } from "../../services/generation.service";

@ExtensionWebController("generations")
export class GenerationController {
    constructor(private readonly generationService: GenerationService) {}

    @Get("models")
    async listModels() {
        return this.generationService.listModels();
    }

    @Get()
    async list(
        @Playground() user: UserPlayground,
        @Query() query: QueryGenerationDto,
    ) {
        return this.generationService.list(user.id, query);
    }

    @Post()
    async generate(
        @Playground() user: UserPlayground,
        @Body() input: GenerateImageDto,
    ) {
        return this.generationService.generate(user.id, input);
    }

    @Post(":id/retry")
    async retry(
        @Playground() user: UserPlayground,
        @Param("id", ParseUUIDPipe) id: string,
    ) {
        return this.generationService.retry(user.id, id);
    }

    @Delete(":id")
    async remove(
        @Playground() user: UserPlayground,
        @Param("id", ParseUUIDPipe) id: string,
    ) {
        return this.generationService.remove(user.id, id);
    }
}