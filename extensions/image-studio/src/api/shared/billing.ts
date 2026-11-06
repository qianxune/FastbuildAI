import { MAIN_IMAGE_LIMIT } from "./main-image";
import { SKU_LIMIT } from "./tool-workflow";

export interface GenerationQuote {
    unitPrice: number;
    count: number;
    total: number;
}

/** 按工作流数量上限计算总积分，拒绝无效单价及超出数据库整数范围的金额。 */
export function quoteGenerationCredits(
    rule: { power: number } | null | undefined,
    count: number,
    tool?: "main" | "sku",
): GenerationQuote {
    if (!Number.isSafeInteger(count) || count < 1 || count > (tool === "main" ? MAIN_IMAGE_LIMIT : tool === "sku" ? SKU_LIMIT : 4)) {
        throw new Error("Invalid image count");
    }
    if (!rule || !Number.isSafeInteger(rule.power) || rule.power < 0) {
        throw new Error("Image model credit price is not configured correctly");
    }
    const total = rule.power * count;
    if (!Number.isSafeInteger(total) || total > 2147483647) {
        throw new Error("Image model credit price exceeds limit");
    }
    return { unitPrice: rule.power, count, total };
}
