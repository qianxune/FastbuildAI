<script setup lang="ts">
import type { XhsProduct } from "@/types/xhs";

interface Props {
    isOpen: boolean;
    title: string;
    content: string;
    product: XhsProduct;
}

interface Emits {
    (e: "close"): void;
    (e: "save", data: { title: string; content: string }): void;
    (e: "publish"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// 编辑状态
const isEditing = ref(false);
const editTitle = ref(props.title);
const editContent = ref(props.content);

// 图片轮播
const currentImageIndex = ref(0);
const images = computed(() => {
    const imgs: string[] = [];
    if (props.product.imageUrl) imgs.push(props.product.imageUrl);
    if (props.product.extraImages?.length) imgs.push(...props.product.extraImages);
    return imgs;
});

// 监听 props 变化更新编辑内容
watch(
    () => props.title,
    (newVal) => {
        editTitle.value = newVal;
    },
);

watch(
    () => props.content,
    (newVal) => {
        editContent.value = newVal;
    },
);

// 切换到上一张图片
const prevImage = (e: Event) => {
    e.stopPropagation();
    if (currentImageIndex.value > 0) {
        currentImageIndex.value--;
    } else {
        currentImageIndex.value = images.value.length - 1;
    }
};

// 切换到下一张图片
const nextImage = (e: Event) => {
    e.stopPropagation();
    if (currentImageIndex.value < images.value.length - 1) {
        currentImageIndex.value++;
    } else {
        currentImageIndex.value = 0;
    }
};

// 切换编辑模式
const toggleEdit = () => {
    isEditing.value = !isEditing.value;
    if (!isEditing.value) {
        // 取消编辑，恢复原值
        editTitle.value = props.title;
        editContent.value = props.content;
    }
};

// 保存编辑
const handleSave = () => {
    if (!editTitle.value.trim()) {
        const toast = useMessage();
        toast.warning("标题不能为空");
        return;
    }
    if (!editContent.value.trim()) {
        const toast = useMessage();
        toast.warning("内容不能为空");
        return;
    }

    emit("save", {
        title: editTitle.value,
        content: editContent.value,
    });
    isEditing.value = false;
};

// 关闭弹窗
const handleClose = () => {
    isEditing.value = false;
    currentImageIndex.value = 0;
    emit("close");
};

// 发布
const handlePublish = () => {
    emit("publish");
};
</script>

<template>
    <Teleport to="body">
        <div
            v-if="props.isOpen"
            class="fixed inset-0 z-[100] flex items-center justify-center p-4"
            @click.self="handleClose"
        >
            <!-- 遮罩层 -->
            <div class="fixed inset-0 bg-black/50" @click="handleClose"></div>

            <!-- 内容区域 -->
            <div class="relative mx-auto w-full max-w-md">
                <!-- 手机外壳 -->
                <div class="overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-gray-900">
                    <!-- 手机顶部状态栏 -->
                    <div
                        class="flex items-center justify-between bg-white px-4 py-2 dark:bg-gray-900"
                    >
                        <div class="flex items-center gap-1 text-xs text-gray-900 dark:text-white">
                            <span>9:41</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <UIcon
                                name="i-heroicons-signal"
                                class="h-4 w-4 text-gray-900 dark:text-white"
                            />
                            <UIcon
                                name="i-heroicons-wifi"
                                class="h-4 w-4 text-gray-900 dark:text-white"
                            />
                            <UIcon
                                name="i-heroicons-battery-100"
                                class="h-4 w-4 text-gray-900 dark:text-white"
                            />
                        </div>
                    </div>

                    <!-- 导航栏 -->
                    <div
                        class="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900"
                    >
                        <UButton
                            variant="ghost"
                            color="neutral"
                            icon="i-heroicons-arrow-left"
                            size="sm"
                            @click="handleClose"
                        />
                        <span class="text-sm font-medium text-gray-900 dark:text-white"
                            >笔记预览</span
                        >
                        <UButton
                            variant="ghost"
                            color="neutral"
                            icon="i-heroicons-ellipsis-horizontal"
                            size="sm"
                        />
                    </div>

                    <!-- 内容区域 -->
                    <div class="max-h-[600px] overflow-y-auto bg-white dark:bg-gray-900">
                        <!-- 图片轮播 -->
                        <div
                            v-if="images.length > 0"
                            class="relative aspect-square w-full bg-gray-100 dark:bg-gray-800"
                        >
                            <img
                                :src="images[currentImageIndex]"
                                :alt="`图片 ${currentImageIndex + 1}`"
                                class="h-full w-full object-cover"
                            />

                            <!-- 轮播控制按钮 -->
                            <button
                                v-if="images.length > 1"
                                @click.stop="prevImage"
                                class="absolute top-1/2 left-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-all hover:bg-black/70"
                            >
                                <UIcon name="i-heroicons-chevron-left" class="h-5 w-5" />
                            </button>
                            <button
                                v-if="images.length > 1"
                                @click.stop="nextImage"
                                class="absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-all hover:bg-black/70"
                            >
                                <UIcon name="i-heroicons-chevron-right" class="h-5 w-5" />
                            </button>

                            <!-- 图片指示器 -->
                            <div
                                v-if="images.length > 1"
                                class="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1"
                            >
                                <div
                                    v-for="(_, idx) in images"
                                    :key="idx"
                                    :class="[
                                        'h-1.5 rounded-full transition-all',
                                        idx === currentImageIndex
                                            ? 'w-6 bg-white'
                                            : 'w-1.5 bg-white/50',
                                    ]"
                                />
                            </div>

                            <!-- 图片计数 -->
                            <div
                                class="absolute top-3 right-3 rounded-full bg-black/50 px-2 py-1 text-xs text-white"
                            >
                                {{ currentImageIndex + 1 }}/{{ images.length }}
                            </div>
                        </div>

                        <!-- 无图片占位 -->
                        <div
                            v-else
                            class="flex aspect-square w-full items-center justify-center bg-gray-100 dark:bg-gray-800"
                        >
                            <div class="text-center">
                                <UIcon
                                    name="i-heroicons-photo"
                                    class="mx-auto h-16 w-16 text-gray-400"
                                />
                                <p class="mt-2 text-sm text-gray-500">暂无图片</p>
                            </div>
                        </div>

                        <!-- 笔记内容 -->
                        <div class="p-4">
                            <!-- 标题 -->
                            <div class="mb-3">
                                <div
                                    v-if="!isEditing"
                                    class="text-lg font-semibold text-gray-900 dark:text-white"
                                >
                                    {{ editTitle }}
                                </div>
                                <textarea
                                    v-else
                                    v-model="editTitle"
                                    rows="2"
                                    placeholder="输入标题..."
                                    class="focus:border-primary-500 focus:ring-primary-500/20 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-lg font-semibold focus:ring-2 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                                />
                            </div>

                            <!-- 正文 -->
                            <div class="mb-4">
                                <div
                                    v-if="!isEditing"
                                    class="text-sm leading-relaxed whitespace-pre-wrap text-gray-700 dark:text-gray-300"
                                >
                                    {{ editContent }}
                                </div>
                                <textarea
                                    v-else
                                    v-model="editContent"
                                    rows="8"
                                    placeholder="输入正文内容..."
                                    class="focus:border-primary-500 focus:ring-primary-500/20 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm leading-relaxed focus:ring-2 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
                                />
                            </div>

                            <!-- 商品信息卡片 -->
                            <div
                                class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800"
                            >
                                <div class="flex items-center gap-3">
                                    <img
                                        v-if="props.product.imageUrl"
                                        :src="props.product.imageUrl"
                                        :alt="props.product.name"
                                        class="h-16 w-16 flex-shrink-0 rounded object-cover"
                                    />
                                    <div class="min-w-0 flex-1">
                                        <p
                                            class="truncate text-sm font-medium text-gray-900 dark:text-white"
                                        >
                                            {{ props.product.name }}
                                        </p>
                                        <p
                                            v-if="props.product.spec"
                                            class="truncate text-xs text-gray-600 dark:text-gray-400"
                                        >
                                            {{ props.product.spec }}
                                        </p>
                                        <p
                                            v-if="props.product.price"
                                            class="mt-1 text-sm font-semibold text-red-600"
                                        >
                                            ¥{{ props.product.price }}
                                        </p>
                                    </div>
                                    <UButton size="xs" color="primary" variant="solid">
                                        购买
                                    </UButton>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 底部操作栏 -->
                    <div
                        class="border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900"
                    >
                        <div v-if="!isEditing" class="flex gap-2">
                            <UButton
                                variant="outline"
                                color="neutral"
                                class="flex-1"
                                @click="toggleEdit"
                            >
                                <UIcon name="i-heroicons-pencil-square" class="mr-1" />
                                编辑
                            </UButton>
                            <UButton color="primary" class="flex-1" @click="handlePublish">
                                <UIcon name="i-heroicons-paper-airplane" class="mr-1" />
                                发布
                            </UButton>
                        </div>
                        <div v-else class="flex gap-2">
                            <UButton
                                variant="outline"
                                color="neutral"
                                class="flex-1"
                                @click="toggleEdit"
                            >
                                取消
                            </UButton>
                            <UButton color="success" class="flex-1" @click="handleSave">
                                <UIcon name="i-heroicons-check" class="mr-1" />
                                保存
                            </UButton>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </Teleport>
</template>
