import {
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    Length,
    Min,
} from "class-validator";

export class CreatePromptTemplateDto {
    @IsNotEmpty({ message: "模板名称不能为空" })
    @IsString()
    @Length(1, 200)
    name: string;

    @IsNotEmpty({ message: "模板内容不能为空" })
    @IsString()
    content: string;

    @IsOptional()
    @IsInt()
    @IsIn([0, 1])
    status?: number;

    @IsOptional()
    @IsUUID()
    groupId?: string;

    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number;
}

export class UpdatePromptTemplateDto {
    @IsOptional()
    @IsString()
    @Length(1, 200)
    name?: string;

    @IsOptional()
    @IsString()
    content?: string;

    @IsOptional()
    @IsInt()
    @IsIn([0, 1])
    status?: number;

    @IsOptional()
    @IsUUID()
    groupId?: string;

    @IsOptional()
    @IsBoolean()
    clearGroup?: boolean;

    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number;
}

export class QueryPromptTemplatesDto {
    @IsOptional()
    @IsUUID()
    groupId?: string;

    @IsOptional()
    @IsString()
    forSelect?: string;
}
