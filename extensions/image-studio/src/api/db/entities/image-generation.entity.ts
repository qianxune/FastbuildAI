import { ExtensionEntity } from "@buildingai/core/decorators";
import {
    Column,
    CreateDateColumn,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from "@buildingai/db/typeorm";

import type { MainImageInput } from "../../shared/main-image";

export enum ImageGenerationStatus {
    QUEUED = "queued",
    CANCELLED = "cancelled",
    PROCESSING = "processing",
    COMPLETED = "completed",
    FAILED = "failed",
}

export interface GeneratedImage {
    url: string;
    mediaType: string;
}

@ExtensionEntity()
@Index(["userId", "createdAt"])
export class ImageGeneration {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    userId: string;

    @Column({ type: "text" })
    prompt: string;

    @Column({ type: "varchar", length: 20, default: "creative" })
    toolKey: "creative" | "main";

    @Column({ type: "jsonb", nullable: true })
    mainInput?: MainImageInput | null;

    @Column({ type: "uuid" })
    modelId: string;

    @Column({ type: "varchar", length: 100 })
    modelName: string;

    @Column({ type: "varchar", length: 30 })
    size: string;

    @Column({ type: "varchar", length: 20, default: "standard" })
    quality: string;

    @Column({ type: "varchar", length: 20, default: "vivid" })
    style: string;

    @Column({ type: "integer", default: 1 })
    count: number;

    @Column({ type: "varchar", length: 20, default: ImageGenerationStatus.PROCESSING })
    status: ImageGenerationStatus;

    @Column({ type: "jsonb", default: () => "'[]'" })
    images: GeneratedImage[];

    @Column({ type: "text", nullable: true })
    error?: string | null;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt: Date;

    @UpdateDateColumn({ type: "timestamptz" })
    updatedAt: Date;
}
