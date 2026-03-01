import { AppEntity } from "../decorators/app-entity.decorator";
import { Column, Index, JoinColumn, ManyToOne, type Relation } from "../typeorm";
import { BaseEntity } from "./base";
import { User } from "./user.entity";

/**
 * 小红书商品/SKU 实体（妙手导入）
 * 每行一条 SKU，同一商品 ID 可对应多条记录
 */
@AppEntity({ name: "xhs_product", comment: "小红书商品/SKU（妙手导入）" })
@Index(["userId", "createdAt"])
@Index(["userId", "externalProductId"])
@Index(["userId", "externalProductId"])
export class XhsProduct extends BaseEntity {
    /**
     * 所属用户ID
     */
    @Column({ type: "uuid", comment: "所属用户ID" })
    @Index()
    userId: string;

    /**
     * 所属用户
     */
    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "user_id" })
    user: Relation<User>;

    /**
     * 商品名称（同商品多 SKU 时可能重复）
     */
    @Column({ type: "varchar", length: 200, comment: "商品名称" })
    name: string;

    /**
     * SKU 编码（Excel 的「SKU」或「SKU编码」）
     */
    @Column({ type: "varchar", length: 100, nullable: true, comment: "SKU 编码" })
    skuCode?: string;

    /**
     * 妙手/外部 SKU ID（用于导入时判重）
     */
    @Column({ type: "varchar", length: 100, nullable: true, comment: "妙手/外部 SKU ID" })
    externalSkuId?: string;

    /**
     * 妙手/外部商品 ID（同一商品多条 SKU 共享，用于关联与分组）
     */
    @Column({ type: "varchar", length: 100, nullable: true, comment: "妙手/外部商品 ID" })
    externalProductId?: string;

    /**
     * 规格/属性
     */
    @Column({ type: "varchar", length: 500, nullable: true, comment: "规格/属性" })
    spec?: string;

    /**
     * 销售价
     */
    @Column({ type: "varchar", length: 50, nullable: true, comment: "销售价" })
    price?: string;

    /**
     * 成本价
     */
    @Column({ type: "varchar", length: 50, nullable: true, comment: "成本价" })
    costPrice?: string;

    /**
     * 库存
     */
    @Column({ type: "int", nullable: true, comment: "库存" })
    stock?: number;

    /**
     * 主图 URL
     */
    @Column({ type: "varchar", length: 500, nullable: true, comment: "主图 URL" })
    imageUrl?: string;

    /**
     * 多图 URL 列表
     */
    @Column({ type: "jsonb", nullable: true, comment: "多图 URL 列表" })
    extraImages?: string[];

    /**
     * 备注或描述
     */
    @Column({ type: "text", nullable: true, comment: "备注或描述" })
    description?: string;

    /**
     * 来源ID（如阿里巴巴商品ID）
     */
    @Column({ type: "varchar", length: 100, nullable: true, comment: "来源ID" })
    sourceId?: string;

    /**
     * 来源标题
     */
    @Column({ type: "varchar", length: 500, nullable: true, comment: "来源标题" })
    sourceTitle?: string;

    /**
     * 来源链接（如阿里巴巴商品链接）
     */
    @Column({ type: "varchar", length: 1000, nullable: true, comment: "来源链接" })
    sourceUrl?: string;

    /**
     * 商品链接（如小红书商品链接）
     */
    @Column({ type: "varchar", length: 1000, nullable: true, comment: "商品链接" })
    productUrl?: string;
}
