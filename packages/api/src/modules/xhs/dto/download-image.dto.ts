import { IsString, IsNotEmpty, IsUrl } from "class-validator";

export class DownloadImageDto {
    @IsString()
    @IsNotEmpty({ message: "图片URL不能为空" })
    @IsUrl({}, { message: "图片URL格式不正确" })
    imageUrl: string;
}
