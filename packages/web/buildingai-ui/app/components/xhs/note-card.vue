<script setup lang="ts">
import type { XhsNote } from "@/types/xhs";

// Vue APIs (ref, computed, watch) 由 Nuxt 自动导入

interface Props {
    note: XhsNote;
    showCheckbox?: boolean;
    isSelected?: boolean;
    listMode?: boolean;
}

interface Emits {
    (e: "click", note: XhsNote): void;
    (e: "delete", noteId: string): void;
    (e: "select", noteId: string, selected: boolean): void;
}

const props = withDefaults(defineProps<Props>(), {
    showCheckbox: false,
    isSelected: false,
    listMode: false,
});

const emit = defineEmits<Emits>();

// 格式化时间显示
const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 1) {
        return "刚刚";
    } else if (diffInHours < 24) {
        return `${diffInHours}小时前`;
    } else if (diffInHours < 24 * 7) {
        const days = Math.floor(diffInHours / 24);
        return `${days}天前`;
    } else {
        return date.toLocaleDateString("zh-CN", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    }
};

// 截取内容预览
const getContentPreview = (content: string, maxLength: number = 100): string => {
    if (!content) return "";

    // 移除多余的换行符和空格
    const cleanContent = content.replace(/\s+/g, " ").trim();

    if (cleanContent.length <= maxLength) {
        return cleanContent;
    }

    return cleanContent.substring(0, maxLength) + "...";
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

// 获取模式颜色
const getModeColor = (mode: string): "primary" | "success" | "warning" | "neutral" => {
    switch (mode) {
        case "ai-generate":
            return "primary";
        case "ai-compose":
            return "success";
        case "add-emoji":
            return "warning";
        default:
            return "neutral";
    }
};

// 处理卡片点击
const handleCardClick = () => {
    if (!props.showCheckbox) {
        emit("click", props.note);
    }
};

// 处理复选框变化
const handleCheckboxChange = (event: Event) => {
    const target = event.target as HTMLInputElement;
    emit("select", props.note.id, target.checked);
};

// 处理删除按钮点击
const handleDeleteClick = (event: Event) => {
    event.stopPropagation(); // 阻止事件冒泡
    emit("delete", props.note.id);
};

// 计算属性
const formattedDate = computed(() => formatDate(props.note.updatedAt));
const contentPreview = computed(() => getContentPreview(props.note.content));
const modeText = computed(() => getModeText(props.note.mode));
const modeColor = computed(() => getModeColor(props.note.mode));
</script>

<template>
    <!-- 列表模式 -->
    <UCard
        v-if="props.listMode"
        class="group cursor-pointer transition-shadow duration-200 hover:shadow-md"
        :class="{
            'ring-primary-500 ring-2': props.isSelected,
            'hover:ring-1 hover:ring-gray-300': !props.showCheckbox,
        }"
        @click="handleCardClick"
    >
        <div class="flex items-start gap-4">
            <!-- 左侧：封面图 -->
            <div class="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                <img
                    v-if="props.note.coverImages && props.note.coverImages.length > 0"
                    :src="props.note.coverImages[0]"
                    alt="封面图"
                    class="h-full w-full object-cover"
                    @error="(e: Event) => ((e.target as HTMLImageElement).style.display = 'none')"
                />
                <div v-else class="flex h-full w-full items-center justify-center">
                    <UIcon name="i-heroicons-photo" class="h-8 w-8 text-gray-300 dark:text-gray-600" />
                </div>
                <!-- 图片数量角标 -->
                <div
                    v-if="props.note.coverImages && props.note.coverImages.length > 1"
                    class="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] text-white"
                >
                    {{ props.note.coverImages.length }}
                </div>
            </div>

            <!-- 右侧：内容 -->
            <div class="min-w-0 flex-1">
                <div class="flex items-start justify-between gap-2">
                    <div class="flex min-w-0 flex-1 items-center gap-2">
                        <UCheckbox
                            v-if="props.showCheckbox"
                            :checked="props.isSelected"
                            @change="handleCheckboxChange"
                            @click.stop
                        />
                        <h3 class="truncate text-base font-semibold text-gray-900 dark:text-white" :title="props.note.title">
                            {{ props.note.title }}
                        </h3>
                    </div>
                    <div class="flex flex-shrink-0 items-center gap-2">
                        <UBadge :color="modeColor" variant="soft" size="xs">{{ modeText }}</UBadge>
                        <UButton
                            v-if="!props.showCheckbox"
                            variant="ghost"
                            color="error"
                            size="xs"
                            icon="i-heroicons-trash"
                            @click="handleDeleteClick"
                            class="opacity-0 transition-opacity group-hover:opacity-100"
                        />
                    </div>
                </div>

                <p class="mt-1 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
                    {{ contentPreview }}
                </p>

                <div class="mt-2 flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <span class="flex items-center gap-1">
                        <UIcon name="i-heroicons-document-text" class="h-3 w-3" />
                        {{ props.note.wordCount || props.note.content.length }}字
                    </span>
                    <span v-if="props.note.group" class="flex items-center gap-1">
                        <UIcon name="i-heroicons-folder" class="h-3 w-3" />
                        {{ props.note.group.name }}
                    </span>
                    <span
                        v-if="props.note.isPublished"
                        class="flex items-center gap-1 text-green-600 dark:text-green-400"
                    >
                        <UIcon name="i-heroicons-check-circle" class="h-3 w-3" />
                        已发布
                    </span>
                    <span class="ml-auto flex items-center gap-1">
                        <UIcon name="i-heroicons-clock" class="h-3 w-3" />
                        {{ formattedDate }}
                    </span>
                </div>
            </div>
        </div>
    </UCard>

    <!-- 网格模式（默认） -->
    <UCard
        v-else
        class="group cursor-pointer transition-shadow duration-200 hover:shadow-md"
        :class="{
            'ring-primary-500 ring-2': props.isSelected,
            'hover:ring-1 hover:ring-gray-300': !props.showCheckbox,
        }"
        @click="handleCardClick"
    >
        <div class="space-y-3">
            <!-- Header with checkbox and actions -->
            <div class="flex items-start justify-between">
                <div class="flex min-w-0 flex-1 items-center space-x-3">
                    <UCheckbox
                        v-if="props.showCheckbox"
                        :checked="props.isSelected"
                        @change="handleCheckboxChange"
                        @click.stop
                    />
                    <h3 class="flex-1 truncate text-lg font-semibold text-gray-900 dark:text-white" :title="props.note.title">
                        {{ props.note.title }}
                    </h3>
                </div>
                <div class="ml-2 flex items-center space-x-2">
                    <UBadge :color="modeColor" variant="soft" size="xs">{{ modeText }}</UBadge>
                    <UButton
                        v-if="!props.showCheckbox"
                        variant="ghost"
                        color="error"
                        size="xs"
                        icon="i-heroicons-trash"
                        @click="handleDeleteClick"
                        class="opacity-0 transition-opacity group-hover:opacity-100"
                    />
                </div>
            </div>

            <!-- Cover images preview -->
            <div
                v-if="props.note.coverImages && props.note.coverImages.length > 0"
                class="flex space-x-2"
            >
                <div
                    v-for="(image, index) in props.note.coverImages.slice(0, 3)"
                    :key="index"
                    class="relative h-16 w-16 overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800"
                >
                    <img
                        :src="image"
                        :alt="`封面图 ${index + 1}`"
                        class="h-full w-full object-cover"
                        @error="(e: Event) => ((e.target as HTMLImageElement).style.display = 'none')"
                    />
                </div>
                <div
                    v-if="props.note.coverImages.length > 3"
                    class="flex h-16 w-16 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800"
                >
                    <span class="text-xs text-gray-500">+{{ props.note.coverImages.length - 3 }}</span>
                </div>
            </div>

            <!-- Content preview -->
            <p class="line-clamp-3 text-sm text-gray-600 dark:text-gray-400" :title="props.note.content">
                {{ contentPreview }}
            </p>

            <!-- Footer with metadata -->
            <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <div class="flex items-center space-x-4">
                    <span class="flex items-center space-x-1">
                        <UIcon name="i-heroicons-document-text" class="h-3 w-3" />
                        <span>{{ props.note.wordCount || props.note.content.length }}字</span>
                    </span>
                    <span v-if="props.note.group" class="flex items-center space-x-1">
                        <UIcon name="i-heroicons-folder" class="h-3 w-3" />
                        <span>{{ props.note.group.name }}</span>
                    </span>
                    <span v-if="props.note.isPublished" class="flex items-center space-x-1 text-green-600 dark:text-green-400">
                        <UIcon name="i-heroicons-check-circle" class="h-3 w-3" />
                        <span>已发布</span>
                    </span>
                </div>
                <span class="flex items-center space-x-1">
                    <UIcon name="i-heroicons-clock" class="h-3 w-3" />
                    <span>{{ formattedDate }}</span>
                </span>
            </div>
        </div>
    </UCard>
</template>

<style scoped>
.line-clamp-3 {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
</style>
