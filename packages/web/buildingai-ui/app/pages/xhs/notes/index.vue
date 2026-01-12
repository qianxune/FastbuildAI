<script setup lang="ts">
import type { XhsNote } from "@/types/xhs";
import { ref, computed, watch, onMounted } from "vue";
import { useXhsNotes } from "@/composables/useXhsNotes";
import NoteCard from "@/components/xhs/note-card.vue";

// Page metadata configuration
definePageMeta({
    layout: "default",
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
    isEmpty,
    isSearching,
    hasNextPage,
    hasPrevPage,
    fetchNotes,
    searchNotes,
    deleteNote,
    batchDelete,
    changePage,
    refresh,
    clearSearch,
} = useXhsNotes();

// 批量操作状态
const isBatchMode = ref(false);
const selectedNoteIds = ref<string[]>([]);

// Toast 通知
const toast = useMessage();

// 路由
const router = useRouter();
const route = useRoute();

// 搜索输入
const searchInput = ref("");

// 删除确认模态框
const showDeleteModal = ref(false);
const noteToDelete = ref<string | null>(null);
const notesToBatchDelete = ref<string[]>([]);

// 页面加载时获取笔记列表
onMounted(async () => {
    // 从 URL 查询参数中恢复状态
    const urlPage = parseInt(route.query.page as string) || 1;
    const urlSearch = (route.query.search as string) || "";

    if (urlSearch) {
        searchInput.value = urlSearch;
    }

    if (urlSearch) {
        await searchNotes(urlSearch);
    } else {
        await fetchNotes(undefined, urlPage);
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

    // 导航到笔记编辑页面
    router.push(`/xhs/notes/${note.id}`);
};

// 处理删除按钮点击
const handleDeleteClick = (noteId: string) => {
    noteToDelete.value = noteId;
    showDeleteModal.value = true;
};

// 确认删除单个笔记
const confirmDelete = async () => {
    if (!noteToDelete.value) return;

    try {
        await deleteNote(noteToDelete.value);
        showDeleteModal.value = false;
        noteToDelete.value = null;
    } catch (error) {
        // 错误已在 composable 中处理
    }
};

// 取消删除
const cancelDelete = () => {
    showDeleteModal.value = false;
    noteToDelete.value = null;
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

// 处理批量删除
const handleBatchDelete = () => {
    if (selectedNoteIds.value.length === 0) {
        toast.error("请选择要删除的笔记");
        return;
    }

    notesToBatchDelete.value = [...selectedNoteIds.value];
    showDeleteModal.value = true;
};

// 确认批量删除
const confirmBatchDelete = async () => {
    if (notesToBatchDelete.value.length === 0) return;

    try {
        await batchDelete(notesToBatchDelete.value);
        selectedNoteIds.value = [];
        notesToBatchDelete.value = [];
        showDeleteModal.value = false;

        // 退出批量模式
        isBatchMode.value = false;
    } catch (error) {
        // 错误已在 composable 中处理
    }
};

// 取消批量删除
const cancelBatchDelete = () => {
    showDeleteModal.value = false;
    notesToBatchDelete.value = [];
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

// 计算属性
const isAllSelected = computed(() => {
    return notes.value.length > 0 && selectedNoteIds.value.length === notes.value.length;
});

const hasSelectedNotes = computed(() => {
    return selectedNoteIds.value.length > 0;
});

const deleteModalTitle = computed(() => {
    if (notesToBatchDelete.value.length > 0) {
        return `确认删除 ${notesToBatchDelete.value.length} 个笔记？`;
    }
    return "确认删除笔记？";
});

const deleteModalDescription = computed(() => {
    if (notesToBatchDelete.value.length > 0) {
        return `你即将删除 ${notesToBatchDelete.value.length} 个笔记，此操作不可撤销。`;
    }
    return "此操作不可撤销，确定要删除这个笔记吗？";
});
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

                    <!-- Search status -->
                    <div v-if="isSearching" class="text-sm text-gray-500">
                        找到 {{ total }} 个结果
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
                <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
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
                        {{ isSearching ? "未找到相关笔记" : "还没有笔记" }}
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

                        <UButton color="primary" @click="goToGenerate">
                            {{ isSearching ? "创建新笔记" : "创建第一个笔记" }}
                        </UButton>
                    </div>
                </div>
            </div>
        </div>

        <!-- Delete confirmation modal -->
        <UModal v-model="showDeleteModal">
            <UCard>
                <template #header>
                    <h3 class="text-lg font-semibold">{{ deleteModalTitle }}</h3>
                </template>

                <p class="mb-6 text-gray-600 dark:text-gray-400">
                    {{ deleteModalDescription }}
                </p>

                <template #footer>
                    <div class="flex justify-end space-x-3">
                        <UButton
                            variant="ghost"
                            @click="
                                notesToBatchDelete.length > 0 ? cancelBatchDelete() : cancelDelete()
                            "
                        >
                            取消
                        </UButton>
                        <UButton
                            color="error"
                            @click="
                                notesToBatchDelete.length > 0
                                    ? confirmBatchDelete()
                                    : confirmDelete()
                            "
                        >
                            确认删除
                        </UButton>
                    </div>
                </template>
            </UCard>
        </UModal>
    </div>
</template>

<style scoped>
/* 自定义样式 */
</style>