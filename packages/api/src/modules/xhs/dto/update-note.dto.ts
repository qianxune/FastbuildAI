import {
    IsArray,
    IsBoolean,
    IsOptional,
    IsString,
    IsUUID,
    Length,
    Matches,
    MaxLength,
} from "class-validator";

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
    @Matches(/.*\S.*/, { message: "标题不能只包含空白字符，请输入有效标题" })
    title?: string;

    /**
     * 笔记正文内容
     */
    @IsOptional()
    @IsString({ message: "正文内容必须是字符串" })
    @Length(1, 10000, { message: "正文内容长度必须在1-10000个字符之间" })
    @Matches(/.*\S.*/, { message: "正文内容不能只包含空白字符，请输入有效内容" })
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

    /**
     * 是否已发布到小红书（保存草稿时不要传）
     */
    @IsOptional()
    @IsBoolean({ message: "isPublished 必须是布尔值" })
    isPublished?: boolean;

    /**
     * 小红书平台上的笔记 ID（发布后回写）
     */
    @IsOptional()
    @IsString({ message: "小红书笔记ID必须是字符串" })
    @MaxLength(100, { message: "小红书笔记ID过长" })
    xhsNoteId?: string;

    /**
     * 小红书笔记链接（发布后回写）
     */
    @IsOptional()
    @IsString({ message: "小红书笔记URL必须是字符串" })
    @MaxLength(500, { message: "小红书笔记URL过长" })
    xhsNoteUrl?: string;
}
