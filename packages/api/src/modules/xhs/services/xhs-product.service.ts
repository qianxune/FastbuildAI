import { BaseService } from "@buildingai/base";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { XhsNote, XhsProduct } from "@buildingai/db/entities";
import { In, Repository } from "@buildingai/db/typeorm";
import { HttpErrorFactory } from "@buildingai/errors";
import { Injectable, Logger } from "@nestjs/common";
import * as XLSX from "xlsx";
import { QueryProductDto } from "../dto/query-product.dto";
import { parseExcelRowToProduct } from "./xhs-product-import.util";

export interface ImportProductResult {
    success: number;
    skipped: number;
    failed: number;
    errors?: Array<{ row: number; message: string }>;
}

export interface XhsProductWithNoteCount extends XhsProduct {
    noteCount: number;
}

/**
 * XHS product/SKU service (Miaoshou import)
 */
@Injectable()
export class XhsProductService extends BaseService<XhsProduct> {
    protected readonly logger = new Logger(XhsProductService.name);

    constructor(
        @InjectRepository(XhsProduct)
        private readonly productRepository: Repository<XhsProduct>,
        @InjectRepository(XhsNote)
        private readonly noteRepository: Repository<XhsNote>,
    ) {
        super(productRepository);
    }

    /**
     * 批量获取商品的笔记数量 (product_id -> count)
     */
    private async getNoteCountsByProductIds(productIds: string[]): Promise<Map<string, number>> {
        if (!productIds.length) return new Map();
        const rows = await this.noteRepository
            .createQueryBuilder("n")
            .select("n.productId", "productId")
            .addSelect("COUNT(n.id)", "cnt")
            .where("n.productId IN (:...ids)", { ids: productIds })
            .andWhere("n.productId IS NOT NULL")
            .groupBy("n.productId")
            .getRawMany<{ productId: string; cnt: string }>();
        const map = new Map<string, number>();
        for (const r of rows) {
            map.set(r.productId, parseInt(r.cnt, 10) || 0);
        }
        return map;
    }

    private applyProductKeywordFilter(
        qb: ReturnType<Repository<XhsProduct>["createQueryBuilder"]>,
        keyword: string,
    ): void {
        const kw = `%${keyword.trim()}%`;
        qb.andWhere(
            "(p.name ILIKE :kw OR p.skuCode ILIKE :kw OR p.spec ILIKE :kw OR p.externalProductId ILIKE :kw OR (p.category IS NOT NULL AND p.category ILIKE :kw))",
            { kw },
        );
    }

    private applyProductCategoryFilter(
        qb: ReturnType<Repository<XhsProduct>["createQueryBuilder"]>,
        category: string,
    ): void {
        qb.andWhere("TRIM(p.category) = :cat", { cat: category.trim() });
    }

    /**
     * 当前用户已使用的分类列表（用于筛选下拉）
     */
    async listDistinctCategories(userId: string): Promise<string[]> {
        const rows = (await this.productRepository.query(
            `SELECT DISTINCT TRIM(category) AS c FROM xhs_product WHERE user_id = $1 AND category IS NOT NULL AND TRIM(category) <> '' ORDER BY 1`,
            [userId],
        )) as Array<{ c: string }>;
        return rows.map((r) => r.c).filter(Boolean);
    }

    /**
     * 各分类下的 SKU 数量（分类管理页）
     */
    async listCategoryStats(
        userId: string,
    ): Promise<Array<{ name: string; count: number }>> {
        const rows = (await this.productRepository.query(
            `SELECT TRIM(category) AS name, COUNT(*)::int AS count
             FROM xhs_product
             WHERE user_id = $1 AND category IS NOT NULL AND TRIM(category) <> ''
             GROUP BY TRIM(category)
             ORDER BY TRIM(category)`,
            [userId],
        )) as Array<{ name: string; count: number }>;
        return rows.filter((r) => r.name);
    }

    /**
     * 将某分类下所有商品改为新分类名称（重命名/合并）
     */
    async renameCategoryForUser(
        userId: string,
        fromCategory: string,
        toCategory: string,
    ): Promise<number> {
        const from = fromCategory.trim();
        const to = toCategory.trim().slice(0, 100);
        if (!from || !to) {
            throw HttpErrorFactory.badRequest("分类名称不能为空");
        }
        if (from === to) {
            return 0;
        }
        const result = await this.productRepository
            .createQueryBuilder()
            .update(XhsProduct)
            .set({ category: to, updatedAt: new Date() } as any)
            .where("userId = :userId", { userId })
            .andWhere("TRIM(category) = :from", { from })
            .execute();
        return result.affected ?? 0;
    }

    /**
     * 清空某分类名称下所有商品的分类（不删商品）
     */
    async clearCategoryByNameForUser(userId: string, categoryName: string): Promise<number> {
        const cat = categoryName.trim();
        if (!cat) {
            throw HttpErrorFactory.badRequest("分类名称不能为空");
        }
        const result = await this.productRepository
            .createQueryBuilder()
            .update(XhsProduct)
            .set({ category: null, updatedAt: new Date() } as any)
            .where("userId = :userId", { userId })
            .andWhere("TRIM(category) = :cat", { cat })
            .execute();
        return result.affected ?? 0;
    }

    /**
     * 批量设置分类（仅更新属于当前用户的记录）
     */
    async batchSetCategoryForUser(
        ids: string[],
        category: string | undefined,
        userId: string,
    ): Promise<number> {
        if (!ids.length) return 0;
        const raw = category?.trim();
        const value = raw === undefined || raw === "" ? null : raw.slice(0, 100);
        const result = await this.productRepository
            .createQueryBuilder()
            .update(XhsProduct)
            .set({ category: value, updatedAt: new Date() } as any)
            .where("id IN (:...ids)", { ids })
            .andWhere("userId = :userId", { userId })
            .execute();
        return result.affected ?? 0;
    }

    /**
     * 无妙手 SKU ID / 本地 SKU 编码时，用「商品ID|规格」生成稳定 sku_code，避免每次导入用行号导致重复插入、创建时间被刷新。
     */
    private stableSkuCodeFromProductRow(parsed: Record<string, unknown>): string | undefined {
        const extPid = parsed.externalProductId
            ? String(parsed.externalProductId).trim()
            : "";
        if (!extPid) return undefined;
        const spec = parsed.spec != null && parsed.spec !== "" ? String(parsed.spec).trim() : "";
        return `${extPid}|${spec}`.slice(0, 100);
    }

    /**
     * 查找当前用户下是否已有同一 Excel 行对应的商品（用于更新而非重复插入；createdAt 保持不变）。
     */
    private async findExistingProductForExcelImport(
        userId: string,
        externalSkuId: string | undefined,
        skuCodeFromExcel: string | undefined,
        resolvedSkuCode: string,
    ): Promise<XhsProduct | null> {
        if (externalSkuId) {
            const byExt = await this.productRepository.findOne({
                where: { userId, externalSkuId },
            });
            if (byExt) return byExt;
        }
        if (skuCodeFromExcel) {
            const bySku = await this.productRepository.findOne({
                where: { userId, skuCode: skuCodeFromExcel },
            });
            if (bySku) return bySku;
        }
        return this.productRepository.findOne({
            where: { userId, skuCode: resolvedSkuCode },
        });
    }

    async importFromExcel(file: Express.Multer.File, userId: string): Promise<ImportProductResult> {
        const result: ImportProductResult = { success: 0, skipped: 0, failed: 0, errors: [] };
        const CHUNK = 100;

        try {
            const workbook = XLSX.read(file.buffer, {
                type: "buffer",
                cellText: false,
                cellDates: true,
                raw: false,
            });
            const sheetName = workbook.SheetNames[0];
            if (!sheetName) {
                throw HttpErrorFactory.badRequest("Excel file has no worksheet");
            }
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false }) as Record<
                string,
                unknown
            >[];
            if (!rows.length) {
                throw HttpErrorFactory.badRequest("Excel file content is empty");
            }

            const toInsert: Partial<XhsProduct>[] = [];
            for (let i = 0; i < rows.length; i++) {
                const rowIndex = i + 2; // 1-based + header
                try {
                    const parsed = parseExcelRowToProduct(rows[i]);
                    const name = String(parsed.name || "").trim();
                    if (!name) {
                        result.skipped += 1;
                        continue;
                    }
                    const externalSkuId = parsed.externalSkuId
                        ? String(parsed.externalSkuId).trim()
                        : undefined;
                    const skuCodeFromExcel = parsed.skuCode
                        ? String(parsed.skuCode).trim()
                        : undefined;
                    const stableSku = this.stableSkuCodeFromProductRow(parsed);
                    const resolvedSkuCode =
                        skuCodeFromExcel || stableSku || `row-${rowIndex}`;

                    const existing = await this.findExistingProductForExcelImport(
                        userId,
                        externalSkuId,
                        skuCodeFromExcel,
                        resolvedSkuCode,
                    );

                    const rowPayload: Record<string, unknown> = {
                        name,
                        skuCode: resolvedSkuCode,
                        externalSkuId: externalSkuId || undefined,
                        externalProductId: parsed.externalProductId
                            ? String(parsed.externalProductId).trim()
                            : undefined,
                        spec: parsed.spec ? String(parsed.spec) : undefined,
                        price: parsed.price ? String(parsed.price) : undefined,
                        costPrice: parsed.costPrice ? String(parsed.costPrice) : undefined,
                        stock:
                            typeof parsed.stock === "number"
                                ? parsed.stock
                                : parsed.stock != null
                                  ? Number(parsed.stock)
                                  : undefined,
                        imageUrl: parsed.imageUrl ? String(parsed.imageUrl) : undefined,
                        extraImages:
                            Array.isArray(parsed.extraImages) &&
                            parsed.extraImages.every((x) => typeof x === "string")
                                ? (parsed.extraImages as string[])
                                : undefined,
                        description: parsed.description ? String(parsed.description) : undefined,
                        sourceId: parsed.sourceId ? String(parsed.sourceId).trim() : undefined,
                        sourceTitle: parsed.sourceTitle
                            ? String(parsed.sourceTitle).trim()
                            : undefined,
                        sourceUrl: parsed.sourceUrl ? String(parsed.sourceUrl).trim() : undefined,
                        productUrl: parsed.productUrl
                            ? String(parsed.productUrl).trim()
                            : undefined,
                        category: parsed.category
                            ? String(parsed.category).trim().slice(0, 100)
                            : undefined,
                    };

                    if (existing) {
                        // update 不写入 created_at，避免重复导入刷新创建时间
                        await this.productRepository.update(
                            { id: existing.id },
                            {
                                ...(rowPayload as Partial<XhsProduct>),
                                externalSkuId:
                                    (rowPayload.externalSkuId as string | undefined) ??
                                    existing.externalSkuId,
                                category:
                                    (rowPayload.category as string | undefined) ??
                                    (existing as { category?: string }).category,
                                updatedAt: new Date(),
                            } as any,
                        );
                        result.success += 1;
                        continue;
                    }

                    const alreadyInBatch = toInsert.some(
                        (p) =>
                            (externalSkuId && p.externalSkuId === externalSkuId) ||
                            p.skuCode === resolvedSkuCode,
                    );
                    if (alreadyInBatch) {
                        result.skipped += 1;
                        continue;
                    }

                    toInsert.push({
                        userId,
                        ...(rowPayload as Partial<XhsProduct>),
                    });
                } catch (err) {
                    result.failed += 1;
                    result.errors?.push({
                        row: rowIndex,
                        message: err instanceof Error ? err.message : String(err),
                    });
                }
            }

            for (let i = 0; i < toInsert.length; i += CHUNK) {
                const chunk = toInsert.slice(i, i + CHUNK);
                await this.productRepository.insert(chunk);
                result.success += chunk.length;
            }
        } catch (err) {
            this.logger.error("Import Excel failed", err);
            throw HttpErrorFactory.badRequest(
                err instanceof Error ? err.message : "Import failed, please check file format",
            );
        }
        return result;
    }
    
    async findByUser(
        userId: string,
        query: QueryProductDto,
    ): Promise<{ items: XhsProductWithNoteCount[]; total: number; page: number; limit: number }> {
        const { page = 1, limit = 20, keyword, category, sortBy = "createdAt", sortOrder = "DESC" } =
            query;
        const qb = this.productRepository
            .createQueryBuilder("p")
            .where("p.userId = :userId", { userId });

        if (keyword?.trim()) {
            this.applyProductKeywordFilter(qb, keyword);
        }
        if (category?.trim()) {
            this.applyProductCategoryFilter(qb, category);
        }

        if (sortBy === "noteCount") {
            const allProducts = await qb.orderBy("p.createdAt", "DESC").getMany();
            const noteCountMap = await this.getNoteCountsByProductIds(allProducts.map((p) => p.id));
            const itemsWithCount: XhsProductWithNoteCount[] = allProducts.map((p) => ({
                ...p,
                noteCount: noteCountMap.get(p.id) ?? 0,
            }));
            itemsWithCount.sort((a, b) => {
                const diff = a.noteCount - b.noteCount;
                return sortOrder === "ASC" ? diff : -diff;
            });
            const total = itemsWithCount.length;
            const start = (page - 1) * limit;
            const paginated = itemsWithCount.slice(start, start + limit);
            return { items: paginated, total, page, limit };
        }

        qb.orderBy("p.createdAt", sortOrder);
        const [items, total] = await qb
            .skip((page - 1) * limit)
            .take(limit)
            .getManyAndCount();

        const noteCountMap = await this.getNoteCountsByProductIds(items.map((p) => p.id));
        const itemsWithCount: XhsProductWithNoteCount[] = items.map((p) => ({
            ...p,
            noteCount: noteCountMap.get(p.id) ?? 0,
        }));

        return { items: itemsWithCount, total, page, limit };
    }
    
    async findOneForUser(id: string, userId: string): Promise<XhsProduct> {
        const product = await this.productRepository.findOne({
            where: { id, userId },
        });
        if (!product) {
            throw HttpErrorFactory.notFound(
                "Product does not exist or you do not have permission to access it",
            );
        }
        return product;
    }
    
    async findByIds(ids: string[], userId: string): Promise<XhsProduct[]> {
        if (!ids.length) return [];
        const list = await this.productRepository.find({
            where: { id: In(ids), userId },
        });
        return list;
    }

    /**
     * 按商品ID（SPU）分组查询
     */
    async findByUserGrouped(
        userId: string,
        query: QueryProductDto,
    ): Promise<{
        items: Array<{
            productId: string;
            productName: string;
            skuCount: number;
            noteCount: number;
            skus: XhsProduct[];
            imageUrl?: string;
            sourceUrl?: string;
            productUrl?: string;
            /** 组内任一 SKU 的分类（展示用） */
            category?: string;
        }>;
        total: number;
        page: number;
        limit: number;
    }> {
        const { page = 1, limit = 20, keyword, category, sortBy = "createdAt", sortOrder = "DESC" } =
            query;

        // 构建查询
        const qb = this.productRepository
            .createQueryBuilder("p")
            .where("p.userId = :userId", { userId })
            .orderBy("p.createdAt", "DESC");

        if (keyword?.trim()) {
            this.applyProductKeywordFilter(qb, keyword);
        }
        if (category?.trim()) {
            this.applyProductCategoryFilter(qb, category);
        }

        // 获取所有匹配的商品
        const allProducts = await qb.getMany();

        // 按 externalProductId 分组
        const groupMap = new Map<
            string,
            {
                productId: string;
                productName: string;
                skus: XhsProduct[];
                imageUrl?: string;
                sourceUrl?: string;
                productUrl?: string;
            }
        >();

        for (const product of allProducts) {
            const productId = product.externalProductId || product.id;
            if (!groupMap.has(productId)) {
                groupMap.set(productId, {
                    productId,
                    productName: product.name,
                    skus: [],
                    imageUrl: product.imageUrl,
                    sourceUrl: product.sourceUrl,
                    productUrl: product.productUrl,
                });
            }
            groupMap.get(productId)!.skus.push(product);
        }

        // 批量获取笔记数量
        const allSkuIds = Array.from(groupMap.values()).flatMap((g) => g.skus.map((s) => s.id));
        const noteCountMap = await this.getNoteCountsByProductIds(allSkuIds);

        // 转换为数组，添加 noteCount，并排序
        const groupsWithCount = Array.from(groupMap.values()).map((group) => {
            const noteCount = group.skus.reduce(
                (sum, sku) => sum + (noteCountMap.get(sku.id) ?? 0),
                0,
            );
            return { ...group, noteCount };
        });

        const minSkuCreatedTime = (skus: XhsProduct[]): number => {
            let min = Infinity;
            for (const s of skus) {
                const t = s.createdAt?.getTime();
                if (t != null && !Number.isNaN(t) && t < min) {
                    min = t;
                }
            }
            return min === Infinity ? 0 : min;
        };

        const groups = groupsWithCount.sort((a, b) => {
            if (sortBy === "noteCount") {
                const diff = a.noteCount - b.noteCount;
                return sortOrder === "ASC" ? diff : -diff;
            }
            const timeA = minSkuCreatedTime(a.skus);
            const timeB = minSkuCreatedTime(b.skus);
            return sortOrder === "ASC" ? timeA - timeB : timeB - timeA;
        });

        // 分页
        const total = groups.length;
        const start = (page - 1) * limit;
        const paginatedGroups = groups.slice(start, start + limit);

        // 添加 skuCount（noteCount 已在上面的 groupsWithCount 中计算）
        const items = paginatedGroups.map((group) => ({
            ...group,
            skuCount: group.skus.length,
            category:
                group.skus
                    .map((s) => (s as { category?: string }).category)
                    .find((c) => c && String(c).trim()) || undefined,
        }));

        return { items, total, page, limit };
    }

    /**
     * 删除单个商品（校验归属）
     */
    async deleteOne(id: string, userId: string): Promise<void> {
        const product = await this.productRepository.findOne({
            where: { id, userId },
        });
        if (!product) {
            throw HttpErrorFactory.notFound("商品不存在或无权操作");
        }
        await this.productRepository.delete(id);
    }

    /**
     * 批量删除商品（仅删除属于当前用户的）
     */
    async deleteManyForUser(ids: string[], userId: string): Promise<number> {
        if (!ids.length) return 0;
        const result = await this.productRepository.delete({
            id: In(ids),
            userId,
        });
        return result.affected ?? 0;
    }
}
