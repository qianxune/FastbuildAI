<script setup lang="ts">
import { usePublishSchedule } from "@/composables/usePublishSchedule";
import type { CreatePublishScheduleDto } from "@/types/xhs";

definePageMeta({
    layout: false,
    name: "Create Publish Schedule",
    auth: true,
});

useSeoMeta({
    title: "创建定时发布计划 - 小红书",
    description: "创建小红书笔记定时发布计划",
});

const route = useRoute();
const router = useRouter();
const toast = useMessage();
const { createSchedule } = usePublishSchedule();

// 从 URL 获取笔记 ID 列表
const noteIds = ref<string[]>([]);
const notes = ref<Array<{ id: string; title: string; content: string }>>([]);

// 表单数据
const form = ref<CreatePublishScheduleDto>({
    noteIds: [],
    startTime: "",
    interval: 30,
});

const isLoading = ref(false);
const isSubmitting = ref(false);

// 加载笔记信息
onMounted(async () => {
    const noteIdsStr = route.query.noteIds as string;
    if (!noteIdsStr) {
        toast.error("未选择笔记");
        router.push("/xhs/batch-generate");
        return;
    }

    noteIds.value = noteIdsStr.split(",").filter(Boolean);
    form.value.noteIds = noteIds.value;

    // 加载笔记详情
    await loadNotes();

    // 设置默认开始时间为当前时间 + 5 分钟
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    form.value.startTime = formatDateTimeLocal(now);
});

// 加载笔记详情
const loadNotes = async () => {
    isLoading.value = true;
    const { get } = useAuthFetch();

    try {
        for (const noteId of noteIds.value) {
            const { data } = await get<{ id: string; title: string; content: string }>(
                `/api/xhs/notes/${noteId}`,
            );
            if (data) {
                notes.value.push(data);
            }
        }
    } catch (error) {
        console.error("加载笔记失败:", error);
        toast.error("加载笔记信息失败");
    } finally {
        isLoading.value = false;
    }
};

// 格式化日期时间为 datetime-local 输入框格式
const formatDateTimeLocal = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
};

// 计算预计完成时间
const estimatedEndTime = computed(() => {
    if (!form.value.startTime || !form.value.interval || notes.value.length === 0) {
        return "";
    }

    const start = new Date(form.value.startTime);
    const totalMinutes = (notes.value.length - 1) * form.value.interval;
    const end = new Date(start.getTime() + totalMinutes * 60000);

    return end.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
});

// 提交表单
const handleSubmit = async () => {
    // 验证表单
    if (!form.value.startTime) {
        toast.error("请选择首次发布时间");
        return;
    }

    if (form.value.interval < 1) {
        toast.error("发布间隔至少为 1 分钟");
        return;
    }

    if (form.value.noteIds.length === 0) {
        toast.error("没有选择笔记");
        return;
    }

    // 验证开始时间不能早于当前时间
    const startTime = new Date(form.value.startTime);
    const now = new Date();
    if (startTime < now) {
        toast.error("首次发布时间不能早于当前时间");
        return;
    }

    isSubmitting.value = true;

    try {
        const result = await createSchedule(form.value);

        if (result) {
            toast.success("定时发布计划创建成功！");
        } else {
            toast.error("创建失败，请重试");
        }
    } catch (error) {
        console.error("创建定时发布计划失败:", error);
        toast.error(error instanceof Error ? error.message : "创建失败");
    } finally {
        isSubmitting.value = false;
    }
};

// 取消并返回
const handleCancel = () => {
    router.back();
};
</script>

<template>
    <div class="min-h-screen bg-stone-50 dark:bg-gray-900">
        <div class="container mx-auto px-4 py-8 md:py-10">
            <!-- Header -->
            <header class="mb-8">
                <div class="mb-4 flex items-center gap-2">
                    <UButton variant="ghost" size="sm" @click="handleCancel">
                        <UIcon name="i-heroicons-arrow-left" />
                    </UButton>
                    <h1
                        class="text-2xl font-bold tracking-tight text-stone-900 md:text-3xl dark:text-white"
                    >
                        创建定时发布计划
                    </h1>
                </div>
                <p class="text-base text-stone-600 dark:text-gray-400">
                    设置笔记的发布时间和间隔，系统将自动按计划发布
                </p>
            </header>

            <div class="grid gap-6 lg:grid-cols-3">
                <!-- 左侧：表单 -->
                <div class="lg:col-span-2">
                    <UCard>
                        <template #header>
                            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
                                发布设置
                            </h2>
                        </template>

                        <div class="space-y-6">
                            <!-- 首次发布时间 -->
                            <div>
                                <label
                                    class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                                >
                                    首次发布时间
                                    <span class="text-red-500">*</span>
                                </label>
                                <input
                                    v-model="form.startTime"
                                    type="datetime-local"
                                    class="focus:border-primary-500 focus:ring-primary-500 w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                                    :min="formatDateTimeLocal(new Date())"
                                />
                                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    第一条笔记将在此时间发布
                                </p>
                            </div>

                            <!-- 发布间隔 -->
                            <div>
                                <label
                                    class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                                >
                                    发布间隔（分钟）
                                    <span class="text-red-500">*</span>
                                </label>
                                <input
                                    v-model.number="form.interval"
                                    type="number"
                                    min="1"
                                    step="1"
                                    class="focus:border-primary-500 focus:ring-primary-500 w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                                />
                                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    每条笔记之间的发布间隔时间
                                </p>
                            </div>

                            <!-- 预计完成时间 -->
                            <div
                                v-if="estimatedEndTime"
                                class="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20"
                            >
                                <div class="flex items-start gap-3">
                                    <UIcon
                                        name="i-heroicons-information-circle"
                                        class="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400"
                                    />
                                    <div>
                                        <p
                                            class="text-sm font-medium text-blue-900 dark:text-blue-100"
                                        >
                                            预计完成时间
                                        </p>
                                        <p class="mt-1 text-sm text-blue-700 dark:text-blue-300">
                                            {{ estimatedEndTime }}
                                        </p>
                                        <p class="mt-1 text-xs text-blue-600 dark:text-blue-400">
                                            共 {{ notes.length }} 条笔记，预计耗时
                                            {{
                                                Math.ceil(((notes.length - 1) * form.interval) / 60)
                                            }}
                                            小时
                                            {{ ((notes.length - 1) * form.interval) % 60 }} 分钟
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <!-- 操作按钮 -->
                            <div
                                class="flex gap-3 border-t border-gray-200 pt-6 dark:border-gray-700"
                            >
                                <UButton
                                    color="primary"
                                    size="lg"
                                    :loading="isSubmitting"
                                    :disabled="isLoading || isSubmitting"
                                    @click="handleSubmit"
                                >
                                    <UIcon name="i-heroicons-check" class="mr-2" />
                                    创建计划
                                </UButton>
                                <UButton
                                    variant="outline"
                                    color="neutral"
                                    size="lg"
                                    :disabled="isSubmitting"
                                    @click="handleCancel"
                                >
                                    取消
                                </UButton>
                            </div>
                        </div>
                    </UCard>
                </div>

                <!-- 右侧：笔记列表 -->
                <div>
                    <UCard>
                        <template #header>
                            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
                                待发布笔记 ({{ notes.length }})
                            </h2>
                        </template>

                        <div v-if="isLoading" class="space-y-3">
                            <div
                                v-for="i in 3"
                                :key="i"
                                class="h-20 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700"
                            ></div>
                        </div>

                        <div v-else-if="notes.length === 0" class="py-8 text-center">
                            <UIcon
                                name="i-heroicons-document-text"
                                class="mx-auto h-12 w-12 text-gray-400"
                            />
                            <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">暂无笔记</p>
                        </div>

                        <div v-else class="space-y-3">
                            <div
                                v-for="(note, index) in notes"
                                :key="note.id"
                                class="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                            >
                                <div class="mb-2 flex items-start justify-between">
                                    <span
                                        class="bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium"
                                    >
                                        {{ index + 1 }}
                                    </span>
                                    <span class="text-xs text-gray-500 dark:text-gray-400">
                                        {{
                                            form.startTime
                                                ? new Date(
                                                      new Date(form.startTime).getTime() +
                                                          index * form.interval * 60000,
                                                  ).toLocaleString("zh-CN", {
                                                      month: "2-digit",
                                                      day: "2-digit",
                                                      hour: "2-digit",
                                                      minute: "2-digit",
                                                  })
                                                : "-"
                                        }}
                                    </span>
                                </div>
                                <h3
                                    class="mb-1 line-clamp-2 text-sm font-medium text-gray-900 dark:text-white"
                                >
                                    {{ note.title }}
                                </h3>
                                <p class="line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                                    {{ note.content }}
                                </p>
                            </div>
                        </div>
                    </UCard>
                </div>
            </div>
        </div>
    </div>
</template>
