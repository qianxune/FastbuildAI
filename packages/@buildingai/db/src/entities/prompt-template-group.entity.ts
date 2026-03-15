import { AppEntity } from "../decorators/app-entity.decorator";
import { Column, Index } from "../typeorm";
import { BaseEntity } from "./base";

/**
 * 提示词模板分组
 * 用于对提示词模板进行分组管理
 */
@AppEntity({ name: "prompt_template_groups", comment: "提示词模板分组" })
@Index(["sortOrder"])
export class PromptTemplateGroup extends BaseEntity {
    /**
     * 分组名称
     */
    @Column({
        type: "varchar",
        length: 100,
        comment: "分组名称",
    })
    name: string;

    /**
     * 排序（数值越小越靠前）
     */
    @Column({
        type: "int",
        default: 0,
        comment: "排序顺序",
    })
    sortOrder: number;
}
