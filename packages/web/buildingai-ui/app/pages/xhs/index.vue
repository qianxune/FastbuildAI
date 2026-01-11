<script setup lang="ts">
import type { GenerationMode } from '@/types/xhs'
import { useXhsGenerate } from '@/composables/useXhsGenerate'

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

// 使用XHS生成组合式函数
const {
    content,
    mode,
    generatedTitle,
    generatedContent,
    isGenerating,
    generationError,
    generationProgress,
    isInputEmpty,
    characterCount,
    selectedModel,
    generate,
    regenerate,
    save,
    clearInput,
    clearGenerated,
    copyTitle,
    copyContent
} = useXhsGenerate()

// 全局状态管理
const controlsStore = useControlsStore()

// Generation modes configuration
const generationModes: GenerationMode[] = [
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

// 获取当前模式的描述
const currentModeDescription = computed(() => {
    return generationModes.find((m: GenerationMode) => m.key === mode.value)?.description || ''
})

// 获取输入框占位符文本
const inputPlaceholder = computed(() => {
    switch (mode.value) {
        case 'ai-generate':
            return '请输入主题，例如：分享一个超好用的护肤品'
        case 'ai-compose':
            return '请输入你的草稿内容，AI将帮你扩写和优化'
        case 'add-emoji':
            return '请输入需要添加emoji的笔记内容'
        default:
            return '请输入内容'
    }
})

// 字符计数颜色
const characterCountColor = computed(() => {
    if (characterCount.value > 2000) {
        return 'text-red-500'
    } else if (characterCount.value > 1800) {
        return 'text-yellow-500'
    }
    return 'text-gray-500'
})

// 输入验证状态
const inputValidationError = computed(() => {
    if (content.value.length > 2000) {
        return '输入内容不能超过2000个字符'
    }
    if (content.value.length > 0 && !/.*\S.*/.test(content.value)) {
        return '输入内容不能只包含空白字符'
    }
    if (!selectedModel.value?.id && content.value.trim()) {
        return '请选择AI模型'
    }
    return ''
})

// 处理模型选择变化
const handleModelChange = (model: any) => {
    // 更新全局状态中的选中模型
    controlsStore.setSelectedModel(model)
}

// 处理生成按钮点击
const handleGenerate = async () => {
    await generate()
}

// 处理重新生成
const handleRegenerate = async () => {
    await regenerate()
}

// 处理保存按钮点击
const handleSave = async () => {
    await save()
}

// 调试模型配置
const debugModel = async () => {
    if (!selectedModel.value?.id) {
        console.error('没有选择模型')
        return
    }

    try {
        const response = await fetch(`/api/xhs/debug/model/${selectedModel.value.id}`)
        const result = await response.json()
        console.log('模型调试结果:', result)
        
        if (result.success) {
            console.log('模型配置正常:', result.model)
        } else {
            console.error('模型配置错误:', result.message)
        }
    } catch (error) {
        console.error('调试请求失败:', error)
    }
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
                                    :items="generationModes.map(m => ({ value: m.key, label: m.label }))"
                                    class="w-full"
                                />
                                
                                <!-- Mode Description -->
                                <div class="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                    <p class="text-sm text-blue-700 dark:text-blue-300">
                                        {{ currentModeDescription }}
                                    </p>
                                </div>
                            </div>

                            <!-- Model Selection -->
                            <div class="mb-6">
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    选择AI模型
                                </label>
                                <ModelSelect
                                    :supportedModelTypes="['llm']"
                                    :show-billingRule="true"
                                    :open-local-storage="true"
                                    placeholder="选择AI模型开始生成"
                                    @change="handleModelChange"
                                />
                                
                                <!-- Debug Button (temporary) -->
                                <div class="mt-2" v-if="selectedModel?.id">
                                    <UButton
                                        variant="ghost"
                                        size="xs"
                                        color="neutral"
                                        @click="debugModel"
                                    >
                                        调试模型配置 ({{ selectedModel.id }})
                                    </UButton>
                                </div>
                            </div>

                            <!-- Input Area -->
                            <div class="space-y-4">
                                <div class="relative">
                                    <UTextarea
                                        v-model="content"
                                        :placeholder="inputPlaceholder"
                                        :rows="8"
                                        class="w-full resize-none"
                                        :ui="{ base: 'w-full' }"
                                    />
                                    
                                    <!-- Character Count -->
                                    <div class="absolute bottom-3 right-3 text-sm" :class="characterCountColor">
                                        {{ characterCount }}/2000
                                    </div>
                                </div>

                                <!-- Input Validation Error -->
                                <div v-if="inputValidationError" class="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                                    <p class="text-sm text-yellow-700 dark:text-yellow-300">
                                        {{ inputValidationError }}
                                    </p>
                                </div>

                                <!-- Error Message -->
                                <div v-if="generationError" class="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                                    <div class="flex justify-between items-center">
                                        <p class="text-sm text-red-700 dark:text-red-300">
                                            {{ generationError }}
                                        </p>
                                        <UButton
                                            variant="ghost"
                                            size="xs"
                                            color="error"
                                            @click="handleGenerate"
                                            :disabled="isInputEmpty || isGenerating"
                                        >
                                            重试
                                        </UButton>
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

                                    <div class="flex gap-2">
                                        <UButton
                                            v-if="generatedTitle || generatedContent"
                                            variant="outline"
                                            color="primary"
                                            size="lg"
                                            @click="handleRegenerate"
                                            :disabled="isInputEmpty || isGenerating"
                                        >
                                            重新生成
                                        </UButton>

                                        <UButton
                                            color="primary"
                                            size="lg"
                                            :loading="isGenerating"
                                            :disabled="isInputEmpty || !!inputValidationError"
                                            @click="handleGenerate"
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
                                <!-- Progress Message -->
                                <div v-if="generationProgress" class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                    <p class="text-sm text-blue-700 dark:text-blue-300">
                                        {{ generationProgress }}
                                    </p>
                                </div>
                                
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
                                    <div class="flex justify-between items-center">
                                        <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">标题</h3>
                                        <UButton
                                            variant="ghost"
                                            size="xs"
                                            @click="copyTitle"
                                        >
                                            复制标题
                                        </UButton>
                                    </div>
                                    <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                        <p class="text-lg font-semibold">{{ generatedTitle }}</p>
                                    </div>
                                </div>

                                <!-- Content Section -->
                                <div v-if="generatedContent" class="space-y-2">
                                    <div class="flex justify-between items-center">
                                        <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">正文</h3>
                                        <UButton
                                            variant="ghost"
                                            size="xs"
                                            @click="copyContent"
                                        >
                                            复制正文
                                        </UButton>
                                    </div>
                                    <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                        <div class="whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                                            {{ generatedContent }}
                                        </div>
                                    </div>
                                </div>

                                <!-- Action Buttons -->
                                <div class="flex gap-2">
                                    <UButton
                                        variant="outline"
                                        color="primary"
                                        @click="clearGenerated"
                                    >
                                        清空结果
                                    </UButton>
                                    
                                    <UButton
                                        color="primary"
                                        @click="handleSave"
                                        :disabled="!generatedTitle || !generatedContent"
                                    >
                                        保存笔记
                                    </UButton>
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