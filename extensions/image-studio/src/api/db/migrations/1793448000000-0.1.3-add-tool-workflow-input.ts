import { type QueryRunner, TableColumn } from "@buildingai/db/typeorm";

import { ImageGeneration } from "../entities/image-generation.entity";

export class AddToolWorkflowInput1793448000000 {
    async up(queryRunner: QueryRunner): Promise<void> {
        const metadata = queryRunner.connection.getMetadata(ImageGeneration);
        const name = metadata.findColumnWithPropertyName("toolInput")!.databaseName;
        await queryRunner.startTransaction();
        try {
            if (!await queryRunner.hasColumn(metadata.tablePath, name)) {
                await queryRunner.addColumn(metadata.tablePath, new TableColumn({ name, type: "jsonb", isNullable: true }));
            }
            await queryRunner.commitTransaction();
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        }
    }

    async down(): Promise<void> {
        throw new Error("Tool workflow input is a forward-only migration; removing it would discard task metadata.");
    }
}