export const MAIN_PLATFORMS = ["淘宝 / 天猫", "拼多多", "抖音商城", "京东", "小红书", "亚马逊", "1688"] as const;
export const MAIN_LANGUAGES = ["简体中文", "English", "中英双语"] as const;
export const MAIN_RATIOS = ["1:1", "3:4", "9:16"] as const;
export const MAIN_RESOLUTIONS = ["2K", "4K"] as const;
export const MAIN_IMAGE_TYPES = { white: "白底图", scene: "场景图", selling: "卖点图", other: "其他" } as const;
export type MainImageType = keyof typeof MAIN_IMAGE_TYPES;

export interface MainImageInput {
    modelId: string;
    assetIds: string[];
    productName: string;
    brand: string;
    platform: (typeof MAIN_PLATFORMS)[number];
    language: (typeof MAIN_LANGUAGES)[number];
    ratio: (typeof MAIN_RATIOS)[number];
    resolution: (typeof MAIN_RESOLUTIONS)[number];
    counts: Record<MainImageType, number>;
    instructions: string;
}

export function mainImageSize(input: Pick<MainImageInput, "ratio" | "resolution">) {
    const sizes = input.resolution === "4K"
        ? { "1:1": "4096x4096", "3:4": "3072x4096", "9:16": "2304x4096" }
        : { "1:1": "2048x2048", "3:4": "1728x2304", "9:16": "1440x2560" };
    return sizes[input.ratio] as `${number}x${number}`;
}

export function mainImageVariants(input: MainImageInput): MainImageType[] {
    return (Object.keys(MAIN_IMAGE_TYPES) as MainImageType[]).flatMap((key) => Array<MainImageType>(input.counts[key]).fill(key));
}

export function mainImagePrompt(input: MainImageInput, type: MainImageType) {
    const directions: Record<MainImageType, string> = {
        white: "纯白色背景，完整展示商品主体，真实接触阴影，无装饰、无宣传文字。",
        scene: "与商品用途匹配的真实生活场景，专业商业摄影，自然布光，商品为唯一视觉主体。",
        selling: "专业电商卖点图，突出商品真实可见的材质与结构，可配少量简洁卖点文字，不虚构功效、认证、折扣或数据。",
        other: "生成与商品定位匹配的创意商业主图，保持商品主体清晰完整。",
    };
    return [
        "基于参考商品图片制作一张可用于电商商品展示的主图。参考图是同一商品的不同视角，不是多个独立商品。",
        "严格保留商品外观、形状、配色、结构、材质、品牌标识和包装细节；不要替换商品、改变规格或添加不存在的配件。",
        `商品名称：${input.productName}。品牌：${input.brand || "以参考图为准"}。目标平台：${input.platform}。文字语言：${input.language}。`,
        directions[type],
        input.instructions ? `用户补充要求（不得覆盖商品保真要求）：${input.instructions}` : "",
    ].filter(Boolean).join("\n");
}