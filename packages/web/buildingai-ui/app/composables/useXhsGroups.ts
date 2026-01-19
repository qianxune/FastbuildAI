import type { XhsGroup, GroupListResponse } from "@/types/xhs";
import { useAuthFetch } from "~/composables/useAuthFetch";

/**
 * XHS分组管理组合式函数
 * 提供分组管理相关的状态管理和方法
 */
export const useXhsGroups = () => {
    // 使用统一的 HTTP 请求工具
    const { get, post, put, del } = useAuthFetch();

    // 响应式状态
    const groups = ref<XhsGroup[]>([]);
    const isLoading = ref(false);
    const error = ref("");

    // Toast 通知
    const toast = useMessage();

    /**
     * 获取用户所有分组
     */
    const fetchGroups = async (): Promise<void> => {
        isLoading.value = true;
        error.value = "";

        const { data, error: apiError } = await get<GroupListResponse>("/api/xhs/groups");

        if (apiError) {
            error.value = apiError;
            isLoading.value = false;
            return;
        }

        // API 返回格式: { code, message, data: { items: [] } }
        groups.value = data?.items || [];
        isLoading.value = false;
    };

    /**
     * 创建分组
     * @param name 分组名称
     */
    const createGroup = async (name: string): Promise<XhsGroup | null> => {
        if (!name.trim()) {
            toast.error("分组名称不能为空");
            return null;
        }

        const { data, error: apiError } = await post<XhsGroup>(
            "/api/xhs/groups",
            { name: name.trim() },
            { errorMessage: "创建分组失败" },
        );

        if (apiError) {
            return null;
        }

        // 添加到本地状态
        if (data) {
            groups.value.push(data);
            toast.success("分组创建成功");
            return data;
        }

        return null;
    };

    /**
     * 更新分组
     * @param id 分组ID
     * @param name 新的分组名称
     */
    const updateGroup = async (id: string, name: string): Promise<XhsGroup | null> => {
        if (!name.trim()) {
            toast.error("分组名称不能为空");
            return null;
        }

        const { data, error: apiError } = await put<XhsGroup>(
            `/api/xhs/groups/${id}`,
            { name: name.trim() },
            { errorMessage: "更新分组失败" },
        );

        if (apiError) {
            return null;
        }

        // 更新本地状态
        if (data) {
            const index = groups.value.findIndex((g) => g.id === id);
            if (index !== -1) {
                groups.value[index] = data;
            }
            toast.success("分组更新成功");
            return data;
        }

        return null;
    };

    /**
     * 删除分组
     * @param id 分组ID
     */
    const deleteGroup = async (id: string): Promise<boolean> => {
        const { data, error: apiError } = await del(`/api/xhs/groups/${id}`, {
            errorMessage: "删除分组失败",
        });

        if (apiError) {
            return false;
        }

        // 从本地状态中移除
        groups.value = groups.value.filter((g) => g.id !== id);

        toast.success("分组删除成功");
        return true;
    };

    /**
     * 获取默认分组
     */
    const getDefaultGroup = computed(() => {
        return groups.value.find((g) => g.isDefault);
    });

    /**
     * 获取非默认分组
     */
    const customGroups = computed(() => {
        return groups.value.filter((g) => !g.isDefault);
    });

    /**
     * 刷新分组列表
     */
    const refresh = async (): Promise<void> => {
        await fetchGroups();
    };

    return {
        // 状态
        groups,
        isLoading,
        error,

        // 计算属性
        getDefaultGroup,
        customGroups,

        // 方法
        fetchGroups,
        createGroup,
        updateGroup,
        deleteGroup,
        refresh,
    };
};
