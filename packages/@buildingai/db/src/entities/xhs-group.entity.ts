import { AppEntity } from "../decorators/app-entity.decorator";
import { Column, Index, JoinColumn, ManyToOne, OneToMany, type Relation } from "../typeorm";
import { BaseEntity } from "./base";
import { User } from "./user.entity";
import { XhsNote } from "./xhs-note.entity";

/**
 * 小红书笔记分组实体
 * 用于组织和管理用户的笔记
 */
@AppEntity({ name: "xhs_group", comment: "小红书笔记分组" })
@Index(["userId"])
export class XhsGroup extends BaseEntity {
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
     * 是否为系统默认分组
     */
    @Column({
        type: "boolean",
        default: false,
        comment: "是否为系统默认分组",
    })
    isDefault: boolean;

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
     * 所属用户
     */
    @ManyToOne(() => User, {
        onDelete: "CASCADE",
    })
    @JoinColumn({ name: "user_id" })
    user: Relation<User>;

    /**
     * 分组下的笔记列表
     */
    @OneToMany(() => XhsNote, (note) => note.group)
    notes: Relation<XhsNote[]>;
}
