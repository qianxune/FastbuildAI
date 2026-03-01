<script setup lang="ts">
import type { XhsProduct } from '@/types/xhs'

interface Props {
  isOpen: boolean
  title: string
  content: string
  product: XhsProduct
}

interface Emits {
  (e: 'close'): void
  (e: 'publish'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const handleClose = () => {
  emit('close')
}

const handlePublish = () => {
  emit('publish')
}
</script>

<template>
  <UModal :model-value="props.isOpen" @update:model-value="handleClose">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">笔记详情</h3>
          <UButton
            variant="ghost"
            color="neutral"
            icon="i-heroicons-x-mark"
            @click="handleClose"
          />
        </div>
      </template>

      <div class="space-y-6">
        <!-- 商品信息 -->
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <h4 class="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">关联商品</h4>
          <div class="flex items-center gap-4">
            <img
              v-if="props.product.imageUrl"
              :src="props.product.imageUrl"
              :alt="props.product.name"
              class="h-20 w-20 rounded object-cover"
            />
            <div
              v-else
              class="flex h-20 w-20 items-center justify-center rounded bg-gray-100 dark:bg-gray-700"
            >
              <UIcon name="i-heroicons-photo" class="h-10 w-10 text-gray-400" />
            </div>
            <div class="flex-1">
              <p class="font-medium text-gray-900 dark:text-white">
                {{ props.product.name }}
              </p>
              <p v-if="props.product.spec" class="text-sm text-gray-600 dark:text-gray-400">
                {{ props.product.spec }}
              </p>
              <p v-if="props.product.price" class="mt-1 text-sm font-medium text-primary-600">
                ¥{{ props.product.price }}
              </p>
            </div>
          </div>
        </div>

        <!-- 笔记标题 -->
        <div>
          <h4 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">标题</h4>
          <div
            class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800"
          >
            <p class="text-gray-900 dark:text-white">{{ props.title }}</p>
          </div>
        </div>

        <!-- 笔记内容 -->
        <div>
          <h4 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">正文</h4>
          <div
            class="max-h-96 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800"
          >
            <p class="whitespace-pre-wrap text-gray-900 dark:text-white">{{ props.content }}</p>
          </div>
        </div>

        <!-- 商品图片预览 -->
        <div v-if="props.product.imageUrl || props.product.extraImages?.length">
          <h4 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">商品图片</h4>
          <div class="grid grid-cols-3 gap-3">
            <img
              v-if="props.product.imageUrl"
              :src="props.product.imageUrl"
              :alt="props.product.name"
              class="h-32 w-full rounded object-cover"
            />
            <img
              v-for="(img, idx) in props.product.extraImages"
              :key="idx"
              :src="img"
              :alt="`${props.product.name} - ${idx + 1}`"
              class="h-32 w-full rounded object-cover"
            />
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton variant="outline" color="neutral" @click="handleClose"> 关闭 </UButton>
          <UButton color="primary" @click="handlePublish">
            <UIcon name="i-heroicons-paper-airplane" class="mr-1" />
            发布到小红书
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
