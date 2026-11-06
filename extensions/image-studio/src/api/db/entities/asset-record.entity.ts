import { ExtensionEntity } from "@buildingai/core/decorators";
import { Column, CreateDateColumn, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "@buildingai/db/typeorm";
import type { CreativeAssetKind } from "../../shared/assets";

@ExtensionEntity("asset_record")
@Index("IDX_asset_record_user_updated", ["userId", "updatedAt"])
export class AssetRecord {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({ type: "uuid" })
    userId!: string;

    @Column({ type: "varchar", length: 20 })
    kind!: CreativeAssetKind;

    @Column({ type: "varchar", length: 120 })
    name!: string;

    @Column({ type: "varchar", length: 1500, default: "" })
    prompt!: string;

    @Column({ type: "jsonb" })
    imageIds!: string[];

    @Column({ type: "integer", default: 1 })
    version!: number;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt!: Date;

    @UpdateDateColumn({ type: "timestamptz" })
    updatedAt!: Date;
}