import { IsNotEmpty, IsString, Length } from "class-validator";

/**
 * 更新分组DTO
 */
export class UpdateGroupDto {
    /**
     * 分组名称
     */
    @IsNotEmpty({ message: "分组名称不能为空" })
    @IsString({ message: "分组名称必须是字符串" })
    @Length(1, 100, { message: "分组名称长度必须在1-100个字符之间" })
    name: string;
}