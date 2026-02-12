import { TypeOrmModule } from "@buildingai/db/@nestjs/typeorm";
import { AiModel } from "@buildingai/db/entities";
import { AiPublicModule } from "@buildingai/extension-sdk";
import { Module } from "@nestjs/common";

import { ImageGeneration } from "../../db/entities/image-generation.entity";
import { GenerationController } from "./controllers/web/generation.controller";
import { GenerationService } from "./services/generation.service";

@Module({
    imports: [AiPublicModule, TypeOrmModule.forFeature([ImageGeneration, AiModel])],
    controllers: [GenerationController],
    providers: [GenerationService],
})
export class GenerationModule {}