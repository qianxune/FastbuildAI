import { CloudStorageModule } from "@buildingai/core/modules";
import { TypeOrmModule } from "@buildingai/db/@nestjs/typeorm";
import { AiModel, StorageConfig } from "@buildingai/db/entities";
import { AiPublicModule, ExtensionBillingModule } from "@buildingai/extension-sdk";
import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { ImageGeneration } from "../../db/entities/image-generation.entity";
import { GenerationController } from "./controllers/web/generation.controller";
import { GenerationProcessor } from "./generation.processor";
import { GENERATION_QUEUE } from "./constants/generation.constants";
import { GenerationModelService } from "./services/generation-model.service";
import { GenerationImageService } from "./services/generation-image.service";
import { GenerationService } from "./services/generation.service";
import { ProductImageService } from "./services/product-image.service";
import { GenerationBillingService } from "./services/generation-billing.service";

@Module({
    imports: [
        AiPublicModule,
        ExtensionBillingModule,
        CloudStorageModule,
        TypeOrmModule.forFeature([ImageGeneration, AiModel, StorageConfig]),
        BullModule.registerQueue({ name: GENERATION_QUEUE }),
    ],
    controllers: [GenerationController],
    providers: [
        GenerationService,
        GenerationModelService,
        GenerationImageService,
        GenerationProcessor,
        ProductImageService,
        GenerationBillingService,
    ],
})
export class GenerationModule {}
