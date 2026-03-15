import { IsInt, IsNotEmpty, IsOptional, IsString, Length, Min } from "class-validator";

export class CreatePromptTemplateGroupDto {
    @IsNotEmpty({ message: "分组名称不能为空" })
    @IsString()
    @Length(1, 100)
    name: string;

    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number;
}

export class UpdatePromptTemplateGroupDto {
    @IsOptional()
    @IsString()
    @Length(1, 100)
    name?: string;

    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number;
}
