import { AppEntity } from "../decorators/app-entity.decorator";
import { Column, Index } from "../typeorm";
import { BaseEntity } from "./base";

/**
 * 小红书热门主题实体
 * 存储热门主题标签，用于快速填充输入内容
 */
@AppEntity({ name: "xhs_hot_topic", comment: "小红书热门主题" })
@Index(["category"])
@Index(["usageCount"])
@Index(["sortOrder"])
export class XhsHotTopic extends BaseEntity {
    /**
     * 主题标题
     */
    @Column({
        type: "varchar",
        length: 100,
        comment: "主题标题",
    })
    title: string;

    /**
     * 主题分类
     */
    @Column({
        type: "varchar",
        length: 50,
        nullable: true,
        comment: "主题分类: 美食, 美妆, 旅游, 穿搭, 好物, 萌宠, 日常等",
    })
    category?: string;

    /**
     * 使用次数
     */
    @Column({
        type: "int",
        default: 0,
        comment: "主题使用次数统计",
    })
    usageCount: number;

    /**
     * 排序顺序
     */
    @Column({
        type: "int",
        default: 0,
        comment: "排序顺序，数值越小越靠前",
    })
    sortOrder: number;

    /**
     * 是否启用
     */
    @Column({
        type: "boolean",
        default: true,
        comment: "是否启用该主题",
    })
    isActive: boolean;
}
