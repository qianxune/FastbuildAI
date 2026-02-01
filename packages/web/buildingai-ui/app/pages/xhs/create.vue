<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import type { XhsNote } from "../../types/xhs";
import { useXhsGenerate } from "../../composables/useXhsGenerate";
import { useAuthFetch } from "../../composables/useAuthFetch";

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

// 图片工具栏配置中的活动标签
const activeImageTab = ref<"auto" | "template" | "history" | "upload">("auto");

// 编辑模式状态
const isEditMode = ref(false);
const editingNoteId = ref<string | null>(null);
const isLoadingNote = ref(false);
const isSaving = ref(false);

// 图片工具栏展开状态
const showImageToolbar = ref(false);

// 图片预览状态
const previewImageUrl = ref<string | null>(null);
const showImagePreview = ref(false);

// 图片工具栏配置
const imageToolbarItems = [
    {
        key: "auto" as const,
        label: "自动配图",
        description: "根据正文自动配图",
        icon: "i-heroicons-sparkles",
        badge: "推荐",
    },
    {
        key: "template" as const,
        label: "图片模板",
        description: "模版一键套用",
        icon: "i-heroicons-photo",
    },
    {
        key: "history" as const,
        label: "历史图片",
        description: "过往使用图片",
        icon: "i-heroicons-clock",
    },
    {
        key: "upload" as const,
        label: "本地上传",
        description: "上传已生成好的图片",
        icon: "i-heroicons-arrow-up-tray",
    },
];

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

// 切换图片工具栏显示
const toggleImageToolbar = () => {
    showImageToolbar.value = !showImageToolbar.value;
};

// 处理图片预览
const handlePreviewImage = (imageUrl: string) => {
    console.log("Preview image URL:", imageUrl);
    previewImageUrl.value = imageUrl;
    showImagePreview.value = true;
    console.log("Preview modal opened with URL:", previewImageUrl.value);
};

// 关闭图片预览
const closeImagePreview = () => {
    showImagePreview.value = false;
    previewImageUrl.value = null;
};

// 从预览模态框中删除当前图片
const handleDeletePreviewImage = () => {
    if (!previewImageUrl.value) return;

    const index = coverImages.value.indexOf(previewImageUrl.value);
    if (index !== -1) {
        coverImages.value.splice(index, 1);
        toast.success("图片已删除");
    }
    closeImagePreview();
};

// 移除单张图片
const handleRemoveImage = (index: number) => {
    coverImages.value.splice(index, 1);
    toast.success("图片已移除");
};

// 一键清空所有图片
const handleClearAllImages = () => {
    if (coverImages.value.length === 0) {
        toast.warning("暂无图片");
        return;
    }
    coverImages.value = [];
    toast.success("已清空所有图片");
};

// 文件上传相关
const fileInput = ref<HTMLInputElement | null>(null);
const isUploading = ref(false);
const uploadProgress = ref(0);

// 处理图片工具选择
const handleImageToolSelect = (key: "auto" | "template" | "history" | "upload") => {
    activeImageTab.value = key;

    switch (key) {
        case "auto":
            // TODO: 实现自动配图功能
            toast.info("自动配图功能开发中...");
            break;
        case "template":
            // TODO: 实现图片模板功能
            toast.info("图片模板功能开发中...");
            break;
        case "history":
            // TODO: 实现历史图片功能
            toast.info("历史图片功能开发中...");
            break;
        case "upload":
            // 直接触发文件选择
            fileInput.value?.click();
            break;
    }
};

// 处理文件选择
const handleFileChange = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const files = target.files;

    if (!files || files.length === 0) return;

    // 验证文件类型和大小
    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    const maxSize = 5 * 1024 * 1024; // 5MB

    for (const file of Array.from(files)) {
        if (!validTypes.includes(file.type)) {
            toast.error(`${file.name}: 只支持 JPG、PNG、GIF、WEBP 格式的图片`);
            continue;
        }

        if (file.size > maxSize) {
            toast.error(`${file.name}: 图片大小不能超过 5MB`);
            continue;
        }

        // 检查图片数量限制
        if (coverImages.value.length >= 9) {
            toast.warning("最多只能上传 9 张图片");
            break;
        }

        await uploadImage(file);
    }

    // 清空 input
    if (target) {
        target.value = "";
    }
};

// 上传单张图片
const uploadImage = async (file: File) => {
    isUploading.value = true;
    uploadProgress.value = 0;

    try {
        const formData = new FormData();
        formData.append("file", file);

        // 模拟上传进度
        const progressInterval = setInterval(() => {
            if (uploadProgress.value < 90) {
                uploadProgress.value += 10;
            }
        }, 200);

        // 使用原生 fetch 上传文件，不要手动设置 Content-Type
        const userStore = useUserStore();
        const authToken = userStore.token || userStore.temporaryToken;

        if (!authToken) {
            toast.error("请先登录");
            clearInterval(progressInterval);
            return;
        }

        const response = await fetch("/api/xhs/images/upload", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
            body: formData,
        });

        clearInterval(progressInterval);
        uploadProgress.value = 100;

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || "图片上传失败");
        }

        const result = await response.json();
        console.log("Upload response:", result);

        // API 返回格式: { code: 20000, data: { data: { url: '...' }, success: true } }
        const imageUrl = result?.data?.data?.url;

        if (imageUrl) {
            // 确保 URL 是绝对路径（以 / 开头）
            const absoluteUrl = imageUrl.startsWith("/") ? imageUrl : `/${imageUrl}`;
            console.log("Image URL from API:", imageUrl);
            console.log("Absolute URL:", absoluteUrl);
            coverImages.value.push(absoluteUrl);
            console.log("Updated coverImages:", coverImages.value);
            toast.success("图片上传成功");
        } else {
            console.error("No URL in response:", result);
            toast.error("上传成功但未返回图片地址");
        }
    } catch (error) {
        console.error("Image upload failed:", error);
        toast.error(error instanceof Error ? error.message : "图片上传失败，请重试");
    } finally {
        isUploading.value = false;
        uploadProgress.value = 0;
    }
};

// 发布相关状态
const isPublishing = ref(false);
const showPublishConfirm = ref(false);

// 登录二维码相关状态
const showLoginQrCode = ref(false);
const loginQrCodeUrl = ref<string | null>(null);
const isLoadingQrCode = ref(false);
const isCheckingLoginStatus = ref(false);

// 发布笔记到小红书
const handlePublish = async () => {
    // 验证内容
    if (!noteTitle.value?.trim()) {
        toast.warning("请填写标题");
        return;
    }

    if (!noteContent.value?.trim()) {
        toast.warning("请填写正文内容");
        return;
    }

    // 如果没有配图，提示但允许继续
    if (coverImages.value.length === 0) {
        showPublishConfirm.value = true;
        return;
    }

    await doPublish();
};

// 确认发布（无配图时）
const confirmPublishWithoutImages = async () => {
    showPublishConfirm.value = false;
    await doPublish();
};

// 获取登录二维码
const fetchLoginQrCode = async () => {
    isLoadingQrCode.value = true;
    const { get } = useAuthFetch();

    try {
        const { data, error: apiError } = await get<{
            success: boolean;
            qrCodeUrl?: string;
            qrCodeBase64?: string;
            message: string;
        }>("/api/xhs/publish/login-qrcode", { showError: false });

        if (apiError || !data?.success) {
            toast.error(data?.message || apiError || "获取登录二维码失败");
            return;
        }

        // 优先使用 base64，其次使用 URL
        loginQrCodeUrl.value = data.qrCodeBase64 || data.qrCodeUrl || null;

        if (!loginQrCodeUrl.value) {
            toast.error("获取登录二维码失败");
        }
    } catch (error) {
        console.error("Fetch QR code failed:", error);
        toast.error("获取登录二维码失败");
    } finally {
        isLoadingQrCode.value = false;
    }
};

// 检查登录状态（用于轮询）
const checkLoginStatusAndPublish = async () => {
    isCheckingLoginStatus.value = true;
    const { get } = useAuthFetch();

    try {
        const { data } = await get<{
            isLoggedIn: boolean;
            message: string;
        }>("/api/xhs/publish/login-status", { showError: false });

        if (data?.isLoggedIn) {
            showLoginQrCode.value = false;
            loginQrCodeUrl.value = null;
            toast.success("登录成功！正在发布...");
            await doPublish();
        } else {
            toast.info("请使用小红书 App 扫描二维码登录");
        }
    } catch (error) {
        console.error("Check login status failed:", error);
    } finally {
        isCheckingLoginStatus.value = false;
    }
};

// 关闭登录二维码弹窗
const closeLoginQrCode = () => {
    showLoginQrCode.value = false;
    loginQrCodeUrl.value = null;
};

// 刷新二维码
const refreshQrCode = async () => {
    await fetchLoginQrCode();
};

// 执行发布
const doPublish = async () => {
    isPublishing.value = true;

    const { post } = useAuthFetch();

    try {
        const { data, error: apiError } = await post<{
            success: boolean;
            message: string;
            noteId?: string;
            noteUrl?: string;
        }>(
            "/api/xhs/publish",
            {
                title: noteTitle.value,
                content: noteContent.value,
                images: coverImages.value,
            },
            {
                showError: false,
            },
        );

        if (apiError || !data?.success) {
            const errorMsg = data?.message || apiError || "发布失败，请稍后重试";

            // 检查是否是登录过期的错误
            if (errorMsg.includes("登录") || errorMsg.includes("过期")) {
                toast.warning("小红书登录已过期，请扫码登录");
                showLoginQrCode.value = true;
                await fetchLoginQrCode();
                return;
            }

            toast.error(errorMsg);
            return;
        }

        toast.success(data.message || "笔记已成功发布到小红书！");

        // 如果返回了笔记链接，可以提示用户
        if (data.noteUrl) {
            console.log("Published note URL:", data.noteUrl);
        }
    } catch (error) {
        console.error("Publish failed:", error);
        toast.error("发布失败，请检查网络连接后重试");
    } finally {
        isPublishing.value = false;
    }
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
                <!-- 图片工具栏 -->
                <div
                    class="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
                >
                    <!-- 工具栏切换按钮 -->
                    <button
                        @click="toggleImageToolbar"
                        class="flex w-full items-center justify-between px-4 py-3 text-left transition-colors duration-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                        <div class="flex items-center gap-2">
                            <UIcon
                                name="i-heroicons-photo"
                                class="text-lg text-blue-600 dark:text-blue-400"
                            />
                            <span class="text-sm font-medium text-slate-700 dark:text-slate-300">
                                点击下方按钮可制作配图
                            </span>
                        </div>
                        <UIcon
                            :name="
                                showImageToolbar
                                    ? 'i-heroicons-chevron-up'
                                    : 'i-heroicons-chevron-down'
                            "
                            class="text-slate-400 transition-transform duration-200"
                        />
                    </button>

                    <!-- 工具栏内容 -->
                    <Transition
                        enter-active-class="transition-all duration-200 ease-out"
                        enter-from-class="max-h-0 opacity-0"
                        enter-to-class="max-h-40 opacity-100"
                        leave-active-class="transition-all duration-200 ease-in"
                        leave-from-class="max-h-40 opacity-100"
                        leave-to-class="max-h-0 opacity-0"
                    >
                        <div v-if="showImageToolbar" class="overflow-hidden">
                            <div class="grid grid-cols-4 gap-3 px-4 pb-4">
                                <button
                                    v-for="item in imageToolbarItems"
                                    :key="item.key"
                                    @click="handleImageToolSelect(item.key)"
                                    :class="[
                                        'group relative flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all duration-200',
                                        activeImageTab === item.key
                                            ? 'border-blue-500 bg-blue-50 shadow-sm dark:border-blue-400 dark:bg-blue-900/30'
                                            : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:hover:border-blue-600',
                                    ]"
                                >
                                    <!-- 推荐标签 -->
                                    <div
                                        v-if="item.badge"
                                        class="absolute -top-1 -right-1 rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-2 py-0.5 text-xs font-medium text-white shadow-sm"
                                    >
                                        {{ item.badge }}
                                    </div>

                                    <!-- 图标 -->
                                    <div
                                        :class="[
                                            'flex h-12 w-12 items-center justify-center rounded-lg transition-colors duration-200',
                                            activeImageTab === item.key
                                                ? 'bg-blue-100 text-blue-600 dark:bg-blue-800 dark:text-blue-300'
                                                : 'bg-slate-100 text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-600 dark:bg-slate-700 dark:text-slate-400 dark:group-hover:bg-blue-900/50',
                                        ]"
                                    >
                                        <UIcon :name="item.icon" class="text-2xl" />
                                    </div>

                                    <!-- 文本 -->
                                    <div class="text-center">
                                        <div
                                            :class="[
                                                'text-sm font-medium',
                                                activeImageTab === item.key
                                                    ? 'text-blue-600 dark:text-blue-400'
                                                    : 'text-slate-700 dark:text-slate-300',
                                            ]"
                                        >
                                            {{ item.label }}
                                        </div>
                                        <div
                                            class="mt-0.5 text-xs text-slate-500 dark:text-slate-400"
                                        >
                                            {{ item.description }}
                                        </div>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </Transition>
                </div>

                <!-- 已上传图片预览区域 -->
                <div
                    v-if="coverImages.length > 0"
                    class="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800"
                >
                    <div class="mb-3 flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="text-sm font-medium text-slate-700 dark:text-slate-300">
                                已上传图片
                            </span>
                            <span
                                class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                            >
                                {{ coverImages.length }}/9
                            </span>
                        </div>
                        <button
                            @click="handleClearAllImages"
                            class="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-600 transition-colors duration-150 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                        >
                            <UIcon name="i-heroicons-trash" class="text-sm" />
                            一键清空
                        </button>
                    </div>

                    <!-- 图片网格 -->
                    <div class="grid grid-cols-6 gap-3">
                        <div
                            v-for="(image, index) in coverImages"
                            :key="index"
                            class="group relative aspect-square overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-700"
                        >
                            <!-- 图片 -->
                            <img
                                :src="image"
                                :alt="`图片 ${index + 1}`"
                                class="h-full w-full cursor-pointer object-cover"
                                @click="handlePreviewImage(image)"
                            />

                            <!-- 悬停遮罩 -->
                            <div
                                class="absolute inset-0 flex items-center justify-center bg-black/0 transition-all duration-200 group-hover:bg-black/50"
                            >
                                <div
                                    class="flex gap-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                                >
                                    <!-- 预览按钮 -->
                                    <button
                                        @click.stop="handlePreviewImage(image)"
                                        class="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-700 transition-transform duration-150 hover:scale-110 dark:bg-slate-800/90 dark:text-slate-300"
                                        aria-label="预览图片"
                                    >
                                        <UIcon name="i-heroicons-eye" class="text-lg" />
                                    </button>

                                    <!-- 删除按钮 -->
                                    <button
                                        @click.stop="handleRemoveImage(index)"
                                        class="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/90 text-white transition-transform duration-150 hover:scale-110"
                                        aria-label="删除图片"
                                    >
                                        <UIcon name="i-heroicons-trash" class="text-lg" />
                                    </button>
                                </div>
                            </div>

                            <!-- 图片序号 -->
                            <div
                                class="absolute top-1 left-1 rounded bg-black/50 px-1.5 py-0.5 text-xs font-medium text-white"
                            >
                                {{ index + 1 }}
                            </div>
                        </div>

                        <!-- 添加更多按钮 -->
                        <button
                            v-if="coverImages.length < 9"
                            @click="fileInput?.click()"
                            class="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 transition-all duration-200 hover:border-blue-400 hover:bg-blue-50 dark:border-slate-600 dark:bg-slate-700 dark:hover:border-blue-500 dark:hover:bg-blue-900/20"
                        >
                            <UIcon
                                name="i-heroicons-plus"
                                class="text-2xl text-slate-400 dark:text-slate-500"
                            />
                            <span class="text-xs text-slate-500 dark:text-slate-400">添加</span>
                        </button>
                    </div>
                </div>

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
            </template>
        </div>

        <!-- 4. 右侧操作菜单 -->
        <div
            class="flex w-20 flex-col items-center border-l border-slate-200 bg-white py-4 dark:border-slate-700 dark:bg-slate-800"
        >
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
                @click="handlePublish"
                :disabled="isPublishing"
                aria-label="发布笔记"
                :class="[
                    'mb-4 flex h-14 w-14 cursor-pointer flex-col items-center justify-center rounded-xl shadow-lg transition-all duration-200',
                    isPublishing
                        ? 'bg-blue-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 hover:shadow-xl',
                    'text-white',
                ]"
            >
                <UIcon
                    :name="isPublishing ? 'i-heroicons-arrow-path' : 'i-heroicons-paper-airplane'"
                    :class="['text-xl', isPublishing ? 'animate-spin' : '']"
                />
                <span class="mt-1 text-xs">{{ isPublishing ? "发布中" : "发布" }}</span>
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
                        <UButton
                            color="primary"
                            @click="showPreview = false; handlePublish()"
                            :loading="isPublishing"
                        >
                            发布笔记
                        </UButton>
                    </div>
                </template>
            </UCard>
        </UModal>

        <!-- 发布确认弹窗（无配图时） -->
        <UModal v-model="showPublishConfirm">
            <UCard class="max-w-sm">
                <template #header>
                    <div class="flex items-center gap-2">
                        <UIcon
                            name="i-heroicons-exclamation-triangle"
                            class="text-xl text-amber-500"
                        />
                        <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
                            发布提示
                        </h3>
                    </div>
                </template>

                <p class="text-sm text-slate-600 dark:text-slate-400">
                    您的笔记还没有添加配图，建议添加至少一张图片以获得更好的展示效果。
                </p>
                <p class="mt-2 text-sm text-slate-600 dark:text-slate-400">确定要继续发布吗？</p>

                <template #footer>
                    <div class="flex justify-end gap-2">
                        <UButton variant="outline" @click="showPublishConfirm = false">
                            返回添加配图
                        </UButton>
                        <UButton
                            color="primary"
                            @click="confirmPublishWithoutImages"
                            :loading="isPublishing"
                        >
                            继续发布
                        </UButton>
                    </div>
                </template>
            </UCard>
        </UModal>

        <!-- 小红书登录二维码弹窗 -->
        <UModal v-model="showLoginQrCode">
            <UCard class="max-w-md">
                <template #header>
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <div
                                class="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30"
                            >
                                <UIcon
                                    name="i-heroicons-qr-code"
                                    class="text-xl text-red-600 dark:text-red-400"
                                />
                            </div>
                            <div>
                                <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
                                    小红书登录
                                </h3>
                                <p class="text-xs text-slate-500 dark:text-slate-400">
                                    请使用小红书 App 扫码登录
                                </p>
                            </div>
                        </div>
                        <button
                            class="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
                            @click="closeLoginQrCode"
                        >
                            <UIcon name="i-heroicons-x-mark" class="text-xl" />
                        </button>
                    </div>
                </template>

                <div class="flex flex-col items-center py-4">
                    <!-- 加载状态 -->
                    <div
                        v-if="isLoadingQrCode"
                        class="flex h-64 w-64 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700"
                    >
                        <div class="text-center">
                            <div
                                class="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-red-200 border-t-red-500"
                            ></div>
                            <p class="text-sm text-slate-500 dark:text-slate-400">
                                正在获取二维码...
                            </p>
                        </div>
                    </div>

                    <!-- 二维码图片 -->
                    <div
                        v-else-if="loginQrCodeUrl"
                        class="rounded-xl border-2 border-slate-200 bg-white p-4 dark:border-slate-600 dark:bg-slate-800"
                    >
                        <img
                            :src="loginQrCodeUrl"
                            alt="小红书登录二维码"
                            class="h-56 w-56 object-contain"
                        />
                    </div>

                    <!-- 获取失败 -->
                    <div
                        v-else
                        class="flex h-64 w-64 flex-col items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700"
                    >
                        <UIcon
                            name="i-heroicons-exclamation-circle"
                            class="mb-2 text-4xl text-slate-400"
                        />
                        <p class="text-sm text-slate-500 dark:text-slate-400">获取二维码失败</p>
                    </div>

                    <!-- 提示文字 -->
                    <div class="mt-4 text-center">
                        <p class="text-sm text-slate-600 dark:text-slate-400">
                            打开小红书 App，扫描上方二维码
                        </p>
                        <p class="mt-1 text-xs text-slate-400 dark:text-slate-500">
                            扫码成功后点击下方按钮继续发布
                        </p>
                    </div>
                </div>

                <template #footer>
                    <div class="flex justify-between gap-3">
                        <UButton
                            variant="outline"
                            :loading="isLoadingQrCode"
                            @click="refreshQrCode"
                        >
                            <UIcon name="i-heroicons-arrow-path" class="mr-1" />
                            刷新二维码
                        </UButton>
                        <UButton
                            color="primary"
                            :loading="isCheckingLoginStatus"
                            @click="checkLoginStatusAndPublish"
                        >
                            <UIcon name="i-heroicons-check" class="mr-1" />
                            我已扫码登录
                        </UButton>
                    </div>
                </template>
            </UCard>
        </UModal>

        <!-- 隐藏的文件输入框 -->
        <input
            ref="fileInput"
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            class="hidden"
            @change="handleFileChange"
        />

        <!-- 图片预览对话框 -->
        <Teleport to="body">
            <Transition name="fade">
                <div
                    v-if="showImagePreview"
                    role="dialog"
                    aria-modal="true"
                    aria-label="图片预览"
                    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
                    @click.self="closeImagePreview"
                    @keydown.escape="closeImagePreview"
                >
                    <div
                        class="relative max-h-[90vh] max-w-[90vw] rounded-xl bg-white p-4 shadow-2xl dark:bg-slate-800"
                    >
                        <!-- 关闭按钮 -->
                        <button
                            class="absolute -top-3 -right-3 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white text-slate-500 shadow-lg transition-colors hover:bg-slate-100 hover:text-slate-700 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                            aria-label="关闭预览"
                            @click="closeImagePreview"
                        >
                            <UIcon name="i-heroicons-x-mark" class="h-5 w-5" />
                        </button>
                        <!-- 预览图片 -->
                        <img
                            v-if="previewImageUrl"
                            :src="previewImageUrl"
                            alt="预览图片"
                            class="max-h-[80vh] max-w-[85vw] rounded-lg object-contain"
                        />
                    </div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
