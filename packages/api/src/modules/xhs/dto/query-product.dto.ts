import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Transform } from "class-transformer";

/**
 * 查询商品列表 DTO
 */
export class QueryProductDto {
    @IsOptional()
    @Transform(({ value }) => parseInt(value, 10))
    @IsInt({ message: "页码必须是整数" })
    @Min(1, { message: "页码必须大于0" })
    page?: number = 1;

    @IsOptional()
    @Transform(({ value }) => parseInt(value, 10))
    @IsInt({ message: "每页数量必须是整数" })
    @Min(1, { message: "每页数量必须大于0" })
    @Max(100, { message: "每页数量不能超过100" })
    limit?: number = 20;

    @IsOptional()
    @IsString({ message: "搜索关键词必须是字符串" })
    keyword?: string;
}
