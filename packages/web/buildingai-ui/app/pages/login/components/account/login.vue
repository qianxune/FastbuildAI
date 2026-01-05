<script setup lang="ts">
// 导入共享常量中的登录类型
import { LOGIN_TYPE } from "@buildingai/constants/shared";
// 导入用户 API 相关的类型定义
import type { LoginResponse } from "@buildingai/service/webapi/user";
// 导入用户登录 API 函数
import { apiAuthLogin } from "@buildingai/service/webapi/user";
// 导入 yup 验证库中的 object 和 string 方法
import { object, string } from "yup";

// 导入用户协议弹窗 Hook
import { useAgreementModal } from "../../hooks/use-agreement-modal";

// 异步加载隐私条款组件
const PrivacyTerms = defineAsyncComponent(() => import("../privacy-terms.vue"));

// 定义组件抛出的事件
const emits = defineEmits<{
    (e: "switchComponent", component: string): void; // 切换组件事件
    (e: "success", v: LoginResponse): void;          // 登录成功事件
}>();

// 使用协议弹窗 Hook，确保用户同意协议
// 传入配置：宽度为 420px，以及 UIcon 组件
const { ensureAgreementAccepted } = useAgreementModal(
    { width: "!w-[420px]" },
    resolveComponent("UIcon") as unknown as Component,
);

// 获取应用状态仓库
const appStore = useAppStore();
// 获取用户状态仓库
const userStore = useUserStore();
// 获取消息提示工具
const toast = useMessage();
// 获取国际化翻译函数
const { t } = useI18n();

// 定义表单验证架构（Schema）
const loginSchema = object({
    // 用户名验证规则
    username: string()
        .required(t("login.validation.accountRequired")) // 必填
        .min(3, t("login.validation.accountMinLength")), // 最小长度 3
    // 密码验证规则
    password: string()
        .required(t("login.validation.passwordRequired")) // 必填
        .min(6, t("login.validation.passwordMinLength"))  // 最小长度 6
        .max(25, t("login.validation.passwordMaxLength")), // 最大长度 25
    // .matches(...) // 注释掉的密码格式正则验证
});

// 定义表单响应式状态
const loginState = shallowReactive({
    username: "", // 用户名
    password: "", // 密码
    terminal: "1", // 终端类型，默认为 1
});

// 使用锁机制封装登录提交函数，防止重复提交
const { lockFn: onLoginSubmit, isLock } = useLockFn(async () => {
    // 确保用户已同意协议
    const canProceed = await ensureAgreementAccepted();
    if (!canProceed) {
        return;
    }
    try {
        // 调用登录 API
        const data = await apiAuthLogin(loginState);
        // 触发成功事件
        emits("success", data);
    } catch (error: unknown) {
        // 登录失败处理，显示错误提示并打印日志
        toast.error(t("login.messages.loginFailed"));
        console.error(t("login.messages.loginFailed"), error);
    }
});

/**
 * 计算密码强度要求的方法
 * 返回一个包含正则表达式和对应提示文本的对象数组
 */
function checkPasswordStrength(str: string) {
    const requirements = [
        { regex: /.{8,}/, text: t("login.requirements.minLength8") }, // 长度至少8位
        { regex: /\d/, text: t("login.requirements.number") },        // 包含数字
        { regex: /[a-z]/, text: t("login.requirements.lowercase") },  // 包含小写字母
        { regex: /[A-Z]/, text: t("login.requirements.uppercase") },  // 包含大写字母
    ];
    // 返回每个要求是否满足的状态
    return requirements.map((req) => ({ met: req.regex.test(str), text: req.text }));
}

/** 计算当前密码满足和未满足的要求列表 */
const passwordStrength = computed(() => checkPasswordStrength(loginState.password));

/** 计算当前密码的强度得分 [0..4] */
const passwordScore = computed(() => passwordStrength.value.filter((req) => req.met).length);

/** 根据得分映射到 UI 组件的颜色 token */
const passwordColor = computed(() => {
    if (passwordScore.value === 0) return "neutral";
    if (passwordScore.value <= 1) return "error";   // 弱
    if (passwordScore.value <= 2) return "warning"; // 中
    if (passwordScore.value === 3) return "warning"; // 中偏强
    return "success";                               // 强
});

/** 计算当前密码强度的本地化文本标签 */
const passwordStrengthText = computed(() => {
    if (passwordScore.value === 0) return "";
    if (passwordScore.value <= 1) return t("login.strength.weak");
    if (passwordScore.value <= 3) return t("login.strength.medium");
    return t("login.strength.strong");
});

/** 根据强度标签颜色匹配文本颜色类 */
const passwordTextClass = computed(() => {
    const c = passwordColor.value;
    if (c === "error") return "text-error";
    if (c === "warning") return "text-warning";
    if (c === "success") return "text-success";
    return "text-muted";
});
</script>

<template>
    <!-- 使用 UForm 组件包裹表单，绑定 schema 和 state，监听 submit 事件 -->
    <UForm :schema="loginSchema" :state="loginState" @submit="onLoginSubmit">
        <!-- 用户名输入字段 -->
        <UFormField :label="$t('login.account')" name="username" required>
            <UInput
                v-model="loginState.username"
                class="w-full"
                size="lg"
                :ui="{ base: 'bg-transparent p-3' }"
                :placeholder="$t('login.usernamePlaceholder')"
            />
        </UFormField>

        <!-- 密码输入字段 -->
        <UFormField :label="$t('login.password')" name="password" class="mt-2" required>
            <div class="flex">
                <!-- 密码输入组件 -->
                <BdInputPassword
                    v-model="loginState.password"
                    class="w-full"
                    type="password"
                    size="lg"
                    :ui="{ base: 'bg-transparent p-3' }"
                    :placeholder="$t('login.passwordPlaceholder')"
                />
                <!-- 忘记密码按钮（已注释） -->
                <!-- <UButton
                    class="flex-none"
                    variant="link"
                    size="lg"
                    color="primary"
                    @click="emits('switchComponent', 'account-forget')"
                >
                    {{ $t("login.forgotPassword") }}
                </UButton> -->
            </div>
            
            <!-- 密码强度指示器，当有密码输入时显示 -->
            <div class="mt-2" v-if="loginState.password">
                <!-- 进度条显示强度得分 -->
                <UProgress :color="passwordColor" :model-value="passwordScore" :max="4" size="sm" />
                <div
                    v-if="passwordStrengthText"
                    class="mt-1 flex items-center gap-1 text-xs font-medium"
                    :class="passwordTextClass"
                >
                    <!-- 显示强度文字 -->
                    <span>{{ passwordStrengthText }}</span>
                    <!-- 悬停显示详细要求的 Popover -->
                    <UPopover mode="hover" :open-delay="0">
                        <span class="inline-flex items-center" aria-label="Password requirements">
                            <UIcon name="i-lucide-help-circle" class="size-3.5" />
                        </span>
                        <template #content>
                            <!-- 详细的密码要求列表 -->
                            <ul class="space-y-1 p-2" aria-label="Password requirements">
                                <li
                                    v-for="(req, index) in passwordStrength"
                                    :key="index"
                                    class="flex items-center gap-0.5"
                                    :class="req.met ? 'text-success' : 'text-muted'"
                                >
                                    <!-- 状态图标：勾选或叉号 -->
                                    <UIcon
                                        :name="
                                            req.met ? 'i-lucide-circle-check' : 'i-lucide-circle-x'
                                        "
                                        class="size-4 shrink-0"
                                    />
                                    <!-- 要求文本 -->
                                    <span class="text-xs font-light">
                                        {{ req.text }}
                                        <span class="sr-only">
                                            {{
                                                req.met
                                                    ? t("login.strength.met")
                                                    : t("login.strength.notMet")
                                            }}
                                        </span>
                                    </span>
                                </li>
                            </ul>
                        </template>
                    </UPopover>
                </div>
            </div>
        </UFormField>

        <!-- 隐私协议勾选框，根据配置显示 -->
        <div v-if="appStore.loginSettings?.showPolicyAgreement" class="mt-8 mb-4 text-left">
            <PrivacyTerms v-model="userStore.isAgreed" />
        </div>

        <!-- 底部按钮区域：注册和登录 -->
        <div
            class="flex flex-1 gap-4 pb-8"
            :class="{ 'mt-8': !appStore.loginSettings?.showPolicyAgreement }"
        >
            <!-- 注册按钮，如果配置允许账号注册则显示 -->
            <UButton
                v-if="appStore.loginSettings?.allowedRegisterMethods.includes(LOGIN_TYPE.ACCOUNT)"
                variant="outline"
                color="primary"
                size="lg"
                :ui="{ base: 'flex-1 justify-center p-3' }"
                @click="emits('switchComponent', 'account-register')"
            >
                {{ $t("login.register") }}
            </UButton>
            <!-- 登录提交按钮 -->
            <UButton
                color="primary"
                type="submit"
                size="lg"
                :ui="{ base: 'flex-1 justify-center p-3' }"
                :loading="isLock"
            >
                {{ $t("login.loginNow") }}
            </UButton>
        </div>
    </UForm>
</template>
