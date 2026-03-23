import { TypeOrmModule } from '@buildingai/db/@nestjs/typeorm'
import {
  XhsGroup,
  XhsHotTopic,
  XhsImage,
  XhsNote,
  XhsProduct,
  XhsPublishSchedule,
  XhsPublishScheduleItem,
  XhsTemplate,
  PromptTemplate,
  PromptTemplateGroup,
  Secret,
} from '@buildingai/db/entities'
import { Module } from '@nestjs/common'
import { AiModelModule } from '@modules/ai/model/ai-model.module'
import { SecretService } from '@buildingai/core/modules'

import { XhsGroupWebController } from './controllers/web/xhs-group.web.controller'
import { XhsNoteWebController } from './controllers/web/xhs-note.web.controller'
import { XhsImageWebController } from './controllers/web/xhs-image.web.controller'
import { XhsProductWebController } from './controllers/web/xhs-product.web.controller'
import { XhsPromptTemplateWebController } from './controllers/web/xhs-prompt-template.web.controller'
import { XhsPublishWebController } from './controllers/web/xhs-publish.web.controller'
import { XhsPublishScheduleWebController } from './controllers/web/xhs-publish-schedule.web.controller'
import { ContentModerationService } from './services/content-moderation.service'
import { XhsGroupService } from './services/xhs-group.service'
import { XhsNoteService } from './services/xhs-note.service'
import { XhsImageService } from './services/xhs-image.service'
import { XhsProductService } from './services/xhs-product.service'
import { XhsPromptTemplateService } from './services/xhs-prompt-template.service'
import { XhsPublishService } from './services/xhs-publish.service'
import { XhsPublishScheduleService } from './services/xhs-publish-schedule.service'

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
      XhsProduct,
      XhsPublishSchedule,
      XhsPublishScheduleItem,
      XhsTemplate,
      PromptTemplate,
      PromptTemplateGroup,
      Secret,
    ]),
    AiModelModule,
  ],
  controllers: [
    XhsNoteWebController,
    XhsGroupWebController,
    XhsImageWebController,
    XhsProductWebController,
    XhsPromptTemplateWebController,
    XhsPublishWebController,
    XhsPublishScheduleWebController,
  ],
  providers: [
    XhsNoteService,
    XhsGroupService,
    XhsImageService,
    XhsProductService,
    XhsPromptTemplateService,
    XhsPublishService,
    XhsPublishScheduleService,
    ContentModerationService,
    SecretService,
  ],
  exports: [
    XhsNoteService,
    XhsGroupService,
    XhsImageService,
    XhsProductService,
    XhsPromptTemplateService,
    XhsPublishService,
    XhsPublishScheduleService,
    ContentModerationService,
  ],
})
export class XhsModule {}
