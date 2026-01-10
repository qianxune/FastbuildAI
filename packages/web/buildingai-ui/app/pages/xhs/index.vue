<script setup lang="ts">
// Page metadata configuration
definePageMeta({
    layout: "default",
    name: "XHS Note Generator",
    auth: true, // Require authentication as per requirements
});

// SEO settings
useSeoMeta({
    title: "小红书爆款文章生成器",
    description: "使用AI快速生成符合小红书风格的笔记内容",
});

// Reactive state for the generation page
const content = ref('')
const mode = ref('ai-generate')
const generatedTitle = ref('')
const generatedContent = ref('')
const isGenerating = ref(false)

// Character count for input
const characterCount = computed(() => content.value.length)

// Check if input is empty or whitespace only
const isInputEmpty = computed(() => content.value.trim() === '')

// Generation modes configuration
const generationModes = [
    {
        key: 'ai-generate',
        label: 'AI生成',
        description: '基于主题完全由AI创作内容'
    },
    {
        key: 'ai-compose',
        label: 'AI作文',
        description: '基于用户草稿进行扩写和优化'
    },
    {
        key: 'add-emoji',
        label: '笔记加emoji',
        description: '为现有笔记内容添加表情符号'
    }
]

// Clear input content
const clearInput = () => {
    content.value = ''
}

// Generate content (placeholder for now)
const generateContent = async () => {
    if (isInputEmpty.value) {
        return
    }
    
    isGenerating.value = true
    // TODO: Implement actual generation logic in later tasks
    setTimeout(() => {
        isGenerating.value = false
    }, 2000)
}
</script>

<template>
    <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div class="container mx-auto px-4 py-8">
            <!-- Page Header -->
            <div class="mb-8 text-center">
                <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                    小红书爆款文章生成器
                </h1>
                <p class="text-gray-600 dark:text-gray-400">
                    使用AI快速生成符合小红书风格的笔记内容，让你的创作更加高效
                </p>
            </div>

            <div class="max-w-6xl mx-auto">
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <!-- Input Section -->
                    <div class="space-y-6">
                        <UCard class="p-6">
                            <template #header>
                                <h2 class="text-xl font-semibold">内容输入</h2>
                            </template>

                            <!-- Mode Selection -->
                            <div class="mb-6">
                                <UTabs 
                                    v-model="mode" 
                                    :items="generationModes.map(m => ({ key: m.key, label: m.label }))"
                                    class="w-full"
                                />
                                
                                <!-- Mode Description -->
                                <div class="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                    <p class="text-sm text-blue-700 dark:text-blue-300">
                                        {{ generationModes.find(m => m.key === mode)?.description }}
                                    </p>
                                </div>
                            </div>

                            <!-- Input Area -->
                            <div class="space-y-4">
                                <div class="relative">
                                    <UTextarea
                                        v-model="content"
                                        :placeholder="mode === 'ai-generate' ? '请输入主题，例如：分享一个超好用的护肤品' : mode === 'ai-compose' ? '请输入你的草稿内容，AI将帮你扩写和优化' : '请输入需要添加emoji的笔记内容'"
                                        :rows="8"
                                        class="w-full resize-none"
                                        :ui="{ base: 'w-full' }"
                                    />
                                    
                                    <!-- Character Count -->
                                    <div class="absolute bottom-3 right-3 text-sm text-gray-500">
                                        {{ characterCount }}/2000
                                    </div>
                                </div>

                                <!-- Action Buttons -->
                                <div class="flex justify-between items-center">
                                    <UButton
                                        variant="ghost"
                                        color="neutral"
                                        size="sm"
                                        @click="clearInput"
                                        :disabled="isInputEmpty"
                                    >
                                        清空
                                    </UButton>

                                    <UButton
                                        color="primary"
                                        size="lg"
                                        :loading="isGenerating"
                                        :disabled="isInputEmpty"
                                        @click="generateContent"
                                    >
                                        <template v-if="isGenerating">
                                            生成中...
                                        </template>
                                        <template v-else>
                                            自动生成(消耗1字)
                                        </template>
                                    </UButton>
                                </div>
                            </div>
                        </UCard>
                    </div>

                    <!-- Output Section -->
                    <div class="space-y-6">
                        <UCard class="p-6">
                            <template #header>
                                <h2 class="text-xl font-semibold">生成结果</h2>
                            </template>

                            <!-- Loading Skeleton -->
                            <div v-if="isGenerating" class="space-y-4">
                                <div class="space-y-2">
                                    <USkeleton class="h-4 w-3/4" />
                                    <USkeleton class="h-4 w-1/2" />
                                </div>
                                <div class="space-y-2">
                                    <USkeleton class="h-4 w-full" />
                                    <USkeleton class="h-4 w-full" />
                                    <USkeleton class="h-4 w-3/4" />
                                    <USkeleton class="h-4 w-5/6" />
                                    <USkeleton class="h-4 w-2/3" />
                                </div>
                            </div>

                            <!-- Generated Content Display -->
                            <div v-else-if="generatedTitle || generatedContent" class="space-y-6">
                                <!-- Title Section -->
                                <div v-if="generatedTitle" class="space-y-2">
                                    <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">标题</h3>
                                    <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                        <p class="text-lg font-semibold">{{ generatedTitle }}</p>
                                    </div>
                                 </div>

                                <!-- Content Section -->
                                <div v-if="generatedContent" class="space-y-2">
                                    <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">正文</h3>
                                    <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                        <div class="whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                                            {{ generatedContent }}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Empty State -->
                            <div v-else class="text-center py-12">
                                <div class="text-gray-400 mb-4">
                                    <UIcon name="i-heroicons-document-text" class="w-16 h-16 mx-auto" />
                                </div>
                                <p class="text-gray-500 dark:text-gray-400">
                                    输入内容并点击生成按钮，AI将为你创作精彩的小红书笔记
                                </p>
                            </div>
                        </UCard>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>