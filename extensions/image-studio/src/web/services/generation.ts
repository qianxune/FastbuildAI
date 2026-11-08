import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { GenerationQuote, GenerationQuoteTool } from "../../api/shared/billing";
import type { GenerationCapabilities } from "../../api/shared/tools";
import { MAIN_IMAGE_LIMIT, type MainImageInput } from "../../api/shared/main-image";

import { apiHttpClient } from "./base";
import { collectGenerations } from "./works";
import type {
    GenerateImageInput,
    GenerationList,
    ImageGeneration,
    ImageModel,
    ProductImage,
} from "./types";

const historyKey = ["image-studio", "generations"] as const;
const productsKey = ["image-studio", "product-images"] as const;
const balanceKey = ["image-studio", "credit-balance"] as const;
const quoteKey = ["image-studio", "credit-quote"] as const;

function invalidateGenerationBilling(client: QueryClient) {
    return Promise.all([
        client.invalidateQueries({ queryKey: historyKey }),
        client.invalidateQueries({ queryKey: balanceKey }),
        client.invalidateQueries({ queryKey: quoteKey }),
    ]);
}

export function useCreditBalanceQuery() {
    return useQuery({
        queryKey: balanceKey,
        queryFn: () => apiHttpClient.get<{ balance: number }>("/generations/billing/balance"),
        refetchInterval: 30000,
    });
}

export function fetchGenerationQuote(modelId: string, count: number, tool?: GenerationQuoteTool) {
    return apiHttpClient.get<GenerationQuote>("/generations/billing/quote", { params: { modelId, count, ...(tool ? { tool } : {}) } });
}

export function useGenerationBilling(modelId: string, count: number, enabled = true, tool?: GenerationQuoteTool) {
    const balance = useCreditBalanceQuery();
    const countLimit = tool === "main" ? MAIN_IMAGE_LIMIT : tool === "sku" || tool === "apparel_sku" ? 10 : 4;
    const validCount = Number.isSafeInteger(count) && count >= 1 && count <= countLimit;
    const quote = useQuery({
        queryKey: [...quoteKey, modelId, count, ...(tool ? [tool] : [])],
        queryFn: () => fetchGenerationQuote(modelId, count, tool),
        enabled: enabled && Boolean(modelId) && validCount,
    });
    const insufficient = quote.isSuccess && balance.isSuccess && quote.data.total > balance.data.balance;
    const ready = enabled && validCount && quote.isSuccess && !quote.isFetching && balance.isSuccess && !insufficient;
    const costText = !validCount ? `请选择 1–${countLimit} 张图片` : !modelId ? "请选择模型" :
        quote.isError ? "费用查询失败" : !quote.isSuccess || quote.isFetching ? "正在查询费用..." :
        balance.isError ? "余额查询失败" : !balance.isSuccess ? "正在查询余额..." :
        `${quote.data.total} 积分 · ${quote.data.unitPrice} 积分/张${insufficient ? " · 余额不足" : ""}`;
    return { balance, quote, ready, insufficient, costText };
}

export function useProductImagesQuery() {
    return useQuery({ queryKey: productsKey, queryFn: () => apiHttpClient.get<ProductImage[]>("/generations/product-images") });
}

export function useUploadProductImageMutation() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: (file: File) => {
            const data = new FormData();
            data.append("file", file);
            return apiHttpClient.post<ProductImage>("/generations/product-images", data);
        },
        onSuccess: async (image) => {
            await client.cancelQueries({ queryKey: productsKey });
            client.setQueryData<ProductImage[]>(productsKey, (current) => [
                ...(current ?? []).filter((item) => item.id !== image.id), image,
            ]);
        },
        onSettled: () => client.invalidateQueries({ queryKey: productsKey }),
    });
}

export function useDeleteProductImageMutation() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => apiHttpClient.delete(`/generations/product-images/${id}`),
        onSuccess: () => client.invalidateQueries({ queryKey: productsKey }),
    });
}

export function loadProductImage(id: string, onLoad: (url: string) => void, onError: () => void) {
    const controller = new AbortController();
    let disposed = false;
    let url: string | undefined;
    const prefix = (import.meta.env.VITE_APP_WEB_API_PREFIX || "api").replace(/^\/+|\/+$/g, "");
    void apiHttpClient.instance.get<Blob>(`/image-studio/${prefix}/generations/product-images/${id}`, {
        responseType: "blob", signal: controller.signal, withCredentials: false,
    }).then((response) => {
        if (disposed) return;
        if (!(response.data instanceof Blob) || response.data.type !== "image/png" ||
            response.data.size > 10 * 1024 * 1024 || response.data.size === 0) throw new Error();
        url = URL.createObjectURL(response.data);
        onLoad(url);
    }).catch(() => { if (!disposed) onError(); });
    return () => { disposed = true; controller.abort(); if (url) URL.revokeObjectURL(url); };
}

export function loadProductThumbnail(id: string, onLoad: (url: string) => void, onError: () => void) {
    const controller = new AbortController();
    let disposed = false;
    let url: string | undefined;
    void (async () => {
        const prefix = (import.meta.env.VITE_APP_WEB_API_PREFIX || "api").replace(/^\/+|\/+$/g, "");
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
            !/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/i.test(prefix)) throw new Error();
        const response = await apiHttpClient.instance.get<Blob>(`/image-studio/${prefix}/generations/product-images/${id}/thumbnail`, {
            responseType: "blob", signal: controller.signal, withCredentials: false,
        });
        if (disposed) return;
        const blob = response.data;
        if (!(blob instanceof Blob) || blob.type !== "image/png" || blob.size === 0 || blob.size > 256 * 1024) throw new Error();
        const header = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
        if (disposed) return;
        if (header.length !== 24 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => header[index] === value) ||
            new DataView(header.buffer).getUint32(8) !== 13 ||
            ![73, 72, 68, 82].every((value, index) => header[index + 12] === value)) throw new Error();
        const width = new DataView(header.buffer).getUint32(16);
        const height = new DataView(header.buffer).getUint32(20);
        if (!width || !height || width > 256 || height > 256) throw new Error();
        url = URL.createObjectURL(blob);
        onLoad(url);
    })().catch(() => { if (!disposed) onError(); });
    return () => {
        disposed = true;
        controller.abort();
        if (url) URL.revokeObjectURL(url);
        url = undefined;
    };
}

export function useGenerateMainImageMutation() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: (input: MainImageInput) => apiHttpClient.post<ImageGeneration>("/generations/main/tasks", input),
        onSettled: () => invalidateGenerationBilling(client),
    });
}

export async function fetchGenerationImage(
    id: string,
    index: number,
    apiPrefix = "api",
    signal?: AbortSignal,
): Promise<Blob> {
    try {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
            !Number.isInteger(index) || index < 0 || index > 9) {
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

export async function fetchGenerationThumbnail(id: string, index: number, apiPrefix = "api", signal?: AbortSignal): Promise<Blob> {
    try {
        const prefix = apiPrefix.replace(/^\/+|\/+$/g, "");
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
            !Number.isInteger(index) || index < 0 || index > 9 || !/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/i.test(prefix)) throw new Error();
        const { data } = await apiHttpClient.instance.get<Blob>(`/image-studio/${prefix}/generations/${id}/images/${index}/thumbnail`, {
            responseType: "blob", signal, withCredentials: false,
        });
        if (!(data instanceof Blob) || data.type !== "image/webp" || !data.size || data.size > 256 * 1024) throw new Error();
        return data;
    } catch { throw new Error("缩略图加载失败，请稍后重试"); }
}

type ThumbnailEntry = { promise: Promise<Blob>; controller: AbortController; users: number; settled: boolean; expires: number };
const generationThumbnails = new Map<string, ThumbnailEntry>();
const thumbnailControllers = new Set<AbortController>();
const thumbnailQueue: Array<() => Promise<void>> = [];
let thumbnailActive = 0;
let thumbnailAccount = "";
let thumbnailEpoch = 0;

function drainThumbnailQueue() {
    while (thumbnailActive < 4 && thumbnailQueue.length) {
        thumbnailActive++;
        void thumbnailQueue.shift()!().finally(() => { thumbnailActive--; drainThumbnailQueue(); });
    }
}

export function clearGenerationThumbnails() {
    thumbnailEpoch++;
    for (const controller of thumbnailControllers) controller.abort();
    generationThumbnails.clear();
}

export function setGenerationThumbnailAccount(account: string) {
    if (thumbnailAccount !== account) { clearGenerationThumbnails(); thumbnailAccount = account; }
}

export function loadGenerationThumbnail(
    id: string, index: number, apiPrefix: string,
    onLoad: (image: { blob: Blob; url: string }) => void, onError: () => void, account: string,
) {
    setGenerationThumbnailAccount(account);
    if (!account) { onError(); return () => undefined; }
    const epoch = thumbnailEpoch;
    const key = JSON.stringify([account, id, index, apiPrefix, "thumbnail-v1"]);
    let entry = generationThumbnails.get(key);
    if (!entry || entry.expires <= Date.now()) {
        const controller = new AbortController();
        thumbnailControllers.add(controller);
        const promise = new Promise<Blob>((resolve, reject) => {
            thumbnailQueue.push(async () => {
                try {
                    if (controller.signal.aborted) throw new Error("cancelled");
                    resolve(await fetchGenerationThumbnail(id, index, apiPrefix, controller.signal));
                } catch (error) { reject(error); }
                finally { thumbnailControllers.delete(controller); }
            });
            drainThumbnailQueue();
        });
        entry = { promise, controller, users: 0, settled: false, expires: Date.now() + 10 * 60 * 1000 };
        const current = entry;
        current.promise = promise.then((blob) => { current.settled = true; return blob; }, (error) => {
            current.settled = true;
            if (generationThumbnails.get(key) === current) generationThumbnails.delete(key);
            throw error;
        });
        generationThumbnails.set(key, current);
        if (generationThumbnails.size > 128) generationThumbnails.delete(generationThumbnails.keys().next().value!);
    }
    const current = entry;
    current.users++;
    let disposed = false;
    let url: string | undefined;
    void current.promise.then((blob) => {
        if (disposed || epoch !== thumbnailEpoch) return;
        url = URL.createObjectURL(blob);
        onLoad({ blob, url });
    }).catch(() => { if (!disposed && epoch === thumbnailEpoch) onError(); });
    return () => {
        if (disposed) return;
        disposed = true;
        if (url) URL.revokeObjectURL(url);
        if (--current.users === 0 && !current.settled) {
            current.controller.abort();
            if (generationThumbnails.get(key) === current) generationThumbnails.delete(key);
        }
    };
}

export function loadWhenVisible(target: Element | null, load: () => () => void) {
    let disposed = false;
    let started = false;
    let release: (() => void) | undefined;
    let observer: IntersectionObserver | undefined;
    const start = () => { if (!disposed && !started) { started = true; observer?.disconnect(); release = load(); } };
    if (!target || typeof IntersectionObserver !== "function") start();
    else {
        try {
            observer = new IntersectionObserver((entries) => {
                if (entries.some((entry) => entry.target === target && entry.isIntersecting)) start();
            }, { rootMargin: "0px", threshold: 0 });
            observer.observe(target);
        } catch { observer?.disconnect(); start(); }
    }
    return () => { disposed = true; observer?.disconnect(); release?.(); };
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
    const client = useQueryClient();
    const query = useQuery({
        queryKey: [...historyKey, page, limit],
        queryFn: () => apiHttpClient.get<GenerationList>("/generations", { params: { page, limit } }),
        refetchInterval: (query) =>
            query.state.data?.items.some((item) => isGenerationActive(item)) ? 5000 : false,
    });
    const statuses = query.data?.items.map((item) => `${item.id}:${item.status}`).join(",");
    useEffect(() => {
        if (statuses) void client.invalidateQueries({ queryKey: balanceKey });
    }, [client, statuses]);
    return query;
}

export function useWorksQuery() {
    return useQuery({
        queryKey: [...historyKey, "works"],
        queryFn: ({ signal }) => collectGenerations((page) => {
            signal.throwIfAborted();
            return apiHttpClient.get<GenerationList>("/generations", { params: { page, limit: 30 } });
        }),
        refetchOnMount: "always",
        refetchInterval: (query) => query.state.data?.some(isGenerationActive) ? 5000 : false,
    });
}

export function isGenerationActive(item: Pick<ImageGeneration, "status"> | undefined | null) {
    return item?.status === "queued" || item?.status === "processing";
}

export function useGenerationQuery(id?: string) {
    const client = useQueryClient();
    const query = useQuery({
        queryKey: ["image-studio", "generation", id],
        queryFn: () => apiHttpClient.get<ImageGeneration>(`/generations/${id}`),
        enabled: Boolean(id),
        refetchInterval: (query) => isGenerationActive(query.state.data) ? 2000 : false,
    });
    const status = query.data?.status;
    useEffect(() => {
        if (id && status && status !== "queued" && status !== "processing") {
            void client.invalidateQueries({ queryKey: balanceKey });
        }
    }, [client, id, status]);
    return query;
}

export function useGenerateImageMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: GenerateImageInput) =>
            apiHttpClient.post<ImageGeneration>("/generations/tasks", input),
        onSettled: () => invalidateGenerationBilling(queryClient),
    });
}

export function useRetryGenerationMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) =>
            apiHttpClient.post<ImageGeneration>(`/generations/${id}/retry-task`),
        onSettled: () => invalidateGenerationBilling(queryClient),
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
        onSettled: () => invalidateGenerationBilling(queryClient),
    });
}

export function useDeleteGenerationMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => apiHttpClient.delete(`/generations/${id}`),
        onSuccess: () => { clearGenerationThumbnails(); return queryClient.invalidateQueries({ queryKey: historyKey }); },
    });
}

export function useAnalyzeProductMutation() {
    return useMutation({
        mutationFn: (input: { modelId: string; assetIds: string[]; productName: string; language: MainImageInput["language"] }) =>
            apiHttpClient.post<{ description: string }>("/generations/main/analyze", input, { timeout: 120000 }),
        retry: false,
    });
}