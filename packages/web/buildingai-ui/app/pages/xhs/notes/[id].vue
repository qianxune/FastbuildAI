<script setup lang="ts">
import type { XhsNote, UpdateNoteDto } from "@/types/xhs";

// Vue APIs (ref, computed, watch, onMounted) 由 Nuxt 自动导入
// Nuxt composables (useRouter, useRoute, useMessage) 由 Nuxt 自动导入

// Page metadata configuration
definePageMeta({
    layout: "default",
    name: "XHS Note Editor",
    auth: true, // Require authentication as per requirements
});

// SEO settings
useSeoMeta({
    title: "编辑笔记 - 小红书爆款文章生成器",
    description: "编辑和修改你的小红书笔记",
});

// 全局状态管理 - useUserStore 由 Nuxt 自动导入
const userStore = useUserStore();

// Toast 通知
const toast = useMessage();

// 路由
const router = useRouter();
const route = useRoute();

// 笔记ID
const noteId = computed(() => route.params.id as string);

// 响应式状态
const note = ref<XhsNote | null>(null);
const isLoading = ref(true);
const isSaving = ref(false);
const error = ref("");

// 编辑状态
const editTitle = ref("");
const editContent = ref("");
const originalTitle = ref("");
const originalContent = ref("");

// 最大字数限制
const MAX_CONTENT_LENGTH = 2000;

// 计算属性 - 字数统计
const wordCount = computed(() => editContent.value.length);

// 计算属性 - 是否有未保存的更改
const hasUnsavedChanges = computed(() => {
    return editTitle.value !== originalTitle.value || editContent.value !== originalContent.value;
});

// 计算属性 - 字数颜色
const wordCountColor = computed(() => {
    if (wordCount.value > MAX_CONTENT_LENGTH) {
        return "text-red-500";
    } else if (wordCount.value > MAX_CONTENT_LENGTH * 0.9) {
        return "text-yellow-500";
    }
    return "text-gray-500";
});

// 计算属性 - 是否可以保存
const canSave = computed(() => {
    return (
        hasUnsavedChanges.value &&
        editTitle.value.trim().length > 0 &&
        editContent.value.trim().length > 0 &&
        wordCount.value <= MAX_CONTENT_LENGTH &&
        !isSaving.value
    );
});

// 获取认证token
const getAuthToken = () => {
    const authToken = userStore.token || userStore.temporaryToken;
    if (!authToken) {
        throw new Error("请先登录");
    }
    return authToken;
};

// 获取笔记详情
const fetchNote = async () => {
    isLoading.value = true;
    error.value = "";

    try {
        const authToken = getAuthToken();

        const response = await fetch(`/api/xhs/notes/${noteId.value}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${authToken}`,
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = "获取笔记失败";

            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.error?.message || errorData.message || errorMessage;
            } catch {
                // 如果不是JSON格式，使用默认错误消息
            }

            if (response.status === 404) {
                errorMessage = "笔记不存在或已被删除";
            } else if (response.status === 403) {
                errorMessage = "无权访问此笔记";
            }

            throw new Error(errorMessage);
        }

        const responseData = await response.json();

        // API 返回格式: { code, message, data: note }
        const noteData: XhsNote = responseData.data || responseData;

        note.value = noteData;

        // 初始化编辑状态
        editTitle.value = noteData.title || "";
        editContent.value = noteData.content || "";
        originalTitle.value = noteData.title || "";
        originalContent.value = noteData.content || "";
    } catch (err: any) {
        console.error("获取笔记失败:", err);

        let errorMessage = "获取笔记失败，请稍后重试";
        const errorMsg = err?.message || "";

        if (errorMsg.includes("登录")) {
            errorMessage = "请先登录";
            router.push("/login");
        } else if (errorMsg) {
            errorMessage = errorMsg;
        }

        error.value = errorMessage;
        toast.error(errorMessage);
    } finally {
        isLoading.value = false;
    }
};

// 保存笔记
const saveNote = async () => {
    if (!canSave.value) return;

    isSaving.value = true;

    try {
        const authToken = getAuthToken();

        const updateDto: UpdateNoteDto = {
            title: editTitle.value.trim(),
            content: editContent.value,
        };

        const response = await fetch(`/api/xhs/notes/${noteId.value}`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${authToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(updateDto),
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = "保存失败";

            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.error?.message || errorData.message || errorMessage;
            } catch {
                // 如果不是JSON格式，使用默认错误消息
            }

            throw new Error(errorMessage);
        }

        const responseData = await response.json();

        // API 返回格式: { code, message, data: note }
        const updatedNote: XhsNote = responseData.data || responseData;

        // 更新本地状态
        note.value = updatedNote;
        originalTitle.value = updatedNote.title;
        originalContent.value = updatedNote.content;

        toast.success("保存成功");
    } catch (err: any) {
        console.error("保存笔记失败:", err);

        let errorMessage = "保存失败，请稍后重试";
        const errorMsg = err?.message || "";

        if (errorMsg.includes("登录")) {
            errorMessage = "请先登录";
        } else if (errorMsg) {
            errorMessage = errorMsg;
        }

        toast.error(errorMessage);
    } finally {
        isSaving.value = false;
    }
};

// 返回笔记列表
const goBack = async () => {
    if (hasUnsavedChanges.value) {
        try {
            const confirmed = await useModal({
                color: "warning",
                title: "有未保存的更改",
                content: "你有未保存的更改，确定要离开吗？",
                confirmText: "离开",
                cancelText: "继续编辑",
                ui: { content: "!w-sm" },
            });

            if (confirmed) {
                router.push("/xhs/notes");
            }
        } catch {
            // 用户取消
        }
    } else {
        router.push("/xhs/notes");
    }
};

// 格式化时间显示
const formatDate = (dateString: string): string => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
};

// 获取生成模式显示文本
const getModeText = (mode: string): string => {
    switch (mode) {
        case "ai-generate":
            return "AI生成";
        case "ai-compose":
            return "AI作文";
        case "add-emoji":
            return "加emoji";
        default:
            return "未知";
    }
};

// 页面加载时获取笔记
onMounted(async () => {
    await fetchNote();
});

// 监听路由变化，防止意外离开
onBeforeRouteLeave(async (to, from, next) => {
    if (hasUnsavedChanges.value) {
        try {
            const confirmed = await useModal({
                color: "warning",
                title: "有未保存的更改",
                content: "你有未保存的更改，确定要离开吗？",
                confirmText: "离开",
                cancelText: "继续编辑",
                ui: { content: "!w-sm" },
            });

            if (confirmed) {
                next();
            } else {
                next(false);
            }
        } catch {
            next(false);
        }
    } else {
        next();
    }
});
</script>

<template>
    <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div class="container mx-auto px-4 py-8">
            <!-- Loading State -->
            <div v-if="isLoading" class="max-w-4xl mx-auto">
                <div class="animate-pulse space-y-6">
                    <div class="flex items-center space-x-4">
                        <div class="h-10 w-10 rounded bg-gray-200 dark:bg-gray-700"></div>
                        <div class="h-8 w-48 rounded bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <div class="h-12 rounded bg-gray-200 dark:bg-gray-700"></div>
                    <div class="h-64 rounded bg-gray-200 dark:bg-gray-700"></div>
                </div>
            </div>

            <!-- Error State -->
            <div v-else-if="error" class="max-w-4xl mx-auto">
                <UCard class="p-8 text-center">
                    <div class="text-gray-400 mb-4">
                        <UIcon name="i-heroicons-exclamation-circle" class="w-16 h-16 mx-auto" />
                    </div>
                    <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                        {{ error }}
                    </h3>
                    <div class="flex justify-center space-x-3 mt-6">
                        <UButton variant="outline" @click="fetchNote"> 重试 </UButton>
                        <UButton color="primary" @click="router.push('/xhs/notes')">
                            返回列表
                        </UButton>
                    </div>
                </UCard>
            </div>

            <!-- Editor Content -->
            <div v-else-if="note" class="max-w-4xl mx-auto">
                <!-- Header -->
                <div class="mb-6">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-4">
                            <UButton
                                variant="ghost"
                                color="neutral"
                                icon="i-heroicons-arrow-left"
                                @click="goBack"
                            >
                                返回
                            </UButton>

                            <div class="flex items-center space-x-2">
                                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                                    编辑笔记
                                </h1>
                                <UBadge
                                    v-if="hasUnsavedChanges"
                                    color="warning"
                                    variant="soft"
                                    size="xs"
                                >
                                    未保存
                                </UBadge>
                            </div>
                        </div>

                        <div class="flex items-center space-x-3">
                            <UButton
                                color="primary"
                                :loading="isSaving"
                                :disabled="!canSave"
                                @click="saveNote"
                            >
                                保存
                            </UButton>
                        </div>
                    </div>
                </div>

                <!-- Editor Card -->
                <UCard class="p-6">
                    <div class="space-y-6">
                        <!-- Note Metadata -->
                        <div
                            class="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 pb-4 border-b border-gray-200 dark:border-gray-700"
                        >
                            <div class="flex items-center space-x-4">
                                <span class="flex items-center space-x-1">
                                    <UIcon name="i-heroicons-tag" class="w-4 h-4" />
                                    <span>{{ getModeText(note.mode) }}</span>
                                </span>

                                <span v-if="note.group" class="flex items-center space-x-1">
                                    <UIcon name="i-heroicons-folder" class="w-4 h-4" />
                                    <span>{{ note.group.name }}</span>
                                </span>
                            </div>

                            <div class="flex items-center space-x-4">
                                <span class="flex items-center space-x-1">
                                    <UIcon name="i-heroicons-clock" class="w-4 h-4" />
                                    <span>创建于 {{ formatDate(note.createdAt) }}</span>
                                </span>

                                <span
                                    v-if="note.updatedAt !== note.createdAt"
                                    class="flex items-center space-x-1"
                                >
                                    <UIcon name="i-heroicons-pencil" class="w-4 h-4" />
                                    <span>更新于 {{ formatDate(note.updatedAt) }}</span>
                                </span>
                            </div>
                        </div>

                        <!-- Title Input -->
                        <div class="space-y-2">
                            <label
                                class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                            >
                                标题
                            </label>
                            <UInput
                                v-model="editTitle"
                                placeholder="请输入笔记标题"
                                size="lg"
                                :ui="{ base: 'w-full text-lg font-semibold' }"
                            />
                        </div>

                        <!-- Content Textarea -->
                        <div class="space-y-2">
                            <div class="flex items-center justify-between">
                                <label
                                    class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                                >
                                    正文
                                </label>
                                <span class="text-sm" :class="wordCountColor">
                                    {{ wordCount }}/{{ MAX_CONTENT_LENGTH }}
                                </span>
                            </div>
                            <UTextarea
                                v-model="editContent"
                                placeholder="请输入笔记正文内容"
                                :rows="16"
                                class="w-full resize-none"
                                :ui="{ base: 'w-full' }"
                            />

                            <!-- Word count warning -->
                            <div
                                v-if="wordCount > MAX_CONTENT_LENGTH"
                                class="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg"
                            >
                                <p class="text-sm text-red-700 dark:text-red-300">
                                    内容超出最大字数限制，请删减部分内容
                                </p>
                            </div>
                        </div>

                        <!-- Cover Images Preview (if any) -->
                        <div
                            v-if="note.coverImages && note.coverImages.length > 0"
                            class="space-y-2"
                        >
                            <label
                                class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                            >
                                封面图片
                            </label>
                            <div class="flex flex-wrap gap-3">
                                <div
                                    v-for="(image, index) in note.coverImages"
                                    :key="index"
                                    class="relative w-24 h-24 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800"
                                >
                                    <img
                                        :src="image"
                                        :alt="`封面图 ${index + 1}`"
                                        class="w-full h-full object-cover"
                                        @error="
                                            (e: Event) =>
                                                ((e.target as HTMLImageElement).style.display =
                                                    'none')
                                        "
                                    />
                                </div>
                            </div>
                        </div>

                        <!-- Action Buttons -->
                        <div
                            class="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700"
                        >
                            <UButton variant="ghost" color="neutral" @click="goBack">
                                取消
                            </UButton>

                            <UButton
                                color="primary"
                                :loading="isSaving"
                                :disabled="!canSave"
                                @click="saveNote"
                            >
                                保存更改
                            </UButton>
                        </div>
                    </div>
                </UCard>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* 自定义样式 */
</style>
