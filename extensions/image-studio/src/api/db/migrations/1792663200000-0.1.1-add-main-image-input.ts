import { type QueryRunner, TableColumn } from "@buildingai/db/typeorm";

import { ImageGeneration } from "../entities/image-generation.entity";

export class AddMainImageInput1792663200000 {
    /** 在事务中按实体字段映射补齐工具标识与主图输入列，已存在的列保持不变。 */
    async up(queryRunner: QueryRunner): Promise<void> {
        const metadata = queryRunner.connection.getMetadata(ImageGeneration);
        const toolKey = metadata.findColumnWithPropertyName("toolKey")!.databaseName;
        const mainInput = metadata.findColumnWithPropertyName("mainInput")!.databaseName;
        await queryRunner.startTransaction();
        try {
            if (!await queryRunner.hasColumn(metadata.tablePath, toolKey)) {
                await queryRunner.addColumn(metadata.tablePath, new TableColumn({
                    name: toolKey, type: "varchar", length: "20", isNullable: false, default: "'creative'",
                }));
            }
            if (!await queryRunner.hasColumn(metadata.tablePath, mainInput)) {
                await queryRunner.addColumn(metadata.tablePath, new TableColumn({
                    name: mainInput, type: "jsonb", isNullable: true,
                }));
            }
            await queryRunner.commitTransaction();
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        }
    }

    /** 拒绝回滚，避免删除历史生成任务的工具标识及主图输入元数据。 */
    async down(): Promise<void> {
        throw new Error("Main image input is a forward-only migration; removing it would discard task metadata.");
    }
}