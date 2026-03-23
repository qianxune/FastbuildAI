<script setup lang="ts">
import type { XhsProduct } from "@/types/xhs";
import { useXhsPublish } from "@/composables/useXhsPublish";
import NotePreviewModal from "@/components/xhs/note-preview-modal.vue";

definePageMeta({
    layout: false,
    name: "XHS Batch Generate",
    auth: true,
});

useSeoMeta({
    title: "批量生成笔记 - 小红书",
    description: "批量生成小红书笔记",
});

interface GenerationTask {
    productId: string;
    product: XhsProduct;
    status: "pending" | "generating" | "success" | "error" | "publishing";
    progress: number;
    title: string;
    content: string;
    error?: string;
    noteId?: string;
    isPublished?: boolean;
}

const route = useRoute();
const router = useRouter();
const toast = useMessage();
const { publishNote } = useXhsPublish();

// 小红书登录二维码（与笔记编辑页 create.vue 一致）
const showLoginQrCode = ref(false);
const loginQrCodeUrl = ref<string | null>(null);
const isLoadingQrCode = ref(false);
const isCheckingLoginStatus = ref(false);

const checkXhsLoginStatus = async (): Promise<boolean> => {
    const { get } = useAuthFetch();
    const { data } = await get<{ isLoggedIn: boolean }>("/api/xhs/publish/login-status", {
        showError: false,
    });
    return data?.isLoggedIn ?? false;
};

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
            const msg = data?.message || apiError || "获取登录二维码失败";
            // 后端返回"已登录"提示时，关闭弹窗让用户直接发布
            if (msg.includes("已登录")) {
                showLoginQrCode.value = false;
                toast.success("小红书已登录，请直接发布");
            } else {
                toast.error(msg);
            }
            return;
        }

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

const checkLoginStatusAfterScan = async () => {
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
            toast.success("小红书登录成功！请再次点击发布");
        } else {
            toast.warning("暂未检测到登录，请先完成扫码");
        }
    } catch (error) {
        console.error("Check login status failed:", error);
    } finally {
        isCheckingLoginStatus.value = false;
    }
};

const closeLoginQrCode = () => {
    showLoginQrCode.value = false;
    loginQrCodeUrl.value = null;
};

const refreshQrCode = async () => {
    await fetchLoginQrCode();
};

/** 未登录时弹出二维码并返回 false；已登录返回 true */
const ensureXhsLoginOrShowQr = async (): Promise<boolean> => {
    const loggedIn = await checkXhsLoginStatus();
    if (!loggedIn) {
        showLoginQrCode.value = true;
        await fetchLoginQrCode();
        return false;
    }
    return true;
};

const maybeShowQrOnPublishError = async (message: string) => {
    if (message.includes("登录") || message.includes("过期")) {
        toast.warning("小红书登录已过期，请扫码登录");
        showLoginQrCode.value = true;
        await fetchLoginQrCode();
    } else {
        toast.error(message);
    }
};

const productIds = ref<string[]>([]);
const modelId = ref<string>("");
const templateId = ref<string>("");
const noteIdsMode = ref(false); // true = 从已有笔记直接进入发布模式
const tasks = ref<GenerationTask[]>([]);
const isGenerating = ref(false);
const isPublishing = ref(false);
const selectedTaskIds = ref<string[]>([]);

// 发布进度
const publishProgress = ref(0);
const publishTotal = ref(0);
const publishCurrent = ref(0);
const showPublishProgress = ref(false);

// 预览弹窗
const showPreviewModal = ref(false);
const currentTask = ref<GenerationTask | null>(null);

// 加载商品信息
onMounted(async () => {
    const noteIdsStr = route.query.noteIds as string;

    // noteIds 模式：从已生成的笔记直接进入发布
    if (noteIdsStr) {
        noteIdsMode.value = true;
        await loadExistingNotes(noteIdsStr.split(",").filter(Boolean));
        return;
    }

    const idsStr = route.query.productIds as string;
    modelId.value = (route.query.modelId as string) || "";
    templateId.value = (route.query.templateId as string) || "";

    if (!idsStr) {
        toast.error("未选择商品");
        router.push("/xhs/products");
        return;
    }

    if (!modelId.value) {
        toast.error("未选择AI模型");
        router.push("/xhs/products");
        return;
    }

    if (!templateId.value) {
        toast.error("未选择提示词模板");
        router.push("/xhs/products");
        return;
    }

    productIds.value = idsStr.split(",").filter(Boolean);

    // 加载商品信息
    await loadProducts();

    // 使用提示词模板批量生成（后端一次性生成，带进度条）
    await startBatchGenerateWithTemplate();
});

// 从已有笔记加载（noteIds 模式，带封面图用于展示与发布）
const loadExistingNotes = async (noteIds: string[]) => {
    const { get } = useAuthFetch();

    for (const noteId of noteIds) {
        const { data } = await get<{
            id: string;
            title: string;
            content: string;
            productId?: string;
            coverImages?: string[];
        }>(`/api/xhs/notes/${noteId}`);
        if (data) {
            const coverImages = data.coverImages ?? [];
            const productLike = {
                id: data.productId || data.id,
                name: data.title,
                imageUrl: coverImages[0] ?? undefined,
                extraImages: coverImages.length > 1 ? coverImages.slice(1) : undefined,
            } as XhsProduct;
            tasks.value.push({
                productId: data.productId || data.id,
                product: productLike,
                status: "success",
                progress: 100,
                title: data.title,
                content: data.content,
                noteId: data.id,
            });
        }
    }
};

// 加载商品信息
const loadProducts = async () => {
    const { get } = useAuthFetch();
    const { data, error } = await get<{ items: XhsProduct[] }>(
        `/api/xhs/products/by-ids?ids=${productIds.value.join(",")}`,
    );

    if (error || !data) {
        toast.error("加载商品信息失败");
        return;
    }

    tasks.value = data.items.map((product) => ({
        productId: product.id,
        product,
        status: "pending",
        progress: 0,
        title: "",
        content: "",
    }));
};

// 使用提示词模板批量生成（后端一次性生成，当前页显示进度）
const startBatchGenerateWithTemplate = async () => {
    isGenerating.value = true;
    for (const task of tasks.value) {
        task.status = "generating";
        task.progress = 0;
    }

    try {
        const { post } = useAuthFetch();
        const { data, error } = await post<{
            items: Array<{
                product_id: string;
                title: string;
                content: string;
                cover_images?: string[];
            }>;
        }>("/api/xhs/batch-generate-notes", {
            product_ids: productIds.value,
            ai_model: modelId.value,
            template_id: templateId.value,
        });

        if (error || !data) {
            toast.error("批量生成失败，请重试");
            for (const task of tasks.value) {
                task.status = "error";
                task.error = "请求失败";
            }
            isGenerating.value = false;
            return;
        }

        const taskMap = new Map(tasks.value.map((t) => [t.productId, t]));

        for (const item of data.items) {
            const task = taskMap.get(item.product_id);
            if (!task) continue;

            const title = item.title || "（无标题）";
            const content = item.content || "（生成失败）";
            const isFailed = !item.title && item.content?.startsWith("生成失败");

            if (isFailed) {
                task.status = "error";
                task.error = item.content || "生成失败";
                task.title = "";
                task.content = item.content || "";
                continue;
            }

            const { post: postNote } = useAuthFetch();
            const { data: noteData } = await postNote<{ id: string }>("/api/xhs/notes", {
                title,
                content,
                mode: "ai-generate",
                productId: item.product_id,
                coverImages: item.cover_images?.length ? item.cover_images : undefined,
            });

            if (noteData?.id) {
                task.noteId = noteData.id;
                task.title = title;
                task.content = content;
                task.status = "success";
                task.progress = 100;
            } else {
                task.status = "error";
                task.error = "保存笔记失败";
            }
        }

        const successCount = tasks.value.filter((t) => t.status === "success").length;
        toast.success(`批量生成完成，成功 ${successCount} 条`);
    } catch (err) {
        toast.error(err instanceof Error ? err.message : "批量生成失败");
        for (const task of tasks.value) {
            if (task.status === "generating") {
                task.status = "error";
                task.error = "生成异常";
            }
        }
    } finally {
        isGenerating.value = false;
    }
};

// 开始批量生成（旧流程：逐条流式生成，无 templateId 时不再使用）
const startBatchGenerate = async () => {
    isGenerating.value = true;

    for (const task of tasks.value) {
        if (task.status === "success") continue;

        task.status = "generating";
        task.progress = 0;

        try {
            await generateSingleNote(task);
        } catch (err) {
            console.error("Generation failed:", err);
        }
    }

    isGenerating.value = false;
    toast.success("批量生成完成");
};

// 生成单条笔记
const generateSingleNote = async (task: GenerationTask) => {
    const product = task.product;
    const prompt = `根据以下商品生成小红书笔记：

商品名称：${product.name}
${product.spec ? `规格：${product.spec}` : ""}
${product.description ? `描述：${product.description}` : ""}`;

    try {
        const userStore = useUserStore();
        const authToken = userStore.token || userStore.temporaryToken;

        if (!authToken) {
            task.status = "error";
            task.error = "请先登录";
            return;
        }

        const response = await fetch("/api/xhs/generate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "text/event-stream",
                Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({
                content: prompt,
                mode: "ai-generate",
                aiModel: modelId.value,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            task.status = "error";
            task.error = errorText || "生成失败";
            return;
        }

        if (!response.body) {
            task.status = "error";
            task.error = "响应体为空";
            return;
        }

        // 处理流式响应
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";

        while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    const data = line.slice(6);

                    if (data === "[DONE]") {
                        // 解析最终内容
                        parseGeneratedContent(task, fullContent);
                        task.status = "success";
                        task.progress = 100;
                        return;
                    }

                    try {
                        const event = JSON.parse(data);
                        if (event.type === "chunk" && event.data) {
                            fullContent += event.data;
                            task.progress = Math.min(90, task.progress + 10);
                        } else if (event.type === "complete" && event.fullContent) {
                            fullContent = event.fullContent;
                        }
                    } catch (parseError) {
                        console.warn("解析事件数据失败:", parseError);
                    }
                }
            }
        }

        // 如果循环结束但没有收到 [DONE]，也尝试解析内容
        if (fullContent) {
            parseGeneratedContent(task, fullContent);
            task.status = "success";
            task.progress = 100;
        } else {
            task.status = "error";
            task.error = "未收到生成内容";
        }
    } catch (err) {
        task.status = "error";
        task.error = err instanceof Error ? err.message : "生成失败";
    }
};

// 解析生成的内容
const parseGeneratedContent = (task: GenerationTask, fullContent: string) => {
    const lines = fullContent.split("\n");
    let title = "";
    let content = "";
    let isContentSection = false;

    for (const line of lines) {
        const trimmedLine = line.trim();

        if (trimmedLine.startsWith("标题：") || trimmedLine.startsWith("标题:")) {
            title = trimmedLine.replace(/^标题[：:]/, "").trim();
        } else if (trimmedLine.startsWith("正文：") || trimmedLine.startsWith("正文:")) {
            content = trimmedLine.replace(/^正文[：:]/, "").trim();
            isContentSection = true;
        } else if (isContentSection && trimmedLine) {
            content += (content ? "\n" : "") + trimmedLine;
        } else if (!title && !isContentSection && trimmedLine) {
            title = trimmedLine;
        }
    }

    task.title = title;
    task.content = content;
};

// 切换任务选择
const toggleTaskSelection = (taskId: string) => {
    const index = selectedTaskIds.value.indexOf(taskId);
    if (index >= 0) {
        selectedTaskIds.value.splice(index, 1);
    } else {
        selectedTaskIds.value.push(taskId);
    }
};

// 全选/取消全选
const toggleSelectAll = () => {
    const successTasks = tasks.value.filter((t) => t.status === "success");
    if (selectedTaskIds.value.length === successTasks.length) {
        selectedTaskIds.value = [];
    } else {
        selectedTaskIds.value = successTasks.map((t) => t.productId);
    }
};

// 预览笔记
const previewNote = (task: GenerationTask) => {
    currentTask.value = task;
    showPreviewModal.value = true;
};

// 关闭预览弹窗
const closePreviewModal = () => {
    showPreviewModal.value = false;
    currentTask.value = null;
};

// 保存编辑后的内容
const handleSaveEdit = (data: { title: string; content: string }) => {
    if (currentTask.value) {
        currentTask.value.title = data.title;
        currentTask.value.content = data.content;
        toast.success("内容已更新");
    }
};

// 从预览弹窗发布
const publishFromModal = async () => {
    if (currentTask.value) {
        await publishSingle(currentTask.value);
        closePreviewModal();
    }
};

// 重新生成单条笔记
const regenerateNote = async (task: GenerationTask) => {
    if (isGenerating.value) {
        toast.warning("正在生成中，请稍候");
        return;
    }

    task.status = "generating";
    task.progress = 0;
    task.title = "";
    task.content = "";
    task.error = undefined;

    try {
        await generateSingleNote(task);
        toast.success("重新生成成功");
    } catch (err) {
        console.error("Regeneration failed:", err);
        toast.error("重新生成失败");
    }
};

// 单条发布
const publishSingle = async (task: GenerationTask) => {
    if (!task.title || !task.content) {
        toast.error("笔记内容不完整");
        return;
    }

    if (task.isPublished) {
        toast.warning("该笔记已发布");
        return;
    }

    const loggedIn = await ensureXhsLoginOrShowQr();
    if (!loggedIn) {
        return;
    }

    task.status = "publishing";

    // 显示单条发布进度
    showPublishProgress.value = true;
    publishTotal.value = 1;
    publishCurrent.value = 0;
    publishProgress.value = 0;

    try {
        // 准备图片列表
        const images: string[] = [];
        if (task.product.imageUrl) {
            images.push(task.product.imageUrl);
        }
        if (task.product.extraImages?.length) {
            images.push(...task.product.extraImages);
        }

        // 发布笔记
        const result = await publishNote({
            title: task.title,
            content: task.content,
            images,
            productId: task.productId,
            // 将当前商品标题传递给小红书 MCP，用于按标题搜索并挂载商品
            productSearchTitle: task.product.name,
        });

        publishCurrent.value = 1;
        publishProgress.value = 100;

        if (result.success) {
            task.isPublished = true;
            task.noteId = result.noteId;
            task.status = "success";
            toast.success("发布成功！");
        } else {
            task.status = "success";
            await maybeShowQrOnPublishError(result.message || "发布失败");
        }
    } catch (err) {
        task.status = "success";
        const msg = err instanceof Error ? err.message : "发布失败";
        await maybeShowQrOnPublishError(msg);
    } finally {
        // 延迟隐藏进度条
        setTimeout(() => {
            showPublishProgress.value = false;
        }, 1000);
    }
};

// 批量发布
const publishBatch = async () => {
    if (selectedTaskIds.value.length === 0) {
        toast.warning("请选择要发布的笔记");
        return;
    }

    // 立即显示进度条（在任何异步操作之前）
    isPublishing.value = true;
    showPublishProgress.value = true;

    const selectedTasks = tasks.value.filter((t) => selectedTaskIds.value.includes(t.productId));
    publishTotal.value = selectedTasks.length;
    publishCurrent.value = 0;
    publishProgress.value = 0;

    const loggedIn = await ensureXhsLoginOrShowQr();
    if (!loggedIn) {
        isPublishing.value = false;
        showPublishProgress.value = false;
        return;
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < selectedTasks.length; i++) {
        const task = selectedTasks[i];

        if (!task) continue;

        if (task.isPublished) {
            publishCurrent.value++;
            publishProgress.value = Math.round((publishCurrent.value / publishTotal.value) * 100);
            continue;
        }

        task.status = "publishing";

        // 准备图片列表
        const images: string[] = [];
        if (task.product.imageUrl) {
            images.push(task.product.imageUrl);
        }
        if (task.product.extraImages?.length) {
            images.push(...task.product.extraImages);
        }

        try {
            const result = await publishNote({
                title: task.title,
                content: task.content,
                images,
                productId: task.productId,
                // 批量发布时同样传递商品标题
                productSearchTitle: task.product.name,
            });

            if (result.success) {
                task.isPublished = true;
                task.noteId = result.noteId;
                task.status = "success";
                successCount++;
            } else {
                task.status = "success";
                task.error = result.message;
                failCount++;
                console.error(`发布失败: ${task.product.name}`, result.message);
            }
        } catch (err) {
            task.status = "success";
            task.error = err instanceof Error ? err.message : "发布失败";
            failCount++;
            console.error(`发布异常: ${task.product.name}`, err);
        }

        publishCurrent.value++;
        publishProgress.value = Math.round((publishCurrent.value / publishTotal.value) * 100);

        // 避免请求过快
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    isPublishing.value = false;

    // 延迟隐藏进度条
    setTimeout(() => {
        showPublishProgress.value = false;
    }, 2000);

    if (successCount > 0) {
        toast.success(`成功发布 ${successCount} 条笔记`);
    }
    if (failCount > 0) {
        toast.warning(`${failCount} 条笔记发布失败`);
    }
};

// 返回商品列表
const goBack = () => {
    router.push("/xhs/products");
};

// 打开定时发布弹窗
const openScheduleModal = () => {
    if (selectedTaskIds.value.length === 0) {
        toast.warning("请选择要定时发布的笔记");
        return;
    }
    
    // 获取选中的笔记ID列表
    const selectedNoteIds = tasks.value
        .filter((t) => selectedTaskIds.value.includes(t.productId) && t.noteId)
        .map((t) => t.noteId as string);
    
    if (selectedNoteIds.length === 0) {
        toast.warning("选中的笔记中没有可发布的内容");
        return;
    }
    
    // 跳转到定时发布页面，传递笔记ID列表
    router.push({
        path: "/xhs/publish-schedule/create",
        query: {
            noteIds: selectedNoteIds.join(","),
        },
    });
};

// 获取状态图标
const getStatusIcon = (status: string) => {
    switch (status) {
        case "pending":
            return "i-heroicons-clock";
        case "generating":
            return "i-heroicons-arrow-path";
        case "success":
            return "i-heroicons-check-circle";
        case "error":
            return "i-heroicons-x-circle";
        default:
            return "i-heroicons-question-mark-circle";
    }
};

// 获取状态颜色
const getStatusColor = (status: string) => {
    switch (status) {
        case "pending":
            return "text-gray-500";
        case "generating":
            return "text-blue-500";
        case "success":
            return "text-green-500";
        case "error":
            return "text-red-500";
        default:
            return "text-gray-500";
    }
};
</script>

<template>
    <div class="min-h-screen bg-stone-50 dark:bg-gray-900">
        <div class="container mx-auto px-4 py-8 md:py-10">
            <!-- Header -->
            <header class="mb-8 md:mb-10 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 class="mb-2 text-2xl font-bold tracking-tight text-stone-900 dark:text-white md:text-3xl">
                        批量生成笔记
                    </h1>
                    <p class="text-base text-stone-600 dark:text-gray-400">
                        共 {{ tasks.length }} 个商品，已完成
                        {{ tasks.filter((t) => t.status === "success").length }} 个
                    </p>
                </div>
                <div class="flex flex-wrap gap-3">
                    <UButton
                        variant="outline"
                        color="neutral"
                        :disabled="isGenerating || isPublishing"
                        @click="publishBatch"
                    >
                        <UIcon name="i-heroicons-paper-airplane" class="mr-1" />
                        批量发布 ({{ selectedTaskIds.length }})
                    </UButton>
                    <UButton
                        variant="outline"
                        color="primary"
                        :disabled="isGenerating || isPublishing || selectedTaskIds.length === 0"
                        @click="openScheduleModal"
                    >
                        <UIcon name="i-heroicons-clock" class="mr-1" />
                        定时发布 ({{ selectedTaskIds.length }})
                    </UButton>
                    <UButton variant="ghost" color="neutral" @click="goBack">
                        <UIcon name="i-heroicons-arrow-left" class="mr-1" />
                        返回商品列表
                    </UButton>
                </div>
            </header>

            <!-- 发布进度条 -->
            <div
                v-if="showPublishProgress"
                class="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20"
            >
                <div class="mb-2 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <UIcon
                            name="i-heroicons-arrow-path"
                            class="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400"
                        />
                        <span class="font-medium text-blue-900 dark:text-blue-100">
                            正在发布笔记...
                        </span>
                    </div>
                    <span class="text-sm text-blue-700 dark:text-blue-300">
                        {{ publishCurrent }} / {{ publishTotal }}
                    </span>
                </div>
                <div class="h-2 w-full overflow-hidden rounded-full bg-blue-200 dark:bg-blue-800">
                    <div
                        class="h-full bg-blue-600 transition-all duration-300 dark:bg-blue-400"
                        :style="{ width: `${publishProgress}%` }"
                    ></div>
                </div>
                <p class="mt-2 text-xs text-blue-700 dark:text-blue-300">
                    {{ publishProgress }}% 完成
                </p>
            </div>

            <!-- Task List -->
            <UCard>
                <div
                    class="mb-4 flex items-center justify-between border-b border-gray-200 pb-4 dark:border-gray-700"
                >
                    <div class="flex items-center gap-2">
                        <input
                            type="checkbox"
                            :checked="
                                selectedTaskIds.length > 0 &&
                                selectedTaskIds.length ===
                                    tasks.filter((t) => t.status === 'success').length
                            "
                            :indeterminate="
                                selectedTaskIds.length > 0 &&
                                selectedTaskIds.length <
                                    tasks.filter((t) => t.status === 'success').length
                            "
                            @change="toggleSelectAll"
                            class="rounded border-gray-300"
                        />
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300"
                            >全选</span
                        >
                    </div>
                    <div v-if="isGenerating" class="flex items-center gap-2 text-sm text-blue-600">
                        <UIcon name="i-heroicons-arrow-path" class="h-4 w-4 animate-spin" />
                        <span>正在生成中...</span>
                    </div>
                </div>

                <div class="space-y-4">
                    <div
                        v-for="task in tasks"
                        :key="task.productId"
                        class="rounded-lg border border-gray-200 p-4 transition-all hover:shadow-md dark:border-gray-700"
                    >
                        <div class="flex items-start gap-4">
                            <!-- Checkbox -->
                            <input
                                v-if="task.status === 'success'"
                                type="checkbox"
                                :checked="selectedTaskIds.includes(task.productId)"
                                @change="toggleTaskSelection(task.productId)"
                                class="mt-1 rounded border-gray-300"
                            />
                            <div v-else class="w-4"></div>

                            <!-- Product Image -->
                            <div class="flex-shrink-0">
                                <img
                                    v-if="task.product.imageUrl"
                                    :src="task.product.imageUrl"
                                    :alt="task.product.name"
                                    class="h-16 w-16 rounded object-cover"
                                />
                                <div
                                    v-else
                                    class="flex h-16 w-16 items-center justify-center rounded bg-gray-100 dark:bg-gray-700"
                                >
                                    <UIcon name="i-heroicons-photo" class="h-8 w-8 text-gray-400" />
                                </div>
                            </div>

                            <!-- Content -->
                            <div class="min-w-0 flex-1">
                                <div class="mb-2 flex items-center justify-between">
                                    <h3 class="font-medium text-gray-900 dark:text-white">
                                        {{ task.product.name }}
                                    </h3>
                                    <div class="flex items-center gap-2">
                                        <UIcon
                                            :name="getStatusIcon(task.status)"
                                            :class="getStatusColor(task.status)"
                                        />
                                        <span class="text-sm" :class="getStatusColor(task.status)">
                                            {{
                                                task.status === "pending"
                                                    ? "等待中"
                                                    : task.status === "generating"
                                                      ? "生成中"
                                                      : task.status === "success"
                                                        ? "已完成"
                                                        : "失败"
                                            }}
                                        </span>
                                    </div>
                                </div>

                                <!-- Progress Bar -->
                                <div v-if="task.status === 'generating'" class="mb-2">
                                    <div
                                        class="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
                                    >
                                        <div
                                            class="h-full bg-blue-500 transition-all duration-300"
                                            :style="{ width: `${task.progress}%` }"
                                        ></div>
                                    </div>
                                </div>

                                <!-- Generated Content Preview -->
                                <div v-if="task.status === 'success'" class="mt-2 space-y-1">
                                    <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        标题: {{ task.title }}
                                    </p>
                                    <p
                                        class="line-clamp-2 text-sm text-gray-600 dark:text-gray-400"
                                    >
                                        {{ task.content }}
                                    </p>
                                </div>

                                <!-- Error Message -->
                                <div v-if="task.status === 'error'" class="mt-2">
                                    <p class="text-sm text-red-600 dark:text-red-400">
                                        {{ task.error }}
                                    </p>
                                </div>

                                <!-- Actions -->
                                <div v-if="task.status === 'success'" class="mt-3 flex gap-2">
                                    <UButton
                                        size="sm"
                                        variant="outline"
                                        color="neutral"
                                        @click="previewNote(task)"
                                    >
                                        <UIcon name="i-heroicons-eye" class="mr-1" />
                                        预览
                                    </UButton>
                                    <UButton
                                        size="sm"
                                        variant="outline"
                                        color="neutral"
                                        :disabled="isGenerating"
                                        @click="regenerateNote(task)"
                                    >
                                        <UIcon name="i-heroicons-arrow-path" class="mr-1" />
                                        重新生成
                                    </UButton>
                                    <UButton
                                        v-if="!task.isPublished"
                                        size="sm"
                                        color="primary"
                                        :disabled="isPublishing"
                                        @click="publishSingle(task)"
                                    >
                                        <UIcon name="i-heroicons-paper-airplane" class="mr-1" />
                                        发布
                                    </UButton>
                                    <UButton
                                        v-else
                                        size="sm"
                                        color="success"
                                        variant="outline"
                                        disabled
                                    >
                                        <UIcon name="i-heroicons-check-circle" class="mr-1" />
                                        已发布
                                    </UButton>
                                </div>

                                <!-- Publishing Status -->
                                <div v-if="task.status === 'publishing'" class="mt-3">
                                    <div class="flex items-center gap-2 text-sm text-blue-600">
                                        <UIcon
                                            name="i-heroicons-arrow-path"
                                            class="h-4 w-4 animate-spin"
                                        />
                                        <span>正在发布到小红书...</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </UCard>
        </div>

        <!-- 预览弹窗 -->
        <NotePreviewModal
            v-if="currentTask"
            :is-open="showPreviewModal"
            :title="currentTask.title"
            :content="currentTask.content"
            :product="currentTask.product"
            @close="closePreviewModal"
            @save="handleSaveEdit"
            @publish="publishFromModal"
        />

        <!-- 小红书登录二维码弹窗 -->
        <Teleport to="body">
            <Transition name="fade">
                <div
                    v-if="showLoginQrCode"
                    class="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
                    @click.self="closeLoginQrCode"
                >
                    <div class="w-full max-w-sm rounded-2xl bg-white shadow-2xl dark:bg-slate-800">
                        <!-- 标题 -->
                        <div class="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                            <div class="flex items-center gap-3">
                                <div class="flex h-9 w-9 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                                    <UIcon name="i-heroicons-qr-code" class="text-lg text-red-600 dark:text-red-400" />
                                </div>
                                <div>
                                    <h3 class="text-base font-semibold text-slate-900 dark:text-white">小红书登录</h3>
                                    <p class="text-xs text-slate-500 dark:text-slate-400">请使用小红书 App 扫码登录</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
                                @click="closeLoginQrCode"
                            >
                                <UIcon name="i-heroicons-x-mark" class="text-xl" />
                            </button>
                        </div>

                        <!-- 二维码区域 -->
                        <div class="flex flex-col items-center px-5 py-6">
                            <!-- 加载状态 -->
                            <div
                                v-if="isLoadingQrCode"
                                class="flex h-56 w-56 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700"
                            >
                                <div class="text-center">
                                    <div class="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-red-200 border-t-red-500"></div>
                                    <p class="text-sm text-slate-500 dark:text-slate-400">正在获取二维码...</p>
                                </div>
                            </div>

                            <!-- 二维码图片 -->
                            <div
                                v-else-if="loginQrCodeUrl"
                                class="rounded-xl border-2 border-slate-200 bg-white p-3 dark:border-slate-600 dark:bg-slate-800"
                            >
                                <img :src="loginQrCodeUrl" alt="小红书登录二维码" class="h-52 w-52 object-contain" />
                            </div>

                            <!-- 获取失败 -->
                            <div
                                v-else
                                class="flex h-56 w-56 flex-col items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700"
                            >
                                <UIcon name="i-heroicons-exclamation-circle" class="mb-2 text-4xl text-slate-400" />
                                <p class="text-sm text-slate-500 dark:text-slate-400">获取二维码失败</p>
                            </div>

                            <p class="mt-4 text-sm text-slate-600 dark:text-slate-400">打开小红书 App，扫描上方二维码</p>
                            <p class="mt-1 text-xs text-slate-400 dark:text-slate-500">扫码后点击「确认已登录」，再点发布按钮发布笔记</p>
                        </div>

                        <!-- 操作按钮 -->
                        <div class="flex gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
                            <button
                                type="button"
                                class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                                :disabled="isLoadingQrCode"
                                @click="refreshQrCode"
                            >
                                <UIcon name="i-heroicons-arrow-path" class="text-base" :class="{ 'animate-spin': isLoadingQrCode }" />
                                刷新二维码
                            </button>
                            <button
                                type="button"
                                class="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                                :disabled="isCheckingLoginStatus"
                                @click="checkLoginStatusAfterScan"
                            >
                                <UIcon name="i-heroicons-check" class="text-base" :class="{ 'animate-spin': isCheckingLoginStatus }" />
                                确认已登录
                            </button>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>
