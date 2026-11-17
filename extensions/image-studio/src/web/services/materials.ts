import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zipSync } from "fflate";
import { apiHttpClient } from "./base";
import type { ProductImage } from "./types";

const productsKey = ["image-studio", "product-images"] as const;
const groupsKey = ["image-studio", "product-image-groups"] as const;
export const MATERIAL_BATCH_LIMIT = 40;
export const materialName = (image: ProductImage) => image.name || `素材-${image.id.slice(0, 8)}`;

export interface MaterialFilters { search: string; group: string; date: string }

export function filterMaterials(images: ProductImage[], filters: MaterialFilters) {
    const search = filters.search.trim().toLocaleLowerCase();
    return images.filter((image) => materialName(image).toLocaleLowerCase().includes(search) &&
        (filters.group === "*" || (image.group ?? "") === filters.group) &&
        (!filters.date || Boolean(image.createdAt && localDate(image.createdAt) === filters.date)))
        .sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? ""));
}

function localDate(value: string) {
    const date = new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function reconcileMaterialIds(ids: string[], images: ProductImage[]) {
    const available = new Set(images.map((image) => image.id));
    return [...new Set(ids)].filter((id) => available.has(id));
}

export function toggleMaterialId(ids: string[], id: string, max: number) {
    return ids.includes(id) ? ids.filter((value) => value !== id) : ids.length < Math.max(0, max) ? [...ids, id] : ids;
}

export function materialError(error: unknown) {
    const message = error instanceof Error ? error.message : "操作失败，请重试";
    return message.slice(0, 240);
}

export function validMaterialLabel(value: string, max = 120) {
    return value.length > 0 && value.length <= max && value === value.trim() && value !== "." && value !== ".." &&
        !/[\x00-\x1f\x7f-\x9f/\\<>:"|?*\u202a-\u202e\u2066-\u2069]/u.test(value);
}

export function useMaterialGroupsQuery() {
    return useQuery({ queryKey: groupsKey, queryFn: () => apiHttpClient.get<string[]>("/generations/product-image-groups") });
}

export function useMaterialMetadataMutation() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...input }: { id: string; name?: string; group?: string }) =>
            apiHttpClient.patch<Pick<ProductImage, "id" | "name" | "group" | "metadataStatus">>(`/generations/product-images/${id}`, input),
        onSuccess: () => client.invalidateQueries({ queryKey: productsKey }),
    });
}

export type MaterialGroupChange = { kind: "create"; name: string } | { kind: "rename"; name: string; next: string } | { kind: "delete"; name: string };

export function useMaterialGroupMutation() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: (change: MaterialGroupChange) => {
            const endpoint = `/generations/product-image-groups/${encodeURIComponent(change.name)}`;
            if (change.kind === "create") return apiHttpClient.post<string[]>("/generations/product-image-groups", { name: change.name });
            if (change.kind === "rename") return apiHttpClient.patch<string[]>(endpoint, { name: change.next });
            return apiHttpClient.delete<string[]>(endpoint);
        },
        onSuccess: () => Promise.all([
            client.invalidateQueries({ queryKey: productsKey }), client.invalidateQueries({ queryKey: groupsKey }),
        ]),
    });
}

export async function uploadMaterials(
    files: File[], upload: (file: File) => Promise<ProductImage>,
    signal?: AbortSignal, progress?: (done: number, total: number) => void,
) {
    const uploaded: ProductImage[] = [];
    const errors: string[] = [];
    const bounded = files.slice(0, MATERIAL_BATCH_LIMIT);
    if (files.length > MATERIAL_BATCH_LIMIT) errors.push(`本次仅处理前 ${MATERIAL_BATCH_LIMIT} 个文件，另 ${files.length - MATERIAL_BATCH_LIMIT} 个未上传`);
    for (const [index, file] of bounded.entries()) {
        if (signal?.aborted) { errors.push("上传已停止；已上传的素材保留"); break; }
        if (!file.size || file.size > 10 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
            errors.push(`${file.name.slice(0, 120)}：仅支持 10 MB 以内 PNG、JPEG、WebP`);
        } else {
            try {
                const image = await upload(file);
                uploaded.push(image);
                if (image.metadataStatus === "unavailable") errors.push(`${file.name.slice(0, 120)}：原图已保存，但名称保存失败`);
            } catch (error) { errors.push(`${file.name.slice(0, 120)}：${materialError(error)}`); }
        }
        progress?.(index + 1, bounded.length);
    }
    return { uploaded, errors };
}

export async function deleteMaterials(images: ProductImage[], remove: (id: string) => Promise<unknown>, signal?: AbortSignal) {
    const removed: string[] = [];
    const errors: string[] = [];
    for (const image of images) {
        if (signal?.aborted) break;
        try { await remove(image.id); removed.push(image.id); }
        catch (error) { errors.push(`${materialName(image)}：${materialError(error)}`); }
    }
    return { removed, errors };
}

export async function fetchMaterialOriginal(id: string, signal?: AbortSignal): Promise<Blob> {
    const prefix = (import.meta.env.VITE_APP_WEB_API_PREFIX || "api").replace(/^\/+|\/+$/g, "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
        !/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/i.test(prefix)) throw new Error("素材编号无效");
    const response = await apiHttpClient.instance.get<Blob>(`/image-studio/${prefix}/generations/product-images/${id}`, {
        responseType: "blob", signal, withCredentials: false,
    });
    const blob = response.data;
    if (!(blob instanceof Blob) || blob.type !== "image/png" || !blob.size || blob.size > 10 * 1024 * 1024)
        throw new Error("原图读取失败");
    const header = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    if (![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => header[index] === value)) throw new Error("原图格式无效");
    signal?.throwIfAborted();
    return blob;
}

export async function materialsZip(images: ProductImage[], fetchOriginal = fetchMaterialOriginal, signal?: AbortSignal) {
    if (!images.length || images.length > MATERIAL_BATCH_LIMIT) throw new Error("请选择 1-40 张素材");
    const files: Record<string, Uint8Array> = {};
    let total = 0;
    for (const image of images) {
        signal?.throwIfAborted();
        const blob = await fetchOriginal(image.id, signal);
        total += blob.size;
        if (total > 100 * 1024 * 1024) throw new Error("所选原图超过 100 MB，请分批下载");
        const label = materialName(image).replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 80);
        files[`${label}-${image.id}.png`] = new Uint8Array(await blob.arrayBuffer());
    }
    signal?.throwIfAborted();
    return new Blob([new Uint8Array(zipSync(files, { level: 0 }))], { type: "application/zip" });
}

export function downloadMaterialBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.append(anchor);
    try { anchor.click(); } finally {
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
}