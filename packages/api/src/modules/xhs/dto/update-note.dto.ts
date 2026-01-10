import { IsArray, IsOptional, IsString, IsUUID, Length } from "class-validator";

/**
 * 更新笔记DTO
 */
export class UpdateNoteDto {
    /**
     * 笔记标题
     */
    @IsOptional()
    @IsString({ message: "标题必须是字符串" })
    @Length(1, 200, { message: "标题长度必须在1-200个字符之间" })
    title?: string;

    /**
     * 笔记正文内容
     */
    @IsOptional()
    @IsString({ message: "正文内容必须是字符串" })
    @Length(1, 10000, { message: "正文内容长度必须在1-10000个字符之间" })
    content?: string;

    /**
     * 所属分组ID
     */
    @IsOptional()
    @IsUUID(4, { message: "分组ID必须是有效的UUID格式" })
    groupId?: string;

    /**
     * 封面图片URL列表
     */
    @IsOptional()
    @IsArray({ message: "封面图片必须是数组" })
    @IsString({ each: true, message: "每个图片URL必须是字符串" })
    coverImages?: string[];
}