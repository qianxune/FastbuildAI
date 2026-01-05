<script setup lang="ts">
// 导入登录响应类型定义
import type { LoginResponse } from "@buildingai/service/webapi/user";

// 异步加载忘记密码组件
const Forget = defineAsyncComponent(() => import("./forget.vue"));
// 异步加载登录组件
const Login = defineAsyncComponent(() => import("./login.vue"));
// 异步加载注册组件
const Register = defineAsyncComponent(() => import("./register.vue"));

// 定义组件抛出的事件
const emits = defineEmits<{
    (e: "success", v: LoginResponse): void;           // 登录成功事件
    (e: "update:showLoginMethods", v: boolean): void; // 更新是否显示登录方式列表的事件
}>();

// 当前显示的组件名称，使用 shallowRef 提高性能
const currentComponent = shallowRef("account-login");

// 组件映射表，将字符串映射到具体的组件对象
const componentMap: Record<string, Component> = {
    "account-login": Login,
    "account-register": Register,
    "account-forget": Forget,
} as const;

// 处理组件切换的函数
function handleSwitchComponent(component: string) {
    // 更新当前组件
    currentComponent.value = component;
    // 如果是登录组件，则显示外部的登录方式列表，否则隐藏
    emits("update:showLoginMethods", component === "account-login");
}

// 处理登录成功的函数
function handleLoginSuccess(v: LoginResponse) {
    // 将成功事件向上冒泡
    emits("success", v);
}

// 组件挂载时的生命周期钩子
onMounted(() => {
    // 默认显示登录方式列表
    emits("update:showLoginMethods", true);
});
</script>

<template>
    <!-- 动态组件渲染，根据 currentComponent 显示对应的组件 -->
    <component
        :is="componentMap[currentComponent]"
        :key="currentComponent"
        @success="handleLoginSuccess"
        @switch-component="handleSwitchComponent"
    />
</template>
