import { AppEntity } from "../decorators/app-entity.decorator";
import { Column, Index, JoinColumn, ManyToOne, type Relation } from "../typeorm";
import { BaseEntity } from "./base";
import { PromptTemplateGroup } from "./prompt-template-group.entity";

/**
 * 提示词模板
 * 用于批量生成笔记时的提示词，支持变量 {product_name}、{spec}、{description}
 */
@AppEntity({ name: "prompt_templates", comment: "提示词模板" })
@Index(["groupId"])
@Index(["status"])
export class PromptTemplate extends BaseEntity {
    /**
     * 模板名称
     */
    @Column({
        type: "varchar",
        length: 200,
        comment: "模板名称",
    })
    name: string;

    /**
     * 模板内容，支持变量 {product_name}、{spec}、{description}
     */
    @Column({
        type: "text",
        comment: "模板内容",
    })
    content: string;

    /**
     * 状态：1=启用，0=禁用
     */
    @Column({
        type: "int",
        default: 1,
        comment: "状态：1=启用，0=禁用",
    })
    status: number;

    /**
     * 所属分组ID
     */
    @Column({
        type: "uuid",
        nullable: true,
        comment: "所属分组ID",
    })
    groupId?: string;

    /**
     * 是否默认提示词（全局仅一个为 true）
     */
    @Column({
        type: "boolean",
        default: false,
        comment: "是否默认提示词",
    })
    isDefault: boolean;

    /**
     * 同组内排序
     */
    @Column({
        type: "int",
        default: 0,
        comment: "同组内排序",
    })
    sortOrder: number;

    /**
     * 所属分组
     */
    @ManyToOne(() => PromptTemplateGroup, { onDelete: "SET NULL", nullable: true })
    @JoinColumn({ name: "group_id" })
    group?: Relation<PromptTemplateGroup>;
}
