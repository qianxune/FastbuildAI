import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Migration: Add publish-related fields to xhs_note table
 * Version: 25.2.2
 * Created: 2026-01-26
 * Description: Add is_published, published_at, xhs_note_id, and xhs_note_url columns to xhs_note table
 */
export class Migration1737901567000 implements MigrationInterface {
    name = "Migration1737901567000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add is_published column
        await queryRunner.query(
            `ALTER TABLE "xhs_note" ADD COLUMN IF NOT EXISTS "is_published" boolean NOT NULL DEFAULT false`,
        );
        await queryRunner.query(
            `COMMENT ON COLUMN "xhs_note"."is_published" IS '是否已发布到小红书'`,
        );

        // Add published_at column
        await queryRunner.query(
            `ALTER TABLE "xhs_note" ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMP WITH TIME ZONE`,
        );
        await queryRunner.query(
            `COMMENT ON COLUMN "xhs_note"."published_at" IS '发布到小红书的时间'`,
        );

        // Add xhs_note_id column
        await queryRunner.query(
            `ALTER TABLE "xhs_note" ADD COLUMN IF NOT EXISTS "xhs_note_id" character varying(100)`,
        );
        await queryRunner.query(
            `COMMENT ON COLUMN "xhs_note"."xhs_note_id" IS '小红书平台上的笔记ID'`,
        );

        // Add xhs_note_url column
        await queryRunner.query(
            `ALTER TABLE "xhs_note" ADD COLUMN IF NOT EXISTS "xhs_note_url" character varying(500)`,
        );
        await queryRunner.query(
            `COMMENT ON COLUMN "xhs_note"."xhs_note_url" IS '小红书平台上的笔记URL'`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove columns in reverse order
        await queryRunner.query(`ALTER TABLE "xhs_note" DROP COLUMN IF EXISTS "xhs_note_url"`);
        await queryRunner.query(`ALTER TABLE "xhs_note" DROP COLUMN IF EXISTS "xhs_note_id"`);
        await queryRunner.query(`ALTER TABLE "xhs_note" DROP COLUMN IF EXISTS "published_at"`);
        await queryRunner.query(`ALTER TABLE "xhs_note" DROP COLUMN IF EXISTS "is_published"`);
    }
}
