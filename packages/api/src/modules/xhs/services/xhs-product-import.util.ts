/**
 * 妙手 Excel 列名到实体字段的映射（常见导出列）
 * 若妙手导出表头不同，可在此增加别名或从配置读取
 */
export const MIAOSHOU_EXCEL_COLUMN_MAP: Record<string, string> = {
    // 商品
    商品ID: "externalProductId",
    商品名称: "name",
    商品标题: "name",
    名称: "name",
    // SKU
    SKU: "skuCode",
    SKU编码: "skuCode",
    SKU_ID: "externalSkuId",
    SKUID: "externalSkuId",
    "SKU ID": "externalSkuId",
    // 规格与价格
    规格: "spec",
    规格属性: "spec",
    销售价: "price",
    价格: "price",
    售卖价: "price",
    成本价: "costPrice",
    市场价: "costPrice",
    库存: "stock",
    // 图片（主图取第一列，多图可有多列）
    主图: "imageUrl",
    图片: "imageUrl",
    商品主图: "imageUrl",
    图片链接: "imageUrl",
    规格图链接: "specImageUrl",
    主图链接: "mainImageUrls",
    详情图链接: "detailImageUrls",
    // 来源信息
    来源ID: "sourceId",
    来源标题: "sourceTitle",
    来源链接: "sourceUrl",
    商品链接: "productUrl",
    分类: "category",
    类目: "category",
    商品类目: "category",
    备注: "description",
    描述: "description",
};

/**
 * 从 Excel 行对象（首行为 key）解析为商品记录
 * @param row 一行数据，key 为表头
 * @returns 实体字段对象，未匹配的忽略
 */
export function parseExcelRowToProduct(row: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const extraImages: string[] = [];

    for (const [header, value] of Object.entries(row)) {
        if (value === undefined || value === null || String(value).trim() === "") continue;
        const trimmed = String(value).trim();
        const field =
            MIAOSHOU_EXCEL_COLUMN_MAP[header] ?? MIAOSHOU_EXCEL_COLUMN_MAP[header?.trim()];
        if (field) {
            if (field === "stock") {
                const num = Number(trimmed);
                result[field] = Number.isNaN(num) ? undefined : num;
            } else if (field === "specImageUrl") {
                // 规格图链接作为主图
                if (!result.imageUrl) {
                    result.imageUrl = trimmed;
                }
            } else if (field === "mainImageUrls") {
                // 主图链接：多个 URL 用 | 分隔
                const urls = trimmed
                    .split("|")
                    .map((u) => u.trim())
                    .filter(Boolean);
                if (urls.length > 0) {
                    if (!result.imageUrl) {
                        result.imageUrl = urls[0];
                    }
                    if (urls.length > 1) {
                        extraImages.push(...urls.slice(1));
                    }
                }
            } else if (field === "detailImageUrls") {
                // 详情图链接：多个 URL 用 | 分隔
                const urls = trimmed
                    .split("|")
                    .map((u) => u.trim())
                    .filter(Boolean);
                extraImages.push(...urls);
            } else if (field === "imageUrl" && !result.imageUrl) {
                result.imageUrl = trimmed;
            } else if (field === "imageUrl" && result.imageUrl && trimmed !== result.imageUrl) {
                extraImages.push(trimmed);
            } else if (field !== "imageUrl") {
                result[field] = trimmed;
            }
        }
        // 未映射的"图片2""图片3"等收集到 extraImages
        if (/^图片\d*$/i.test(header?.trim() || "") && trimmed) {
            if (!result.imageUrl) result.imageUrl = trimmed;
            else extraImages.push(trimmed);
        }
    }

    if (extraImages.length > 0) {
        result.extraImages = [...new Set(extraImages)];
    }
    return result;
}
