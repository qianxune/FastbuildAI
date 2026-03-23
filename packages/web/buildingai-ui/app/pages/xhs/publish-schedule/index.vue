<script setup lang="ts">
import type {
    PublishSchedule,
    PublishScheduleStatus,
    PublishScheduleItem,
} from "@/types/xhs";
import { usePublishSchedule } from "@/composables/usePublishSchedule";

definePageMeta({
    layout: false,
    name: "Publish Schedule List",
    auth: true,
});

useSeoMeta({
    title: "定时发布计划 - 小红书",
    description: "管理小红书笔记定时发布计划",
});

const router = useRouter();
const toast = useMessage();
const {
    schedules,
    total,
    isLoading,
    fetchSchedules,
    fetchScheduleDetail,
    pauseSchedule,
    resumeSchedule,
    cancelSchedule,
} = usePublishSchedule();

// 筛选和分页状态
const selectedStatus = ref<PublishScheduleStatus | "">("");
const currentPage = ref(1);
const pageSize = ref(10);

// 详情弹窗
const showDetailModal = ref(false);
const selectedSchedule = ref<PublishSchedule | null>(null);
const scheduleItems = ref<PublishScheduleItem[]>([]);
const isLoadingDetail = ref(false);

// 取消确认弹窗
const showCancelModal = ref(false);
const scheduleToCancel = ref<PublishSchedule | null>(null);

// 加载计划列表
const loadSchedules = async () => {
    await fetchSchedules({
        page: currentPage.value,
        limit: pageSize.value,
        status: selectedStatus.value || undefined,
    });
};

// 初始加载
onMounted(() => {
    loadSchedules();
});

// 状态筛选变化
watch(selectedStatus, () => {
    currentPage.value = 1;
    loadSchedules();
});

// 页码变化
watch(currentPage, () => {
    loadSchedules();
});

// 查看详情
const viewDetail = async (schedule: PublishSchedule) => {
    selectedSchedule.value = schedule;
    scheduleItems.value = [];
    showDetailModal.value = true;
    isLoadingDetail.value = true;
    try {
        const detail = await fetchScheduleDetail(schedule.id);
        if (detail) {
            scheduleItems.value = detail.items;
        }
    } finally {
        isLoadingDetail.value = false;
    }
};

// 关闭详情弹窗
const closeDetailModal = () => {
    showDetailModal.value = false;
    selectedSchedule.value = null;
    scheduleItems.value = [];
};

// 获取计划项状态标签
const getItemStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
        pending: "待发布",
        publishing: "发布中",
        published: "已发布",
        failed: "失败",
    };
    return labels[status] || status;
};

// 获取计划项状态颜色
const getItemStatusColor = (status: string) => {
    const colors: Record<string, string> = {
        pending: "text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-800",
        publishing: "text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900",
        published: "text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900",
        failed: "text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900",
    };
    return colors[status] || "text-gray-600 bg-gray-100";
};

// 暂停计划
const handlePause = async (schedule: PublishSchedule) => {
    const success = await pauseSchedule(schedule.id);
    if (success) {
        await loadSchedules();
    }
};

// 恢复计划
const handleResume = async (schedule: PublishSchedule) => {
    const success = await resumeSchedule(schedule.id);
    if (success) {
        await loadSchedules();
    }
};

// 取消计划 - 打开确认弹窗
const handleCancel = (schedule: PublishSchedule) => {
    scheduleToCancel.value = schedule;
    showCancelModal.value = true;
};

// 确认取消
const confirmCancel = async () => {
    if (!scheduleToCancel.value) return;
    const success = await cancelSchedule(scheduleToCancel.value.id);
    showCancelModal.value = false;
    scheduleToCancel.value = null;
    if (success) {
        await loadSchedules();
    }
};

// 关闭取消弹窗
const closeCancelModal = () => {
    showCancelModal.value = false;
    scheduleToCancel.value = null;
};

// 获取状态标签
const getStatusLabel = (status: PublishScheduleStatus) => {
    const labels: Record<PublishScheduleStatus, string> = {
        pending: "待执行",
        running: "执行中",
        completed: "已完成",
        paused: "已暂停",
        cancelled: "已取消",
    };
    return labels[status] || status;
};

// 获取状态颜色
const getStatusColor = (status: PublishScheduleStatus) => {
    const colors: Record<PublishScheduleStatus, string> = {
        pending: "text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-800",
        running: "text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900",
        completed: "text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900",
        paused: "text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900",
        cancelled: "text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900",
    };
    return colors[status] || "text-gray-600 bg-gray-100";
};

// 格式化日期时间
const formatDateTime = (date: string | Date) => {
    return new Date(date).toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
};

// 返回批量生成页面
const goBack = () => {
    router.push("/xhs/batch-generate");
};
</script>

<template>
    <div class="min-h-screen bg-stone-50 dark:bg-gray-900">
        <div class="container mx-auto px-4 py-8 md:py-10">
            <!-- Header -->
            <header class="mb-8 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1
                        class="mb-2 text-2xl font-bold tracking-tight text-stone-900 md:text-3xl dark:text-white"
                    >
                        定时发布计划
                    </h1>
                    <p class="text-base text-stone-600 dark:text-gray-400">
                        管理和查看所有定时发布计划
                    </p>
                </div>
                <UButton variant="ghost" color="neutral" @click="goBack">
                    <UIcon name="i-heroicons-arrow-left" class="mr-1" />
                    返回
                </UButton>
            </header>

            <!-- 筛选器 -->
            <div class="mb-6">
                <UCard>
                    <div class="flex flex-wrap items-center gap-4">
                        <div class="flex items-center gap-2">
                            <span class="text-sm font-medium text-gray-700 dark:text-gray-300"
                                >状态：</span
                            >
                            <select
                                v-model="selectedStatus"
                                class="focus:border-primary-500 focus:ring-primary-500 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                            >
                                <option value="">全部</option>
                                <option value="pending">待执行</option>
                                <option value="running">执行中</option>
                                <option value="completed">已完成</option>
                                <option value="paused">已暂停</option>
                                <option value="cancelled">已取消</option>
                            </select>
                        </div>
                        <div class="ml-auto text-sm text-gray-600 dark:text-gray-400">
                            共 {{ total }} 个计划
                        </div>
                    </div>
                </UCard>
            </div>

            <!-- 计划列表 -->
            <UCard>
                <div v-if="isLoading" class="space-y-4">
                    <div
                        v-for="i in 3"
                        :key="i"
                        class="h-24 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700"
                    ></div>
                </div>

                <div v-else-if="schedules.length === 0" class="py-16 text-center">
                    <UIcon name="i-heroicons-calendar" class="mx-auto h-16 w-16 text-gray-400" />
                    <p class="mt-4 text-lg font-medium text-gray-900 dark:text-white">
                        暂无发布计划
                    </p>
                    <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        从批量生成页面创建定时发布计划
                    </p>
                </div>

                <div v-else class="space-y-4">
                    <div
                        v-for="schedule in schedules"
                        :key="schedule.id"
                        class="rounded-lg border border-gray-200 p-4 transition-all hover:shadow-md dark:border-gray-700"
                    >
                        <div class="flex items-start justify-between">
                            <div class="flex-1">
                                <div class="mb-2 flex items-center gap-3">
                                    <span
                                        class="rounded-full px-3 py-1 text-xs font-medium"
                                        :class="getStatusColor(schedule.status)"
                                    >
                                        {{ getStatusLabel(schedule.status) }}
                                    </span>
                                    <span class="text-sm text-gray-600 dark:text-gray-400">
                                        {{ schedule.publishedCount }} /
                                        {{ schedule.totalCount }} 已发布
                                    </span>
                                </div>

                                <div class="mb-2 grid gap-2 text-sm md:grid-cols-2">
                                    <div class="flex items-center gap-2">
                                        <UIcon
                                            name="i-heroicons-clock"
                                            class="h-4 w-4 text-gray-400"
                                        />
                                        <span class="text-gray-600 dark:text-gray-400"
                                            >首次发布：</span
                                        >
                                        <span class="font-medium text-gray-900 dark:text-white">
                                            {{ formatDateTime(schedule.startTime) }}
                                        </span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <UIcon
                                            name="i-heroicons-arrow-path"
                                            class="h-4 w-4 text-gray-400"
                                        />
                                        <span class="text-gray-600 dark:text-gray-400">间隔：</span>
                                        <span class="font-medium text-gray-900 dark:text-white">
                                            {{ schedule.interval }} 分钟
                                        </span>
                                    </div>
                                </div>

                                <!-- 进度条 -->
                                <div class="mt-3">
                                    <div class="mb-1 flex items-center justify-between text-xs">
                                        <span class="text-gray-600 dark:text-gray-400"
                                            >发布进度</span
                                        >
                                        <span class="font-medium text-gray-900 dark:text-white">
                                            {{
                                                Math.round(
                                                    (schedule.publishedCount /
                                                        schedule.totalCount) *
                                                        100,
                                                )
                                            }}%
                                        </span>
                                    </div>
                                    <div
                                        class="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
                                    >
                                        <div
                                            class="bg-primary-500 h-full transition-all duration-300"
                                            :style="{
                                                width: `${(schedule.publishedCount / schedule.totalCount) * 100}%`,
                                            }"
                                        ></div>
                                    </div>
                                </div>
                            </div>

                            <!-- 操作按钮 -->
                            <div class="ml-4 flex flex-col gap-2">
                                <UButton size="sm" variant="outline" @click="viewDetail(schedule)">
                                    <UIcon name="i-heroicons-eye" class="mr-1" />
                                    详情
                                </UButton>

                                <UButton
                                    v-if="schedule.status === 'running'"
                                    size="sm"
                                    variant="outline"
                                    color="warning"
                                    @click="handlePause(schedule)"
                                >
                                    <UIcon name="i-heroicons-pause" class="mr-1" />
                                    暂停
                                </UButton>

                                <UButton
                                    v-if="schedule.status === 'paused'"
                                    size="sm"
                                    variant="outline"
                                    color="success"
                                    @click="handleResume(schedule)"
                                >
                                    <UIcon name="i-heroicons-play" class="mr-1" />
                                    恢复
                                </UButton>

                                <UButton
                                    v-if="
                                        ['pending', 'running', 'paused'].includes(schedule.status)
                                    "
                                    size="sm"
                                    variant="outline"
                                    color="error"
                                    @click="handleCancel(schedule)"
                                >
                                    <UIcon name="i-heroicons-x-mark" class="mr-1" />
                                    取消
                                </UButton>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 分页 -->
                <div v-if="total > pageSize" class="mt-6 flex justify-center">
                    <div class="flex items-center gap-2">
                        <UButton
                            size="sm"
                            variant="outline"
                            :disabled="currentPage === 1"
                            @click="currentPage--"
                        >
                            上一页
                        </UButton>
                        <span class="text-sm text-gray-600 dark:text-gray-400">
                            第 {{ currentPage }} / {{ Math.ceil(total / pageSize) }} 页
                        </span>
                        <UButton
                            size="sm"
                            variant="outline"
                            :disabled="currentPage >= Math.ceil(total / pageSize)"
                            @click="currentPage++"
                        >
                            下一页
                        </UButton>
                    </div>
                </div>
            </UCard>
        </div>

        <!-- 取消确认弹窗 -->
        <UModal v-model:open="showCancelModal">
            <template #content>
                <UCard>
                    <template #header>
                        <div class="flex items-center gap-3">
                            <div
                                class="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30"
                            >
                                <UIcon
                                    name="i-heroicons-exclamation-triangle"
                                    class="h-5 w-5 text-red-600 dark:text-red-400"
                                />
                            </div>
                            <h3 class="text-base font-semibold text-gray-900 dark:text-white">
                                取消发布计划
                            </h3>
                        </div>
                    </template>

                    <p class="text-sm text-gray-600 dark:text-gray-400">
                        确定要取消这个发布计划吗？取消后，尚未发布的笔记将不会自动发布，此操作不可撤销。
                    </p>

                    <template #footer>
                        <div class="flex justify-end gap-3">
                            <UButton variant="outline" color="neutral" @click="closeCancelModal">
                                返回
                            </UButton>
                            <UButton color="error" :loading="isLoading" @click="confirmCancel">
                                确认取消
                            </UButton>
                        </div>
                    </template>
                </UCard>
            </template>
        </UModal>

        <!-- 详情弹窗 -->
        <UModal v-model:open="showDetailModal" :ui="{ content: 'sm:max-w-3xl' }">
            <template #content>
                <UCard v-if="selectedSchedule">
                    <template #header>
                        <div class="flex items-center justify-between">
                            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                                计划详情
                            </h3>
                            <UButton
                                variant="ghost"
                                color="neutral"
                                icon="i-heroicons-x-mark"
                                size="sm"
                                @click="closeDetailModal"
                            />
                        </div>
                    </template>

                    <div class="space-y-4">
                        <div class="grid gap-4 md:grid-cols-2">
                            <div>
                                <span class="text-sm text-gray-600 dark:text-gray-400">状态</span>
                                <p
                                    class="mt-1 inline-block rounded-full px-3 py-1 text-sm font-medium"
                                    :class="getStatusColor(selectedSchedule.status)"
                                >
                                    {{ getStatusLabel(selectedSchedule.status) }}
                                </p>
                            </div>
                            <div>
                                <span class="text-sm text-gray-600 dark:text-gray-400"
                                    >发布进度</span
                                >
                                <p class="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                                    {{ selectedSchedule.publishedCount }} /
                                    {{ selectedSchedule.totalCount }}
                                </p>
                            </div>
                            <div>
                                <span class="text-sm text-gray-600 dark:text-gray-400"
                                    >首次发布时间</span
                                >
                                <p class="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                                    {{ formatDateTime(selectedSchedule.startTime) }}
                                </p>
                            </div>
                            <div>
                                <span class="text-sm text-gray-600 dark:text-gray-400"
                                    >发布间隔</span
                                >
                                <p class="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                                    {{ selectedSchedule.interval }} 分钟
                                </p>
                            </div>
                        </div>

                        <!-- 笔记列表 -->
                        <div class="border-t border-gray-200 pt-4 dark:border-gray-700">
                            <p class="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                                笔记列表 ({{ selectedSchedule.totalCount }})
                            </p>

                            <!-- 加载中 -->
                            <div v-if="isLoadingDetail" class="space-y-2">
                                <div
                                    v-for="i in 3"
                                    :key="i"
                                    class="h-16 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"
                                />
                            </div>

                            <!-- 笔记条目 -->
                            <div v-else-if="scheduleItems.length > 0" class="space-y-2 max-h-72 overflow-y-auto pr-1">
                                <div
                                    v-for="item in scheduleItems"
                                    :key="item.id"
                                    class="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                                >
                                    <div class="flex items-start justify-between gap-3">
                                        <!-- 序号 -->
                                        <span
                                            class="bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium"
                                        >
                                            {{ item.order }}
                                        </span>

                                        <!-- 笔记信息 -->
                                        <div class="min-w-0 flex-1">
                                            <p class="truncate text-sm font-medium text-gray-900 dark:text-white">
                                                {{ item.note?.title || "（无标题）" }}
                                            </p>
                                            <p class="mt-0.5 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
                                                {{ item.note?.content || "" }}
                                            </p>
                                            <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                                <span>预计：{{ formatDateTime(item.scheduledTime) }}</span>
                                                <span v-if="item.publishedTime">· 已发布：{{ formatDateTime(item.publishedTime) }}</span>
                                                <span v-if="item.error" class="text-red-500">· {{ item.error }}</span>
                                            </div>
                                        </div>

                                        <!-- 状态标签 -->
                                        <span
                                            class="flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                                            :class="getItemStatusColor(item.status)"
                                        >
                                            {{ getItemStatusLabel(item.status) }}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <p v-else class="text-xs text-gray-500 dark:text-gray-400">
                                暂无笔记数据
                            </p>
                        </div>
                    </div>
                </UCard>
            </template>
        </UModal>
    </div>
</template>
