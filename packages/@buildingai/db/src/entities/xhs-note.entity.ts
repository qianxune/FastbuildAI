import { AppEntity } from "../decorators/app-entity.decorator";
import { Column, Index, JoinColumn, ManyToOne, type Relation } from "../typeorm";
import { BaseEntity } from "./base";
import { User } from "./user.entity";
import { XhsGroup } from "./xhs-group.entity";

/**
 * 小红书笔记实体
 * 存储用户生成的笔记内容
 */
@AppEntity({ name: "xhs_note", comment: "小红书笔记" })
@Index(["userId", "createdAt"])
@Index(["groupId"])
export class XhsNote extends BaseEntity {
    /**
     * 笔记标题
     */
    @Column({
        type: "varchar",
        length: 200,
        comment: "笔记标题",
    })
    title: string;

    /**
     * 笔记正文内容
     */
    @Column({
        type: "text",
        comment: "笔记正文内容",
    })
    content: string;

    /**
     * 封面图片URL列表
     */
    @Column({
        type: "jsonb",
        nullable: true,
        comment: "封面图片URL列表",
    })
    coverImages?: string[];

    /**
     * 字数统计
     */
    @Column({
        type: "int",
        default: 0,
        comment: "字数统计",
    })
    wordCount: number;

    /**
     * 生成模式
     */
    @Column({
        type: "varchar",
        length: 50,
        default: "ai-generate",
        comment: "生成模式: ai-generate-AI生成, ai-compose-AI作文, add-emoji-笔记加emoji",
    })
    mode: string;

    /**
     * 用户原始输入
     */
    @Column({
        type: "text",
        nullable: true,
        comment: "用户原始输入内容",
    })
    originalInput?: string;

    /**
     * 所属用户ID
     */
    @Column({
        type: "uuid",
        comment: "所属用户ID",
    })
    @Index()
    userId: string;

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
     * 所属用户
     */
    @ManyToOne(() => User, {
        onDelete: "CASCADE",
    })
    @JoinColumn({ name: "user_id" })
    user: Relation<User>;

    /**
     * 所属分组
     */
    @ManyToOne(() => XhsGroup, (group) => group.notes, {
        onDelete: "SET NULL",
        nullable: true,
    })
    @JoinColumn({ name: "group_id" })
    group?: Relation<XhsGroup>;
}
