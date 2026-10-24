import { Type, Transform } from "class-transformer";
import {
    ArrayMaxSize,
    ArrayMinSize,
    ArrayUnique,
    IsArray,
    IsIn,
    IsInt,
    IsObject,
    IsString,
    IsUUID,
    Length,
    Max,
    Min,
    ValidateNested,
} from "class-validator";

import {
    MAIN_LANGUAGES,
    MAIN_PLATFORMS,
    MAIN_RATIOS,
    MAIN_RESOLUTIONS,
    type MainImageInput,
} from "../../../shared/main-image";

export class MainImageCountsDto {
    @IsInt()
    @Min(0)
    @Max(4)
    white: number = 1;

    @IsInt()
    @Min(0)
    @Max(4)
    scene: number = 1;

    @IsInt()
    @Min(0)
    @Max(4)
    selling: number = 1;

    @IsInt()
    @Min(0)
    @Max(4)
    other: number = 0;
}

export class MainImageDto implements MainImageInput {
    @IsUUID()
    modelId: string;

    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(5)
    @ArrayUnique()
    @IsUUID(undefined, { each: true })
    assetIds: string[];

    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    @IsString()
    @Length(1, 100)
    productName: string;

    @IsString()
    @Length(0, 100)
    brand: string = "";

    @IsIn(MAIN_PLATFORMS)
    platform: MainImageInput["platform"] = "淘宝 / 天猫";

    @IsIn(MAIN_LANGUAGES)
    language: MainImageInput["language"] = "简体中文";

    @IsIn(MAIN_RATIOS)
    ratio: MainImageInput["ratio"] = "1:1";

    @IsIn(MAIN_RESOLUTIONS)
    resolution: MainImageInput["resolution"] = "2K";

    @IsObject()
    @ValidateNested()
    @Type(() => MainImageCountsDto)
    counts: MainImageCountsDto = new MainImageCountsDto();

    @IsString()
    @Length(0, 3000)
    description: string = "";

    @IsString()
    @Length(0, 1500)
    instructions: string = "";
}

export class AnalyzeProductDto {
    @IsUUID()
    modelId: string;

    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(5)
    @ArrayUnique()
    @IsUUID(undefined, { each: true })
    assetIds: string[];

    @IsString()
    @Length(0, 100)
    productName: string = "";

    @IsIn(MAIN_LANGUAGES)
    language: MainImageInput["language"] = "简体中文";
}
