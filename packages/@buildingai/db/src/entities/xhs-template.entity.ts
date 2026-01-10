import { AppEntity } from "../decorators/app-entity.decorator";
import { Column, Index } from "../typeorm";
import { BaseEntity } from "./base";

/**
 * 小红书内容模板实体
 * 存储预设的文案模板，用于快速创作
 */
@AppEntity({ name: "xhs_content_template", comment: "小红书内容模板" })
@Index(["category"])
@Index(["usageCount"])
export class XhsTemplate extends BaseEntity {
    /**
     * 模板标题
     */
    @Column({
        type: "varchar",
        length: 200,
        comment: "模板标题",
    })
    title: string;

    /**
     * 模板内容
     */
    @Column({
        type: "text",
        comment: "模板内容",
    })
    content: string;

    /**
     * 模板分类
     */
    @Column({
        type: "varchar",
        length: 50,
        comment: "模板分类: 美妆, OOTD, 好物分享, 探店, 美食, 萌宠, 日常等",
    })
    category: string;

    /**
     * 使用次数
     */
    @Column({
        type: "int",
        default: 0,
        comment: "模板使用次数统计",
    })
    usageCount: number;

    /**
     * 是否启用
     */
    @Column({
        type: "boolean",
        default: true,
        comment: "是否启用该模板",
    })
    isActive: boolean;
}
