<script setup lang="ts">
import type { XhsNote } from "@/types/xhs";
import { useXhsNotes } from "@/composables/useXhsNotes";
import { useXhsGroups } from "@/composables/useXhsGroups";
import NoteCard from "@/components/xhs/note-card.vue";
import GroupManager from "@/components/xhs/group-manager.vue";

// Vue APIs (ref, computed, watch, onMounted) 由 Nuxt 自动导入
// Nuxt composables (useRouter, useRoute, useMessage) 由 Nuxt 自动导入
// definePageMeta, useSeoMeta 由 Nuxt 自动导入

// Page metadata configuration
definePageMeta({
    layout: false,
    name: "XHS Notes List",
    auth: true, // Require authentication as per requirements
});

// SEO settings
useSeoMeta({
    title: "我的笔记 - 小红书爆款文章生成器",
    description: "管理和查看你的小红书笔记",
});

// 使用笔记管理组合式函数
const {
    notes,
    currentPage,
    total,
    totalPages,
    isLoading,
    error,
    searchKeyword,
    selectedGroupId,
    isEmpty,
    isSearching,
    hasNextPage,
    hasPrevPage,
    fetchNotes,
    searchNotes,
    deleteNote,
    batchDelete,
    batchMove,
    changePage,
    refresh,
    clearSearch,
} = useXhsNotes();

// 使用分组管理组合式函数
const {
    groups,
    isLoading: isGroupsLoading,
    fetchGroups,
} = useXhsGroups();

// 批量操作状态
const isBatchMode = ref(false);
const selectedNoteIds = ref<string[]>([]);

// 分组管理弹窗状态
const showGroupManager = ref(false);

// 当前选中的分组ID（用于筛选）
const currentGroupId = ref<string | undefined>(undefined);

// Toast 通知
const toast = useMessage();

// 路由
const router = useRouter();
const route = useRoute();

// 搜索输入
const searchInput = ref("");

// 页面加载时获取笔记列表
onMounted(async () => {
    // 从 URL 查询参数中恢复状态
    const urlPage = parseInt(route.query.page as string) || 1;
    const urlSearch = (route.query.search as string) || "";
    const urlGroupId = (route.query.groupId as string) || undefined;

    if (urlSearch) {
        searchInput.value = urlSearch;
    }

    if (urlGroupId) {
        currentGroupId.value = urlGroupId;
    }

    // 加载分组列表
    await fetchGroups();

    if (urlSearch) {
        await searchNotes(urlSearch);
    } else {
        await fetchNotes(urlGroupId, urlPage);
    }
});

// 处理搜索
const handleSearch = async () => {
    const keyword = searchInput.value.trim();

    // 更新 URL 查询参数
    await router.push({
        query: {
            ...route.query,
            search: keyword || undefined,
            page: undefined, // 搜索时重置页码
        },
    });

    if (keyword) {
        await searchNotes(keyword);
    } else {
        await clearSearch();
    }
};

// 处理搜索输入变化（实时搜索）
let searchTimeout: NodeJS.Timeout | null = null;

const debouncedSearch = () => {
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }

    searchTimeout = setTimeout(() => {
        handleSearch();
    }, 500);
};

watch(searchInput, () => {
    debouncedSearch();
});

// 处理笔记卡片点击
const handleNoteClick = (note: XhsNote) => {
    if (isBatchMode.value) {
        return; // 批量模式下不响应点击
    }

    // 导航到创建/编辑页面，传递笔记ID进行编辑
    router.push({
        path: '/xhs/create',
        query: {
            noteId: note.id
        }
    });
};

// 处理删除按钮点击 - 使用 useModal 弹出确认框
const handleDeleteClick = async (noteId: string) => {
    try {
        const confirmed = await useModal({
            color: "error",
            title: "确认删除笔记？",
            content: "此操作不可撤销，确定要删除这个笔记吗？",
            confirmText: "确认删除",
            cancelText: "取消",
            ui: { content: "!w-sm" },
        });

        if (confirmed) {
            await deleteNote(noteId);
        }
    } catch (error) {
        // 用户取消删除操作
        console.log("用户取消删除操作");
    }
};

// 切换批量编辑模式
const toggleBatchMode = () => {
    isBatchMode.value = !isBatchMode.value;
    if (!isBatchMode.value) {
        selectedNoteIds.value = [];
    }
};

// 处理笔记选择
const handleNoteSelect = (noteId: string, selected: boolean) => {
    if (selected) {
        if (!selectedNoteIds.value.includes(noteId)) {
            selectedNoteIds.value.push(noteId);
        }
    } else {
        selectedNoteIds.value = selectedNoteIds.value.filter((id) => id !== noteId);
    }
};

// 全选/取消全选
const toggleSelectAll = () => {
    if (selectedNoteIds.value.length === notes.value.length) {
        selectedNoteIds.value = [];
    } else {
        selectedNoteIds.value = notes.value.map((note) => note.id);
    }
};

// 处理批量删除 - 使用 useModal 弹出确认框
const handleBatchDelete = async () => {
    if (selectedNoteIds.value.length === 0) {
        toast.error("请选择要删除的笔记");
        return;
    }

    try {
        const confirmed = await useModal({
            color: "error",
            title: `确认删除 ${selectedNoteIds.value.length} 个笔记？`,
            content: `你即将删除 ${selectedNoteIds.value.length} 个笔记，此操作不可撤销。`,
            confirmText: "确认删除",
            cancelText: "取消",
            ui: { content: "!w-sm" },
        });

        if (confirmed) {
            await batchDelete(selectedNoteIds.value);
            selectedNoteIds.value = [];
            // 退出批量模式
            isBatchMode.value = false;
        }
    } catch (error) {
        // 用户取消删除操作
        console.log("用户取消批量删除操作");
    }
};

// 处理页面变化
const handlePageChange = async (page: number) => {
    await changePage(page);

    // 更新 URL 查询参数
    await router.push({
        query: {
            ...route.query,
            page: page > 1 ? page.toString() : undefined,
        },
    });
};

// 刷新列表
const handleRefresh = async () => {
    await refresh();
};

// 清空搜索
const handleClearSearch = async () => {
    searchInput.value = "";

    // 清除 URL 查询参数
    await router.push({
        query: {
            ...route.query,
            search: undefined,
            page: undefined,
        },
    });

    await clearSearch();
};

// 导航到生成页面
const goToGenerate = () => {
    router.push("/xhs");
};

// 处理分组筛选
const handleGroupFilter = async (groupId: string | undefined) => {
    currentGroupId.value = groupId;

    // 更新 URL 查询参数
    await router.push({
        query: {
            ...route.query,
            groupId: groupId || undefined,
            page: undefined, // 切换分组时重置页码
            search: undefined, // 切换分组时清空搜索
        },
    });

    // 清空搜索
    searchInput.value = "";

    // 获取该分组下的笔记
    await fetchNotes(groupId, 1);
};

// 打开分组管理弹窗
const openGroupManager = () => {
    showGroupManager.value = true;
};

// 分组变更后刷新
const handleGroupsChanged = async () => {
    // 重新加载分组列表
    await fetchGroups();
    // 刷新笔记列表
    await refresh();
};

// 处理批量移动
const handleBatchMove = async (targetGroupId: string) => {
    if (selectedNoteIds.value.length === 0) {
        toast.error("请选择要移动的笔记");
        return;
    }

    try {
        await batchMove(selectedNoteIds.value, targetGroupId);
        selectedNoteIds.value = [];
        // 退出批量模式
        isBatchMode.value = false;
        // 刷新列表
        await refresh();
    } catch (error) {
        // 错误已在 batchMove 中处理
    }
};

// 计算属性
const isAllSelected = computed(() => {
    return notes.value.length > 0 && selectedNoteIds.value.length === notes.value.length;
});

const hasSelectedNotes = computed(() => {
    return selectedNoteIds.value.length > 0;
});

// 当前选中分组的名称
const currentGroupName = computed(() => {
    if (!currentGroupId.value) return "全部笔记";
    const group = groups.value.find((g) => g.id === currentGroupId.value);
    return group?.name || "全部笔记";
});

// 获取分组的笔记数量（简化版，实际可能需要后端支持）
const getGroupNoteCount = (groupId: string | undefined) => {
    // 这里简化处理，实际应该从后端获取每个分组的笔记数量
    // 目前只显示当前筛选的总数
    if (groupId === currentGroupId.value) {
        return total.value;
    }
    return undefined;
};
</script>

<template>
    <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div class="container mx-auto px-4 py-8">
            <!-- Page Header -->
            <div class="mb-8">
                <div class="flex items-center justify-between">
                    <div>
                        <h1 class="mb-2 text-3xl font-bold text-gray-900 dark:text-white">
                            我的笔记
                        </h1>
                        <p class="text-gray-600 dark:text-gray-400">管理和查看你的小红书笔记内容</p>
                    </div>

                    <!-- Action buttons -->
                    <div class="flex items-center space-x-3">
                        <UButton
                            variant="outline"
                            color="neutral"
                            icon="i-heroicons-folder"
                            @click="openGroupManager"
                        >
                            分组管理
                        </UButton>

                        <UButton
                            variant="outline"
                            color="primary"
                            @click="handleRefresh"
                            :loading="isLoading"
                        >
                            刷新
                        </UButton>

                        <UButton
                            v-if="!isEmpty"
                            variant="outline"
                            :color="isBatchMode ? 'error' : 'neutral'"
                            @click="toggleBatchMode"
                        >
                            {{ isBatchMode ? "退出批量编辑" : "批量编辑" }}
                        </UButton>

                        <UButton color="primary" @click="goToGenerate"> 创建笔记 </UButton>
                    </div>
                </div>
            </div>

            <!-- Main content with sidebar -->
            <div class="flex gap-6">
                <!-- Group Sidebar -->
                <div class="w-64 flex-shrink-0">
                    <div class="sticky top-4">
                        <UCard class="p-4">
                            <div class="space-y-2">
                                <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                                    笔记分组
                                </h3>

                                <!-- 全部笔记 -->
                                <button
                                    class="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors"
                                    :class="[
                                        !currentGroupId
                                            ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                                            : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                                    ]"
                                    @click="handleGroupFilter(undefined)"
                                >
                                    <div class="flex items-center space-x-2">
                                        <UIcon name="i-heroicons-squares-2x2" class="w-4 h-4" />
                                        <span>全部笔记</span>
                                    </div>
                                </button>

                                <!-- 分组加载状态 -->
                                <div v-if="isGroupsLoading" class="space-y-2">
                                    <div
                                        v-for="i in 3"
                                        :key="i"
                                        class="animate-pulse h-9 bg-gray-100 dark:bg-gray-800 rounded-lg"
                                    ></div>
                                </div>

                                <!-- 分组列表 -->
                                <template v-else>
                                    <button
                                        v-for="group in groups"
                                        :key="group.id"
                                        class="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors"
                                        :class="[
                                            currentGroupId === group.id
                                                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                                                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                                        ]"
                                        @click="handleGroupFilter(group.id)"
                                    >
                                        <div class="flex items-center space-x-2">
                                            <UIcon name="i-heroicons-folder" class="w-4 h-4" />
                                            <span class="truncate">{{ group.name }}</span>
                                            <UBadge
                                                v-if="group.isDefault"
                                                color="primary"
                                                variant="soft"
                                                size="xs"
                                            >
                                                默认
                                            </UBadge>
                                        </div>
                                    </button>
                                </template>

                                <!-- 分组管理按钮 -->
                                <div class="pt-2 border-t border-gray-200 dark:border-gray-700 mt-2">
                                    <button
                                        class="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                        @click="openGroupManager"
                                    >
                                        <UIcon name="i-heroicons-cog-6-tooth" class="w-4 h-4" />
                                        <span class="text-sm">管理分组</span>
                                    </button>
                                </div>
                            </div>
                        </UCard>
                    </div>
                </div>

                <!-- Notes Content -->
                <div class="flex-1 min-w-0">
                    <!-- Search and filters -->
                    <div class="mb-6">
                        <div class="flex items-center space-x-4">
                            <!-- Search input -->
                            <div class="max-w-md flex-1">
                                <UInput
                                    v-model="searchInput"
                                    placeholder="搜索笔记标题或内容..."
                                    icon="i-heroicons-magnifying-glass"
                                    :loading="isLoading"
                                >
                                    <template #trailing>
                                        <UButton
                                            v-if="searchInput"
                                            variant="ghost"
                                            size="xs"
                                            color="neutral"
                                            icon="i-heroicons-x-mark"
                                            @click="handleClearSearch"
                                        />
                                    </template>
                                </UInput>
                            </div>

                            <!-- Current filter info -->
                            <div class="text-sm text-gray-500">
                                <span v-if="isSearching">找到 {{ total }} 个结果</span>
                                <span v-else-if="currentGroupId">{{ currentGroupName }} ({{ total }})</span>
                                <span v-else>共 {{ total }} 个笔记</span>
                            </div>
                        </div>
                    </div>

                    <!-- Batch operations toolbar -->
                    <div
                        v-if="isBatchMode"
                        class="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20"
                    >
                        <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-4">
                                <UCheckbox
                                    :checked="isAllSelected"
                                    :indeterminate="hasSelectedNotes && !isAllSelected"
                                    @change="toggleSelectAll"
                                />
                                <span class="text-sm text-blue-700 dark:text-blue-300">
                                    {{
                                        hasSelectedNotes
                                            ? `已选择 ${selectedNoteIds.length} 个笔记`
                                            : "全选"
                                    }}
                                </span>
                            </div>

                            <div class="flex items-center space-x-2">
                                <!-- 批量移动下拉菜单 -->
                                <UDropdownMenu v-if="hasSelectedNotes && groups.length > 0">
                                    <UButton variant="outline" color="primary" size="sm">
                                        批量移动
                                        <UIcon name="i-heroicons-chevron-down" class="w-4 h-4 ml-1" />
                                    </UButton>
                                    <template #content>
                                        <UDropdownMenuItem
                                            v-for="group in groups"
                                            :key="group.id"
                                            @click="handleBatchMove(group.id)"
                                        >
                                            <UIcon name="i-heroicons-folder" class="w-4 h-4 mr-2" />
                                            {{ group.name }}
                                        </UDropdownMenuItem>
                                    </template>
                                </UDropdownMenu>

                                <UButton
                                    v-if="hasSelectedNotes"
                                    variant="outline"
                                    color="error"
                                    size="sm"
                                    @click="handleBatchDelete"
                                >
                                    批量删除
                                </UButton>
                            </div>
                        </div>
                    </div>

                    <!-- Error message -->
                    <div v-if="error" class="mb-6">
                        <UAlert
                            color="error"
                            variant="soft"
                            :title="error"
                            :close-button="{
                                icon: 'i-heroicons-x-mark-20-solid',
                                color: 'error',
                                variant: 'link',
                            }"
                            @close="error = ''"
                        />
                    </div>

                    <!-- Loading state -->
                    <div v-if="isLoading && notes.length === 0" class="space-y-4">
                        <div v-for="i in 6" :key="i" class="animate-pulse">
                            <div class="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
                                <div class="space-y-3">
                                    <div class="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700"></div>
                                    <div class="space-y-2">
                                        <div class="h-3 rounded bg-gray-200 dark:bg-gray-700"></div>
                                        <div class="h-3 w-5/6 rounded bg-gray-200 dark:bg-gray-700"></div>
                                    </div>
                                    <div class="flex justify-between">
                                        <div class="h-3 w-20 rounded bg-gray-200 dark:bg-gray-700"></div>
                                        <div class="h-3 w-16 rounded bg-gray-200 dark:bg-gray-700"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Notes grid -->
                    <div v-else-if="!isEmpty" class="space-y-4">
                        <div class="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                            <NoteCard
                                v-for="note in notes"
                                :key="note.id"
                                :note="note"
                                :show-checkbox="isBatchMode"
                                :is-selected="selectedNoteIds.includes(note.id)"
                                @click="handleNoteClick"
                                @delete="handleDeleteClick"
                                @select="handleNoteSelect"
                            />
                        </div>

                        <!-- Pagination -->
                        <div v-if="totalPages > 1" class="mt-8 flex justify-center">
                            <UPagination
                                v-model="currentPage"
                                :page-count="totalPages"
                                :total="total"
                                @update:model-value="handlePageChange"
                            />
                        </div>
                    </div>

                    <!-- Empty state -->
                    <div v-else class="py-16 text-center">
                        <div class="mx-auto max-w-md">
                            <div class="mb-6 text-gray-400">
                                <UIcon name="i-heroicons-document-text" class="mx-auto h-24 w-24" />
                            </div>

                            <h3 class="mb-2 text-xl font-semibold text-gray-900 dark:text-white">
                                {{ isSearching ? "未找到相关笔记" : currentGroupId ? "该分组暂无笔记" : "还没有笔记" }}
                            </h3>

                            <p class="mb-6 text-gray-500 dark:text-gray-400">
                                {{
                                    isSearching
                                        ? "尝试使用其他关键词搜索"
                                        : "开始创建你的第一个小红书笔记吧"
                                }}
                            </p>

                            <div class="flex justify-center space-x-3">
                                <UButton v-if="isSearching" variant="outline" @click="handleClearSearch">
                                    清空搜索
                                </UButton>

                                <UButton v-if="currentGroupId && !isSearching" variant="outline" @click="handleGroupFilter(undefined)">
                                    查看全部笔记
                                </UButton>

                                <UButton color="primary" @click="goToGenerate">
                                    {{ isSearching ? "创建新笔记" : "创建第一个笔记" }}
                                </UButton>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Group Manager Modal -->
        <GroupManager
            v-model="showGroupManager"
            @groups-changed="handleGroupsChanged"
        />
    </div>
</template>

<style scoped>
/* 自定义样式 */
</style>