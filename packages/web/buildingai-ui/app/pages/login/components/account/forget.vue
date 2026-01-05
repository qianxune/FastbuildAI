<script setup lang="ts">
// 导入短信类型常量
import { SMS_TYPE } from "@buildingai/constants/web/auth.constant";
// 导入重置密码和发送短信的 API
import { apiPostResetPassword, apiSmsSend } from "@buildingai/service/webapi/user";
// 导入动画组件
import { Motion } from "motion-v";
// 导入 Vue 的响应式 API
import { reactive, ref } from "vue";
// 导入 yup 验证库
import { object, ref as yupRef, string } from "yup";

// 定义组件事件
const emits = defineEmits<{
    (e: "switchComponent", component: string): void; // 切换组件事件
}>();

// 获取消息提示工具
const toast = useMessage();
// 获取国际化工具
const { t } = useI18n();

// 地区代码列表
const areaCodes = ref<{ value: string; label: string }[]>([
    { value: t("console-common.phoneAreaCodes.china"), label: "86" },
]);
// 当前选中的地区代码
const selected = ref(areaCodes.value[0]);

// 重置密码表单验证架构
const forgetchema = object({
    // 手机号验证
    mobile: string()
        .required(t("login.forget.validation.mobileRequired"))
        .matches(/^1[3-9]\d{9}$/, t("login.forget.validation.mobileInvalid")),
    // 验证码验证
    code: string().required(t("login.forget.validation.codeRequired")),
    // 新密码验证
    password: string()
        .required(t("login.forget.validation.passwordRequired"))
        .min(6, t("login.forget.validation.passwordMinLength"))
        .max(25, t("login.forget.validation.passwordMaxLength"))
        .matches(
            /^(?=.*[a-z])(?=.*[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/,
            t("login.forget.validation.passwordFormat"),
        ),
    // 确认密码验证，必须与 password 字段一致
    password_confirm: string()
        .required(t("login.forget.validation.confirmPasswordRequired"))
        .oneOf([yupRef("password")], t("login.forget.validation.passwordMismatch")),
});

// 重置密码表单状态
const forgetState = reactive({
    mobile: "",
    code: "",
    password: "",
    password_confirm: "",
});

// 验证码按钮状态
const codeBtnState = reactive<{
    isCounting: boolean; // 是否正在倒计时
    text: string;        // 按钮显示文本
}>({
    isCounting: false,
    text: t("login.forget.getCode"),
});

// 发送短信验证码的函数，使用 useLockFn 防止重复点击
const { lockFn: onSmsSend, isLock: smsLoading } = useLockFn(async () => {
    // 如果正在倒计时，直接返回
    if (codeBtnState.isCounting === true) return;
    codeBtnState.text = t("login.forget.sending");

    try {
        // 调用发送短信 API
        await apiSmsSend({
            scene: SMS_TYPE.FIND_PASSWORD, // 场景：找回密码
            mobile: forgetState.mobile,
        });
        
        // 开始倒计时
        codeBtnState.isCounting = true;
        let count = 60;
        codeBtnState.text = `${count}s`;
        const interval = setInterval(() => {
            count--;
            codeBtnState.text = `${count}s`;
            if (count === 0) {
                // 倒计时结束
                clearInterval(interval);
                codeBtnState.isCounting = false;
                codeBtnState.text = t("login.forget.resend");
            }
        }, 1000);
        
        // 显示成功提示
        toast.success(t("login.forget.messages.sendSuccess"), {
            title: t("login.forget.messages.sendSuccessTitle"),
            duration: 3000,
        });
    } catch (error) {
        // 发送失败处理
        console.error("Send verification code failed:", error);
        codeBtnState.isCounting = false;
        codeBtnState.text = t("login.forget.resend");
        toast.error(t("login.forget.messages.sendFailed"), {
            title: t("login.forget.messages.sendFailedTitle"),
            duration: 3000,
        });
    }
});

// 处理重置密码表单提交
const { lockFn: onForgetSubmit, isLock } = useLockFn(async () => {
    try {
        // 调用重置密码 API
        await apiPostResetPassword(forgetState);
        // 这里可能需要添加成功后的处理，比如跳转回登录页
    } catch (error) {
        console.log("Reset password failed =>", error);
    }
});
</script>

<template>
    <div class="px-8 pt-8">
        <!-- 标题区域动画 -->
        <Motion
            :initial="{ opacity: 0, y: 10 }"
            :animate="{ opacity: 1, y: 0 }"
            :transition="{
                type: 'tween',
                stiffness: 300,
                damping: 30,
                delay: 0.2,
            }"
            class="relative"
        >
            <h2 class="mb-2 text-2xl font-bold">{{ $t("login.forget.title") }}</h2>

            <p class="text-muted-foreground mb-4 text-sm">{{ $t("login.forget.subtitle") }}</p>
        </Motion>

        <!-- 表单区域动画 -->
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
            <!-- 表单组件 -->
            <UForm :schema="forgetchema" :state="forgetState" @submit="onForgetSubmit">
                <!-- 手机号输入框 -->
                <UFormField :label="$t('login.forget.mobile')" name="mobile" required>
                    <UInput
                        v-model="forgetState.mobile"
                        class="w-full"
                        size="lg"
                        :placeholder="$t('login.forget.mobilePlaceholder')"
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
                </UFormField>

                <!-- 验证码输入框 -->
                <UFormField :label="$t('login.forget.code')" name="code" class="mt-2" required>
                    <UInput
                        id="code"
                        v-model="forgetState.code"
                        size="lg"
                        :placeholder="$t('login.forget.codePlaceholder')"
                        autocomplete="off"
                        :ui="{ root: 'w-full', trailing: 'pr-0' }"
                    >
                        <!-- 发送验证码按钮 -->
                        <template #trailing>
                            <USeparator class="h-1/2" orientation="vertical" />
                            <UButton
                                variant="link"
                                :ui="{
                                    base: 'w-[90px] justify-center',
                                }"
                                :disabled="smsLoading"
                                @click="onSmsSend"
                            >
                                {{ codeBtnState.text }}
                            </UButton>
                        </template>
                    </UInput>
                </UFormField>

                <!-- 新密码输入框 -->
                <UFormField
                    :label="$t('login.forget.newPassword')"
                    name="password"
                    class="mt-3"
                    required
                >
                    <BdInputPassword
                        v-model="forgetState.password"
                        class="w-full"
                        type="password"
                        size="lg"
                        :placeholder="$t('login.forget.newPasswordPlaceholder')"
                    />
                    <!-- 帮助提示 -->
                    <template #help>
                        <div class="flex items-center gap-1 text-xs">
                            <UIcon name="tabler:alert-circle" size="14" />
                            {{ $t("login.forget.passwordHint") }}
                        </div>
                    </template>
                </UFormField>

                <!-- 确认密码输入框 -->
                <UFormField
                    :label="$t('login.forget.confirmPassword')"
                    name="password_confirm"
                    class="mt-3"
                    required
                >
                    <BdInputPassword
                        v-model="forgetState.password_confirm"
                        class="w-full"
                        type="password"
                        size="lg"
                        :placeholder="$t('login.forget.confirmPasswordPlaceholder')"
                    />
                    <template #help>
                        <div class="flex items-center gap-1 text-xs">
                            <UIcon name="tabler:alert-circle" size="14" />
                            {{ $t("login.forget.passwordHint") }}
                        </div>
                    </template>
                </UFormField>

                <!-- 底部按钮：返回登录和确认修改 -->
                <div class="flex flex-1 gap-2 py-8">
                    <UButton
                        variant="outline"
                        color="primary"
                        size="lg"
                        :ui="{ base: 'flex-1 justify-center' }"
                        @click="emits('switchComponent', 'account-login')"
                    >
                        {{ $t("login.forget.backToLogin") }}
                    </UButton>
                    <UButton
                        color="primary"
                        type="submit"
                        size="lg"
                        :ui="{ base: 'flex-1 justify-center' }"
                        :loading="isLock"
                    >
                        {{ $t("login.forget.confirmChange") }}
                    </UButton>
                </div>
            </UForm>
        </Motion>
    </div>
</template>
