import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GenerationCapabilities } from "../../api/shared/tools";

import { apiHttpClient } from "./base";
import type {
    GenerateImageInput,
    GenerationList,
    ImageGeneration,
    ImageModel,
} from "./types";

const historyKey = ["image-studio", "generations"] as const;

export async function fetchGenerationImage(
    id: string,
    index: number,
    apiPrefix = "api",
    signal?: AbortSignal,
): Promise<Blob> {
    try {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
            !Number.isInteger(index) || index < 0 || index > 3) {
            throw new Error();
        }
        const prefix = apiPrefix.replace(/^\/+|\/+$/g, "");
        if (!/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/i.test(prefix)) throw new Error();
        const response = await apiHttpClient.instance.get<Blob>(
            `/image-studio/${prefix}/generations/${id}/images/${index}`,
            { responseType: "blob", signal, withCredentials: false },
        );
        const blob = response.data;
        if (!(blob instanceof Blob) || !["image/png", "image/jpeg", "image/webp"].includes(blob.type) ||
            blob.size === 0 || blob.size > 20 * 1024 * 1024) throw new Error();
        return blob;
    } catch {
        throw new Error("图片加载失败，请稍后重试");
    }
}

export function loadGenerationImage(
    id: string,
    index: number,
    apiPrefix: string,
    onLoad: (image: { blob: Blob; url: string }) => void,
    onError: () => void,
) {
    const controller = new AbortController();
    let disposed = false;
    let objectUrl: string | undefined;
    void fetchGenerationImage(id, index, apiPrefix, controller.signal).then((blob) => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        onLoad({ blob, url: objectUrl });
    }).catch(() => {
        if (!disposed) onError();
    });
    return () => {
        disposed = true;
        controller.abort();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = undefined;
    };
}

export function useGenerationCapabilitiesQuery() {
    return useQuery({
        queryKey: ["image-studio", "capabilities"],
        queryFn: () => apiHttpClient.get<GenerationCapabilities>("/generations/capabilities"),
    });
}

export function useImageModelsQuery() {
    return useQuery({
        queryKey: ["image-studio", "models"],
        queryFn: () => apiHttpClient.get<ImageModel[]>("/generations/models"),
    });
}

export function useGenerationHistoryQuery(page = 1, limit = 30) {
    return useQuery({
        queryKey: [...historyKey, page, limit],
        queryFn: () => apiHttpClient.get<GenerationList>("/generations", { params: { page, limit } }),
        refetchInterval: (query) =>
            query.state.data?.items.some((item) => isGenerationActive(item)) ? 5000 : false,
    });
}

export function isGenerationActive(item: Pick<ImageGeneration, "status"> | undefined | null) {
    return item?.status === "queued" || item?.status === "processing";
}

export function useGenerationQuery(id?: string) {
    return useQuery({
        queryKey: ["image-studio", "generation", id],
        queryFn: () => apiHttpClient.get<ImageGeneration>(`/generations/${id}`),
        enabled: Boolean(id),
        refetchInterval: (query) => isGenerationActive(query.state.data) ? 2000 : false,
    });
}

export function useGenerateImageMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: GenerateImageInput) =>
            apiHttpClient.post<ImageGeneration>("/generations/tasks", input),
        onSettled: () => queryClient.invalidateQueries({ queryKey: historyKey }),
    });
}

export function useRetryGenerationMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) =>
            apiHttpClient.post<ImageGeneration>(`/generations/${id}/retry-task`),
        onSettled: () => queryClient.invalidateQueries({ queryKey: historyKey }),
    });
}

export function useCancelGenerationMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) =>
            apiHttpClient.post<ImageGeneration>(`/generations/${id}/cancel`),
        onSuccess: (record) => {
            queryClient.setQueryData(["image-studio", "generation", record.id], record);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: historyKey }),
    });
}

export function useDeleteGenerationMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => apiHttpClient.delete(`/generations/${id}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: historyKey }),
    });
}