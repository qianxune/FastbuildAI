export const MAIN_PLATFORMS = [
    "淘宝 / 天猫",
    "拼多多",
    "抖音商城",
    "京东",
    "小红书",
    "亚马逊",
    "1688",
] as const;
export const MAIN_LANGUAGES = ["简体中文", "English", "中英双语"] as const;
export const MAIN_RATIOS = ["1:1", "4:3", "3:4", "16:9", "9:16", "2:3", "3:2", "21:9"] as const;
export const MAIN_RESOLUTIONS = ["2K", "4K"] as const;
export const MAIN_IMAGE_TYPES = {
    white: "白底图",
    scene: "场景图",
    selling: "卖点图",
    other: "其他",
} as const;
export type MainImageType = keyof typeof MAIN_IMAGE_TYPES;

export const MAIN_IMAGE_LIMIT = 10;
export const MAX_SELLING_LAYOUTS = 4;
export const SELLING_IMAGE_LAYOUTS = [
    { id: "headline-detail", name: "标题与细节", image: "perfume-after", headline: "细节，值得看见", detail: "材质 · 结构 · 工艺", features: ["材质细节", "结构设计", "精细工艺"], direction: "上方短标题，中部完整商品占约六成画面，底部三张等宽局部细节窗配短注释。主体与细节有清晰主次，不重复堆叠商品。" },
    { id: "split-detail", name: "材质特写", image: "sneaker-after", headline: "质感藏在细节里", detail: "面料 · 连接 · 收边", features: ["表面纹理", "连接细节", "边缘工艺"], direction: "三段横向工艺特写自上而下排列，每段左侧为真实材质或结构的放大照片，右侧为短标题和一行说明；三段保持等高，薄分隔线区分，不捏造不可见的内部结构。" },
    { id: "feature-grid", name: "多卖点分区", image: "bottle-scene", headline: "好设计，不止一面", detail: "主体 · 细节 · 用途", features: ["主体展示", "细节展示", "使用场景"], direction: "顶部居中大标题，下方三列等宽商品或真实细节展示，底部对应三个简短标签。只有参考图确认是套装时才能展示不同单品；单件商品用同一商品的不同视角，不虚构套装或颜色规格。" },
    { id: "scene-caption", name: "场景与卖点", image: "mug-scene", headline: "融入日常的好物", detail: "自然光线 · 日常场景", features: ["主体视角", "使用环境", "局部细节"], direction: "上方约三分之二为自然生活场景主视觉，左上方短标题，下方三列圆形或拱形细节窗配短注释；细节窗沿同一基线排列，不遮挡完整商品，场景必须匹配商品真实用途。" },
    { id: "clean-type", name: "极简留白", image: "perfume-before", headline: "让产品自己说话", detail: "清晰主体 · 克制排版", features: ["外观设计", "真实材质", "细节呈现"], direction: "完整商品偏左或偏下占七成画面，右上角短标题与三行精简卖点，低饱和纯色或真实环境背景，保留清晰留白和自然接触阴影；文字不叠压品牌与商品轮廓，不添加虚构功效。" },
    { id: "editorial", name: "杂志式排版", image: "sneaker-before", headline: "认真对待每一处", detail: "主视觉 / 细节 / 注释", features: ["商品主视觉", "场景视角", "结构特写"], direction: "斜切双画面构图，一侧为商品使用场景，另一侧为商品近景，斜向边界形成视觉张力；左上方醒目短标题，右下方可放一个圆形真实细节放大窗，注释紧邻对应画面，不遮挡商品。" },
    { id: "color-swatches", name: "色卡陈列", image: "sneaker-after", headline: "日常搭配，自有质感", detail: "颜色 · 纹理 · 搭配", features: ["原图配色", "材质纹理", "搭配细节"], direction: "顶部右对齐两行标题，中部商品沿斜向或弧形整齐陈列，底部对应颜色圆点及名称。仅展示参考图或用户确认存在的配色，色卡必须与商品真实颜色一致；单色商品不得编造其他 SKU。" },
    { id: "sidebar-features", name: "侧栏卖点", image: "bottle-scene", headline: "细节到位，日常好用", detail: "结构 · 外观 · 使用", features: ["结构细节", "外观设计", "使用场景"], direction: "上方左侧两行短标题，左边约四分之一宽度为三个图标加短卖点的垂直栏，右侧为完整商品主视觉，底部为三格真实场景或细节照片带；图标不代表未经确认的认证。" },
    { id: "benefit-icons", name: "图标环绕", image: "perfume-after", headline: "清晰呈现，真实细节", detail: "主视觉 · 三项卖点", features: ["外观设计", "包装细节", "使用方式"], direction: "顶部两行居中标题，中下部完整商品主体占六成画面，三个简洁线性图标及短标签沿主体周围分布，留出呼吸空间；不使用认证徽章、功效数值、奖章或未经证实的参数。" },
    { id: "vertical-copy", name: "竖栏大字", image: "bottle-scene", headline: "自然场景\n清晰主角", detail: "场景光线 · 商品细节", features: ["主体呈现", "自然光线", "细节质感"], direction: "左侧约三分之一为浅色文字栏，上方三行醒目短标题，下方两段精简说明；右侧三分之二为自然光商品场景照片，主体完整且清晰，使用匹配商品的真实场景，不虚构配料或原产地。" },
    { id: "block-collage", name: "模块拼贴", image: "perfume-before", headline: "层次分明，细节可见", detail: "主体 · 包装 · 细节", features: ["主体视角", "包装视角", "局部特写"], direction: "使用非对称矩形拼贴：一幅大商品主视觉占右侧，左侧两幅局部特写或真实包装照片上下排列，顶部短标题，局部少量色块标签。色块取自商品配色，不复制示例文字，不添加不存在的包装。" },
    { id: "arched-details", name: "拱窗细节", image: "perfume-after", headline: "用心设计，细节可见", detail: "外观 · 材质 · 结构", features: ["外观细节", "材质细节", "结构细节"], direction: "顶部居中标题，下方三个等宽拱形细节窗，每窗上方线性图标和短标签；下半部为完整商品主视觉，背景保持统一。特写必须来自参考商品可见细节，不捏造剖面、内部成分或医学功效。" },
] as const;
export type SellingImageLayoutId = (typeof SELLING_IMAGE_LAYOUTS)[number]["id"];

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
    sellingLayouts?: SellingImageLayoutId[];
    description?: string;
    instructions: string;
}

/** 将主图比例及 2K、4K 档位映射为模型请求使用的固定像素尺寸。 */
export function mainImageSize(input: Pick<MainImageInput, "ratio" | "resolution">) {
    const sizes =
        input.resolution === "4K"
            ? {
                  "1:1": "4096x4096",
                  "4:3": "4096x3072",
                  "3:4": "3072x4096",
                  "16:9": "4096x2304",
                  "9:16": "2304x4096",
                  "2:3": "2720x4080",
                  "3:2": "4080x2720",
                  "21:9": "4480x1920",
              }
            : {
                  "1:1": "2048x2048",
                  "4:3": "2304x1728",
                  "3:4": "1728x2304",
                  "16:9": "2560x1440",
                  "9:16": "1440x2560",
                  "2:3": "1664x2496",
                  "3:2": "2496x1664",
                  "21:9": "3136x1344",
              };
    return sizes[input.ratio] as `${number}x${number}`;
}

/** 按预设类型顺序展开各类出图数量，返回逐张生成所需的类型序列。 */
export function mainImageVariants(input: MainImageInput): MainImageType[] {
    return (Object.keys(MAIN_IMAGE_TYPES) as MainImageType[]).flatMap((key) =>
        Array<MainImageType>(input.counts[key]).fill(key),
    );
}

/** 拼装商品保真要求、平台语言、图型方向及补充要求，生成单张主图提示词。 */
export function mainImagePrompt(input: MainImageInput, type: MainImageType, sellingIndex = 0) {
    const layout = type === "selling" ? SELLING_IMAGE_LAYOUTS.find((item) => item.id === input.sellingLayouts?.[sellingIndex]) : undefined;
    const directions: Record<MainImageType, string> = {
        white: "纯白色背景，完整展示商品主体，真实接触阴影，无装饰、无宣传文字。",
        scene: "与商品用途匹配的真实生活场景，专业商业摄影，自然布光，商品为唯一视觉主体。",
        selling:
            "专业电商卖点图，突出商品真实可见的材质与结构，可配少量简洁卖点文字，不虚构功效、认证、折扣或数据。",
        other: "生成与商品定位匹配的创意商业主图，保持商品主体清晰完整。",
    };
    return [
        "基于参考商品图片制作一张可用于电商商品展示的主图。参考图是同一商品的不同视角，不是多个独立商品。",
        "严格保留商品外观、形状、配色、结构、材质、品牌标识和包装细节；不要替换商品、改变规格或添加不存在的配件。",
        `商品名称：${input.productName}。品牌：${input.brand || "以参考图为准"}。目标平台：${input.platform}。文字语言：${input.language}。`,
        input.description
            ? `商品描述（以参考图为准，不添加未经证实的功效或认证）：${input.description}`
            : "",
        directions[type],
        layout ? `版式：${layout.name}。${layout.direction} 仅参考构图与排版，不复制示例商品、示例文案或未经确认的卖点；实际文字使用用户指定语言。` : "",
        input.instructions ? `用户补充要求（不得覆盖商品保真要求）：${input.instructions}` : "",
    ]
        .filter(Boolean)
        .join("\n");
}
