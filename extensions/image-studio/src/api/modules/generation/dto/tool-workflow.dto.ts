import { Transform } from "class-transformer";
import { Allow, ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateBy, ValidateIf } from "class-validator";

import { TOOL_EDIT_KEYS, TOOL_EXPANSIONS, TOOL_LANGUAGES, TOOL_RATIOS, validateToolWorkflow, type ToolSuggestionInput, type ToolWorkflowInput } from "../../../shared/tool-workflow";

export class ToolAssetsDto {
    @IsUUID()
    modelId!: string;

    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(5)
    @ArrayUnique()
    @IsUUID(undefined, { each: true })
    assetIds!: string[];

    @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
    @IsString()
    @Length(1, 100)
    productName!: string;
}

export class ToolWorkflowDto implements ToolWorkflowInput {
    @IsUUID()
    modelId!: string;

    @IsArray()
    @ArrayMinSize(0)
    @ArrayMaxSize(5)
    @ArrayUnique()
    @IsUUID(undefined, { each: true })
    assetIds!: string[];

    @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
    @ValidateIf((_object, value) => value !== undefined)
    @IsString()
    @Length(0, 100)
    productName?: string;

    @IsIn(TOOL_EDIT_KEYS)
    @ValidateBy({
        name: "toolWorkflow",
        validator: {
            validate: (_value, arguments_) => !!arguments_ && validateToolWorkflow(arguments_.object as ToolWorkflowInput) === null,
            defaultMessage: (arguments_) => arguments_ ? validateToolWorkflow(arguments_.object as ToolWorkflowInput) ?? "工具输入无效" : "工具输入无效",
        },
    })
    tool!: ToolWorkflowInput["tool"];

    @IsString()
    @Length(0, 1500)
    instructions!: string;

    @IsInt()
    @Min(1)
    @Max(10)
    count!: number;

    @IsIn(TOOL_RATIOS)
    ratio!: ToolWorkflowInput["ratio"];

    @IsOptional()
    @IsIn(TOOL_LANGUAGES)
    targetLanguage?: ToolWorkflowInput["targetLanguage"];

    @IsOptional()
    @IsString()
    @Length(1, 300)
    variant?: string;

    @IsOptional()
    @IsIn(TOOL_EXPANSIONS)
    expansion?: ToolWorkflowInput["expansion"];

    @IsOptional()
    @IsBoolean()
    authorized?: boolean;

    @Allow()
    design?: ToolWorkflowInput["design"];
}

export class ToolSuggestionDto extends ToolAssetsDto implements ToolSuggestionInput {
    @IsIn(TOOL_LANGUAGES)
    language!: ToolSuggestionInput["language"];
}