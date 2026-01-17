<script setup lang="ts">
import type { XhsImage, XhsImageTemplate } from '@/types/xhs'

interface Props {
  /**
   * 当前封面图片列表
   */
  coverImages?: string[]
  
  /**
   * 笔记内容（用于自动配图）
   */
  noteContent?: string
}

interface Emits {
  (e: 'update:coverImages', images: string[]): void
  (e: 'close'): void
}

const props = withDefaults(defineProps<Props>(), {
  coverImages: () => [],
  noteContent: ''
})

const emit = defineEmits<Emits>()

// 当前选中的标签页
const activeTab = ref<'auto' | 'template' | 'history' | 'upload'>('auto')

// 图片列表
const images = ref<string[]>([...props.coverImages])

// 历史图片列表
const historyImages = ref<XhsImage[]>([])

// 图片模板列表
const imageTemplates = ref<XhsImageTemplate[]>([])

// 加载状态
const isLoadingHistory = ref(false)
const isLoadingTemplates = ref(false)
const isGenerating = ref(false)
const isUploading = ref(false)

// 上传进度
const uploadProgress = ref(0)

// Toast
const toast = useMessage()

// 全局状态管理
const userStore = useUserStore()

// 获取认证token
const getAuthToken = () => {
  const authToken = userStore.token || userStore.temporaryToken
  if (!authToken) {
    throw new Error('请先登录')
  }
  return authToken
}

// 当前图片索引（用于多图导航）
const currentImageIndex = ref(0)

// 计算属性：是否有多张图片
const hasMultipleImages = computed(() => images.value.length > 1)

// 计算属性：当前显示的图片
const currentImage = computed(() => {
  if (images.value.length === 0) return ''
  return images.value[currentImageIndex.value] || images.value[0]
})

// 监听 props 变化
watch(() => props.coverImages, (newImages) => {
  images.value = [...newImages]
  if (currentImageIndex.value >= images.value.length) {
    currentImageIndex.value = Math.max(0, images.value.length - 1)
  }
}, { immediate: true })

// 标签页配置
const tabs = [
  { value: 'auto' as const, label: '自动配图', icon: 'i-heroicons-sparkles' },
  { value: 'template' as const, label: '图片模板', icon: 'i-heroicons-photo' },
  { value: 'history' as const, label: '历史图片', icon: 'i-heroicons-clock' },
  { value: 'upload' as const, label: '本地上传', icon: 'i-heroicons-arrow-up-tray' }
]

// 加载历史图片
const loadHistoryImages = async () => {
  isLoadingHistory.value = true
  try {
    const authToken = getAuthToken()
    const response = await $fetch<{ items: XhsImage[] }>('/api/xhs/images/history', {
      params: { page: 1, limit: 20 },
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    })
    historyImages.value = response.items
  } catch (error) {
    console.error('Failed to load history images:', error)
    toast.error('加载历史图片失败')
  } finally {
    isLoadingHistory.value = false
  }
}

// 加载图片模板
const loadImageTemplates = async () => {
  isLoadingTemplates.value = true
  try {
    const authToken = getAuthToken()
    const response = await $fetch<{ items: XhsImageTemplate[] }>('/api/xhs/images/templates', {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    })
    imageTemplates.value = response.items
  } catch (error) {
    console.error('Failed to load image templates:', error)
    toast.error('加载图片模板失败')
  } finally {
    isLoadingTemplates.value = false
  }
}

// 切换标签页时加载数据
watch(activeTab, (newTab) => {
  if (newTab === 'history' && historyImages.value.length === 0) {
    loadHistoryImages()
  } else if (newTab === 'template' && imageTemplates.value.length === 0) {
    loadImageTemplates()
  }
})

// 自动配图
const handleAutoGenerate = async () => {
  if (!props.noteContent || !props.noteContent.trim()) {
    toast.warning('请先输入笔记内容')
    return
  }

  isGenerating.value = true
  try {
    const authToken = getAuthToken()
    const response = await $fetch<{ url: string }>('/api/xhs/images/auto', {
      method: 'POST',
      body: { content: props.noteContent },
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    })
    
    if (response.url) {
      images.value.push(response.url)
      emit('update:coverImages', images.value)
      toast.success('自动配图成功')
    }
  } catch (error) {
    console.error('Auto image generation failed:', error)
    toast.error('自动配图失败，请重试')
  } finally {
    isGenerating.value = false
  }
}

// 选择模板图片
const handleSelectTemplate = (template: XhsImageTemplate) => {
  images.value.push(template.url)
  emit('update:coverImages', images.value)
  toast.success('已添加图片')
}

// 选择历史图片
const handleSelectHistory = (image: XhsImage) => {
  images.value.push(image.url)
  emit('update:coverImages', images.value)
  toast.success('已添加图片')
}

// 文件上传
const fileInput = ref<HTMLInputElement | null>(null)

const handleUploadClick = () => {
  fileInput.value?.click()
}

const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  
  if (!file) return

  // 验证文件类型
  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  if (!validTypes.includes(file.type)) {
    toast.error('只支持 JPG、PNG、GIF、WEBP 格式的图片')
    return
  }

  // 验证文件大小（5MB）
  const maxSize = 5 * 1024 * 1024
  if (file.size > maxSize) {
    toast.error('图片大小不能超过 5MB')
    return
  }

  isUploading.value = true
  uploadProgress.value = 0

  try {
    const authToken = getAuthToken()
    const formData = new FormData()
    formData.append('file', file)

    // 模拟上传进度
    const progressInterval = setInterval(() => {
      if (uploadProgress.value < 90) {
        uploadProgress.value += 10
      }
    }, 200)

    const response = await $fetch<{ url: string }>('/api/xhs/images/upload', {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    })

    clearInterval(progressInterval)
    uploadProgress.value = 100

    if (response.url) {
      images.value.push(response.url)
      emit('update:coverImages', images.value)
      toast.success('图片上传成功')
    }
  } catch (error) {
    console.error('Image upload failed:', error)
    toast.error('图片上传失败，请重试')
  } finally {
    isUploading.value = false
    uploadProgress.value = 0
    if (target) {
      target.value = ''
    }
  }
}

// 拖拽上传
const isDragging = ref(false)

const handleDragOver = (event: DragEvent) => {
  event.preventDefault()
  isDragging.value = true
}

const handleDragLeave = () => {
  isDragging.value = false
}

const handleDrop = async (event: DragEvent) => {
  event.preventDefault()
  isDragging.value = false

  const file = event.dataTransfer?.files[0]
  if (!file) return

  // 创建一个模拟的 input change 事件
  const input = fileInput.value
  if (input) {
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(file)
    input.files = dataTransfer.files
    await handleFileChange({ target: input } as any)
  }
}

// 图片导航
const handlePrevImage = () => {
  if (currentImageIndex.value > 0) {
    currentImageIndex.value--
  }
}

const handleNextImage = () => {
  if (currentImageIndex.value < images.value.length - 1) {
    currentImageIndex.value++
  }
}

// 移除单张图片
const handleRemoveImage = (index: number) => {
  images.value.splice(index, 1)
  emit('update:coverImages', images.value)
  
  // 调整当前索引
  if (currentImageIndex.value >= images.value.length) {
    currentImageIndex.value = Math.max(0, images.value.length - 1)
  }
  
  toast.success('已移除图片')
}

// 移除所有图片
const handleRemoveAll = () => {
  images.value = []
  currentImageIndex.value = 0
  emit('update:coverImages', images.value)
  toast.success('已移除所有配图')
}

// 关闭选择器
const handleClose = () => {
  emit('close')
}
</script>

<template>
  <UModal :model-value="true" @update:model-value="handleClose">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">配图管理</h3>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-heroicons-x-mark"
            @click="handleClose"
          />
        </div>
      </template>

      <div class="space-y-4">
        <!-- 当前图片预览 -->
        <div v-if="images.length > 0" class="relative">
          <div class="aspect-video bg-gray-100 rounded-lg overflow-hidden">
            <img
              :src="currentImage"
              alt="Cover image"
              class="w-full h-full object-cover"
            />
          </div>

          <!-- 多图导航 -->
          <div v-if="hasMultipleImages" class="absolute inset-0 flex items-center justify-between px-2">
            <UButton
              icon="i-heroicons-chevron-left"
              color="neutral"
              :disabled="currentImageIndex === 0"
              @click="handlePrevImage"
            />
            <UButton
              icon="i-heroicons-chevron-right"
              color="neutral"
              :disabled="currentImageIndex === images.length - 1"
              @click="handleNextImage"
            />
          </div>

          <!-- 图片索引指示器 -->
          <div class="absolute bottom-2 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-50 text-white px-3 py-1 rounded-full text-sm">
            {{ currentImageIndex + 1 }} / {{ images.length }}
          </div>

          <!-- 移除按钮 -->
          <div class="absolute top-2 right-2 flex gap-2">
            <UButton
              icon="i-heroicons-trash"
              color="error"
              size="sm"
              @click="handleRemoveImage(currentImageIndex)"
            >
              移除此图
            </UButton>
            <UButton
              v-if="images.length > 1"
              color="error"
              variant="soft"
              size="sm"
              @click="handleRemoveAll"
            >
              移除全部
            </UButton>
          </div>
        </div>

        <!-- 标签页 -->
        <div class="border-b border-gray-200 dark:border-gray-700">
          <div class="flex space-x-1">
            <button
              v-for="tab in tabs"
              :key="tab.value"
              class="px-4 py-2 text-sm font-medium transition-colors"
              :class="activeTab === tab.value 
                ? 'border-b-2 border-primary text-primary' 
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'"
              @click="activeTab = tab.value"
            >
              <UIcon :name="tab.icon" class="inline-block mr-1" />
              {{ tab.label }}
            </button>
          </div>
        </div>

        <!-- 标签页内容 -->
        <div class="py-4">
          <!-- 自动配图 -->
          <div v-if="activeTab === 'auto'" class="space-y-4">
            <p class="text-sm text-gray-600">
              根据笔记内容自动生成匹配的配图
            </p>
            <UButton
              block
              size="lg"
              :loading="isGenerating"
              :disabled="!noteContent || !noteContent.trim()"
              @click="handleAutoGenerate"
            >
              <template #leading>
                <UIcon name="i-heroicons-sparkles" />
              </template>
              {{ isGenerating ? '生成中...' : '自动配图' }}
            </UButton>
          </div>

          <!-- 图片模板 -->
          <div v-if="activeTab === 'template'">
            <div v-if="isLoadingTemplates" class="flex justify-center py-8">
              <UIcon name="i-heroicons-arrow-path" class="animate-spin text-2xl" />
            </div>
            <div v-else-if="imageTemplates.length === 0" class="text-center py-8 text-gray-500">
              暂无图片模板
            </div>
            <div v-else class="grid grid-cols-3 gap-3">
              <div
                v-for="template in imageTemplates"
                :key="template.id"
                class="aspect-square bg-gray-100 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                @click="handleSelectTemplate(template)"
              >
                <img
                  :src="template.thumbnailUrl || template.url"
                  :alt="template.name"
                  class="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>

          <!-- 历史图片 -->
          <div v-if="activeTab === 'history'">
            <div v-if="isLoadingHistory" class="flex justify-center py-8">
              <UIcon name="i-heroicons-arrow-path" class="animate-spin text-2xl" />
            </div>
            <div v-else-if="historyImages.length === 0" class="text-center py-8 text-gray-500">
              暂无历史图片
            </div>
            <div v-else class="grid grid-cols-3 gap-3">
              <div
                v-for="image in historyImages"
                :key="image.id"
                class="aspect-square bg-gray-100 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                @click="handleSelectHistory(image)"
              >
                <img
                  :src="image.url"
                  alt="History image"
                  class="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>

          <!-- 本地上传 -->
          <div v-if="activeTab === 'upload'" class="space-y-4">
            <div
              class="border-2 border-dashed rounded-lg p-8 text-center transition-colors"
              :class="isDragging ? 'border-primary bg-primary-50' : 'border-gray-300'"
              @dragover="handleDragOver"
              @dragleave="handleDragLeave"
              @drop="handleDrop"
            >
              <input
                ref="fileInput"
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                class="hidden"
                @change="handleFileChange"
              />
              
              <UIcon
                name="i-heroicons-arrow-up-tray"
                class="mx-auto text-4xl text-gray-400 mb-3"
              />
              
              <p class="text-sm text-gray-600 mb-2">
                拖拽图片到此处，或
              </p>
              
              <UButton
                color="primary"
                variant="soft"
                :loading="isUploading"
                @click="handleUploadClick"
              >
                选择文件
              </UButton>
              
              <p class="text-xs text-gray-500 mt-3">
                支持 JPG、PNG、GIF、WEBP 格式，最大 5MB
              </p>
            </div>

            <!-- 上传进度 -->
            <div v-if="isUploading" class="space-y-2">
              <div class="flex justify-between text-sm">
                <span>上传中...</span>
                <span>{{ uploadProgress }}%</span>
              </div>
              <UProgress :value="uploadProgress" />
            </div>
          </div>
        </div>
      </div>
    </UCard>
  </UModal>
</template>
