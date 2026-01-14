<script setup lang="ts">
import { useXhsGenerate } from '@/composables/useXhsGenerate'

definePageMeta({
    layout: false,
    name: "XHS Note Create",
    auth: true,
});

useSeoMeta({
    title: "创建笔记 - 小红书",
    description: "创建和编辑小红书笔记",
});

const route = useRoute()
const router = useRouter()
const toast = useMessage()

// 全局状态管理
const userStore = useUserStore()

// 使用生成组合式函数
const {
    content,
    mode,
    generatedTitle,
    generatedContent,
    isGenerating,
    generationError,
    generate,
    save,
} = useXhsGenerate()

// 编辑器状态
const noteTitle = ref('')
const noteContent = ref('')
const activeMenu = ref('template')
const showPreview = ref(false)
const wordCount = computed(() => noteContent.value.length)

// 编辑模式状态
const isEditMode = ref(false)
const editingNoteId = ref<string | null>(null)
const isLoadingNote = ref(false)
const isSaving = ref(false)

// 菜单配置
const menuItems = [
    { key: 'template', label: '模版', icon: 'i-heroicons-document-text' },
    { key: 'format', label: '格式', icon: 'i-heroicons-pencil-square' },
    { key: 'emoji', label: '表情', icon: 'i-heroicons-face-smile' },
    { key: 'topic', label: '话题', icon: 'i-heroicons-hashtag' },
    { key: 'library', label: '文案库', icon: 'i-heroicons-book-open' },
]

// 模版分类
const templateCategories = [
    { key: 'beauty', label: '美妆', color: 'bg-purple-100 text-purple-700' },
    { key: 'ootd', label: 'OOTD', color: 'bg-blue-100 text-blue-700' },
    { key: 'share', label: '好物分享', color: 'bg-orange-100 text-orange-700' },
    { key: 'explore', label: '探店', color: 'bg-red-100 text-red-700' },
    { key: 'food', label: '美食', color: 'bg-yellow-100 text-yellow-700' },
    { key: 'pet', label: '萌宠', color: 'bg-pink-100 text-pink-700' },
    { key: 'daily', label: '日常', color: 'bg-green-100 text-green-700' },
]

// 示例模版内容
const sampleTemplates = [
    {
        title: '【美妆行业深度解析】把握美...',
        preview: '市场现状 - 美妆行业正以前所未有的速度发展，不仅关于美丽，更是经济和文化自信的体现...',
        category: 'beauty'
    },
    {
        title: '新手化妆正确步骤敲详细...',
        preview: '化妆前必须要做的护肤步骤：爽肤水、面部精华、眼霜、乳液/面霜...',
        category: 'beauty'
    },
    {
        title: '古代美妆秘籍：化妆步骤一网...',
        preview: '嘿，姑娘们！你们有没有想过古代女子是怎么化妆的呢？来，我今天就来给你们揭秘一下！',
        category: 'beauty'
    },
    {
        title: '绝美色号安利',
        preview: '承包我的一整个春夏 #今日妆容 #色号评测',
        category: 'beauty'
    },
]

// 表情列表
const emojiList = [':)', ':D', '<3', '*_*', '^_^', 'XD', ':P', ';)', ':O', '(Y)']

// 话题列表
const topicList = ['#今日妆容', '#好物分享', '#穿搭日记', '#美食探店', '#旅行日记', '#日常vlog', '#护肤心得', '#减肥打卡', '#健身日记', '#读书笔记']

// 页面加载时检查是否需要自动生成或加载已有笔记
onMounted(async () => {
    const queryContent = route.query.content as string
    const queryMode = route.query.mode as string
    const autoGenerate = route.query.autoGenerate as string
    const noteId = route.query.noteId as string
    
    // 如果有noteId，则加载已有笔记进行编辑
    if (noteId) {
        await loadNote(noteId)
        return
    }
    
    if (queryContent) {
        content.value = queryContent
    }
    if (queryMode) {
        mode.value = queryMode as 'ai-generate' | 'ai-compose' | 'add-emoji'
    }
    
    // 如果需要自动生成
    if (autoGenerate === 'true' && queryContent) {
        await handleGenerate()
    }
})

// 加载已有笔记
const loadNote = async (noteId: string) => {
    isLoadingNote.value = true
    isEditMode.value = true
    editingNoteId.value = noteId
    
    try {
        const authToken = userStore.token || userStore.temporaryToken
        if (!authToken) {
            throw new Error('请先登录')
        }
        
        const response = await fetch(`/api/xhs/notes/${noteId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
        })
        
        if (!response.ok) {
            throw new Error('获取笔记失败')
        }
        
        const responseData = await response.json()
        const note = responseData.data || responseData
        
        noteTitle.value = note.title || ''
        noteContent.value = note.content || ''
        mode.value = note.mode || 'ai-generate'
        
    } catch (error: any) {
        console.error('加载笔记失败:', error)
        toast.error(error.message || '加载笔记失败')
    } finally {
        isLoadingNote.value = false
    }
}

// 监听生成结果，自动填充到编辑器
watch([generatedTitle, generatedContent], ([title, contentVal]) => {
    if (title) noteTitle.value = title
    if (contentVal) noteContent.value = contentVal
})

// 处理生成
const handleGenerate = async () => {
    await generate()
}

// 复制标题
const handleCopyTitle = async () => {
    if (!noteTitle.value) {
        toast.warning('没有可复制的标题')
        return
    }
    await navigator.clipboard.writeText(noteTitle.value)
    toast.success('标题已复制')
}

// 复制正文
const handleCopyContent = async () => {
    if (!noteContent.value) {
        toast.warning('没有可复制的正文')
        return
    }
    await navigator.clipboard.writeText(noteContent.value)
    toast.success('正文已复制')
}

// 保存笔记
const handleSave = async () => {
    if (!noteTitle.value || !noteContent.value) {
        toast.warning('请填写标题和正文')
        return
    }
    
    isSaving.value = true
    
    try {
        const authToken = userStore.token || userStore.temporaryToken
        if (!authToken) {
            throw new Error('请先登录')
        }
        
        if (isEditMode.value && editingNoteId.value) {
            // 更新已有笔记
            const response = await fetch(`/api/web/xhs/notes/${editingNoteId.value}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: noteTitle.value,
                    content: noteContent.value,
                }),
            })
            
            if (!response.ok) {
                throw new Error('更新笔记失败')
            }
            
            toast.success('笔记已更新')
        } else {
            // 创建新笔记
            generatedTitle.value = noteTitle.value
            generatedContent.value = noteContent.value
            
            await save()
            toast.success('笔记已保存')
        }
    } catch (error: any) {
        console.error('保存笔记失败:', error)
        toast.error(error.message || '保存失败')
    } finally {
        isSaving.value = false
    }
}

// 预览笔记
const handlePreview = () => {
    showPreview.value = true
}

// 清空笔记
const handleClear = () => {
    noteTitle.value = ''
    noteContent.value = ''
}

// 插入模版
const insertTemplate = (template: { title: string; preview: string }) => {
    noteTitle.value = template.title
    noteContent.value = template.preview
}

// 插入表情
const insertEmoji = (emoji: string) => {
    noteContent.value += emoji
}

// 插入话题
const insertTopic = (topic: string) => {
    noteContent.value += ' ' + topic + ' '
}

// 返回首页
const goBack = () => {
    router.push('/xhs')
}

// 跳转到我的笔记
const goToMyNotes = () => {
    router.push('/xhs/notes')
}
</script>

<template>
    <div class="h-screen flex bg-gray-50 dark:bg-gray-900">
        <!-- 1. 左侧菜单栏 -->
        <div class="w-20 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center py-4">
            <button
                v-for="item in menuItems"
                :key="item.key"
                @click="activeMenu = item.key"
                :class="[
                    'w-16 h-16 flex flex-col items-center justify-center rounded-lg mb-2 transition-colors',
                    activeMenu === item.key 
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' 
                        : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                ]"
            >
                <UIcon :name="item.icon" class="text-xl mb-1" />
                <span class="text-xs">{{ item.label }}</span>
            </button>
            
            <div class="flex-1"></div>
            
            <!-- 底部菜单 -->
            <button 
                @click="goToMyNotes"
                class="w-16 h-16 flex flex-col items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
                <UIcon name="i-heroicons-document-text" class="text-xl mb-1" />
                <span class="text-xs">我的笔记</span>
            </button>
            <button 
                @click="goBack"
                class="w-16 h-16 flex flex-col items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
                <UIcon name="i-heroicons-home" class="text-xl mb-1" />
                <span class="text-xs">返回首页</span>
            </button>
        </div>

        <!-- 2. 菜单内容区域 -->
        <div class="w-72 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
            <!-- 模版内容 -->
            <div v-if="activeMenu === 'template'" class="p-4">
                <div class="flex flex-wrap gap-2 mb-4">
                    <button
                        v-for="cat in templateCategories"
                        :key="cat.key"
                        :class="['px-3 py-1 rounded-full text-sm', cat.color]"
                    >
                        {{ cat.label }}
                    </button>
                </div>
                
                <div class="space-y-3">
                    <div
                        v-for="(tpl, idx) in sampleTemplates"
                        :key="idx"
                        @click="insertTemplate(tpl)"
                        class="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                    >
                        <h4 class="font-medium text-sm text-gray-900 dark:text-white mb-1 line-clamp-1">{{ tpl.title }}</h4>
                        <p class="text-xs text-gray-500 dark:text-gray-400 line-clamp-3">{{ tpl.preview }}</p>
                    </div>
                </div>
            </div>

            <!-- 格式内容 -->
            <div v-else-if="activeMenu === 'format'" class="p-4">
                <h3 class="font-medium mb-3 text-gray-900 dark:text-white">文本格式</h3>
                <div class="space-y-2">
                    <button class="w-full text-left px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-sm">加粗</button>
                    <button class="w-full text-left px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-sm">斜体</button>
                    <button class="w-full text-left px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-sm">下划线</button>
                    <button class="w-full text-left px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-sm">分割线</button>
                </div>
            </div>

            <!-- 表情内容 -->
            <div v-else-if="activeMenu === 'emoji'" class="p-4">
                <h3 class="font-medium mb-3 text-gray-900 dark:text-white">常用表情</h3>
                <div class="grid grid-cols-5 gap-2">
                    <button
                        v-for="emoji in emojiList"
                        :key="emoji"
                        @click="insertEmoji(emoji)"
                        class="w-10 h-10 flex items-center justify-center text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                    >
                        {{ emoji }}
                    </button>
                </div>
            </div>

            <!-- 话题内容 -->
            <div v-else-if="activeMenu === 'topic'" class="p-4">
                <h3 class="font-medium mb-3 text-gray-900 dark:text-white">热门话题</h3>
                <div class="space-y-2">
                    <button
                        v-for="topic in topicList"
                        :key="topic"
                        @click="insertTopic(topic)"
                        class="block w-full text-left px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-blue-600"
                    >
                        {{ topic }}
                    </button>
                </div>
            </div>

            <!-- 文案库内容 -->
            <div v-else-if="activeMenu === 'library'" class="p-4">
                <h3 class="font-medium mb-3 text-gray-900 dark:text-white">文案库</h3>
                <p class="text-sm text-gray-500">收藏的文案将显示在这里</p>
            </div>
        </div>

        <!-- 3. 笔记编辑区域 -->
        <div class="flex-1 flex flex-col bg-white dark:bg-gray-800">
            <!-- 加载状态 -->
            <div v-if="isLoadingNote" class="flex-1 flex items-center justify-center">
                <div class="text-center">
                    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p class="text-gray-500">正在加载笔记...</p>
                </div>
            </div>
            
            <template v-else>
                <div class="p-4 border-b border-gray-200 dark:border-gray-700">
                    <div class="flex items-center justify-between">
                        <input
                            v-model="noteTitle"
                            type="text"
                            placeholder="请输入笔记标题"
                            class="flex-1 text-xl font-medium bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder-gray-400"
                        />
                        <UBadge v-if="isEditMode" color="primary" variant="soft" size="sm">
                            编辑模式
                        </UBadge>
                    </div>
                </div>
            
            <div class="flex-1 p-4 overflow-y-auto">
                <div v-if="isGenerating" class="flex items-center justify-center h-full">
                    <div class="text-center">
                        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                        <p class="text-gray-500">正在生成内容...</p>
                    </div>
                </div>
                
                <div v-else-if="generationError" class="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg mb-4">
                    <p class="text-red-600 dark:text-red-400">{{ generationError }}</p>
                </div>
                
                <textarea
                    v-else
                    v-model="noteContent"
                    placeholder="请输入笔记内容"
                    class="w-full h-full resize-none bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder-gray-400 text-base leading-relaxed"
                ></textarea>
            </div>
            
            <div class="px-4 py-2 border-t border-gray-200 dark:border-gray-700 text-right">
                <span class="text-sm text-gray-500">{{ wordCount }} / 1000</span>
            </div>
            </template>
        </div>

        <!-- 4. 右侧操作菜单 -->
        <div class="w-20 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col items-center py-4">
            <button
                @click="handleCopyTitle"
                class="w-16 h-16 flex flex-col items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 mb-2"
            >
                <UIcon name="i-heroicons-clipboard-document" class="text-xl mb-1" />
                <span class="text-xs">复制标题</span>
            </button>
            
            <button
                @click="handleCopyContent"
                class="w-16 h-16 flex flex-col items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 mb-2"
            >
                <UIcon name="i-heroicons-document-duplicate" class="text-xl mb-1" />
                <span class="text-xs">复制正文</span>
            </button>
            
            <button
                @click="handleSave"
                :disabled="isSaving"
                class="w-16 h-16 flex flex-col items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 mb-2 disabled:opacity-50"
            >
                <UIcon v-if="isSaving" name="i-heroicons-arrow-path" class="text-xl mb-1 animate-spin" />
                <UIcon v-else name="i-heroicons-bookmark" class="text-xl mb-1" />
                <span class="text-xs">{{ isEditMode ? '更新笔记' : '保存笔记' }}</span>
            </button>
            
            <button
                @click="handlePreview"
                class="w-16 h-16 flex flex-col items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 mb-2"
            >
                <UIcon name="i-heroicons-eye" class="text-xl mb-1" />
                <span class="text-xs">预览笔记</span>
            </button>
            
            <div class="flex-1"></div>
            
            <button
                class="w-14 h-14 flex flex-col items-center justify-center rounded-xl bg-blue-500 text-white hover:bg-blue-600 mb-4"
            >
                <UIcon name="i-heroicons-paper-airplane" class="text-xl" />
                <span class="text-xs mt-1">发布</span>
            </button>
            
            <button
                @click="handleClear"
                class="w-16 h-16 flex flex-col items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
                <UIcon name="i-heroicons-trash" class="text-xl mb-1" />
                <span class="text-xs">清空</span>
            </button>
        </div>

        <!-- 预览弹窗 -->
        <UModal v-model="showPreview">
            <UCard class="max-w-md">
                <template #header>
                    <h3 class="text-lg font-semibold">笔记预览</h3>
                </template>
                
                <div class="space-y-4">
                    <h4 class="font-bold text-lg">{{ noteTitle || '未填写标题' }}</h4>
                    <div class="whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                        {{ noteContent || '未填写内容' }}
                    </div>
                </div>

                <template #footer>
                    <div class="flex justify-end">
                        <UButton @click="showPreview = false">关闭</UButton>
                    </div>
                </template>
            </UCard>
        </UModal>
    </div>
</template>
