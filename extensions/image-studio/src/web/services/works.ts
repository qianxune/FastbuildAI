import type { GenerationList, ImageGeneration } from "./types";

export interface WorkImage {
    generation: ImageGeneration;
    index: number;
    key: string;
}

export async function collectGenerations(
    fetchPage: (page: number) => Promise<GenerationList>,
): Promise<ImageGeneration[]> {
    const records = new Map<string, ImageGeneration>();
    for (let page = 1; ; page += 1) {
        const response = await fetchPage(page);
        const previousSize = records.size;
        response.items.forEach((item) => records.set(item.id, item));
        if (page * response.limit >= response.total) return [...records.values()];
        if (records.size === previousSize || response.limit < 1) {
            throw new Error("作品列表未完整加载，请刷新重试");
        }
    }
}

export function filterWorks(
    records: ImageGeneration[],
    filters: { tool: string; date: string; task: string },
) {
    return records
        .filter((record) =>
            (filters.tool === "all" || (record.toolKey ?? "creative") === filters.tool) &&
            (!filters.date || new Date(record.createdAt).toLocaleDateString("sv-SE") === filters.date) &&
            (filters.task === "all" || record.id === filters.task),
        )
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
        .flatMap((generation) => generation.images.map((_image, index): WorkImage => ({
            generation, index, key: `${generation.id}:${index}`,
        })));
}