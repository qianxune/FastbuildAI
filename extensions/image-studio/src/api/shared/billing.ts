export interface GenerationQuote {
    unitPrice: number;
    count: number;
    total: number;
}

export function quoteGenerationCredits(
    rule: { power: number } | null | undefined,
    count: number,
): GenerationQuote {
    if (!Number.isInteger(count) || count < 1 || count > 4) {
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
