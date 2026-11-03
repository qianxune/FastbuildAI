export const GENERATION_QUEUE = "image-studio-generation";
export const GENERATION_FAILED = "图片生成失败，请稍后重试";
export const GENERATION_STORAGE_RESTRICTED = "图片保存被腾讯云 COS 拒绝（451），请联系管理员检查存储桶状态。";
export const MODEL_UNAVAILABLE = "所选图片模型不可用，请在模型管理中启用图片模型";

export function publicGenerationError(message: unknown) {
    return message === GENERATION_STORAGE_RESTRICTED ? GENERATION_STORAGE_RESTRICTED : GENERATION_FAILED;
}

export interface GenerationJobData {
    id: string;
    userId: string;
}
