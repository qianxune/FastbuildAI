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
                    const skuCode = parsed.skuCode ? String(parsed.skuCode).trim() : undefined;

                    let exists = false;
                    if (externalSkuId) {
                        exists = !!(await this.productRepository.findOne({
                            where: { userId, externalSkuId },
                        }));
                    } else if (skuCode) {
                        exists = !!(await this.productRepository.findOne({
                            where: { userId, skuCode },
                        }));
                    }
                    if (exists) {
                        result.skipped += 1;
                        continue;
                    }

                    const alreadyInBatch = toInsert.some(
                        (p) =>
                            (externalSkuId && p.externalSkuId === externalSkuId) ||
                            (skuCode && p.skuCode === skuCode),
                    );
                    if (alreadyInBatch) {
                        result.skipped += 1;
                        continue;
                    }

                    toInsert.push({
                        userId,
                        name,
                        skuCode: skuCode || `row-${rowIndex}`,
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
        const { page = 1, limit = 20, keyword, sortBy = "createdAt", sortOrder = "DESC" } = query;
        const qb = this.productRepository
            .createQueryBuilder("p")
            .where("p.userId = :userId", { userId });

        if (keyword?.trim()) {
            qb.andWhere(
                "(p.name ILIKE :kw OR p.skuCode ILIKE :kw OR p.spec ILIKE :kw OR p.externalProductId ILIKE :kw)",
                { kw: `%${keyword.trim()}%` },
            );
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
        }>;
        total: number;
        page: number;
        limit: number;
    }> {
        const { page = 1, limit = 20, keyword, sortBy = "createdAt", sortOrder = "DESC" } = query;

        // 构建查询
        const qb = this.productRepository
            .createQueryBuilder("p")
            .where("p.userId = :userId", { userId })
            .orderBy("p.createdAt", "DESC");

        if (keyword?.trim()) {
            qb.andWhere(
                "(p.name ILIKE :kw OR p.skuCode ILIKE :kw OR p.spec ILIKE :kw OR p.externalProductId ILIKE :kw)",
                { kw: `%${keyword.trim()}%` },
            );
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

        const groups = groupsWithCount.sort((a, b) => {
            if (sortBy === "noteCount") {
                const diff = a.noteCount - b.noteCount;
                return sortOrder === "ASC" ? diff : -diff;
            }
            const timeA = a.skus[0]?.createdAt?.getTime() || 0;
            const timeB = b.skus[0]?.createdAt?.getTime() || 0;
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
        }));

        return { items, total, page, limit };
    }
}
