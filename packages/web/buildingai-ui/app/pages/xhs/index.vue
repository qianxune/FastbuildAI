<script setup lang="ts">
import type { GenerationMode } from "@/types/xhs";
import { useXhsGenerate } from "@/composables/useXhsGenerate";

// Page metadata configuration
definePageMeta({
    layout: false,
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
    { icon: "🎯", title: "AI一键生成小红书笔记", color: "bg-red-50" },
    { icon: "📝", title: "批量生成小红书笔记", color: "bg-orange-50" },
    { icon: "🏆", title: "AI智能美图省时高效", color: "bg-yellow-50" },
    { icon: "📊", title: "海量图片模板随心用", color: "bg-pink-50" },
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
    <div class="min-h-screen bg-white dark:bg-gray-900">
        <!-- Main Content -->
        <div class="container mx-auto max-w-5xl px-4 py-8">
            <!-- Header Section -->
            <div class="mb-8 text-center">
                <!-- Brand Logo -->
                <div
                    class="mb-4 inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-white"
                >
                    <span class="text-lg font-bold">AI小红书</span>
                </div>

                <!-- Main Title -->
                <h1 class="mb-3 text-3xl font-bold text-gray-900 md:text-4xl dark:text-white">
                    一键「<span class="text-red-500">智创</span>」爆款小红书笔记
                </h1>

                <!-- Subtitle -->
                <p class="text-base text-gray-500 dark:text-gray-400">
                    输入你的内容主题，让AI为你服务到底
                </p>
            </div>

            <!-- Generation Card -->
            <div
                class="mb-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800"
            >
                <!-- Top Right Quick Actions -->
                <div class="mb-4 flex justify-end gap-3">
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
                <div class="mb-6 flex gap-2">
                    <button
                        v-for="m in generationModes"
                        :key="m.key"
                        @click="mode = m.key"
                        :class="[
                            'rounded-full px-6 py-2 text-sm font-medium transition-all',
                            mode === m.key
                                ? 'bg-red-500 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600',
                        ]"
                    >
                        {{ m.label }}
                    </button>
                </div>

                <!-- Input Area -->
                <div class="relative mb-4">
                    <div
                        class="flex items-center overflow-hidden rounded-xl border border-gray-200 dark:border-gray-600"
                    >
                        <input
                            v-model="content"
                            type="text"
                            :placeholder="inputPlaceholder"
                            class="flex-1 border-none bg-transparent px-4 py-4 text-base text-gray-900 placeholder-gray-400 outline-none dark:text-white"
                        />

                        <!-- Generate Button -->
                        <div
                            class="flex items-center gap-3 border-l border-gray-200 px-4 dark:border-gray-600"
                        >
                            <UButton
                                color="primary"
                                size="lg"
                                :loading="isGenerating"
                                :disabled="isInputEmpty"
                                @click="handleGenerate"
                                class="rounded-lg bg-gradient-to-r from-red-500 to-orange-500 px-6 hover:from-red-600 hover:to-orange-600"
                            >
                                {{ isGenerating ? "生成中..." : "自动生成(消耗1字)" }}
                            </UButton>
                        </div>
                    </div>
                </div>

                <!-- Bottom Actions Row -->
                <div class="flex items-center justify-between">
                    <!-- Left Options -->
                    <div class="flex items-center gap-2">
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
                            @click="goToCreateNote"
                        >
                            创建笔记
                        </UButton>
                    </div>
                </div>
            </div>

            <!-- Generated Content Display (when available) -->
            <div
                v-if="generatedTitle || generatedContent"
                class="mb-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800"
            >
                <h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">生成结果</h3>

                <!-- Title Section -->
                <div v-if="generatedTitle" class="mb-4">
                    <div class="mb-2 flex items-center justify-between">
                        <span class="text-sm text-gray-500">标题</span>
                        <UButton variant="ghost" size="xs" @click="copyTitle">复制标题</UButton>
                    </div>
                    <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-700">
                        <p class="text-lg font-semibold text-gray-900 dark:text-white">
                            {{ generatedTitle }}
                        </p>
                    </div>
                </div>

                <!-- Content Section -->
                <div v-if="generatedContent" class="mb-4">
                    <div class="mb-2 flex items-center justify-between">
                        <span class="text-sm text-gray-500">正文</span>
                        <UButton variant="ghost" size="xs" @click="copyContent">复制正文</UButton>
                    </div>
                    <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-700">
                        <div class="whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                            {{ generatedContent }}
                        </div>
                    </div>
                </div>

                <!-- Save Button -->
                <div class="flex justify-end">
                    <UButton
                        color="primary"
                        @click="handleSave"
                        :disabled="!generatedTitle || !generatedContent"
                    >
                        保存笔记
                    </UButton>
                </div>
            </div>

            <!-- Error Message -->
            <div v-if="generationError" class="mb-8 rounded-xl bg-red-50 p-4 dark:bg-red-900/20">
                <p class="text-red-600 dark:text-red-400">{{ generationError }}</p>
            </div>

            <!-- Feature Cards -->
            <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div
                    v-for="(card, index) in featureCards"
                    :key="index"
                    :class="[
                        'cursor-pointer rounded-2xl border border-gray-100 p-6 text-center transition-shadow hover:shadow-md dark:border-gray-700',
                        card.color,
                        'dark:bg-gray-800',
                    ]"
                >
                    <div class="mb-3 text-3xl">{{ card.icon }}</div>
                    <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {{ card.title }}
                    </p>
                </div>
            </div>
        </div>
    </div>
</template>
