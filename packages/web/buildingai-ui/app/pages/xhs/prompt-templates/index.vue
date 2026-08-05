<script setup lang="ts">
import { xhsLayoutKey } from "@/constants/xhs-layout";

definePageMeta({
    layout: xhsLayoutKey,
    name: "XHS Prompt Templates",
    auth: true,
});

useSeoMeta({
    title: "提示词模板管理 - 小红书",
    description: "管理小红书笔记生成提示词模板",
});

const router = useRouter();
const toast = useMessage();

// ======================== 类型定义 ========================

interface PromptTemplateGroup {
    id: string;
    name: string;
    sortOrder: number;
    templateCount?: number;
}

interface PromptTemplate {
    id: string;
    name: string;
    content: string;
    status: number;
    groupId?: string;
    isDefault: boolean;
    sortOrder: number;
    group?: PromptTemplateGroup;
}

// ======================== 分组管理 ========================

const groups = ref<PromptTemplateGroup[]>([]);
const selectedGroupId = ref<string | null>(null);
const isLoadingGroups = ref(false);

const loadGroups = async () => {
    isLoadingGroups.value = true;
    try {
        const { get } = useAuthFetch();
        const { data } = await get<PromptTemplateGroup[]>("/api/xhs/prompt-template-groups");
        if (data) groups.value = data;
    } finally {
        isLoadingGroups.value = false;
    }
};

// 分组弹窗
const showGroupModal = ref(false);
const isEditingGroup = ref(false);
const groupForm = ref({ name: "", sortOrder: 0 });
const currentGroupId = ref<string | null>(null);
const isSavingGroup = ref(false);

const openAddGroup = () => {
    isEditingGroup.value = false;
    groupForm.value = { name: "", sortOrder: groups.value.length };
    currentGroupId.value = null;
    showGroupModal.value = true;
};

const openEditGroup = (group: PromptTemplateGroup) => {
    isEditingGroup.value = true;
    groupForm.value = { name: group.name, sortOrder: group.sortOrder };
    currentGroupId.value = group.id;
    showGroupModal.value = true;
};

const saveGroup = async () => {
    if (!groupForm.value.name.trim()) {
        toast.warning("请输入分组名称");
        return;
    }
    isSavingGroup.value = true;
    try {
        const { post, put } = useAuthFetch();
        if (isEditingGroup.value && currentGroupId.value) {
            await put(`/api/xhs/prompt-template-groups/${currentGroupId.value}`, groupForm.value);
            toast.success("分组已更新");
        } else {
            await post("/api/xhs/prompt-template-groups", groupForm.value);
            toast.success("分组已创建");
        }
        showGroupModal.value = false;
        await loadGroups();
    } finally {
        isSavingGroup.value = false;
    }
};

const confirmDeleteGroup = ref<PromptTemplateGroup | null>(null);
const isDeletingGroup = ref(false);

const deleteGroup = async () => {
    const group = confirmDeleteGroup.value;
    if (!group) return;
    const deletedId = group.id;
    isDeletingGroup.value = true;
    try {
        const { del } = useAuthFetch();
        await del(`/api/xhs/prompt-template-groups/${deletedId}`);
        toast.success("分组已删除，该组下的模板移至未分组");
        confirmDeleteGroup.value = null;
        if (selectedGroupId.value === deletedId) {
            selectedGroupId.value = null;
        }
        await loadGroups();
        await loadTemplates();
    } finally {
        isDeletingGroup.value = false;
    }
};

// ======================== 模板管理 ========================

const templates = ref<PromptTemplate[]>([]);
const defaultTemplateId = ref<string | null>(null);
const isLoadingTemplates = ref(false);

const filteredTemplates = computed(() => {
    if (!selectedGroupId.value) return templates.value;
    return templates.value.filter((t) => t.groupId === selectedGroupId.value);
});

const loadTemplates = async () => {
    isLoadingTemplates.value = true;
    try {
        const { get } = useAuthFetch();
        const params = selectedGroupId.value ? `?groupId=${selectedGroupId.value}` : "";
        const { data } = await get<{
            items: PromptTemplate[];
            groups: PromptTemplateGroup[];
            defaultTemplateId: string | null;
        }>(`/api/xhs/prompt-templates${params}`);
        if (data) {
            templates.value = data.items;
            defaultTemplateId.value = data.defaultTemplateId;
        }
    } finally {
        isLoadingTemplates.value = false;
    }
};

watch(selectedGroupId, () => {
    loadTemplates();
});

// 模板弹窗
const showTemplateModal = ref(false);
const isEditingTemplate = ref(false);
const currentTemplateId = ref<string | null>(null);
const isSavingTemplate = ref(false);
const templateForm = ref({
    name: "",
    content: "",
    status: 1,
    groupId: "" as string | undefined,
    sortOrder: 0,
});

const openAddTemplate = () => {
    isEditingTemplate.value = false;
    currentTemplateId.value = null;
    templateForm.value = {
        name: "",
        content: "",
        status: 1,
        groupId: selectedGroupId.value ?? undefined,
        sortOrder: 0,
    };
    showTemplateModal.value = true;
};

const openEditTemplate = (template: PromptTemplate) => {
    isEditingTemplate.value = true;
    currentTemplateId.value = template.id;
    templateForm.value = {
        name: template.name,
        content: template.content,
        status: template.status,
        groupId: template.groupId ?? undefined,
        sortOrder: template.sortOrder,
    };
    showTemplateModal.value = true;
};

const saveTemplate = async () => {
    if (!templateForm.value.name.trim()) {
        toast.warning("请输入模板名称");
        return;
    }
    if (!templateForm.value.content.trim()) {
        toast.warning("请输入模板内容");
        return;
    }
    isSavingTemplate.value = true;
    try {
        const { post, put } = useAuthFetch();
        const payload = {
            ...templateForm.value,
            groupId: templateForm.value.groupId || undefined,
        };
        if (isEditingTemplate.value && currentTemplateId.value) {
            await put(`/api/xhs/prompt-templates/${currentTemplateId.value}`, payload);
            toast.success("模板已更新");
        } else {
            await post("/api/xhs/prompt-templates", payload);
            toast.success("模板已创建");
        }
        showTemplateModal.value = false;
        await loadTemplates();
    } finally {
        isSavingTemplate.value = false;
    }
};

const confirmDeleteTemplate = ref<PromptTemplate | null>(null);
const isDeletingTemplate = ref(false);

const deleteTemplate = async () => {
    if (!confirmDeleteTemplate.value) return;
    isDeletingTemplate.value = true;
    try {
        const { del } = useAuthFetch();
        await del(`/api/xhs/prompt-templates/${confirmDeleteTemplate.value.id}`);
        toast.success("模板已删除");
        confirmDeleteTemplate.value = null;
        await loadTemplates();
    } finally {
        isDeletingTemplate.value = false;
    }
};

const isSettingDefault = ref<string | null>(null);

const setDefault = async (template: PromptTemplate) => {
    isSettingDefault.value = template.id;
    try {
        const { put } = useAuthFetch();
        await put(`/api/xhs/prompt-templates/${template.id}/set-default`, {});
        toast.success(`「${template.name}」已设为默认模板`);
        await loadTemplates();
    } finally {
        isSettingDefault.value = null;
    }
};

// ======================== 初始化 ========================

onMounted(async () => {
    await Promise.all([loadGroups(), loadTemplates()]);
});
</script>

<template>
    <div>
        <div class="container mx-auto px-4 py-8 md:py-10">
            <!-- 页头 -->
            <header class="mb-8 md:mb-10 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 class="mb-2 text-2xl font-bold tracking-tight text-stone-900 dark:text-white md:text-3xl">
                        提示词模板管理
                    </h1>
                    <p class="text-base text-stone-600 dark:text-gray-400">
                        管理小红书笔记生成的提示词模板与分组
                    </p>
                </div>
                <div class="flex gap-2">
                    <UButton
                        variant="outline"
                        color="neutral"
                        @click="router.push('/xhs/products')"
                    >
                        <UIcon name="i-heroicons-arrow-left" class="mr-1" />
                        返回商品管理
                    </UButton>
                </div>
            </header>

            <div class="grid grid-cols-1 gap-6 lg:grid-cols-4 md:gap-8">
                <!-- 左侧分组列表 -->
                <div class="lg:col-span-1">
                    <UCard class="border-stone-200/80 dark:border-gray-700">
                        <template #header>
                            <div class="flex items-center justify-between">
                                <span class="font-semibold text-stone-900 dark:text-white"
                                    >分组管理</span
                                >
                                <UButton size="xs" icon="i-heroicons-plus" @click="openAddGroup">
                                    新增分组
                                </UButton>
                            </div>
                        </template>

                        <div v-if="isLoadingGroups" class="flex justify-center py-4">
                            <UIcon
                                name="i-heroicons-arrow-path"
                                class="h-5 w-5 animate-spin text-gray-400"
                            />
                        </div>
                        <div v-else class="space-y-1">
                            <!-- 全部 -->
                            <button
                                type="button"
                                :class="[
                                    'w-full rounded-lg px-3 py-2 text-left text-sm transition-colors',
                                    !selectedGroupId
                                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800',
                                ]"
                                @click="selectedGroupId = null"
                            >
                                全部模板
                            </button>
                            <div
                                v-for="group in groups"
                                :key="group.id"
                                :class="[
                                    'flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 transition-colors',
                                    selectedGroupId === group.id
                                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800',
                                ]"
                                @click="selectedGroupId = group.id"
                            >
                                <span class="truncate text-sm">{{ group.name }}</span>
                                <div class="ml-2 flex shrink-0 items-center gap-1">
                                    <span class="text-xs text-gray-400">{{
                                        group.templateCount ?? 0
                                    }}</span>
                                    <UButton
                                        size="xs"
                                        variant="ghost"
                                        color="neutral"
                                        icon="i-heroicons-pencil"
                                        @click.stop="openEditGroup(group)"
                                    />
                                    <UButton
                                        size="xs"
                                        variant="ghost"
                                        color="error"
                                        icon="i-heroicons-trash"
                                        @click.stop="confirmDeleteGroup = group"
                                    />
                                </div>
                            </div>
                            <div
                                v-if="!groups.length"
                                class="py-4 text-center text-sm text-gray-400"
                            >
                                暂无分组
                            </div>
                        </div>
                    </UCard>
                </div>

                <!-- 右侧模板列表 -->
                <div class="lg:col-span-3">
                    <UCard>
                        <template #header>
                            <div class="flex items-center justify-between">
                                <span class="font-semibold text-gray-900 dark:text-white">
                                    {{
                                        selectedGroupId
                                            ? (groups.find((g) => g.id === selectedGroupId)?.name ??
                                              "分组")
                                            : "全部模板"
                                    }}
                                </span>
                                <UButton size="sm" icon="i-heroicons-plus" @click="openAddTemplate">
                                    新增模板
                                </UButton>
                            </div>
                        </template>

                        <div v-if="isLoadingTemplates" class="flex justify-center py-12">
                            <UIcon
                                name="i-heroicons-arrow-path"
                                class="h-8 w-8 animate-spin text-gray-400"
                            />
                        </div>
                        <div
                            v-else-if="!filteredTemplates.length"
                            class="py-12 text-center text-gray-400"
                        >
                            暂无模板，点击「新增模板」创建
                        </div>
                        <div v-else class="overflow-x-auto">
                            <table class="w-full text-left text-sm">
                                <thead>
                                    <tr class="border-b border-gray-200 dark:border-gray-700">
                                        <th class="pr-4 pb-3 font-medium text-gray-500">名称</th>
                                        <th class="pr-4 pb-3 font-medium text-gray-500">分组</th>
                                        <th class="pr-4 pb-3 font-medium text-gray-500">状态</th>
                                        <th class="pr-4 pb-3 font-medium text-gray-500">默认</th>
                                        <th class="pb-3 font-medium text-gray-500">操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr
                                        v-for="template in filteredTemplates"
                                        :key="template.id"
                                        class="border-b border-gray-100 dark:border-gray-800"
                                    >
                                        <td class="py-3 pr-4">
                                            <span class="font-medium text-gray-900 dark:text-white">
                                                {{ template.name }}
                                            </span>
                                        </td>
                                        <td class="py-3 pr-4 text-gray-500">
                                            {{ template.group?.name ?? "未分组" }}
                                        </td>
                                        <td class="py-3 pr-4">
                                            <UBadge
                                                :color="
                                                    template.status === 1 ? 'success' : 'neutral'
                                                "
                                                variant="soft"
                                                size="sm"
                                            >
                                                {{ template.status === 1 ? "启用" : "禁用" }}
                                            </UBadge>
                                        </td>
                                        <td class="py-3 pr-4">
                                            <UBadge
                                                v-if="template.isDefault"
                                                color="primary"
                                                variant="soft"
                                                size="sm"
                                            >
                                                默认
                                            </UBadge>
                                        </td>
                                        <td class="py-3">
                                            <div class="flex items-center gap-2">
                                                <UButton
                                                    size="xs"
                                                    variant="outline"
                                                    color="neutral"
                                                    icon="i-heroicons-pencil"
                                                    @click="openEditTemplate(template)"
                                                >
                                                    编辑
                                                </UButton>
                                                <UButton
                                                    v-if="!template.isDefault"
                                                    size="xs"
                                                    variant="outline"
                                                    color="primary"
                                                    :loading="isSettingDefault === template.id"
                                                    @click="setDefault(template)"
                                                >
                                                    设为默认
                                                </UButton>
                                                <UButton
                                                    size="xs"
                                                    variant="outline"
                                                    color="error"
                                                    icon="i-heroicons-trash"
                                                    @click="confirmDeleteTemplate = template"
                                                >
                                                    删除
                                                </UButton>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </UCard>
                </div>
            </div>
        </div>

        <!-- 分组新建/编辑弹窗 -->
        <UModal v-model:open="showGroupModal">
            <template #content>
                <div class="p-6">
                    <h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                        {{ isEditingGroup ? "编辑分组" : "新增分组" }}
                    </h3>
                    <div class="space-y-4">
                        <div>
                            <label
                                class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                            >
                                分组名称 <span class="text-red-500">*</span>
                            </label>
                            <UInput v-model="groupForm.name" placeholder="请输入分组名称" />
                        </div>
                        <div>
                            <label
                                class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                            >
                                排序（数值越小越靠前）
                            </label>
                            <UInput v-model.number="groupForm.sortOrder" type="number" :min="0" />
                        </div>
                    </div>
                    <div class="mt-6 flex justify-end gap-3">
                        <UButton variant="outline" color="neutral" @click="showGroupModal = false">
                            取消
                        </UButton>
                        <UButton :loading="isSavingGroup" @click="saveGroup">
                            {{ isEditingGroup ? "保存" : "创建" }}
                        </UButton>
                    </div>
                </div>
            </template>
        </UModal>

        <!-- 分组删除确认弹窗 -->
        <UModal
            :open="!!confirmDeleteGroup"
            @update:open="(v) => { if (!v) confirmDeleteGroup = null }"
        >
            <template #content>
                <div class="p-6">
                    <h3 class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
                        确认删除分组
                    </h3>
                    <p class="mb-6 text-gray-600 dark:text-gray-400">
                        确定要删除分组「{{
                            confirmDeleteGroup?.name
                        }}」吗？该组下的模板将移至未分组。
                    </p>
                    <div class="flex justify-end gap-3">
                        <UButton
                            variant="outline"
                            color="neutral"
                            @click="confirmDeleteGroup = null"
                            >取消</UButton
                        >
                        <UButton color="error" :loading="isDeletingGroup" @click="deleteGroup"
                            >确认删除</UButton
                        >
                    </div>
                </div>
            </template>
        </UModal>

        <!-- 模板新建/编辑：用 UModal 自带 body/footer，body 为 flex-1 + overflow-y-auto，底部按钮始终在视口内 -->
        <UModal
            v-model:open="showTemplateModal"
            :title="isEditingTemplate ? '编辑模板' : '新增模板'"
            :ui="{
                content: 'w-[calc(100vw-2rem)] max-w-4xl sm:max-w-4xl',
                footer: 'justify-end gap-3',
            }"
        >
            <template #body>
                <div class="space-y-4">
                    <div>
                        <label
                            class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                        >
                            模板名称 <span class="text-red-500">*</span>
                        </label>
                        <UInput v-model="templateForm.name" placeholder="如：万能种草型" />
                    </div>
                    <div>
                        <label
                            class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                        >
                            所属分组
                        </label>
                        <USelectMenu
                            :model-value="templateForm.groupId ?? ''"
                            :items="[
                                { label: '未分组', value: '' },
                                ...groups.map((g) => ({ label: g.name, value: g.id })),
                            ]"
                            value-key="value"
                            placeholder="选择分组（可选）"
                            @update:model-value="(v) => (templateForm.groupId = v === '' ? undefined : (v as string))"
                        />
                    </div>
                    <div>
                        <label
                            class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                        >
                            模板内容 <span class="text-red-500">*</span>
                        </label>
                        <p class="mb-1 text-xs text-gray-400">
                            支持变量：<code class="rounded bg-gray-100 px-1 dark:bg-gray-800"
                                >{product_name}</code
                            >（必有）、
                            <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">{spec}</code>、
                            <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">{description}</code
                            >（可选）
                        </p>
                        <UTextarea
                            v-model="templateForm.content"
                            :rows="10"
                            autoresize
                            :maxrows="20"
                            placeholder="请输入提示词内容，例如：请为商品「{product_name}」写一篇小红书笔记..."
                            class="w-full min-h-[8rem] font-mono text-sm"
                        />
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label
                                class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                                >状态</label
                            >
                            <USelectMenu
                                :model-value="templateForm.status"
                                :items="[
                                    { label: '启用', value: 1 },
                                    { label: '禁用', value: 0 },
                                ]"
                                value-key="value"
                                @update:model-value="(v) => (templateForm.status = Number(v))"
                            />
                        </div>
                        <div>
                            <label
                                class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                                >排序</label
                            >
                            <UInput
                                v-model.number="templateForm.sortOrder"
                                type="number"
                                :min="0"
                            />
                        </div>
                    </div>
                </div>
            </template>
            <template #footer>
                <UButton variant="outline" color="neutral" @click="showTemplateModal = false">
                    取消
                </UButton>
                <UButton :loading="isSavingTemplate" @click="saveTemplate">
                    {{ isEditingTemplate ? "保存" : "创建" }}
                </UButton>
            </template>
        </UModal>

        <!-- 模板删除确认弹窗 -->
        <UModal
            :open="!!confirmDeleteTemplate"
            @update:open="(v) => { if (!v) confirmDeleteTemplate = null }"
        >
            <template #content>
                <div class="p-6">
                    <h3 class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
                        确认删除模板
                    </h3>
                    <p class="mb-6 text-gray-600 dark:text-gray-400">
                        确定要删除模板「{{ confirmDeleteTemplate?.name }}」吗？此操作不可恢复。
                    </p>
                    <div class="flex justify-end gap-3">
                        <UButton
                            variant="outline"
                            color="neutral"
                            @click="confirmDeleteTemplate = null"
                            >取消</UButton
                        >
                        <UButton color="error" :loading="isDeletingTemplate" @click="deleteTemplate"
                            >确认删除</UButton
                        >
                    </div>
                </div>
            </template>
        </UModal>
    </div>
</template>
