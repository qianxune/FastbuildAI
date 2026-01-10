import { TypeOrmModule } from "@buildingai/db/@nestjs/typeorm";
import { XhsGroup, XhsHotTopic, XhsImage, XhsNote, XhsTemplate } from "@buildingai/db/entities";
import { Module } from "@nestjs/common";

import { XhsGroupService } from "./services/xhs-group.service";
import { XhsNoteService } from "./services/xhs-note.service";

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
        ]),
    ],
    controllers: [],
    providers: [XhsNoteService, XhsGroupService],
    exports: [XhsNoteService, XhsGroupService],
})
export class XhsModule {}