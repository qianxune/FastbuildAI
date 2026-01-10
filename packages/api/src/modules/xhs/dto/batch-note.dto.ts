import { IsArray, IsEnum, IsOptional, IsString, IsUUID } from "class-validator";

/**
 * 批量操作类型
 */
export enum BatchActionType {
    DELETE = "delete",
    MOVE = "move",
}

/**
 * 批量操作笔记DTO
 */
export class BatchNoteDto {
    /**
     * 操作类型
     */
    @IsEnum(BatchActionType, { message: "操作类型必须是 delete 或 move" })
    action: BatchActionType;

    /**
     * 笔记ID列表
     */
    @IsArray({ message: "笔记ID列表必须是数组" })
    @IsUUID("4", { each: true, message: "每个笔记ID必须是有效的UUID" })
    ids: string[];

    /**
     * 目标分组ID（仅在move操作时需要）
     */
    @IsOptional()
    @IsString({ message: "分组ID必须是字符串" })
    @IsUUID("4", { message: "分组ID必须是有效的UUID" })
    groupId?: string;
}