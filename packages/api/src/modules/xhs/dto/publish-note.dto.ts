import { IsString, IsNotEmpty, IsOptional, IsArray, MaxLength } from "class-validator";

export class PublishNoteDto {
    @IsString()
    @IsNotEmpty({ message: "标题不能为空" })
    @MaxLength(200, { message: "标题最多200个字符" })
    title: string;

    @IsString()
    @IsNotEmpty({ message: "正文内容不能为空" })
    content: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    images?: string[];

    /**
     * 可选：妙手/外部商品 ID（对应 xhs_product.external_product_id），传给 MCP 用于挂载店内商品
     */
    @IsOptional()
    @IsString()
    productSearchId?: string;
}

export class PublishNoteByIdDto {
    @IsString()
    @IsNotEmpty({ message: "笔记ID不能为空" })
    noteId: string;
}
