export const GENERATION_QUEUE = "image-studio-generation";
export const GENERATION_FAILED = "图片生成失败，请稍后重试";
export const GENERATION_STORAGE_RESTRICTED = "图片保存被腾讯云 COS 拒绝（451），请联系管理员检查存储桶状态。";
export const MODEL_UNAVAILABLE = "所选图片模型不可用，请在模型管理中启用图片模型";

const CUTOUT_ERRORS: Record<string, string> = {
    CUTOUT_NOT_CONFIGURED: "腾讯云抠图未配置，请联系管理员启用 COS 存储及数据万象。",
    CUTOUT_ACCESS_DENIED: "腾讯云抠图权限不足，请检查 COS 读写删除及 ci:CreateS3AIPicMattingJob 权限。",
    CUTOUT_STORAGE_RESTRICTED: "抠图素材被腾讯云 COS 拒绝（451），请联系管理员检查存储桶状态。",
    CUTOUT_SERVICE_UNAVAILABLE: "腾讯云抠图不可用，请检查存储桶地域、数据万象开通状态及图片限制。",
    CUTOUT_TIMEOUT: "腾讯云抠图请求超时，结果未确认；系统未自动重试，请核对云端账单后再重试。",
    CUTOUT_FAILED: "腾讯云抠图失败，系统未自动重试，请检查服务状态后再试。",
    CUTOUT_INVALID_PRICE: "抠图积分价格配置无效，请联系管理员。",
};

export function publicGenerationError(message: unknown) {
    if (message === GENERATION_STORAGE_RESTRICTED) return GENERATION_STORAGE_RESTRICTED;
    if (typeof message === "string") {
        if (Object.hasOwn(CUTOUT_ERRORS, message)) return CUTOUT_ERRORS[message]!;
        if (Object.values(CUTOUT_ERRORS).includes(message)) return message;
    }
    return GENERATION_FAILED;
}

export interface GenerationJobData {
    id: string;
    userId: string;
}
