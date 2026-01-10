import { AppEntity } from "../decorators/app-entity.decorator";
import { Column, Index, JoinColumn, ManyToOne, type Relation } from "../typeorm";
import { BaseEntity } from "./base";
import { User } from "./user.entity";

/**
 * 小红书图片实体
 * 用于跟踪用户上传和使用的图片
 */
@AppEntity({ name: "xhs_image", comment: "小红书图片" })
@Index(["userId", "createdAt"])
@Index(["type"])
export class XhsImage extends BaseEntity {
    /**
     * 图片URL
     */
    @Column({
        type: "varchar",
        length: 500,
        comment: "图片URL地址",
    })
    url: string;

    /**
     * 图片类型
     */
    @Column({
        type: "varchar",
        length: 50,
        comment: "图片类型: auto-自动配图, template-图片模板, upload-本地上传",
    })
    type: string;

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
}
