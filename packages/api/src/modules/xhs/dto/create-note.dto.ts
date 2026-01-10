import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Length, Matches } from "class-validator";

/**
 * 创建笔记DTO
 */
export class CreateNoteDto {
    /**
     * 笔记标题
     */
    @IsNotEmpty({ message: "标题不能为空" })
    @IsString({ message: "标题必须是字符串" })
    @Length(1, 200, { message: "标题长度必须在1-200个字符之间" })
    @Matches(/.*\S.*/, { message: "标题不能只包含空白字符，请输入有效标题" })
    title: string;

    /**
     * 笔记正文内容
     */
    @IsNotEmpty({ message: "正文内容不能为空" })
    @IsString({ message: "正文内容必须是字符串" })
    @Length(1, 10000, { message: "正文内容长度必须在1-10000个字符之间" })
    @Matches(/.*\S.*/, { message: "正文内容不能只包含空白字符，请输入有效内容" })
    content: string;

    /**
     * 生成模式
     */
    @IsNotEmpty({ message: "生成模式不能为空" })
    @IsString({ message: "生成模式必须是字符串" })
    @IsIn(["ai-generate", "ai-compose", "add-emoji"], {
        message: "生成模式只能是 ai-generate、ai-compose 或 add-emoji",
    })
    mode: string;

    /**
     * 用户原始输入
     */
    @IsOptional()
    @IsString({ message: "原始输入必须是字符串" })
    originalInput?: string;

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