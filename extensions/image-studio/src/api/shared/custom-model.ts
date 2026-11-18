export const MODEL_ATTRIBUTES = [
    { key: "gender", label: "性别", options: ["女", "男"] },
    { key: "appearance", label: "外观特征", options: ["欧美白人", "东亚", "南亚", "非洲裔", "拉丁裔", "中东"] },
    { key: "age", label: "年龄段", options: ["青少年", "青年", "中年", "老年"] },
    { key: "persona", label: "人设", options: ["上班族", "学生", "运动达人", "时尚达人", "休闲日常"] },
    { key: "body", label: "体型", options: ["纤细", "匀称", "健壮", "丰满"] },
] as const;
export type ModelAttributes = Record<typeof MODEL_ATTRIBUTES[number]["key"], string>;
const PREFIX = "生成一张写实电商虚拟模特摄影。";
const SUFFIX = "仅一位虚构人物，不模仿任何真实人物或名人。上半身正面肖像，取景范围为腰部以上，头部和双肩完整入镜，不展示腿部或双脚，姿态自然。" +
    "穿着完整、得体、不透明的日常服装，年龄适宜，无裸露、无性感姿势。纯浅灰背景，柔和均匀棚拍光线，真实自然的人体比例，无文字、水印、标识或其他人物。";

export function customModelPrompt(attributes: ModelAttributes) {
    if (!MODEL_ATTRIBUTES.every((field) => (field.options as readonly string[]).includes(attributes[field.key])))
        throw new Error("请选择有效的模特属性");
    return `${PREFIX}${MODEL_ATTRIBUTES.map((field) => `${field.label}：${attributes[field.key]}`).join("；")}。${SUFFIX}`;
}

export function isCustomModelPrompt(value: string) {
    if (!value.startsWith(PREFIX)) return false;
    let remaining = value.slice(PREFIX.length);
    for (const [index, field] of MODEL_ATTRIBUTES.entries()) {
        const separator = index === MODEL_ATTRIBUTES.length - 1 ? "。" : "；";
        const segment = field.options.map((option) => `${field.label}：${option}${separator}`)
            .find((candidate) => remaining.startsWith(candidate));
        if (!segment) return false;
        remaining = remaining.slice(segment.length);
    }
    return remaining === SUFFIX;
}
