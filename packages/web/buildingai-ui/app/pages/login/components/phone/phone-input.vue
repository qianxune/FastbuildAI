<script setup lang="ts">
// 导入动画组件
import { Motion } from "motion-v";
// 导入 Vue 响应式 API
import { reactive, ref } from "vue";
// 导入 yup 类型和函数
import type { InferType } from "yup";
import { object, string } from "yup";

// 导入 UI 组件库的类型
import type { FormSubmitEvent } from "#ui/types";

// 导入短信类型常量
import { SMS_TYPE } from "@buildingai/constants/web";
// 导入发送短信 API
import { apiSmsSend } from "@buildingai/service/webapi/user";

// 异步加载隐私条款组件
const PrivacyTerms = defineAsyncComponent(() => import("../privacy-terms.vue"));

// 定义组件事件
const emit = defineEmits<{
    (e: "next", v: string): void;                   // 下一步事件，传递手机号
    (e: "switchComponent", component: string): void;// 切换组件事件
}>();

// 获取应用和用户 Store
const appStore = useAppStore();
const userStore = useUserStore();
// 获取消息提示工具
const toast = useMessage();
// 地区代码配置
const areaCodes = ref<{ value: string; label: string }[]>([{ value: "中国大陆", label: "86" }]);
const selected = ref(areaCodes.value[0]);

// 表单验证架构
const phoneSchema = object({
    phone: string()
        .required("请输入手机号")
        .matches(/^1[3-9]\d{9}$/, "请输入正确的手机号码"),
});

// 推断 Schema 类型
type PhoneSchema = InferType<typeof phoneSchema>;

// 表单状态
const phoneState = reactive({
    phone: "",
});

// 处理表单提交，使用 useLockFn 防止重复点击
const { lockFn: onPhoneSubmit, isLock } = useLockFn(async (event: FormSubmitEvent<PhoneSchema>) => {
    // 检查是否同意隐私协议
    if (!userStore.isAgreed && !!appStore.loginWay.loginAgreement) {
        toast.warning("请先同意隐私协议和服务条款", {
            title: "温馨提示",
            duration: 3000,
        });
        return;
    }

    try {
        // 调用发送短信的 API
        await apiSmsSend({
            scene: SMS_TYPE.LOGIN,
            mobile: phoneState.phone,
        });
        
        // 发送成功提示
        toast.success("验证码已发送，请注意查收", {
            title: "发送成功",
            duration: 3000,
        });
        // 验证成功，触发 next 事件，进入验证码输入步骤
        emit("next", event.data.phone);
    } catch (error) {
        console.error("发送验证码失败:", error);
        toast.error("验证码发送失败，请稍后重试", {
            title: "发送失败",
            duration: 3000,
        });
    }
});
</script>

<template>
    <div class="px-8 pt-8">
        <!-- 标题动画 -->
        <Motion
            :initial="{ opacity: 0, y: 10 }"
            :animate="{ opacity: 1, y: 0 }"
            :transition="{
                type: 'tween',
                stiffness: 300,
                damping: 30,
            }"
        >
            <h2 class="mb-2 text-2xl font-bold">手机号登录</h2>
            <p class="text-muted-foreground mb-6 text-sm">请输入手机号码，我们将向您发送验证码</p>
        </Motion>

        <!-- 表单动画 -->
        <Motion
            :initial="{ opacity: 0, y: 10 }"
            :animate="{ opacity: 1, y: 0 }"
            :transition="{
                type: 'tween',
                stiffness: 300,
                damping: 30,
                delay: 0.4,
            }"
            class="relative"
        >
            <UForm :schema="phoneSchema" :state="phoneState" @submit="onPhoneSubmit">
                <!-- 手机号输入框 -->
                <UFormField label="手机号" name="phone" required>
                    <div class="relative">
                        <UInput
                            v-model="phoneState.phone"
                            class="w-full"
                            size="lg"
                            placeholder="请输入手机号码"
                            autocomplete="off"
                            :ui="{ base: '!pl-24' }"
                        >
                            <!-- 手机号前缀选择 -->
                            <template #leading>
                                <div class="flex items-center text-sm" @click.stop.prevent>
                                    <span class="mr-px pb-px">+</span>
                                    <UInputMenu
                                        v-model="selected"
                                        trailing-icon="heroicons:chevron-up-down-20-solid"
                                        :ui="{
                                            base: '!ring-0',
                                            content: 'z-999 w-34',
                                        }"
                                        class="w-16"
                                        :items="areaCodes"
                                    >
                                        <template #item="{ item }">
                                            {{ item.value }} +{{ item.label }}
                                        </template>
                                    </UInputMenu>
                                </div>
                                <USeparator class="h-1/2" orientation="vertical" />
                            </template>
                        </UInput>
                    </div>
                </UFormField>

                <!-- 隐私条款勾选 -->
                <div class="mt-8 mb-4 text-left">
                    <PrivacyTerms v-model="userStore.isAgreed" />
                </div>

                <!-- 下一步按钮 -->
                <UButton
                    color="primary"
                    type="submit"
                    size="lg"
                    :ui="{ base: 'w-full justify-center' }"
                    :loading="isLock"
                    :disabled="!userStore.isAgreed && !!appStore.loginWay.loginAgreement"
                >
                    下一步
                </UButton>
            </UForm>
        </Motion>
    </div>
</template>
