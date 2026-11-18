import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { validateCreativeAsset, type CreativeAsset, type CreativeAssetInput } from "../../api/shared/assets";
import { apiHttpClient } from "./base";
import { validMaterialLabel } from "./materials";

export const assetsKey = ["image-studio", "assets"] as const;
export type AssetList = { items: CreativeAsset[]; limit: number };
export type AssetSave = { input: CreativeAssetInput; original?: CreativeAsset; faceConsent?: boolean; generatedFrom?: string };

export async function saveCreativeAsset({ input, original, faceConsent, generatedFrom }: AssetSave): Promise<CreativeAsset> {
    const error = validateCreativeAsset(input);
    if (error) throw new Error(error);
    if (!validMaterialLabel(input.name)) throw new Error("名称不能包含路径、控制字符或特殊文件名字符");
    const snapshot = { ...input, imageIds: [...input.imageIds],
        ...(faceConsent === undefined ? {} : { faceConsent }), ...(generatedFrom === undefined ? {} : { generatedFrom }) };
    return original
        ? apiHttpClient.patch<CreativeAsset>(`/assets/${original.id}`, { ...snapshot, expectedVersion: original.version })
        : apiHttpClient.post<CreativeAsset>("/assets", snapshot);
}

export function useAssetsQuery() {
    return useQuery({ queryKey: assetsKey, queryFn: () => apiHttpClient.get<AssetList>("/assets") });
}

export function useOfficialModelsQuery() {
    return useQuery({ queryKey: ["image-studio", "official-models"], queryFn: () => apiHttpClient.get<CreativeAsset[]>("/assets/official-models") });
}

export function useSaveAssetMutation() {
    const client = useQueryClient();
    return useMutation({ mutationFn: saveCreativeAsset, onSuccess: (record) => {
        client.setQueryData<AssetList>(assetsKey, (previous) => previous && {
            ...previous, items: [...previous.items.filter((item) => item.id !== record.id), record],
        });
        void client.invalidateQueries({ queryKey: assetsKey });
    } });
}

export function useDeleteAssetMutation() {
    const client = useQueryClient();
    return useMutation({ mutationFn: (id: string) => apiHttpClient.delete<{ success: boolean }>(`/assets/${id}`),
        onSuccess: (_result, id) => {
            client.setQueryData<AssetList>(assetsKey, (previous) => previous && { ...previous, items: previous.items.filter((item) => item.id !== id) });
            void client.invalidateQueries({ queryKey: assetsKey });
        } });
}