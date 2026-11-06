import { ExtensionWebController } from "@buildingai/core/decorators";
import type { UserPlayground } from "@buildingai/db";
import { Playground } from "@buildingai/decorators/playground.decorator";
import { Body, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { AssetRecordService } from "../../services/asset-record.service";

@ExtensionWebController("assets")
export class AssetsController {
    constructor(private readonly assetRecordService: AssetRecordService) {}

    @Get("official-models")
    officialModels(@Playground() _user: UserPlayground) {
        return this.assetRecordService.officialModels();
    }

    @Get()
    list(@Playground() user: UserPlayground) {
        return this.assetRecordService.list(user.id);
    }

    @Post()
    create(@Playground() user: UserPlayground, @Body() input: unknown) {
        return this.assetRecordService.create(user.id, input);
    }

    @Patch(":id")
    update(@Playground() user: UserPlayground, @Param("id", ParseUUIDPipe) id: string, @Body() input: unknown) {
        return this.assetRecordService.update(user.id, id, input);
    }

    @Delete(":id")
    remove(@Playground() user: UserPlayground, @Param("id", ParseUUIDPipe) id: string) {
        return this.assetRecordService.remove(user.id, id);
    }
}