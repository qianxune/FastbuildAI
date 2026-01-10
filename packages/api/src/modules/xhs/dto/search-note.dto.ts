import { IsOptional, IsString, IsBoolean } from "class-validator";
import { Transform } from "class-transformer";

/**
 * 搜索笔记DTO
 */
export class SearchNoteDto {
    /**
     * 搜索关键词
     */
    @IsString({ message: "搜索关键词必须是字符串" })
    keyword: string;

    /**
     * 是否精确匹配
     * true: 精确匹配，false: 模糊匹配（默认）
     */
    @IsOptional()
    @Transform(({ value }) => value === 'true' || value === true)
    @IsBoolean({ message: "精确匹配标志必须是布尔值" })
    exact?: boolean = false;
}