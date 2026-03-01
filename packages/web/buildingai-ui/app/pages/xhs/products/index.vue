<script setup lang="ts">
import type { XhsProduct, XhsProductGroup } from "@/types/xhs";
import type { AiModel } from "@buildingai/service/webapi/ai-conversation";
import { useXhsProducts } from "~/composables/useXhsProducts";

definePageMeta({
    layout: false,
    name: "XHS Products List",
    auth: true,
});

useSeoMeta({
    title: "Product management - XHS note generator",
    description: "Import products from Miaoshou, select products to generate XHS notes",
});

const router = useRouter();
const route = useRoute();
const toast = useMessage();

const {
    products,
    productGroups,
    total,
    page,
    limit,
    totalPages,
    isLoading,
    error,
    viewMode,
    fetchProducts,
    fetchProductsGrouped,
    importExcel,
} = useXhsProducts();

const searchInput = ref("");
const selectedIds = ref<string[]>([]);
const expandedGroups = ref<Set<string>>(new Set());
const isImporting = ref(false);
const importResult = ref<{ success: number; skipped: number; failed: number } | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

// AI模型选择
const selectedModelId = ref<string>("");

const allImages = (p: XhsProduct) => {
    const list = [p.imageUrl, ...(p.extraImages || [])].filter(Boolean) as string[];
    return list;
};

const handleImageError = (event: Event, url: string) => {
    console.error("Image failed to load:", url, event);
};

const isEmpty = computed(() => {
    if (viewMode.value === "grouped") {
        return productGroups.value.length === 0;
    }
    return products.value.length === 0;
});

const hasSelected = computed(() => selectedIds.value.length > 0)

// 单条生成 - 跳转到笔记编辑页
const goToSingleGenerate = () => {
  if (selectedIds.value.length !== 1) return

  // 检查是否选择了模型
  if (!selectedModelId.value) {
    toast.warning('请先选择AI模型')
    return
  }

  router.push({
    path: '/xhs/create',
    query: {
      productIds: selectedIds.value[0],
      modelId: selectedModelId.value,
    },
  })
}

// 批量生成 - 跳转到批量生成页面
const goToBatchGenerate = () => {
  if (selectedIds.value.length === 0) return

  // 检查是否选择了模型
  if (!selectedModelId.value) {
    toast.warning('请先选择AI模型')
    return
  }

  router.push({
    path: '/xhs/batch-generate',
    query: {
      productIds: selectedIds.value.join(','),
      modelId: selectedModelId.value,
    },
  })
}

const toggleExpand = (productId: string) => {
    if (expandedGroups.value.has(productId)) {
        expandedGroups.value.delete(productId);
    } else {
        expandedGroups.value.add(productId);
    }
};

const isExpanded = (productId: string) => expandedGroups.value.has(productId);

const toggleSelectGroup = (group: XhsProductGroup) => {
    const skuIds = group.skus.map((sku) => sku.id);
    const allSelected = skuIds.every((id) => selectedIds.value.includes(id));

    if (allSelected) {
        selectedIds.value = selectedIds.value.filter((id) => !skuIds.includes(id));
    } else {
        const newIds = skuIds.filter((id) => !selectedIds.value.includes(id));
        selectedIds.value = [...selectedIds.value, ...newIds];
    }
};

const isGroupSelected = (group: XhsProductGroup) => {
    const skuIds = group.skus.map((sku) => sku.id);
    return skuIds.length > 0 && skuIds.every((id) => selectedIds.value.includes(id));
};

const isGroupPartiallySelected = (group: XhsProductGroup) => {
    const skuIds = group.skus.map((sku) => sku.id);
    const selectedCount = skuIds.filter((id) => selectedIds.value.includes(id)).length;
    return selectedCount > 0 && selectedCount < skuIds.length;
};

onMounted(async () => {
    const urlPage = parseInt((route.query.page as string) || "1");
    const urlKw = (route.query.keyword as string) || "";
    if (urlKw) searchInput.value = urlKw;

    if (viewMode.value === "grouped") {
        await fetchProductsGrouped({ page: urlPage, keyword: urlKw });
    } else {
        await fetchProducts({ page: urlPage, keyword: urlKw });
    }
});

// 处理模型选择变化
const handleModelChange = (model: AiModel | null) => {
    if (model) {
        selectedModelId.value = model.id;
    } else {
        selectedModelId.value = "";
    }
};

let searchTimeout: ReturnType<typeof setTimeout> | null = null;
const handleSearch = async () => {
    const kw = searchInput.value.trim();
    await router.push({ query: { ...route.query, keyword: kw || undefined, page: undefined } });

    if (viewMode.value === "grouped") {
        await fetchProductsGrouped({ page: 1, keyword: kw });
    } else {
        await fetchProducts({ page: 1, keyword: kw });
    }
};

watch(searchInput, () => {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(handleSearch, 500);
});

watch(viewMode, async (newMode) => {
    selectedIds.value = [];
    expandedGroups.value.clear();

    if (newMode === "grouped") {
        await fetchProductsGrouped({ page: 1, keyword: searchInput.value.trim() });
    } else {
        await fetchProducts({ page: 1, keyword: searchInput.value.trim() });
    }
});

const toggleSelect = (id: string) => {
    const i = selectedIds.value.indexOf(id);
    if (i >= 0) selectedIds.value = selectedIds.value.filter((x) => x !== id);
    else selectedIds.value = [...selectedIds.value, id];
};

const toggleSelectAll = () => {
    if (viewMode.value === "grouped") {
        const allSkuIds = productGroups.value.flatMap((g) => g.skus.map((s) => s.id));
        if (selectedIds.value.length === allSkuIds.length) {
            selectedIds.value = [];
        } else {
            selectedIds.value = allSkuIds;
        }
    } else {
        if (selectedIds.value.length === products.value.length) {
            selectedIds.value = [];
        } else {
            selectedIds.value = products.value.map((p) => p.id);
        }
    }
};

const isAllSelected = computed(() => {
    if (viewMode.value === "grouped") {
        const allSkuIds = productGroups.value.flatMap((g) => g.skus.map((s) => s.id));
        return allSkuIds.length > 0 && selectedIds.value.length === allSkuIds.length;
    }
    return products.value.length > 0 && selectedIds.value.length === products.value.length;
});

const goToCreateWithProducts = () => {
    if (!selectedIds.value.length) return;

    // 检查是否选择了模型
    if (!selectedModelId.value) {
        toast.warning("请先选择AI模型");
        return;
    }

    router.push({
        path: "/xhs/create",
        query: {
            productIds: selectedIds.value.join(","),
            modelId: selectedModelId.value,
        },
    });
};

const handlePageChange = async (p: number) => {
    if (p < 1 || p > totalPages.value) return;
    await router.push({ query: { ...route.query, page: p.toString() } });

    if (viewMode.value === "grouped") {
        await fetchProductsGrouped({ page: p, keyword: searchInput.value.trim() });
    } else {
        await fetchProducts({ page: p, keyword: searchInput.value.trim() });
    }
};

const triggerImport = () => {
    importResult.value = null;
    fileInputRef.value?.click();
};

const onFileChange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    target.value = "";
    if (!file) return;
    const ext = (file.name || "").toLowerCase();
    if (!ext.endsWith(".xlsx") && !ext.endsWith(".xls")) {
        toast.error("Only .xlsx or .xls format supported");
        return;
    }
    isImporting.value = true;
    try {
        const result = await importExcel(file);
        importResult.value = {
            success: result.success,
            skipped: result.skipped,
            failed: result.failed,
        };
        if (result.success > 0 || result.skipped > 0 || result.failed > 0) {
            toast.success(
                `Import done: success ${result.success}, skipped ${result.skipped}, failed ${result.failed}`,
            );
            if (viewMode.value === "grouped") {
                await fetchProductsGrouped({ page: 1, keyword: searchInput.value.trim() });
            } else {
                await fetchProducts({ page: 1, keyword: searchInput.value.trim() });
            }
        }
    } catch (err) {
        toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
        isImporting.value = false;
    }
};

const openLink = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
};
</script>

<template>
    <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div class="container mx-auto px-4 py-8">
            <div class="mb-8">
                <div class="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 class="mb-2 text-3xl font-bold text-gray-900 dark:text-white">
                            Product management
                        </h1>
                        <p class="text-gray-600 dark:text-gray-400">
                            Import from Miaoshou Excel, select products to generate XHS notes
                        </p>
                    </div>
                    <div class="flex flex-wrap items-center gap-3">
                        <input
                            ref="fileInputRef"
                            type="file"
                            accept=".xlsx,.xls"
                            class="hidden"
                            @change="onFileChange"
                        />
                        <UButton
                            variant="outline"
                            color="neutral"
                            :loading="isImporting"
                            @click="triggerImport"
                        >
                            <UIcon name="i-heroicons-arrow-up-tray" class="mr-1" />
                            Import Excel
                        </UButton>
                        <UButton
                            v-if="selectedIds.length === 1"
                            color="primary"
                            @click="goToSingleGenerate"
                        >
                            <UIcon name="i-heroicons-document-plus" class="mr-1" />
                            Single Generate
                        </UButton>
                        <UButton
                            v-else
                            color="primary"
                            :disabled="selectedIds.length === 0"
                            @click="goToBatchGenerate"
                        >
                            <UIcon name="i-heroicons-sparkles" class="mr-1" />
                            Batch Generate ({{ selectedIds.length }} selected)
                        </UButton>
                        <UButton
                            variant="outline"
                            color="neutral"
                            @click="
                                () => {
                                    router.push('/xhs/notes')
                                }
                            "
                        >
                            My notes
                        </UButton>
                        <UButton
                            variant="ghost"
                            color="neutral"
                            @click="
                                () => {
                                    router.push('/xhs')
                                }
                            "
                        >
                            Back to home
                        </UButton>
                    </div>
                </div>
                <div
                    v-if="importResult"
                    class="bg-primary-50 dark:bg-primary-900/20 mt-3 rounded-lg p-3 text-sm"
                >
                    Import result: success {{ importResult.success }}, skipped
                    {{ importResult.skipped }}, failed {{ importResult.failed }}
                </div>
            </div>

            <div class="mb-4 flex items-center gap-3">
                <UInput
                    v-model="searchInput"
                    placeholder="Search product name, SKU, spec..."
                    class="max-w-xs"
                    icon="i-heroicons-magnifying-glass"
                    size="md"
                />

                <!-- AI模型选择 -->
                <div class="flex items-center gap-2">
                    <label class="text-sm font-medium text-gray-700 dark:text-gray-300"
                        >AI模型:</label
                    >
                    <ModelSelect
                        v-model="selectedModelId"
                        :supported-model-types="['llm']"
                        :show-billing-rule="true"
                        :default-selected="false"
                        placeholder="选择AI模型"
                        size="sm"
                        @change="handleModelChange"
                    />
                </div>

                <div class="flex gap-2 rounded-lg border border-gray-200 p-1 dark:border-gray-700">
                    <button
                        type="button"
                        :class="[
                            'rounded px-3 py-1 text-sm transition-colors',
                            viewMode === 'grouped'
                                ? 'bg-primary-500 text-white'
                                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800',
                        ]"
                        @click="viewMode = 'grouped'"
                    >
                        <UIcon name="i-heroicons-squares-2x2" class="mr-1" />
                        Grouped
                    </button>
                    <button
                        type="button"
                        :class="[
                            'rounded px-3 py-1 text-sm transition-colors',
                            viewMode === 'list'
                                ? 'bg-primary-500 text-white'
                                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800',
                        ]"
                        @click="viewMode = 'list'"
                    >
                        <UIcon name="i-heroicons-list-bullet" class="mr-1" />
                        List
                    </button>
                </div>
            </div>

            <UCard>
                <div v-if="isLoading" class="flex justify-center py-12">
                    <UIcon
                        name="i-heroicons-arrow-path"
                        class="text-primary-500 h-8 w-8 animate-spin"
                    />
                </div>
                <div v-else-if="error" class="text-error py-8 text-center">
                    {{ error }}
                </div>
                <div v-else-if="isEmpty" class="py-12 text-center text-gray-500 dark:text-gray-400">
                    No products yet. Import Excel or upload Miaoshou SKU file first.
                </div>

                <!-- Grouped View -->
                <div v-else-if="viewMode === 'grouped'">
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-sm">
                            <thead>
                                <tr class="border-b border-gray-200 dark:border-gray-700">
                                    <th class="w-10 py-3 pr-2">
                                        <input
                                            type="checkbox"
                                            :checked="isAllSelected"
                                            @change="toggleSelectAll"
                                            class="rounded border-gray-300"
                                        />
                                    </th>
                                    <th class="w-10 py-3"></th>
                                    <th class="py-3 font-medium text-gray-700 dark:text-gray-300">
                                        Image
                                    </th>
                                    <th class="py-3 font-medium text-gray-700 dark:text-gray-300">
                                        Product Name
                                    </th>
                                    <th class="py-3 font-medium text-gray-700 dark:text-gray-300">
                                        SKUs
                                    </th>
                                    <th class="py-3 font-medium text-gray-700 dark:text-gray-300">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <template v-for="group in productGroups" :key="group.productId">
                                    <tr
                                        class="group border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"
                                    >
                                        <td class="w-10 py-2 pr-2">
                                            <input
                                                type="checkbox"
                                                :checked="isGroupSelected(group)"
                                                :indeterminate="isGroupPartiallySelected(group)"
                                                @change="toggleSelectGroup(group)"
                                                class="rounded border-gray-300"
                                            />
                                        </td>
                                        <td class="w-10 py-2">
                                            <button
                                                type="button"
                                                @click="toggleExpand(group.productId)"
                                                class="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-700"
                                            >
                                                <UIcon
                                                    :name="
                                                        isExpanded(group.productId)
                                                            ? 'i-heroicons-chevron-down'
                                                            : 'i-heroicons-chevron-right'
                                                    "
                                                    class="h-4 w-4"
                                                />
                                            </button>
                                        </td>
                                        <td class="py-2">
                                            <div class="flex gap-1">
                                                <template v-if="group.imageUrl">
                                                    <img
                                                        :src="group.imageUrl"
                                                        alt="Product"
                                                        class="h-12 w-12 rounded object-cover"
                                                        loading="lazy"
                                                        @error="
                                                            (e) =>
                                                                handleImageError(e, group.imageUrl!)
                                                        "
                                                    />
                                                </template>
                                                <span
                                                    v-else
                                                    class="flex h-12 w-12 items-center justify-center rounded bg-gray-100 text-gray-400 dark:bg-gray-700"
                                                >
                                                    <UIcon
                                                        name="i-heroicons-photo"
                                                        class="h-6 w-6"
                                                    />
                                                </span>
                                            </div>
                                        </td>
                                        <td
                                            class="max-w-[300px] truncate font-medium"
                                            :title="group.productName"
                                        >
                                            {{ group.productName }}
                                        </td>
                                        <td>
                                            <span
                                                class="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                                            >
                                                {{ group.skuCount }} SKU{{
                                                    group.skuCount > 1 ? "s" : ""
                                                }}
                                            </span>
                                        </td>
                                        <td class="py-2">
                                            <div class="flex gap-2">
                                                <button
                                                    v-if="group.sourceUrl"
                                                    type="button"
                                                    @click="openLink(group.sourceUrl)"
                                                    class="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                                                    :title="group.sourceUrl"
                                                >
                                                    <UIcon
                                                        name="i-heroicons-link"
                                                        class="h-3 w-3"
                                                    />
                                                    来源
                                                </button>
                                                <button
                                                    v-if="group.productUrl"
                                                    type="button"
                                                    @click="openLink(group.productUrl)"
                                                    class="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20"
                                                    :title="group.productUrl"
                                                >
                                                    <UIcon
                                                        name="i-heroicons-shopping-bag"
                                                        class="h-3 w-3"
                                                    />
                                                    商品
                                                </button>
                                                <span
                                                    v-if="!group.sourceUrl && !group.productUrl"
                                                    class="text-xs text-gray-400"
                                                >
                                                    -
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr
                                        v-if="isExpanded(group.productId)"
                                        class="border-b border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/30"
                                    >
                                        <td colspan="6" class="p-4">
                                            <div class="space-y-2">
                                                <div
                                                    v-for="sku in group.skus"
                                                    :key="sku.id"
                                                    class="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        :checked="selectedIds.includes(sku.id)"
                                                        @change="toggleSelect(sku.id)"
                                                        class="rounded border-gray-300"
                                                    />
                                                    <div class="flex gap-2">
                                                        <template v-if="allImages(sku).length">
                                                            <img
                                                                v-for="(url, idx) in allImages(
                                                                    sku,
                                                                ).slice(0, 3)"
                                                                :key="idx"
                                                                :src="url"
                                                                :alt="`Image ${idx + 1}`"
                                                                class="h-10 w-10 rounded object-cover"
                                                                loading="lazy"
                                                                @error="
                                                                    (e) => handleImageError(e, url)
                                                                "
                                                            />
                                                            <span
                                                                v-if="allImages(sku).length > 3"
                                                                class="flex h-10 w-10 items-center justify-center rounded bg-gray-100 text-xs text-gray-500 dark:bg-gray-700"
                                                            >
                                                                +{{ allImages(sku).length - 3 }}
                                                            </span>
                                                        </template>
                                                    </div>
                                                    <div class="flex-1">
                                                        <div
                                                            class="text-sm font-medium text-gray-900 dark:text-white"
                                                        >
                                                            SKU: {{ sku.skuCode || "-" }}
                                                        </div>
                                                        <div
                                                            class="text-xs text-gray-600 dark:text-gray-400"
                                                        >
                                                            {{ sku.spec || "No spec" }}
                                                        </div>
                                                    </div>
                                                    <div
                                                        class="text-sm text-gray-700 dark:text-gray-300"
                                                    >
                                                        ¥{{ sku.price || "-" }}
                                                    </div>
                                                    <div
                                                        class="text-sm text-gray-600 dark:text-gray-400"
                                                    >
                                                        Stock: {{ sku.stock ?? "-" }}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                </template>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- List View -->
                <div v-else>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-sm">
                            <thead>
                                <tr class="border-b border-gray-200 dark:border-gray-700">
                                    <th class="w-10 py-3 pr-2">
                                        <input
                                            type="checkbox"
                                            :checked="isAllSelected"
                                            @change="toggleSelectAll"
                                            class="rounded border-gray-300"
                                        />
                                    </th>
                                    <th class="py-3 font-medium text-gray-700 dark:text-gray-300">
                                        Image
                                    </th>
                                    <th class="py-3 font-medium text-gray-700 dark:text-gray-300">
                                        Name
                                    </th>
                                    <th class="py-3 font-medium text-gray-700 dark:text-gray-300">
                                        SKU
                                    </th>
                                    <th class="py-3 font-medium text-gray-700 dark:text-gray-300">
                                        Spec
                                    </th>
                                    <th class="py-3 font-medium text-gray-700 dark:text-gray-300">
                                        Price
                                    </th>
                                    <th class="py-3 font-medium text-gray-700 dark:text-gray-300">
                                        Stock
                                    </th>
                                    <th class="py-3 font-medium text-gray-700 dark:text-gray-300">
                                        Created
                                    </th>
                                    <th class="py-3 font-medium text-gray-700 dark:text-gray-300">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr
                                    v-for="p in products"
                                    :key="p.id"
                                    class="group border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"
                                >
                                    <td class="w-10 py-2 pr-2">
                                        <input
                                            type="checkbox"
                                            :checked="selectedIds.includes(p.id)"
                                            @change="toggleSelect(p.id)"
                                            class="rounded border-gray-300"
                                        />
                                    </td>
                                    <td class="py-2">
                                        <div class="flex gap-1">
                                            <template v-if="allImages(p).length">
                                                <img
                                                    v-for="(url, idx) in allImages(p).slice(0, 3)"
                                                    :key="idx"
                                                    :src="url"
                                                    :alt="`Image ${idx + 1}`"
                                                    class="h-12 w-12 rounded object-cover"
                                                    loading="lazy"
                                                    @error="(e) => handleImageError(e, url)"
                                                />
                                                <span
                                                    v-if="allImages(p).length > 3"
                                                    class="flex h-12 w-12 items-center justify-center rounded bg-gray-100 text-xs text-gray-500 dark:bg-gray-700"
                                                >
                                                    +{{ allImages(p).length - 3 }}
                                                </span>
                                            </template>
                                            <span
                                                v-else
                                                class="flex h-12 w-12 items-center justify-center rounded bg-gray-100 text-gray-400 dark:bg-gray-700"
                                            >
                                                <UIcon name="i-heroicons-photo" class="h-6 w-6" />
                                            </span>
                                        </div>
                                    </td>
                                    <td class="max-w-[200px] truncate font-medium" :title="p.name">
                                        {{ p.name }}
                                    </td>
                                    <td class="text-gray-600 dark:text-gray-400">
                                        {{ p.skuCode || "-" }}
                                    </td>
                                    <td
                                        class="max-w-[120px] truncate text-gray-600 dark:text-gray-400"
                                    >
                                        {{ p.spec || "-" }}
                                    </td>
                                    <td>{{ p.price ?? "-" }}</td>
                                    <td>{{ p.stock ?? "-" }}</td>
                                    <td class="whitespace-nowrap text-gray-500 dark:text-gray-400">
                                        {{
                                            p.createdAt
                                                ? new Date(p.createdAt).toLocaleDateString()
                                                : "-"
                                        }}
                                    </td>
                                    <td class="py-2">
                                        <div class="flex gap-2">
                                            <button
                                                v-if="p.sourceUrl"
                                                type="button"
                                                @click="openLink(p.sourceUrl)"
                                                class="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                                                :title="p.sourceUrl"
                                            >
                                                <UIcon name="i-heroicons-link" class="h-3 w-3" />
                                                来源
                                            </button>
                                            <button
                                                v-if="p.productUrl"
                                                type="button"
                                                @click="openLink(p.productUrl)"
                                                class="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20"
                                                :title="p.productUrl"
                                            >
                                                <UIcon
                                                    name="i-heroicons-shopping-bag"
                                                    class="h-3 w-3"
                                                />
                                                商品
                                            </button>
                                            <span
                                                v-if="!p.sourceUrl && !p.productUrl"
                                                class="text-xs text-gray-400"
                                            >
                                                -
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div
                    v-if="!isEmpty && !isLoading && totalPages > 1"
                    class="mt-4 flex items-center justify-between border-t border-gray-200 pt-4 dark:border-gray-700"
                >
                    <span class="text-sm text-gray-500">
                        Total {{ total }} items, page {{ page }} / {{ totalPages }}
                    </span>
                    <div class="flex gap-2">
                        <UButton
                            variant="outline"
                            color="neutral"
                            size="sm"
                            :disabled="page <= 1"
                            @click="handlePageChange(page - 1)"
                        >
                            Previous
                        </UButton>
                        <UButton
                            variant="outline"
                            color="neutral"
                            size="sm"
                            :disabled="page >= totalPages"
                            @click="handlePageChange(page + 1)"
                        >
                            Next
                        </UButton>
                    </div>
                </div>
            </UCard>
        </div>
    </div>
</template>
