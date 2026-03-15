import { IsArray, IsNotEmpty, IsString, IsUUID, ArrayMinSize } from "class-validator";

export class BatchGenerateNotesDto {
    @IsNotEmpty({ message: "商品ID列表不能为空" })
    @IsArray({ message: "商品ID列表必须是数组" })
    @ArrayMinSize(1, { message: "至少需要选择一个商品" })
    @IsUUID(4, { each: true, message: "商品ID格式不正确" })
    product_ids: string[];

    @IsNotEmpty({ message: "AI模型不能为空" })
    @IsString({ message: "AI模型必须是字符串" })
    ai_model: string;

    @IsNotEmpty({ message: "提示词模板ID不能为空" })
    @IsUUID(4, { message: "提示词模板ID格式不正确" })
    template_id: string;
}
