<script setup lang="ts">
import type { GenerationMode } from "@/types/xhs";
import { xhsLayoutKey } from "@/constants/xhs-layout";
import { useXhsGenerate } from "@/composables/useXhsGenerate";

// Page metadata configuration
definePageMeta({
    layout: xhsLayoutKey,
    name: "XHS Note Generator",
    auth: true,
});

// SEO settings
useSeoMeta({
    title: "小红书爆款文章生成器",
    description: "使用AI快速生成符合小红书风格的笔记内容",
});

// Router
const router = useRouter();

// 使用XHS生成组合式函数
const {
    content,
    mode,
    generatedTitle,
    generatedContent,
    isGenerating,
    generationError,
    isInputEmpty,
    save,
    copyTitle,
    copyContent,
} = useXhsGenerate();

// 全局状态管理
const controlsStore = useControlsStore();

// Generation modes configuration
const generationModes: GenerationMode[] = [
    { key: "ai-generate", label: "AI生成", description: "基于主题完全由AI创作内容" },
    { key: "ai-compose", label: "AI仿写", description: "基于用户草稿进行扩写和优化" },
    { key: "add-emoji", label: "笔记加emoji", description: "为现有笔记内容添加表情符号" },
];

// 功能卡片配置
const featureCards = [
    {
        icon: "🎯",
        title: "AI一键生成小红书笔记",
        cardClass:
            "border-rose-100/80 bg-rose-50/90 dark:border-rose-900/35 dark:bg-rose-950/25",
    },
    {
        icon: "📝",
        title: "批量生成小红书笔记",
        cardClass:
            "border-orange-100/80 bg-orange-50/90 dark:border-orange-900/35 dark:bg-orange-950/25",
    },
    {
        icon: "🏆",
        title: "AI智能美图省时高效",
        cardClass:
            "border-amber-100/80 bg-amber-50/90 dark:border-amber-900/35 dark:bg-amber-950/25",
    },
    {
        icon: "📊",
        title: "海量图片模板随心用",
        cardClass:
            "border-pink-100/80 bg-pink-50/90 dark:border-pink-900/35 dark:bg-pink-950/25",
    },
];

// 获取输入框占位符文本
const inputPlaceholder = computed(() => {
    switch (mode.value) {
        case "ai-generate":
            return "美食探店看！这些好吃到爆的餐厅你去过几家";
        case "ai-compose":
            return "请输入你的草稿内容，AI将帮你扩写和优化";
        case "add-emoji":
            return "请输入需要添加emoji的笔记内容";
        default:
            return "请输入内容";
    }
});

// 处理模型选择变化
const handleModelChange = (model: any) => {
    controlsStore.setSelectedModel(model);
};

// 处理生成按钮点击 - 跳转到创建页面并开始生成
const handleGenerate = async () => {
    if (isInputEmpty.value) return;

    // 跳转到创建页面，传递输入内容和模式
    router.push({
        path: "/xhs/create",
        query: {
            content: content.value,
            mode: mode.value,
            autoGenerate: "true",
        },
    });
};

// 处理保存按钮点击
const handleSave = async () => {
    await save();
};

// 跳转到我的笔记页面
const goToMyNotes = () => {
    router.push("/xhs/notes");
};

// 跳转到创建笔记页面
const goToCreateNote = () => {
    router.push("/xhs/create");
};

// 跳转到商品管理
const goToProductManage = () => {
    router.push("/xhs/products");
};

// 跳转到模板笔记
const goToTemplates = () => {
    // TODO: 实现模板笔记功能
};

// 跳转到批量生成
const goToBatchGenerate = () => {
    // TODO: 实现批量生成功能
};
</script>

<template>
    <div>
        <!-- Main Content -->
        <div class="container mx-auto max-w-5xl px-4 py-10 md:py-12">
            <!-- Header Section -->
            <header class="mb-10 text-center md:mb-12">
                <!-- Brand Logo -->
                <div
                    class="mb-5 inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-white shadow-[var(--xhs-shadow-card)]"
                    style="background-color: var(--xhs-brand)"
                >
                    <span class="text-lg font-bold tracking-tight">AI小红书</span>
                </div>

                <!-- Main Title -->
                <h1
                    class="mb-4 text-3xl font-bold tracking-tight md:text-4xl"
                    style="color: var(--xhs-text)"
                >
                    一键「<span style="color: var(--xhs-brand)">智创</span>」爆款小红书笔记
                </h1>

                <!-- Subtitle -->
                <p class="text-lg" style="color: var(--xhs-text-muted)">
                    输入你的内容主题，让AI为你服务到底
                </p>
            </header>

            <!-- Generation Card -->
            <section
                class="mb-10 rounded-2xl border p-6 md:mb-12 md:p-8"
                style="
                    border-color: var(--xhs-border);
                    background: var(--xhs-card);
                    box-shadow: var(--xhs-shadow-card);
                "
            >
                <!-- Top Right Quick Actions -->
                <div class="mb-5 flex justify-end gap-3">
                    <UButton variant="ghost" color="neutral" size="sm" @click="goToTemplates">
                        <UIcon name="i-heroicons-document-duplicate" class="mr-1" />
                        模板笔记
                    </UButton>
                    <UButton variant="ghost" color="neutral" size="sm" @click="goToBatchGenerate">
                        <UIcon name="i-heroicons-squares-plus" class="mr-1" />
                        批量生成
                    </UButton>
                </div>

                <!-- Mode Selection Tabs -->
                <div class="mb-6 flex flex-wrap gap-2">
                    <button
                        v-for="m in generationModes"
                        :key="m.key"
                        @click="mode = m.key"
                        :class="[
                            'rounded-full px-5 py-2.5 text-sm font-semibold transition-all',
                            mode === m.key
                                ? 'bg-[color:var(--xhs-brand)] text-white shadow-sm'
                                : 'bg-[color:var(--xhs-muted-bg)] text-[color:var(--xhs-text-muted)] hover:bg-[color:var(--xhs-hover-bg)]',
                        ]"
                    >
                        {{ m.label }}
                    </button>
                </div>

                <!-- Input Area -->
                <div class="relative mb-5">
                    <div
                        class="flex items-center overflow-hidden rounded-2xl border"
                        style="border-color: var(--xhs-border)"
                    >
                        <input
                            v-model="content"
                            type="text"
                            :placeholder="inputPlaceholder"
                            class="min-w-0 flex-1 border-none bg-transparent px-4 py-4 text-base outline-none placeholder:text-[color:var(--xhs-text-soft)]"
                            style="color: var(--xhs-text)"
                        />

                        <!-- Generate Button -->
                        <div
                            class="flex shrink-0 items-center gap-3 border-l px-4"
                            style="border-color: var(--xhs-border)"
                        >
                            <UButton
                                color="primary"
                                size="lg"
                                :loading="isGenerating"
                                :disabled="isInputEmpty"
                                @click="handleGenerate"
                                class="rounded-xl bg-gradient-to-r px-6 from-[color:var(--xhs-brand)] to-[color:var(--xhs-brand-2)] hover:from-[color:var(--xhs-brand-hover)] hover:to-[color:var(--xhs-brand-2-hover)]"
                            >
                                {{ isGenerating ? "生成中..." : "自动生成(消耗1字)" }}
                            </UButton>
                        </div>
                    </div>
                </div>

                <!-- Bottom Actions Row -->
                <div class="flex flex-wrap items-center justify-between gap-4">
                    <!-- Left Options -->
                    <div class="flex flex-wrap items-center gap-2">
                        <UButton variant="outline" color="neutral" size="sm" class="rounded-full">
                            Pro(简单问答)
                        </UButton>
                        <UButton variant="outline" color="neutral" size="sm" class="rounded-full">
                            图片模板
                        </UButton>
                        <UButton variant="outline" color="neutral" size="sm" class="rounded-full">
                            自动配图
                        </UButton>

                        <!-- AI Model Selection -->
                        <div class="ml-2">
                            <ModelSelect
                                :supportedModelTypes="['llm']"
                                :show-billingRule="true"
                                :open-local-storage="true"
                                placeholder="选择AI模型"
                                size="sm"
                                @change="handleModelChange"
                            />
                        </div>
                    </div>

                    <!-- Right Actions -->
                    <div class="flex gap-3">
                        <UButton variant="outline" color="neutral" size="sm" @click="goToMyNotes">
                            我的笔记
                        </UButton>
                        <UButton
                            variant="outline"
                            color="neutral"
                            size="sm"
                            @click="goToProductManage"
                        >
                            商品管理
                        </UButton>
                        <UButton
                            variant="outline"
                            color="neutral"
                            size="sm"
                            @click="goToCreateNote"
                        >
                            创建笔记
                        </UButton>
                    </div>
                </div>
            </section>

            <!-- Generated Content Display (when available) -->
            <section
                v-if="generatedTitle || generatedContent"
                class="mb-10 rounded-2xl border p-6 md:mb-12 md:p-8"
                style="
                    border-color: var(--xhs-border);
                    background: var(--xhs-card);
                    box-shadow: var(--xhs-shadow-card);
                "
            >
                <h3 class="mb-5 text-xl font-semibold tracking-tight" style="color: var(--xhs-text)">
                    生成结果
                </h3>

                <!-- Title Section -->
                <div v-if="generatedTitle" class="mb-5">
                    <div class="mb-2 flex items-center justify-between gap-3">
                        <span class="text-sm font-medium" style="color: var(--xhs-text-muted)">标题</span>
                        <UButton variant="ghost" size="xs" @click="copyTitle">复制标题</UButton>
                    </div>
                    <div class="rounded-xl p-4" style="background: var(--xhs-muted-bg)">
                        <p class="text-lg font-semibold leading-snug" style="color: var(--xhs-text)">
                            {{ generatedTitle }}
                        </p>
                    </div>
                </div>

                <!-- Content Section -->
                <div v-if="generatedContent" class="mb-5">
                    <div class="mb-2 flex items-center justify-between gap-3">
                        <span class="text-sm font-medium" style="color: var(--xhs-text-muted)">正文</span>
                        <UButton variant="ghost" size="xs" @click="copyContent">复制正文</UButton>
                    </div>
                    <div class="rounded-xl p-4" style="background: var(--xhs-muted-bg)">
                        <div
                            class="whitespace-pre-wrap text-base leading-relaxed"
                            style="color: var(--xhs-text)"
                        >
                            {{ generatedContent }}
                        </div>
                    </div>
                </div>

                <!-- Save Button -->
                <div class="flex justify-end pt-1">
                    <UButton
                        color="primary"
                        @click="handleSave"
                        :disabled="!generatedTitle || !generatedContent"
                    >
                        保存笔记
                     </UButton>
                </div>
            </section>

            <!-- Error Message -->
            <div v-if="generationError" class="mb-10 rounded-xl bg-red-50 p-4 dark:bg-red-900/20 md:mb-12">
                <p class="text-sm font-medium text-red-700 dark:text-red-300">{{ generationError }}</p>
            </div>

            <!-- Feature Cards -->
            <section class="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6" aria-label="功能入口">
                <div
                    v-for="(card, index) in featureCards"
                    :key="index"
                    :class="[
                        'cursor-pointer rounded-2xl border p-6 text-center shadow-[var(--xhs-shadow-card)] transition-shadow hover:shadow-[var(--xhs-shadow-card-hover)] focus-within:ring-2 focus-within:ring-[color:var(--xhs-brand)]/25',
                        card.cardClass,
                    ]"
                >
                    <div class="mb-3 text-3xl" aria-hidden="true">{{ card.icon }}</div>
                    <p class="text-sm font-semibold" style="color: var(--xhs-text)">
                        {{ card.title }}
                    </p>
                </div>
            </section>
        </div>
    </div>
</template>
