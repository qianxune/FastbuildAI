import { IsIn, IsNotEmpty, IsOptional, IsString, Length, Matches } from "class-validator";

/**
 * 生成笔记DTO
 */
export class GenerateNoteDto {
    /**
     * 用户输入内容
     * 主题或草稿内容
     */
    @IsNotEmpty({ message: "输入内容不能为空" })
    @IsString({ message: "输入内容必须是字符串" })
    @Length(1, 2000, { message: "输入内容长度必须在1-2000个字符之间" })
    @Matches(/.*\S.*/, { message: "输入内容不能只包含空白字符，请输入有效内容" })
    content: string;

    /**
     * 生成模式
     * ai-generate: AI生成
     * ai-compose: AI作文
     * add-emoji: 笔记加emoji
     */
    @IsNotEmpty({ message: "生成模式不能为空" })
    @IsString({ message: "生成模式必须是字符串" })
    @IsIn(["ai-generate", "ai-compose", "add-emoji"], {
        message: "生成模式只能是 ai-generate、ai-compose 或 add-emoji",
    })
    mode: string;

    /**
     * 高级选项 - AI模型
     */
    @IsOptional()
    @IsString({ message: "AI模型必须是字符串" })
    aiModel?: string;

    /**
     * 高级选项 - 创作风格
     */
    @IsOptional()
    @IsString({ message: "创作风格必须是字符串" })
    @IsIn(["活泼", "严谨", "专业", "可爱"], {
        message: "创作风格只能是 活泼、严谨、专业 或 可爱",
    })
    style?: string;

    /**
     * 高级选项 - 温度参数
     */
    @IsOptional()
    @IsString({ message: "温度参数必须是字符串" })
    temperature?: string;

    /**
     * 高级选项 - 最大长度
     */
    @IsOptional()
    @IsString({ message: "最大长度必须是字符串" })
    maxLength?: string;

    /**
     * 高级选项 - emoji频率
     */
    @IsOptional()
    @IsString({ message: "emoji频率必须是字符串" })
    @IsIn(["少", "适中", "多"], {
        message: "emoji频率只能是 少、适中 或 多",
    })
    emojiFrequency?: string;

    /**
     * 高级选项 - 生成标题数量
     */
    @IsOptional()
    @IsString({ message: "标题数量必须是字符串" })
    titleCount?: string;
}
