export interface ImageModel {
    id: string;
    name: string;
    model: string;
    provider: string;
    providerCode: string;
    description?: string;
}

export interface GeneratedImage {
    url: string;
    mediaType: string;
}

export type GenerationStatus = "processing" | "completed" | "failed";

export interface ImageGeneration {
    id: string;
    prompt: string;
    modelId: string;
    modelName: string;
    size: string;
    quality: string;
    style: string;
    count: number;
    status: GenerationStatus;
    images: GeneratedImage[];
    error?: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface GenerateImageInput {
    prompt: string;
    modelId: string;
    size: string;
    quality: string;
    style: string;
    count: number;
}

export interface GenerationList {
    items: ImageGeneration[];
    total: number;
    page: number;
    limit: number;
}