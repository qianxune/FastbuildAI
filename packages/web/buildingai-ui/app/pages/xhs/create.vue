<script setup lang="ts">
import type { XhsNote } from "@/types/xhs";
import { useXhsGenerate } from "@/composables/useXhsGenerate";
import ImageSelector from "@/components/xhs/image-selector.vue";
import { useAuthFetch } from "~/composables/useAuthFetch";

definePageMeta({
    layout: false,
    name: "XHS Note Create",
    auth: true,
});

useSeoMeta({
    title: "创建笔记 - 小红书",
    description: "创建和编辑小红书笔记",
});

const route = useRoute();
const router = useRouter();
const toast = useMessage();

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
} = useXhsGenerate();

// 编辑器状态
const noteTitle = ref("");
const noteContent = ref("");
const activeMenu = ref("template");
const showPreview = ref(false);
const wordCount = computed(() => noteContent.value.length);

// 封面图片状态
const coverImages = ref<string[]>([]);

// 图片选择器状态
const showImageSelector = ref(false);

// 编辑模式状态
const isEditMode = ref(false);
const editingNoteId = ref<string | null>(null);
const isLoadingNote = ref(false);
const isSaving = ref(false);

// 菜单配置
const menuItems = [
    { key: "template", label: "模版", icon: "i-heroicons-document-text" },
    { key: "format", label: "格式", icon: "i-heroicons-pencil-square" },
    { key: "emoji", label: "表情", icon: "i-heroicons-face-smile" },
    { key: "topic", label: "话题", icon: "i-heroicons-hashtag" },
    { key: "library", label: "文案库", icon: "i-heroicons-book-open" },
];

// 模版分类
const templateCategories = [
    {
        key: "beauty",
        label: "美妆",
        color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    },
    {
        key: "ootd",
        label: "OOTD",
        color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    },
    {
        key: "share",
        label: "好物分享",
        color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    },
    {
        key: "explore",
        label: "探店",
        color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    },
    {
        key: "food",
        label: "美食",
        color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    },
    {
        key: "pet",
        label: "萌宠",
        color: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
    },
    {
        key: "daily",
        label: "日常",
        color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    },
];

// 示例模版内容
const sampleTemplates = [
    {
        title: "【美妆行业深度解析】把握美...",
        preview:
            "市场现状 - 美妆行业正以前所未有的速度发展，不仅关于美丽，更是经济和文化自信的体现...",
        category: "beauty",
    },
    {
        title: "新手化妆正确步骤敲详细...",
        preview: "化妆前必须要做的护肤步骤：爽肤水、面部精华、眼霜、乳液/面霜...",
        category: "beauty",
    },
    {
        title: "古代美妆秘籍：化妆步骤一网...",
        preview: "嘿，姑娘们！你们有没有想过古代女子是怎么化妆的呢？来，我今天就来给你们揭秘一下！",
        category: "beauty",
    },
    {
        title: "绝美色号安利",
        preview: "承包我的一整个春夏 #今日妆容 #色号评测",
        category: "beauty",
    },
];

// 表情列表
const emojiList = [":)", ":D", "<3", "*_*", "^_^", "XD", ":P", ";)", ":O", "(Y)"];

// 话题列表
const topicList = [
    "#今日妆容",
    "#好物分享",
    "#穿搭日记",
    "#美食探店",
    "#旅行日记",
    "#日常vlog",
    "#护肤心得",
    "#减肥打卡",
    "#健身日记",
    "#读书笔记",
];

// 页面加载时检查是否需要自动生成或加载已有笔记
onMounted(async () => {
    const queryContent = route.query.content as string;
    const queryMode = route.query.mode as string;
    const autoGenerate = route.query.autoGenerate as string;
    const noteId = route.query.noteId as string;

    // 如果有noteId，则加载已有笔记进行编辑
    if (noteId) {
        await loadNote(noteId);
        return;
    }

    if (queryContent) {
        content.value = queryContent;
    }
    if (queryMode) {
        mode.value = queryMode as "ai-generate" | "ai-compose" | "add-emoji";
    }

    // 如果需要自动生成
    if (autoGenerate === "true" && queryContent) {
        await handleGenerate();
    }
});

// 加载已有笔记
const loadNote = async (noteId: string) => {
    isLoadingNote.value = true;
    isEditMode.value = true;
    editingNoteId.value = noteId;

    const { get } = useAuthFetch();
    const { data, error: apiError } = await get<XhsNote>(`/api/xhs/notes/${noteId}`, {
        errorMessage: "获取笔记失败",
    });

    if (apiError) {
        isLoadingNote.value = false;
        return;
    }

    noteTitle.value = data?.title || "";
    noteContent.value = data?.content || "";
    coverImages.value = data?.coverImages || [];
    mode.value = (data?.mode as "ai-generate" | "ai-compose" | "add-emoji") || "ai-generate";
    isLoadingNote.value = false;
};

// 监听生成结果，自动填充到编辑器
watch([generatedTitle, generatedContent], ([title, contentVal]) => {
    if (title) noteTitle.value = title;
    if (contentVal) noteContent.value = contentVal;
});

// 处理生成
const handleGenerate = async () => {
    await generate();
};

// 复制标题
const handleCopyTitle = async () => {
    if (!noteTitle.value) {
        toast.warning("没有可复制的标题");
        return;
    }
    await navigator.clipboard.writeText(noteTitle.value);
    toast.success("标题已复制");
};

// 复制正文
const handleCopyContent = async () => {
    if (!noteContent.value) {
        toast.warning("没有可复制的正文");
        return;
    }
    await navigator.clipboard.writeText(noteContent.value);
    toast.success("正文已复制");
};

// 保存笔记
const handleSave = async () => {
    if (!noteTitle.value || !noteContent.value) {
        toast.warning("请填写标题和正文");
        return;
    }

    isSaving.value = true;

    const { put, post } = useAuthFetch();

    try {
        if (isEditMode.value && editingNoteId.value) {
            // 更新已有笔记
            await put(
                `/api/xhs/notes/${editingNoteId.value}`,
                {
                    title: noteTitle.value,
                    content: noteContent.value,
                    coverImages: coverImages.value,
                },
                {
                    errorMessage: "更新笔记失败",
                },
            );

            toast.success("笔记已更新");
        } else {
            // 创建新笔记
            generatedTitle.value = noteTitle.value;
            generatedContent.value = noteContent.value;

            await save();
        }
    } finally {
        isSaving.value = false;
    }
};

// 预览笔记
const handlePreview = () => {
    showPreview.value = true;
};

// 清空笔记
const handleClear = () => {
    noteTitle.value = "";
    noteContent.value = "";
    coverImages.value = [];
};

// 打开图片选择器
const openImageSelector = () => {
    showImageSelector.value = true;
};

// 关闭图片选择器
const closeImageSelector = () => {
    showImageSelector.value = false;
};

// 更新封面图片
const handleUpdateCoverImages = (images: string[]) => {
    coverImages.value = images;
};

// 插入模版
const insertTemplate = (template: { title: string; preview: string }) => {
    noteTitle.value = template.title;
    noteContent.value = template.preview;
};

// 插入表情
const insertEmoji = (emoji: string) => {
    noteContent.value += emoji;
};

// 插入话题
const insertTopic = (topic: string) => {
    noteContent.value += " " + topic + " ";
};

// 返回首页
const goBack = () => {
    router.push("/xhs");
};

// 跳转到我的笔记
const goToMyNotes = () => {
    router.push("/xhs/notes");
};
</script>

<template>
    <div class="flex h-screen bg-slate-50 dark:bg-slate-900">
        <!-- 1. 左侧菜单栏 -->
        <div
            class="flex w-20 flex-col items-center border-r border-slate-200 bg-white py-4 dark:border-slate-700 dark:bg-slate-800"
        >
            <button
                v-for="item in menuItems"
                :key="item.key"
                @click="activeMenu = item.key"
                :class="[
                    'mb-2 flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-lg transition-all duration-200',
                    activeMenu === item.key
                        ? 'bg-blue-50 text-blue-600 shadow-sm dark:bg-blue-900/30 dark:text-blue-400'
                        : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700',
                ]"
            >
                <UIcon :name="item.icon" class="mb-1 text-xl" />
                <span class="text-xs">{{ item.label }}</span>
            </button>

            <div class="flex-1"></div>

            <!-- 底部菜单 -->
            <button
                @click="goToMyNotes"
                class="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-lg text-slate-500 transition-colors duration-200 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            >
                <UIcon name="i-heroicons-document-text" class="mb-1 text-xl" />
                <span class="text-xs">我的笔记</span>
            </button>
            <button
                @click="goBack"
                class="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-lg text-slate-500 transition-colors duration-200 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            >
                <UIcon name="i-heroicons-home" class="mb-1 text-xl" />
                <span class="text-xs">返回首页</span>
            </button>
        </div>

        <!-- 2. 菜单内容区域 -->
        <div
            class="w-72 overflow-y-auto border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
        >
            <!-- 模版内容 -->
            <div v-if="activeMenu === 'template'" class="p-4">
                <div class="mb-4 flex flex-wrap gap-2">
                    <button
                        v-for="cat in templateCategories"
                        :key="cat.key"
                        :class="[
                            'cursor-pointer rounded-full px-3 py-1 text-sm font-medium transition-all duration-150 hover:opacity-80',
                            cat.color,
                        ]"
                    >
                        {{ cat.label }}
                    </button>
                </div>

                <div class="space-y-3">
                    <div
                        v-for="(tpl, idx) in sampleTemplates"
                        :key="idx"
                        @click="insertTemplate(tpl)"
                        class="cursor-pointer rounded-lg bg-slate-50 p-3 transition-all duration-200 hover:bg-slate-100 hover:shadow-sm dark:bg-slate-700 dark:hover:bg-slate-600"
                    >
                        <h4
                            class="mb-1 line-clamp-1 text-sm font-medium text-slate-900 dark:text-white"
                        >
                            {{ tpl.title }}
                        </h4>
                        <p
                            class="line-clamp-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400"
                        >
                            {{ tpl.preview }}
                        </p>
                    </div>
                </div>
            </div>

            <!-- 格式内容 -->
            <div v-else-if="activeMenu === 'format'" class="p-4">
                <h3 class="mb-3 text-sm font-semibold text-slate-900 dark:text-white">文本格式</h3>
                <div class="space-y-2">
                    <button
                        class="w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition-colors duration-150 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                        <UIcon name="i-heroicons-bold" class="mr-2 inline-block" />
                        加粗
                    </button>
                    <button
                        class="w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition-colors duration-150 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                        <UIcon name="i-heroicons-italic" class="mr-2 inline-block" />
                        斜体
                    </button>
                    <button
                        class="w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition-colors duration-150 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                        <UIcon name="i-heroicons-underline" class="mr-2 inline-block" />
                        下划线
                    </button>
                    <button
                        class="w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition-colors duration-150 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                        <UIcon name="i-heroicons-minus" class="mr-2 inline-block" />
                        分割线
                    </button>
                </div>
            </div>

            <!-- 表情内容 -->
            <div v-else-if="activeMenu === 'emoji'" class="p-4">
                <h3 class="mb-3 text-sm font-semibold text-slate-900 dark:text-white">常用表情</h3>
                <div class="grid grid-cols-5 gap-2">
                    <button
                        v-for="emoji in emojiList"
                        :key="emoji"
                        @click="insertEmoji(emoji)"
                        class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-lg transition-colors duration-150 hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                        {{ emoji }}
                    </button>
                </div>
            </div>

            <!-- 话题内容 -->
            <div v-else-if="activeMenu === 'topic'" class="p-4">
                <h3 class="mb-3 text-sm font-semibold text-slate-900 dark:text-white">热门话题</h3>
                <div class="space-y-2">
                    <button
                        v-for="topic in topicList"
                        :key="topic"
                        @click="insertTopic(topic)"
                        class="block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm text-blue-600 transition-all duration-150 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30"
                    >
                        {{ topic }}
                    </button>
                </div>
            </div>

            <!-- 文案库内容 -->
            <div v-else-if="activeMenu === 'library'" class="p-4">
                <h3 class="mb-3 text-sm font-semibold text-slate-900 dark:text-white">文案库</h3>
                <div class="rounded-lg bg-slate-50 p-4 text-center dark:bg-slate-700">
                    <UIcon
                        name="i-heroicons-folder-open"
                        class="mx-auto mb-2 text-3xl text-slate-400"
                    />
                    <p class="text-sm text-slate-500 dark:text-slate-400">收藏的文案将显示在这里</p>
                </div>
            </div>
        </div>

        <!-- 3. 笔记编辑区域 -->
        <div class="flex flex-1 flex-col bg-white dark:bg-slate-800">
            <!-- 加载状态 -->
            <div v-if="isLoadingNote" class="flex flex-1 items-center justify-center">
                <div class="text-center">
                    <div
                        class="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-500"
                    ></div>
                    <p class="text-sm text-slate-500 dark:text-slate-400">正在加载笔记...</p>
                </div>
            </div>

            <template v-else>
                <!-- 标题栏 -->
                <div class="border-b border-slate-200 p-4 dark:border-slate-700">
                    <div class="flex items-center justify-between">
                        <input
                            v-model="noteTitle"
                            type="text"
                            placeholder="请输入笔记标题"
                            class="flex-1 border-none bg-transparent text-xl font-medium text-slate-900 placeholder-slate-400 outline-none dark:text-white dark:placeholder-slate-500"
                        />
                        <UBadge v-if="isEditMode" color="primary" variant="soft" size="sm">
                            编辑模式
                        </UBadge>
                    </div>
                </div>

                <!-- 内容编辑区 -->
                <div class="flex-1 overflow-y-auto p-4">
                    <!-- 生成中状态 -->
                    <div v-if="isGenerating" class="flex h-full items-center justify-center">
                        <div class="text-center">
                            <div
                                class="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-500"
                            ></div>
                            <p class="text-sm text-slate-500 dark:text-slate-400">
                                正在生成内容...
                            </p>
                        </div>
                    </div>

                    <!-- 错误状态 -->
                    <div
                        v-else-if="generationError"
                        class="rounded-lg bg-red-50 p-4 dark:bg-red-900/20"
                    >
                        <div class="flex items-start gap-3">
                            <UIcon
                                name="i-heroicons-exclamation-circle"
                                class="mt-0.5 text-xl text-red-600 dark:text-red-400"
                            />
                            <div class="flex-1">
                                <h4 class="mb-1 text-sm font-medium text-red-800 dark:text-red-300">
                                    生成失败
                                </h4>
                                <p class="text-sm text-red-600 dark:text-red-400">
                                    {{ generationError }}
                                </p>
                            </div>
                        </div>
                    </div>

                    <!-- 内容输入框 -->
                    <textarea
                        v-else
                        v-model="noteContent"
                        placeholder="请输入笔记内容"
                        class="h-full w-full resize-none border-none bg-transparent text-base leading-relaxed text-slate-900 placeholder-slate-400 outline-none dark:text-white dark:placeholder-slate-500"
                    ></textarea>
                </div>

                <!-- 字数统计 -->
                <div class="border-t border-slate-200 px-4 py-2 text-right dark:border-slate-700">
                    <span class="text-sm text-slate-500 dark:text-slate-400"
                        >{{ wordCount }} / 1000</span
                    >
                </div>

                <!-- 封面图片预览 -->
                <div
                    v-if="coverImages.length > 0"
                    class="border-t border-slate-200 px-4 py-3 dark:border-slate-700"
                >
                    <div class="mb-2 flex items-center justify-between">
                        <span class="text-sm font-medium text-slate-700 dark:text-slate-300"
                            >封面图片</span
                        >
                        <UButton
                            size="xs"
                            variant="ghost"
                            icon="i-heroicons-pencil"
                            @click="openImageSelector"
                        >
                            编辑
                        </UButton>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <div
                            v-for="(image, index) in coverImages"
                            :key="index"
                            class="group relative h-16 w-16 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-700"
                        >
                            <img
                                :src="image"
                                :alt="`封面图 ${index + 1}`"
                                class="h-full w-full object-cover"
                            />
                            <div
                                class="bg-opacity-0 group-hover:bg-opacity-40 absolute inset-0 flex items-center justify-center bg-black transition-all duration-200"
                            >
                                <UButton
                                    size="xs"
                                    color="error"
                                    icon="i-heroicons-trash"
                                    class="opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                                    @click="coverImages.splice(index, 1)"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </template>
        </div>

        <!-- 4. 右侧操作菜单 -->
        <div
            class="flex w-20 flex-col items-center border-l border-slate-200 bg-white py-4 dark:border-slate-700 dark:bg-slate-800"
        >
            <button
                @click="openImageSelector"
                aria-label="管理配图"
                class="mb-2 flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-lg text-slate-500 transition-colors duration-200 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            >
                <UIcon name="i-heroicons-photo" class="mb-1 text-xl" />
                <span class="text-xs">管理配图</span>
            </button>

            <button
                @click="handleCopyTitle"
                aria-label="复制标题"
                class="mb-2 flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-lg text-slate-500 transition-colors duration-200 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            >
                <UIcon name="i-heroicons-clipboard-document" class="mb-1 text-xl" />
                <span class="text-xs">复制标题</span>
            </button>

            <button
                @click="handleCopyContent"
                aria-label="复制正文"
                class="mb-2 flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-lg text-slate-500 transition-colors duration-200 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            >
                <UIcon name="i-heroicons-document-duplicate" class="mb-1 text-xl" />
                <span class="text-xs">复制正文</span>
            </button>

            <button
                @click="handleSave"
                :disabled="isSaving"
                aria-label="保存笔记"
                class="mb-2 flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-lg text-slate-500 transition-colors duration-200 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-700"
            >
                <UIcon
                    v-if="isSaving"
                    name="i-heroicons-arrow-path"
                    class="mb-1 animate-spin text-xl"
                />
                <UIcon v-else name="i-heroicons-bookmark" class="mb-1 text-xl" />
                <span class="text-xs">{{ isEditMode ? "更新笔记" : "保存笔记" }}</span>
            </button>

            <button
                @click="handlePreview"
                aria-label="预览笔记"
                class="mb-2 flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-lg text-slate-500 transition-colors duration-200 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            >
                <UIcon name="i-heroicons-eye" class="mb-1 text-xl" />
                <span class="text-xs">预览笔记</span>
            </button>

            <div class="flex-1"></div>

            <!-- 发布按钮 (主要CTA) -->
            <button
                aria-label="发布笔记"
                class="mb-4 flex h-14 w-14 cursor-pointer flex-col items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg transition-all duration-200 hover:bg-blue-700 hover:shadow-xl"
            >
                <UIcon name="i-heroicons-paper-airplane" class="text-xl" />
                <span class="mt-1 text-xs">发布</span>
            </button>

            <!-- 清空按钮 -->
            <button
                @click="handleClear"
                aria-label="清空笔记"
                class="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-lg text-slate-500 transition-colors duration-200 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            >
                <UIcon name="i-heroicons-trash" class="mb-1 text-xl" />
                <span class="text-xs">清空</span>
            </button>
        </div>

        <!-- 预览弹窗 -->
        <UModal v-model="showPreview">
            <UCard class="max-w-md">
                <template #header>
                    <div class="flex items-center justify-between">
                        <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
                            笔记预览
                        </h3>
                        <UButton
                            variant="ghost"
                            icon="i-heroicons-x-mark"
                            size="sm"
                            @click="showPreview = false"
                        />
                    </div>
                </template>

                <div class="space-y-4">
                    <div>
                        <h4
                            class="mb-2 text-xs font-medium text-slate-500 uppercase dark:text-slate-400"
                        >
                            标题
                        </h4>
                        <p class="text-lg font-bold text-slate-900 dark:text-white">
                            {{ noteTitle || "未填写标题" }}
                        </p>
                    </div>

                    <div>
                        <h4
                            class="mb-2 text-xs font-medium text-slate-500 uppercase dark:text-slate-400"
                        >
                            正文
                        </h4>
                        <div
                            class="text-sm leading-relaxed whitespace-pre-wrap text-slate-700 dark:text-slate-300"
                        >
                            {{ noteContent || "未填写内容" }}
                        </div>
                    </div>

                    <div v-if="coverImages.length > 0">
                        <h4
                            class="mb-2 text-xs font-medium text-slate-500 uppercase dark:text-slate-400"
                        >
                            封面图片
                        </h4>
                        <div class="grid grid-cols-3 gap-2">
                            <img
                                v-for="(image, index) in coverImages"
                                :key="index"
                                :src="image"
                                :alt="`封面图 ${index + 1}`"
                                class="aspect-square rounded-lg object-cover"
                            />
                        </div>
                    </div>
                </div>

                <template #footer>
                    <div class="flex justify-end gap-2">
                        <UButton variant="outline" @click="showPreview = false">关闭</UButton>
                        <UButton color="primary">发布笔记</UButton>
                    </div>
                </template>
            </UCard>
        </UModal>

        <!-- Image Selector Modal -->
        <ImageSelector
            v-if="showImageSelector"
            :cover-images="coverImages"
            :note-content="noteContent"
            @update:cover-images="handleUpdateCoverImages"
            @close="closeImageSelector"
        />
    </div>
</template>
