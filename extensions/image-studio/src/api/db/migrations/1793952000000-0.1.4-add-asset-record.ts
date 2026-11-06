import type { QueryRunner } from "@buildingai/db/typeorm";

import { AssetRecord } from "../entities/asset-record.entity";

export class AddAssetRecord1793952000000 {
    async up(queryRunner: QueryRunner): Promise<void> {
        const metadata = queryRunner.connection.getMetadata(AssetRecord);
        if (metadata.schema !== "image_studio" || metadata.tableName !== "asset_record") {
            throw new Error("Asset record migration requires image_studio.asset_record metadata.");
        }
        await queryRunner.startTransaction();
        try {
            await queryRunner.query(`CREATE TABLE IF NOT EXISTS "image_studio"."asset_record" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "user_id" uuid NOT NULL,
                "kind" varchar(20) NOT NULL,
                "name" varchar(120) NOT NULL,
                "prompt" varchar(1500) NOT NULL DEFAULT '',
                "image_ids" jsonb NOT NULL,
                "version" integer NOT NULL DEFAULT 1,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                PRIMARY KEY ("id")
            )`);
            await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_asset_record_user_updated"
                ON "image_studio"."asset_record" ("user_id", "updated_at")`);
            await queryRunner.commitTransaction();
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        }
    }

    async down(): Promise<void> {
        throw new Error("Asset records are a forward-only migration; removing them would discard user references.");
    }
}