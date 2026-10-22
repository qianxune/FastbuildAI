export const GENERATION_QUEUE = "image-studio-generation";
export const GENERATION_FAILED = "图片生成失败，请稍后重试";
export const MODEL_UNAVAILABLE = "所选图片模型不可用，请在模型管理中启用图片模型";

export interface GenerationJobData {
    id: string;
    userId: string;
}
