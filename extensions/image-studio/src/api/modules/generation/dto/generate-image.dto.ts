import { Transform } from "class-transformer";
import { IsIn, IsInt, IsString, IsUUID, Length, Max, Min } from "class-validator";

export const IMAGE_SIZES = ["1024x1024", "1536x1024", "1024x1536", "1792x1024", "1024x1792"] as const;
export const IMAGE_QUALITIES = ["standard", "hd"] as const;
export const IMAGE_STYLES = ["vivid", "natural"] as const;

export class GenerateImageDto {
    @IsString()
    @Length(3, 2000)
    prompt: string;

    @IsUUID()
    modelId: string;

    @IsIn(IMAGE_SIZES)
    size: (typeof IMAGE_SIZES)[number] = "1024x1024";

    @IsIn(IMAGE_QUALITIES)
    quality: (typeof IMAGE_QUALITIES)[number] = "standard";

    @IsIn(IMAGE_STYLES)
    style: (typeof IMAGE_STYLES)[number] = "vivid";

    @Transform(({ value }) => Number(value))
    @IsInt()
    @Min(1)
    @Max(4)
    count: number = 1;
}