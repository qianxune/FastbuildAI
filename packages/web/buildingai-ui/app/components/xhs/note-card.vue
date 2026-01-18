<script setup lang="ts">
import type { XhsNote } from "@/types/xhs";

// Vue APIs (ref, computed, watch) 由 Nuxt 自动导入

interface Props {
    note: XhsNote;
    showCheckbox?: boolean;
    isSelected?: boolean;
}

interface Emits {
    (e: "click", note: XhsNote): void;
    (e: "delete", noteId: string): void;
    (e: "select", noteId: string, selected: boolean): void;
}

const props = withDefaults(defineProps<Props>(), {
    showCheckbox: false,
    isSelected: false,
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
    <UCard
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
                    <!-- Checkbox for batch selection -->
                    <UCheckbox
                        v-if="props.showCheckbox"
                        :checked="props.isSelected"
                        @change="handleCheckboxChange"
                        @click.stop
                    />

                    <!-- Title -->
                    <h3
                        class="flex-1 truncate text-lg font-semibold text-gray-900 dark:text-white"
                        :title="props.note.title"
                    >
                        {{ props.note.title }}
                    </h3>
                </div>

                <!-- Actions -->
                <div class="ml-2 flex items-center space-x-2">
                    <!-- Mode badge -->
                    <UBadge :color="modeColor" variant="soft" size="xs">
                        {{ modeText }}
                    </UBadge>

                    <!-- Delete button -->
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

            <!-- Content preview -->
            <div class="space-y-2">
                <p
                    class="line-clamp-3 text-sm text-gray-600 dark:text-gray-400"
                    :title="props.note.content"
                >
                    {{ contentPreview }}
                </p>
            </div>

            <!-- Footer with metadata -->
            <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <div class="flex items-center space-x-4">
                    <!-- Word count -->
                    <span class="flex items-center space-x-1">
                        <UIcon name="i-heroicons-document-text" class="h-3 w-3" />
                        <span>{{ props.note.wordCount || props.note.content.length }}字</span>
                    </span>

                    <!-- Group info -->
                    <span v-if="props.note.group" class="flex items-center space-x-1">
                        <UIcon name="i-heroicons-folder" class="h-3 w-3" />
                        <span>{{ props.note.group.name }}</span>
                    </span>
                </div>

                <!-- Update time -->
                <span class="flex items-center space-x-1">
                    <UIcon name="i-heroicons-clock" class="h-3 w-3" />
                    <span>{{ formattedDate }}</span>
                </span>
            </div>

            <!-- Cover images preview (if any) -->
            <div
                v-if="props.note.coverImages && props.note.coverImages.length > 0"
                class="flex space-x-2"
            >
                <div
                    v-for="(image, index) in props.note.coverImages.slice(0, 3)"
                    :key="index"
                    class="relative h-12 w-12 overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800"
                >
                    <img
                        :src="image"
                        :alt="`封面图 ${index + 1}`"
                        class="h-full w-full object-cover"
                        @error="
                            (e: Event) => ((e.target as HTMLImageElement).style.display = 'none')
                        "
                    />
                </div>

                <!-- More images indicator -->
                <div
                    v-if="props.note.coverImages.length > 3"
                    class="flex h-12 w-12 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800"
                >
                    <span class="text-xs text-gray-500"
                        >+{{ props.note.coverImages.length - 3 }}</span
                    >
                </div>
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
