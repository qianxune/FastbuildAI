import type {
    XhsProduct,
    ImportProductResult,
    XhsProductGroup,
    ProductGroupListResponse,
} from "@/types/xhs";

/**
 * XHS 商品管理组合式函数（妙手导入）
 * 使用 useAuthFetch，符合项目开发指南
 */
export const useXhsProducts = () => {
    const { get } = useAuthFetch();

    const products = ref<XhsProduct[]>([]);
    const productGroups = ref<XhsProductGroup[]>([]);
    const total = ref(0);
    const page = ref(1);
    const limit = ref(20);
    const isLoading = ref(false);
    const error = ref("");
    const keyword = ref("");
    const viewMode = ref<"list" | "grouped">("grouped");
    const sortBy = ref<"createdAt" | "noteCount">("createdAt");
    const sortOrder = ref<"ASC" | "DESC">("DESC");

    const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit.value)));

    const fetchProducts = async (opts?: {
        page?: number;
        keyword?: string;
        sortBy?: "createdAt" | "noteCount";
        sortOrder?: "ASC" | "DESC";
    }) => {
        isLoading.value = true;
        error.value = "";
        const p = opts?.page ?? page.value;
        const kw = opts?.keyword !== undefined ? opts.keyword : keyword.value;
        const sb = opts?.sortBy ?? sortBy.value;
        const so = opts?.sortOrder ?? sortOrder.value;
        const params = new URLSearchParams({
            page: String(p),
            limit: String(limit.value),
            sortBy: sb,
            sortOrder: so,
        });
        if (kw?.trim()) params.set("keyword", kw.trim());

        const { data, error: apiError } = await get<{
            items: XhsProduct[];
            total: number;
            page: number;
            limit: number;
        }>(`/api/xhs/products?${params.toString()}`);

        if (apiError) {
            error.value = apiError;
            isLoading.value = false;
            return;
        }
        products.value = data?.items ?? [];
        total.value = data?.total ?? 0;
        page.value = data?.page ?? p;
        limit.value = data?.limit ?? 20;
        isLoading.value = false;
    };

    const fetchProductsGrouped = async (opts?: {
        page?: number;
        keyword?: string;
        sortBy?: "createdAt" | "noteCount";
        sortOrder?: "ASC" | "DESC";
    }) => {
        isLoading.value = true;
        error.value = "";
        const p = opts?.page ?? page.value;
        const kw = opts?.keyword !== undefined ? opts.keyword : keyword.value;
        const sb = opts?.sortBy ?? sortBy.value;
        const so = opts?.sortOrder ?? sortOrder.value;
        const params = new URLSearchParams({
            page: String(p),
            limit: String(limit.value),
            sortBy: sb,
            sortOrder: so,
        });
        if (kw?.trim()) params.set("keyword", kw.trim());

        const { data, error: apiError } = await get<ProductGroupListResponse>(
            `/api/xhs/products/grouped?${params.toString()}`,
        );

        if (apiError) {
            error.value = apiError;
            isLoading.value = false;
            return;
        }
        productGroups.value = data?.items ?? [];
        total.value = data?.total ?? 0;
        page.value = data?.page ?? p;
        limit.value = data?.limit ?? 20;
        isLoading.value = false;
    };

    const fetchByIds = async (ids: string[]): Promise<XhsProduct[]> => {
        if (!ids.length) return [];
        const { data, error: apiError } = await get<{ items: XhsProduct[] }>(
            `/api/xhs/products/by-ids?ids=${encodeURIComponent(ids.join(","))}`,
        );
        if (apiError) throw new Error(apiError);
        return data?.items ?? [];
    };

    const importExcel = async (file: File): Promise<ImportProductResult> => {
        const form = new FormData();
        form.append("file", file);
        const userStore = useUserStore();
        const authToken = userStore.token || userStore.temporaryToken;
        if (!authToken) throw new Error("请先登录");

        try {
            const response = await fetch("/api/xhs/products/import", {
                method: "POST",
                headers: { Authorization: `Bearer ${authToken}` },
                body: form,
            });

            const contentType = response.headers.get("content-type");

            // Check if response is HTML (error page) instead of JSON
            if (contentType?.includes("text/html")) {
                throw new Error(
                    `服务器返回错误页面 (${response.status}). 请检查API路由是否正确配置。`,
                );
            }

            if (!response.ok) {
                const errText = await response.text();
                let msg = "导入失败";
                try {
                    const j = JSON.parse(errText);
                    msg = j.message || j.error?.message || msg;
                } catch {
                    msg = `导入失败 (${response.status}): ${errText.substring(0, 100)}`;
                }
                throw new Error(msg);
            }

            const result = await response.json();
            const data = result?.data !== undefined ? result.data : result;
            return data as ImportProductResult;
        } catch (err) {
            if (err instanceof Error) {
                throw err;
            }
            throw new Error("导入失败: 网络错误或服务器无响应");
        }
    };

    return {
        products,
        productGroups,
        total,
        page,
        limit,
        totalPages,
        isLoading,
        error,
        keyword,
        viewMode,
        sortBy,
        sortOrder,
        fetchProducts,
        fetchProductsGrouped,
        fetchByIds,
        importExcel,
    };
};
