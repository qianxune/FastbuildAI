<script setup lang="ts">
import type { XhsNote, XhsProduct } from "@/types/xhs";
import NoteCard from "@/components/xhs/note-card.vue";
import NotePreviewModal from "@/components/xhs/note-preview-modal.vue";
import { useAuthFetch } from "~/composables/useAuthFetch";

interface Props {
    modelValue: boolean;
    /** 单个商品 ID（SKU） */
    productId?: string;
    /** 多个商品 ID（用于分组视图） */
    productIds?: string[];
    productName: string;
}

interface Emits {
    (e: "update:modelValue", v: boolean): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const isOpen = computed({
    get: () => props.modelValue,
    set: (v) => emit("update:modelValue", v),
});

const { get } = useAuthFetch();
const notes = ref<XhsNote[]>([]);
const total = ref(0);
const isLoading = ref(false);
const error = ref("");

const effectiveProductIds = computed(() => {
    if (props.productIds?.length) return props.productIds;
    if (props.productId) return [props.productId];
    return [];
});

const fetchNotes = async () => {
    const ids = effectiveProductIds.value;
    if (!ids.length) return;
    isLoading.value = true;
    error.value = "";
    const params = new URLSearchParams({
        page: "1",
        limit: "100",
    });
    if (ids.length === 1 && ids[0]) {
        params.set("productId", ids[0]);
    } else if (ids.length > 1) {
        params.set("productIds", ids.filter(Boolean).join(","));
    }
    const { data, error: apiError } = await get<{
        items: XhsNote[];
        total: number;
        totalPages: number;
    }>(`/api/xhs/notes?${params.toString()}`);

    if (apiError) {
        error.value = apiError;
        notes.value = [];
        total.value = 0;
    } else {
        notes.value = data?.items ?? [];
        total.value = data?.total ?? 0;
    }
    isLoading.value = false;
};

const handleClose = () => {
    emit("update:modelValue", false);
};

watch(
    () => [props.modelValue, effectiveProductIds.value] as const,
    ([open, ids]) => {
        if (open && ids?.length) {
            fetchNotes();
        } else {
            notes.value = [];
        }
    },
);

const router = useRouter();
const handleNoteClick = (note: XhsNote) => {
    router.push({ path: "/xhs/create", query: { noteId: note.id } });
};

// 预览：打开 note-preview-modal
const previewOpen = ref(false);
const previewNote = ref<XhsNote | null>(null);
const previewProduct = ref<XhsProduct | null>(null);
const isLoadingPreviewProduct = ref(false);

const openPreview = async (note: XhsNote) => {
    const productId = note.productId || effectiveProductIds.value[0];
    if (!productId) return;
    previewNote.value = note;
    previewProduct.value = null;
    isLoadingPreviewProduct.value = true;
    try {
        const { data, error: apiError } = await get<{ items: XhsProduct[] }>(
            `/api/xhs/products/by-ids?ids=${encodeURIComponent(productId)}`,
        );
        if (!apiError && data?.items?.length) {
            const product = data.items[0];
            if (product) {
                previewProduct.value = product;
                previewOpen.value = true;
            }
        }
    } finally {
        isLoadingPreviewProduct.value = false;
    }
};

const closePreview = () => {
    previewOpen.value = false;
    previewNote.value = null;
    previewProduct.value = null;
};
</script>

<template>
    <USlideover
        v-model:open="isOpen"
        side="right"
        :ui="{
            content: 'w-full max-w-md sm:max-w-lg flex flex-col',
            body: 'flex flex-1 flex-col min-h-0 p-0',
        }"
    >
        <template #content>
            <div class="flex h-full flex-col bg-gray-50 dark:bg-gray-900">
                <!-- 标题栏 -->
                <div
                    class="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700"
                >
                    <h2 class="text-lg font-semibold text-gray-900 dark:text-white">关联笔记</h2>
                    <UButton
                        variant="ghost"
                        color="neutral"
                        icon="i-heroicons-x-mark"
                        size="sm"
                        class="-mr-1"
                        @click="handleClose"
                    />
                </div>

                <!-- 商品名 + 数量 -->
                <div class="shrink-0 border-b border-gray-200 px-4 py-2 dark:border-gray-700">
                    <p class="truncate text-sm font-medium text-gray-700 dark:text-gray-300">
                        {{ productName }}
                    </p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">共 {{ total }} 条笔记</p>
                </div>

                <!-- 内容区：加载 / 错误 / 空 / 列表 -->
                <div class="min-h-0 flex-1 overflow-y-auto p-4">
                    <div v-if="isLoading" class="flex justify-center py-12">
                        <UIcon
                            name="i-heroicons-arrow-path"
                            class="text-primary-500 h-8 w-8 animate-spin"
                        />
                    </div>
                    <div v-else-if="error" class="py-8 text-center text-sm text-red-500">
                        {{ error }}
                    </div>
                    <div
                        v-else-if="notes.length === 0"
                        class="py-12 text-center text-sm text-gray-500 dark:text-gray-400"
                    >
                        暂无关联笔记
                    </div>
                    <div v-else class="space-y-3">
                            <div
                                v-for="note in notes"
                                :key="note.id"
                                class="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
                            >
                                <NoteCard :note="note" @click="handleNoteClick" />
                                <div class="mt-2 flex justify-end gap-2">
                                    <UButton
                                        variant="link"
                                        color="primary"
                                        size="xs"
                                        label="预览"
                                        @click="openPreview(note)"
                                    />
                                    <UButton
                                        variant="link"
                                        color="primary"
                                        size="xs"
                                        label="详情"
                                        @click="handleNoteClick(note)"
                                    />
                                </div>
                            </div>
                    </div>
                </div>
            </div>
        </template>
    </USlideover>

    <NotePreviewModal
        v-if="previewNote && previewProduct"
        :is-open="previewOpen"
        :title="previewNote.title"
        :content="previewNote.content"
        :cover-images="previewNote.coverImages ?? []"
        :product="previewProduct"
        @close="closePreview"
    />
</template>
