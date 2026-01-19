import type { XhsNote, PaginatedResponse, BatchOperationResponse } from "@/types/xhs";
import { useAuthFetch } from "~/composables/useAuthFetch";

/**
 * XHS笔记管理组合式函数
 * 提供笔记列表管理相关的状态管理和方法
 */
export const useXhsNotes = () => {
    // 使用统一的 HTTP 请求工具
    const { get, post, del } = useAuthFetch();

    // 响应式状态
    const notes = ref<XhsNote[]>([]);
    const currentPage = ref(1);
    const total = ref(0);
    const totalPages = ref(0);
    const limit = ref(20);
    const isLoading = ref(false);
    const error = ref("");
    const searchKeyword = ref("");
    const selectedGroupId = ref<string | undefined>(undefined);

    // Toast 通知
    const toast = useMessage();

    // 获取笔记列表
    const fetchNotes = async (groupId?: string, page: number = 1): Promise<void> => {
        isLoading.value = true;
        error.value = "";

        // 构建查询参数
        const queryParams = new URLSearchParams({
            page: page.toString(),
            limit: limit.value.toString(),
        });

        if (groupId) {
            queryParams.append("groupId", groupId);
            selectedGroupId.value = groupId;
        }

        const { data, error: apiError } = await get<PaginatedResponse<XhsNote>>(
            `/api/xhs/notes?${queryParams.toString()}`,
        );

        if (apiError) {
            error.value = apiError;
            isLoading.value = false;
            return;
        }

        // 更新状态
        notes.value = data?.items || [];
        total.value = data?.total || 0;
        totalPages.value = data?.totalPages || 0;
        currentPage.value = data?.page || page;
        isLoading.value = false;
    };

    // 搜索笔记
    const searchNotes = async (keyword: string): Promise<void> => {
        if (!keyword.trim()) {
            // 如果搜索关键词为空，重新获取所有笔记
            searchKeyword.value = "";
            await fetchNotes(selectedGroupId.value, 1);
            return;
        }

        isLoading.value = true;
        error.value = "";
        searchKeyword.value = keyword;

        // 构建查询参数
        const queryParams = new URLSearchParams({
            keyword: keyword.trim(),
        });

        const { data, error: apiError } = await get<PaginatedResponse<XhsNote>>(
            `/api/xhs/notes/search?${queryParams.toString()}`,
        );

        if (apiError) {
            error.value = apiError;
            isLoading.value = false;
            return;
        }

        // 更新状态
        notes.value = data?.items || [];
        total.value = data?.total || 0;
        totalPages.value = data?.totalPages || 0;
        currentPage.value = 1; // 搜索结果重置到第一页
        isLoading.value = false;
    };

    // 删除单个笔记
    const deleteNote = async (id: string): Promise<void> => {
        const { error: apiError } = await del(`/api/xhs/notes/${id}`);

        if (apiError) {
            throw new Error(apiError);
        }

        // 从本地状态中移除已删除的笔记
        notes.value = notes.value.filter((note) => note.id !== id);
        total.value = Math.max(0, total.value - 1);

        toast.success("笔记删除成功");

        // 如果当前页没有笔记了，且不是第一页，则跳转到上一页
        if (notes.value.length === 0 && currentPage.value > 1) {
            await fetchNotes(selectedGroupId.value, currentPage.value - 1);
        }
    };

    // 批量删除笔记
    const batchDelete = async (ids: string[]): Promise<void> => {
        if (!ids.length) {
            toast.error("请选择要删除的笔记");
            return;
        }

        const { data, error: apiError } = await post<BatchOperationResponse>(
            "/api/xhs/notes/batch",
            {
                action: "delete",
                ids: ids,
            },
        );

        if (apiError) {
            throw new Error(apiError);
        }

        // 从本地状态中移除已删除的笔记
        notes.value = notes.value.filter((note) => !ids.includes(note.id));
        total.value = Math.max(0, total.value - (data?.affected || 0));

        toast.success(data?.message || `成功删除 ${data?.affected || 0} 个笔记`);

        // 如果当前页没有笔记了，且不是第一页，则跳转到上一页
        if (notes.value.length === 0 && currentPage.value > 1) {
            await fetchNotes(selectedGroupId.value, currentPage.value - 1);
        }
    };

    // 批量移动笔记
    const batchMove = async (ids: string[], groupId: string): Promise<void> => {
        if (!ids.length) {
            toast.error("请选择要移动的笔记");
            return;
        }

        if (!groupId) {
            toast.error("请选择目标分组");
            return;
        }

        const { data, error: apiError } = await post<BatchOperationResponse>(
            "/api/xhs/notes/batch",
            {
                action: "move",
                ids: ids,
                groupId: groupId,
            },
        );

        if (apiError) {
            throw new Error(apiError);
        }

        // 更新本地状态中的笔记分组
        notes.value = notes.value.map((note) => {
            if (ids.includes(note.id)) {
                return { ...note, groupId };
            }
            return note;
        });

        toast.success(data?.message || `成功移动 ${data?.affected || 0} 个笔记`);
    };

    // 切换页面
    const changePage = async (page: number): Promise<void> => {
        if (page < 1 || page > totalPages.value) {
            return;
        }

        if (searchKeyword.value) {
            // 如果是搜索状态，搜索不支持分页，直接返回
            return;
        }

        await fetchNotes(selectedGroupId.value, page);
    };

    // 刷新当前页面
    const refresh = async (): Promise<void> => {
        if (searchKeyword.value) {
            await searchNotes(searchKeyword.value);
        } else {
            await fetchNotes(selectedGroupId.value, currentPage.value);
        }
    };

    // 清空搜索
    const clearSearch = async (): Promise<void> => {
        searchKeyword.value = "";
        await fetchNotes(selectedGroupId.value, 1);
    };

    // 计算属性
    const isEmpty = computed(() => notes.value.length === 0);
    const isSearching = computed(() => !!searchKeyword.value);
    const hasNextPage = computed(() => currentPage.value < totalPages.value);
    const hasPrevPage = computed(() => currentPage.value > 1);

    return {
        // 状态
        notes,
        currentPage,
        total,
        totalPages,
        limit,
        isLoading,
        error,
        searchKeyword,
        selectedGroupId,

        // 计算属性
        isEmpty,
        isSearching,
        hasNextPage,
        hasPrevPage,

        // 方法
        fetchNotes,
        searchNotes,
        deleteNote,
        batchDelete,
        batchMove,
        changePage,
        refresh,
        clearSearch,
    };
};
