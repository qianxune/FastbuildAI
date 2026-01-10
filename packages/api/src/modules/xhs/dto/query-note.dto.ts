import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";
import { Transform } from "class-transformer";

/**
 * 查询笔记DTO
 */
export class QueryNoteDto {
    /**
     * 页码
     */
    @IsOptional()
    @Transform(({ value }) => parseInt(value))
    @IsInt({ message: "页码必须是整数" })
    @Min(1, { message: "页码必须大于0" })
    page?: number = 1;

    /**
     * 每页数量
     */
    @IsOptional()
    @Transform(({ value }) => parseInt(value))
    @IsInt({ message: "每页数量必须是整数" })
    @Min(1, { message: "每页数量必须大于0" })
    @Max(100, { message: "每页数量不能超过100" })
    limit?: number = 20;

    /**
     * 分组ID筛选
     */
    @IsOptional()
    @IsUUID(4, { message: "分组ID必须是有效的UUID格式" })
    groupId?: string;

    /**
     * 搜索关键词
     */
    @IsOptional()
    @IsString({ message: "搜索关键词必须是字符串" })
    keyword?: string;

    /**
     * 排序字段
     */
    @IsOptional()
    @IsString({ message: "排序字段必须是字符串" })
    sortBy?: string = "createdAt";

    /**
     * 排序方向
     */
    @IsOptional()
    @IsString({ message: "排序方向必须是字符串" })
    sortOrder?: "ASC" | "DESC" = "DESC";
}