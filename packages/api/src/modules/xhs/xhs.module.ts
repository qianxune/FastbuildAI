import { TypeOrmModule } from "@buildingai/db/@nestjs/typeorm";
import { XhsGroup, XhsHotTopic, XhsImage, XhsNote, XhsTemplate, Secret } from "@buildingai/db/entities";
import { Module } from "@nestjs/common";
import { AiModelModule } from "@modules/ai/model/ai-model.module";
import { SecretService } from "@buildingai/core/modules";

import { XhsGroupWebController } from "./controllers/web/xhs-group.web.controller";
import { XhsNoteWebController } from "./controllers/web/xhs-note.web.controller";
import { XhsImageWebController } from "./controllers/web/xhs-image.web.controller";
import { ContentModerationService } from "./services/content-moderation.service";
import { XhsGroupService } from "./services/xhs-group.service";
import { XhsNoteService } from "./services/xhs-note.service";
import { XhsImageService } from "./services/xhs-image.service";

/**
 * 小红书笔记生成模块
 * 提供笔记生成、管理、分组等功能
 */
@Module({
    imports: [
        TypeOrmModule.forFeature([
            XhsNote,
            XhsGroup,
            XhsHotTopic,
            XhsImage,
            XhsTemplate,
            Secret, // 添加Secret实体
        ]),
        AiModelModule, // 导入AI模型模块
    ],
    controllers: [XhsNoteWebController, XhsGroupWebController, XhsImageWebController],
    providers: [
        XhsNoteService, 
        XhsGroupService, 
        XhsImageService,
        ContentModerationService,
        SecretService, // 添加SecretService
    ],
    exports: [XhsNoteService, XhsGroupService, XhsImageService, ContentModerationService],
})
export class XhsModule {}