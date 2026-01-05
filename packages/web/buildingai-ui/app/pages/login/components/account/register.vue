<script setup lang="ts">
// 导入登录响应类型
import type { LoginResponse } from "@buildingai/service/webapi/user";
// 导入注册 API
import { apiAuthRegister } from "@buildingai/service/webapi/user";
// 导入 Vue 相关函数
import { computed, reactive, resolveComponent } from "vue";
// 导入国际化 hook
import { useI18n } from "vue-i18n";
// 导入 yup 验证库
import { object, ref as yupRef, string } from "yup";

// 导入用户协议弹窗 Hook
import { useAgreementModal } from "../../hooks/use-agreement-modal";

// 异步加载隐私条款组件
const PrivacyTerms = defineAsyncComponent(() => import("../privacy-terms.vue"));

// 定义组件事件
const emits = defineEmits<{
    (e: "switchComponent", component: string): void; // 切换组件
    (e: "success", v: LoginResponse): void;          // 注册并登录成功
}>();

// 获取应用状态
const appStore = useAppStore();
// 获取用户状态
const userStore = useUserStore();
// 获取国际化函数
const { t } = useI18n();

// 初始化协议弹窗控制
const { ensureAgreementAccepted } = useAgreementModal(
    { width: "!w-[420px]" },
    resolveComponent("UIcon") as unknown as Component,
);

// 定义注册表单验证架构
const registerSchema = object({
    // 用户名验证
    username: string()
        .required(t("login.validation.accountRequired"))
        .min(3, t("login.validation.accountMinLength"))
        .max(20, t("login.validation.accountMaxLength")),
    // 邮箱验证（已注释）
    // email: string()
    //   .required(t("login.validation.emailRequired"))
    //   .email(t("login.validation.emailInvalid")),
    // 密码验证
    password: string()
        .required(t("login.validation.passwordRequired"))
        .min(6, t("login.validation.passwordMinLength"))
        .max(25, t("login.validation.passwordMaxLength"))
        .matches(
            /^(?=.*[a-z])(?=.*[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/,
            t("login.validation.passwordFormat"),
        ),
    // 确认密码验证
    confirmPassword: string()
        .required(t("login.validation.confirmPasswordRequired"))
        .oneOf([yupRef("password")], t("login.validation.passwordMismatch")),
});

// 注册表单状态
const registerState = reactive({
    username: "",
    // email: '',
    password: "",
    confirmPassword: "",
});

// 注册提交处理函数，防止重复提交
const { lockFn: onRegisterSubmit, isLock } = useLockFn(async () => {
    // 确保已同意协议
    const canProceed = await ensureAgreementAccepted();
    if (!canProceed) {
        return;
    }
    try {
        // 调用注册接口，terminal 默认为 "1"
        const data = await apiAuthRegister({
            terminal: "1",
            ...registerState,
        });

        // 注册成功后，触发成功事件，并传递用户数据
        emits("success", { ...data, ...data.user });
    } catch (error: unknown) {
        console.log(t("login.messages.registerFailed"), error);
    }
});

/**
 * 计算密码强度要求的方法
 * 返回一个包含正则表达式和对应提示文本的对象数组
 */
function checkPasswordStrength(str: string) {
    const requirements = [
        { regex: /.{8,}/, text: t("login.requirements.minLength8") },
        { regex: /\d/, text: t("login.requirements.number") },
        { regex: /[a-z]/, text: t("login.requirements.lowercase") },
        { regex: /[A-Z]/, text: t("login.requirements.uppercase") },
    ];
    return requirements.map((req) => ({ met: req.regex.test(str), text: req.text }));
}

/** 计算当前密码满足和未满足的要求列表 */
const passwordStrength = computed(() => checkPasswordStrength(registerState.password));

/** 计算当前密码的强度得分 [0..4] */
const passwordScore = computed(() => passwordStrength.value.filter((req) => req.met).length);

/** 根据得分映射到 UI 组件的颜色 token */
const passwordColor = computed(() => {
    if (passwordScore.value === 0) return "neutral";
    if (passwordScore.value <= 1) return "error";
    if (passwordScore.value <= 2) return "warning";
    if (passwordScore.value === 3) return "warning";
    return "success";
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
    <!-- 注册表单 -->
    <UForm :schema="registerSchema" :state="registerState" @submit="onRegisterSubmit">
        <!-- 用户名输入 -->
        <UFormField :label="$t('login.account')" name="username" required>
            <UInput
                v-model="registerState.username"
                class="w-full"
                size="lg"
                :ui="{ base: 'bg-transparent p-3' }"
                :placeholder="$t('login.placeholders.enterAccount')"
            />
        </UFormField>

        <!-- 密码输入 -->
        <UFormField :label="$t('login.password')" name="password" class="mt-2" required>
            <BdInputPassword
                v-model="registerState.password"
                class="w-full"
                type="password"
                size="lg"
                :ui="{ base: 'bg-transparent p-3' }"
                :placeholder="$t('login.placeholders.enterPassword')"
            />

            <!-- 密码强度显示 -->
            <div class="mt-2" v-if="registerState.password">
                <UProgress :color="passwordColor" :model-value="passwordScore" :max="4" size="sm" />
                <div
                    v-if="passwordStrengthText"
                    class="mt-1 flex items-center gap-1 text-xs font-medium"
                    :class="passwordTextClass"
                >
                    <span>{{ passwordStrengthText }}</span>
                    <!-- 悬停查看密码要求 -->
                    <UPopover mode="hover">
                        <span
                            class="inline-flex cursor-help items-center"
                            aria-label="Password requirements"
                        >
                            <UIcon name="i-lucide-help-circle" class="size-3.5" />
                        </span>
                        <template #content>
                            <ul class="space-y-1 p-2" aria-label="Password requirements">
                                <li
                                    v-for="(req, index) in passwordStrength"
                                    :key="index"
                                    class="flex items-center gap-0.5"
                                    :class="req.met ? 'text-success' : 'text-muted'"
                                >
                                    <UIcon
                                        :name="
                                            req.met ? 'i-lucide-circle-check' : 'i-lucide-circle-x'
                                        "
                                        class="size-4 shrink-0"
                                    />
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

        <!-- 确认密码输入 -->
        <UFormField
            :label="$t('login.confirmPassword')"
            name="confirmPassword"
            class="mt-2"
            required
        >
            <BdInputPassword
                v-model="registerState.confirmPassword"
                class="w-full"
                type="password"
                size="lg"
                :ui="{ base: 'bg-transparent p-3' }"
                :placeholder="$t('login.placeholders.enterPasswordAgain')"
            />
            <template #help>
                <div class="flex items-center gap-1 text-xs">
                    <UIcon name="tabler:alert-circle" size="14" />
                    {{ $t("login.passwordRule") }}
                </div>
            </template>
        </UFormField>

        <!-- 隐私协议，根据配置显示 -->
        <div v-if="appStore.loginSettings?.showPolicyAgreement" class="mt-8 mb-4 text-left">
            <PrivacyTerms v-model="userStore.isAgreed" />
        </div>

        <!-- 底部按钮 -->
        <div
            class="flex flex-1 gap-4 pb-8"
            :class="{ 'mt-8': !appStore.loginSettings?.showPolicyAgreement }"
        >
            <!-- 返回登录 -->
            <UButton
                variant="outline"
                color="primary"
                size="lg"
                :ui="{ base: 'flex-1 justify-center p-3' }"
                @click="emits('switchComponent', 'account-login')"
            >
                {{ $t("login.backToLogin") }}
            </UButton>
            <!-- 注册提交 -->
            <UButton
                color="primary"
                type="submit"
                size="lg"
                :loading="isLock"
                :ui="{ base: 'flex-1 justify-center p-3' }"
            >
                {{ $t("login.registerNow") }}
            </UButton>
        </div>
    </UForm>
</template>
