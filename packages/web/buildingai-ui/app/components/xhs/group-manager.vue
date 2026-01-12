<script setup lang="ts">
import type { XhsGroup } from "@/types/xhs";
import { useXhsGroups } from "@/composables/useXhsGroups";

// Props
interface Props {
    modelValue: boolean;
}

// Emits
interface Emits {
    (e: "update:modelValue", value: boolean): void;
    (e: "groupsChanged"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// 使用分组管理组合式函数
const { groups, isLoading, fetchGroups, createGroup, updateGroup, deleteGroup } = useXhsGroups();

// Toast 通知
const toast = useMessage();

// 新建分组输入
const newGroupName = ref("");
const isCreating = ref(false);

// 编辑状态
const editingGroupId = ref<string | null>(null);
const editingGroupName = ref("");
const isUpdating = ref(false);

// 删除状态
const isDeleting = ref(false);
const deletingGroupId = ref<string | null>(null);

// 计算属性 - 控制弹窗显示
const isOpen = computed({
    get: () => props.modelValue,
    set: (value) => emit("update:modelValue", value),
});

// 加载分组列表
const loadGroups = async () => {
    await fetchGroups();
};

// 创建新分组
const handleCreateGroup = async () => {
    if (!newGroupName.value.trim()) {
        toast.error("请输入分组名称");
        return;
    }

    isCreating.value = true;
    try {
        const result = await createGroup(newGroupName.value);
        if (result) {
            newGroupName.value = "";
            emit("groupsChanged");
        }
    } finally {
        isCreating.value = false;
    }
};

// 开始编辑分组
const startEdit = (group: XhsGroup) => {
    if (group.isDefault) {
        toast.error("不能编辑默认分组");
        return;
    }
    editingGroupId.value = group.id;
    editingGroupName.value = group.name;
};

// 取消编辑
const cancelEdit = () => {
    editingGroupId.value = null;
    editingGroupName.value = "";
};

// 保存编辑
const saveEdit = async () => {
    if (!editingGroupId.value || !editingGroupName.value.trim()) {
        toast.error("请输入分组名称");
        return;
    }

    isUpdating.value = true;
    try {
        const result = await updateGroup(editingGroupId.value, editingGroupName.value);
        if (result) {
            cancelEdit();
            emit("groupsChanged");
        }
    } finally {
        isUpdating.value = false;
    }
};

// 删除分组
const handleDeleteGroup = async (group: XhsGroup) => {
    if (group.isDefault) {
        toast.error("不能删除默认分组");
        return;
    }

    try {
        const confirmed = await useModal({
            color: "error",
            title: "确认删除分组？",
            content: `删除分组"${group.name}"后，该分组下的所有笔记将被移动到默认分组。此操作不可撤销。`,
            confirmText: "确认删除",
            cancelText: "取消",
            ui: { content: "!w-sm" },
        });

        if (confirmed) {
            isDeleting.value = true;
            deletingGroupId.value = group.id;
            const result = await deleteGroup(group.id);
            if (result) {
                emit("groupsChanged");
            }
        }
    } catch {
        // 用户取消删除
    } finally {
        isDeleting.value = false;
        deletingGroupId.value = null;
    }
};

// 关闭弹窗
const closeModal = () => {
    isOpen.value = false;
    cancelEdit();
    newGroupName.value = "";
};

// 监听弹窗打开，加载分组列表
watch(isOpen, (value) => {
    if (value) {
        loadGroups();
    }
});
</script>

<template>
    <UModal v-model:open="isOpen" :ui="{ content: 'sm:max-w-lg' }">
        <template #content>
            <UCard>
                <template #header>
                    <div class="flex items-center justify-between">
                        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                            分组管理
                        </h3>
                        <UButton
                            variant="ghost"
                            color="neutral"
                            icon="i-heroicons-x-mark"
                            size="sm"
                            @click="closeModal"
                        />
                    </div>
                </template>

                <div class="space-y-6">
                    <!-- 新建分组 -->
                    <div class="space-y-2">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            新建分组
                        </label>
                        <div class="flex items-center space-x-2">
                            <UInput
                                v-model="newGroupName"
                                placeholder="输入分组名称"
                                class="flex-1"
                                :disabled="isCreating"
                                @keyup.enter="handleCreateGroup"
                            />
                            <UButton
                                color="primary"
                                :loading="isCreating"
                                :disabled="!newGroupName.trim()"
                                @click="handleCreateGroup"
                            >
                                创建
                            </UButton>
                        </div>
                    </div>

                    <!-- 分组列表 -->
                    <div class="space-y-2">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            现有分组
                        </label>

                        <!-- 加载状态 -->
                        <div v-if="isLoading" class="space-y-2">
                            <div
                                v-for="i in 3"
                                :key="i"
                                class="animate-pulse flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-800 rounded-lg"
                            >
                                <div class="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
                                <div class="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
                            </div>
                        </div>

                        <!-- 分组列表 -->
                        <div v-else class="space-y-2 max-h-80 overflow-y-auto">
                            <div
                                v-for="group in groups"
                                :key="group.id"
                                class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                                <!-- 编辑模式 -->
                                <template v-if="editingGroupId === group.id">
                                    <div class="flex items-center space-x-2 flex-1">
                                        <UInput
                                            v-model="editingGroupName"
                                            class="flex-1"
                                            size="sm"
                                            :disabled="isUpdating"
                                            @keyup.enter="saveEdit"
                                            @keyup.escape="cancelEdit"
                                        />
                                        <UButton
                                            variant="ghost"
                                            color="primary"
                                            icon="i-heroicons-check"
                                            size="xs"
                                            :loading="isUpdating"
                                            @click="saveEdit"
                                        />
                                        <UButton
                                            variant="ghost"
                                            color="neutral"
                                            icon="i-heroicons-x-mark"
                                            size="xs"
                                            :disabled="isUpdating"
                                            @click="cancelEdit"
                                        />
                                    </div>
                                </template>

                                <!-- 显示模式 -->
                                <template v-else>
                                    <div class="flex items-center space-x-2">
                                        <UIcon
                                            name="i-heroicons-folder"
                                            class="w-5 h-5 text-gray-400"
                                        />
                                        <span class="text-gray-900 dark:text-white">
                                            {{ group.name }}
                                        </span>
                                        <UBadge
                                            v-if="group.isDefault"
                                            color="primary"
                                            variant="soft"
                                            size="xs"
                                        >
                                            默认
                                        </UBadge>
                                    </div>

                                    <div class="flex items-center space-x-1">
                                        <UButton
                                            v-if="!group.isDefault"
                                            variant="ghost"
                                            color="neutral"
                                            icon="i-heroicons-pencil"
                                            size="xs"
                                            @click="startEdit(group)"
                                        />
                                        <UButton
                                            v-if="!group.isDefault"
                                            variant="ghost"
                                            color="error"
                                            icon="i-heroicons-trash"
                                            size="xs"
                                            :loading="isDeleting && deletingGroupId === group.id"
                                            @click="handleDeleteGroup(group)"
                                        />
                                    </div>
                                </template>
                            </div>

                            <!-- 空状态 -->
                            <div
                                v-if="groups.length === 0"
                                class="text-center py-8 text-gray-500 dark:text-gray-400"
                            >
                                <UIcon
                                    name="i-heroicons-folder-open"
                                    class="w-12 h-12 mx-auto mb-2 opacity-50"
                                />
                                <p>暂无分组</p>
                            </div>
                        </div>
                    </div>
                </div>

                <template #footer>
                    <div class="flex justify-end">
                        <UButton variant="outline" color="neutral" @click="closeModal">
                            关闭
                        </UButton>
                    </div>
                </template>
            </UCard>
        </template>
    </UModal>
</template>

<style scoped>
/* 自定义样式 */
</style>
