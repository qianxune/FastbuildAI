import { type QueryRunner, TableColumn } from "@buildingai/db/typeorm";

import { ImageGeneration } from "../entities/image-generation.entity";

export class AddGenerationBilling1792674000000 {
    /** 在事务中补齐计费金额与计费状态列，使用默认值保留旧记录且跳过已有列。 */
    async up(queryRunner: QueryRunner): Promise<void> {
        const metadata = queryRunner.connection.getMetadata(ImageGeneration);
        const columns = [
            { property: "billingAmount", type: "integer", default: "0" },
            { property: "billingStatus", type: "varchar", length: "20", default: "'uncharged'" },
        ];
        await queryRunner.startTransaction();
        try {
            for (const column of columns) {
                const name = metadata.findColumnWithPropertyName(column.property)!.databaseName;
                if (!await queryRunner.hasColumn(metadata.tablePath, name)) {
                    await queryRunner.addColumn(metadata.tablePath, new TableColumn({
                        name,
                        type: column.type,
                        length: column.length,
                        default: column.default,
                        isNullable: false,
                    }));
                }
            }
            await queryRunner.commitTransaction();
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        }
    }

    /** 拒绝回滚，保留财务审计所需的历史计费快照。 */
    async down(): Promise<void> {
        throw new Error("Billing snapshots must be retained for financial audit.");
    }
}