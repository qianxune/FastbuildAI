<script setup lang="ts">
// 导入登录响应类型定义
import type { LoginResponse } from "@buildingai/service/webapi/user";

// 异步加载验证码输入组件
const CodeInput = defineAsyncComponent(() => import("./code-input.vue"));
// 异步加载手机号输入组件
const PhoneInput = defineAsyncComponent(() => import("./phone-input.vue"));

// 定义手机登录容器的尺寸接口
interface PhoneLoginContainers {
    width: string;
    height: string;
}

// 定义手机登录各步骤的容器尺寸配置接口
interface PhoneLoginContainer {
    phone: PhoneLoginContainers;
    code: PhoneLoginContainers;
}

// 定义组件事件
const emits = defineEmits<{
    (e: "success", v: LoginResponse): void;           // 登录成功事件
    (e: "updateStyle", v: PhoneLoginContainers): void;// 更新容器样式事件
    (e: "update:showLoginMethods", v: boolean): void; // 更新是否显示登录方式列表
    (e: "switchLoginMethod", v: string): void;        // 切换登录方式
}>();

// 当前步骤：'phone' (输入手机号) 或 'code' (输入验证码)
const step = ref<"phone" | "code">("phone");
// 存储输入的手机号
const phone = ref<string>("");

// 定义各步骤对应的容器尺寸
const container: PhoneLoginContainer = {
    phone: { width: "420px", height: "396px" },
    code: { width: "660px", height: "450px" },
};

// 处理手机号验证完成，进入下一步
function handlePhoneNext(phoneNumber: string) {
    // TODO: 这里通常会触发发送验证码的逻辑，或者在 PhoneInput 中已处理
    step.value = "code";
    phone.value = phoneNumber;

    // 隐藏外部的登录方式列表，专注于验证码输入
    emits("update:showLoginMethods", false);
    // 更新容器尺寸以适应验证码输入界面
    emits("updateStyle", container[step.value]);
}

// 处理从验证码界面返回到手机号输入界面
function handleCodeBack() {
    step.value = "phone";

    // 恢复显示登录方式列表
    emits("update:showLoginMethods", true);
    // 恢复容器尺寸
    emits("updateStyle", container[step.value]);
}

// 处理登录成功
function handleSuccess(v: LoginResponse) {
    emits("success", v);
}

// 处理切换登录方式
function handleSwitchComponent(component: string) {
    emits("switchLoginMethod", component);
}

// 组件挂载时初始化样式和状态
onMounted(() => {
    emits("updateStyle", container[step.value]);
    emits("update:showLoginMethods", true);
});
</script>

<template>
    <!-- 手机号输入步骤 -->
    <PhoneInput
        v-if="step === 'phone'"
        @next="handlePhoneNext"
        @switch-component="handleSwitchComponent"
    />

    <!-- 验证码输入步骤 -->
    <CodeInput v-else :phone="phone" @back="handleCodeBack" @success="handleSuccess" />
</template>
