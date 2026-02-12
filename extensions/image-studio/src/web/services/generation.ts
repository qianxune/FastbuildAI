import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiHttpClient } from "./base";
import type {
    GenerateImageInput,
    GenerationList,
    ImageGeneration,
    ImageModel,
} from "./types";

const historyKey = ["image-studio", "generations"] as const;

export function useImageModelsQuery() {
    return useQuery({
        queryKey: ["image-studio", "models"],
        queryFn: () => apiHttpClient.get<ImageModel[]>("/generations/models"),
    });
}

export function useGenerationHistoryQuery() {
    return useQuery({
        queryKey: historyKey,
        queryFn: () => apiHttpClient.get<GenerationList>("/generations", { params: { limit: 30 } }),
    });
}

export function useGenerateImageMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: GenerateImageInput) =>
            apiHttpClient.post<ImageGeneration>("/generations", input),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: historyKey }),
    });
}

export function useRetryGenerationMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) =>
            apiHttpClient.post<ImageGeneration>(`/generations/${id}/retry`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: historyKey }),
    });
}

export function useDeleteGenerationMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => apiHttpClient.delete(`/generations/${id}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: historyKey }),
    });
}