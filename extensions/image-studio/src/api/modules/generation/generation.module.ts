import { CloudStorageModule } from "@buildingai/core/modules";
import { TypeOrmModule } from "@buildingai/db/@nestjs/typeorm";
import { AiModel, StorageConfig } from "@buildingai/db/entities";
import { AiPublicModule, ExtensionBillingModule } from "@buildingai/extension-sdk";
import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { ImageGeneration } from "../../db/entities/image-generation.entity";
import { AssetRecord } from "../../db/entities/asset-record.entity";
import { AssetsController } from "./controllers/web/assets.controller";
import { AssetRecordService } from "./services/asset-record.service";
import { GenerationController } from "./controllers/web/generation.controller";
import { GenerationProcessor } from "./generation.processor";
import { GENERATION_QUEUE } from "./constants/generation.constants";
import { GenerationModelService } from "./services/generation-model.service";
import { GenerationImageService } from "./services/generation-image.service";
import { GenerationService } from "./services/generation.service";
import { ProductImageService } from "./services/product-image.service";
import { GenerationBillingService } from "./services/generation-billing.service";
import { CutoutService } from "./services/cutout.service";

@Module({
    imports: [
        AiPublicModule,
        ExtensionBillingModule,
        CloudStorageModule,
        TypeOrmModule.forFeature([ImageGeneration, AssetRecord, AiModel, StorageConfig]),
        BullModule.registerQueue({ name: GENERATION_QUEUE }),
    ],
    controllers: [GenerationController, AssetsController],
    providers: [
        AssetRecordService,
        { provide: "IMAGE_STUDIO_ASSET_RECORD_SERVICE", useExisting: AssetRecordService },
        GenerationService,
        GenerationModelService,
        GenerationImageService,
        GenerationProcessor,
        ProductImageService,
        GenerationBillingService,
        CutoutService,
    ],
})
export class GenerationModule {}
