import { TypeOrmModule } from "@buildingai/db/@nestjs/typeorm";
import { AiModel } from "@buildingai/db/entities";
import { AiPublicModule } from "@buildingai/extension-sdk";
import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { ImageGeneration } from "../../db/entities/image-generation.entity";
import { GenerationController } from "./controllers/web/generation.controller";
import { GenerationProcessor } from "./generation.processor";
import { GENERATION_QUEUE, GenerationService } from "./services/generation.service";

@Module({
    imports: [AiPublicModule, TypeOrmModule.forFeature([ImageGeneration, AiModel]),
        BullModule.registerQueue({ name: GENERATION_QUEUE })],
    controllers: [GenerationController],
    providers: [GenerationService, GenerationProcessor],
})
export class GenerationModule {}