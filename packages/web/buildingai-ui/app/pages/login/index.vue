<script setup lang="ts">
// 导入登录类型的常量定义
import { LOGIN_TYPE } from "@buildingai/constants/shared";
// 导入登录状态的常量定义
import { LOGIN_STATUS } from "@buildingai/constants/web/auth.constant";
// 导入网站版权信息的类型定义
import type { WebsiteCopyright } from "@buildingai/service/common";
// 导入登录响应数据的类型定义
import type { LoginResponse } from "@buildingai/service/webapi/user";

// 导入全尺寸Logo SVG文件
import LogoFull from "../../../public/logo-full.svg";
// 导入账号登录组件
import AccountLogin from "./components/account/account.vue";
// 导入登录绑定组件
import LoginBind from "./components/login-bind.vue";
// 注释掉的手机号登录组件导入
// import PhoneLogin from "@/co/components/phone/index.vue";
// 导入微信登录组件
import WechatLogin from "./components/wechat/wechat.vue";

// 定义页面元数据，使用全屏布局，且不需要认证（auth: false）
definePageMeta({ layout: "full-screen", auth: false });

// 获取应用状态仓库实例
const appStore = useAppStore();
// 获取用户状态仓库实例
const userStore = useUserStore();

// 获取国际化翻译函数
const { t } = useI18n();

// 定义登录组件配置接口
interface LoginComponentConfig {
    component: Component; // 组件对象
    icon: string;         // 图标名称
    label: string;        // 显示标签
}

// 计算属性：定义可用的登录组件映射表
// 根据登录类型映射到具体的组件、图标和标签
const LOGIN_COMPONENTS = computed<Record<string | number, LoginComponentConfig>>(() => ({
    // 账号登录配置
    [LOGIN_TYPE.ACCOUNT]: {
        component: AccountLogin,
        icon: "tabler:lock",
        label: t("login.continueWithAccount"),
    },
    // 手机号登录配置（目前注释掉）
    // [LOGIN_TYPE.PHONE]: {
    //     component: PhoneLogin,
    //     icon: "tabler:phone",
    //     label: "手机号登录",
    // },
    // 微信登录配置
    [LOGIN_TYPE.WECHAT]: {
        component: WechatLogin,
        icon: "tabler:brand-wechat",
        label: t("login.continueWithWechat"),
    },
    // 绑定手机号配置（这是一个特殊的状态，也作为组件处理）
    [LOGIN_STATUS.BIND]: {
        component: LoginBind,
        icon: "",
        label: t("login.bindMobile"),
    },
}));

// 默认登录方式，优先从 store 获取，否则默认为账号登录
const DEFAULT_LOGIN_METHOD = appStore?.loginSettings?.defaultLoginMethod || LOGIN_TYPE.ACCOUNT;
// 当前选中的登录方式，初始化为默认方式
const currentLoginMethod = ref<string | number>(DEFAULT_LOGIN_METHOD);
// 是否显示登录方式列表的开关
const showLoginMethods = ref<boolean>(true);

// 计算属性：获取允许的登录方式
// 根据 appStore 中的配置过滤出允许的登录方式
const allowedLoginMethods = computed(() => {
    const result = Object.fromEntries(
        Object.entries(LOGIN_COMPONENTS.value).filter(([k]) =>
            appStore?.loginSettings?.allowedLoginMethods.includes(Number(k)),
        ),
    );
    return result;
});

// 计算属性：将允许的登录方式转换为数组格式，用于模板循环渲染
// 过滤掉 BIND 和 SUCCESS 等非主要登录入口的状态
const loginMethods = computed(() =>
    Object.entries(allowedLoginMethods.value)
        .filter(([key]) => key !== LOGIN_STATUS.BIND && key !== LOGIN_STATUS.SUCCESS)
        .map(([key, config]) => ({ name: key, ...config })),
);

// 计算属性：当前应该渲染的组件
const currentComponent = computed(
    () => LOGIN_COMPONENTS.value[currentLoginMethod.value]?.component,
);

// 计算属性：当前组件的配置信息
const currentComponentConfig = computed(() => LOGIN_COMPONENTS.value[currentLoginMethod.value]);

// 切换登录方式的处理函数
function switchLoginMethod(methodName: string | number): void {
    // 只有当目标方式存在于配置中时才切换
    if (LOGIN_COMPONENTS.value[methodName]) {
        currentLoginMethod.value = methodName;
    }
}

// 登录成功后的处理函数
// data 包含登录响应和是否已绑定的信息
function loginHandle(data: LoginResponse & { hasBind: boolean }): void {
    // 如果配置强制手机号（coerceMobile 为真），且用户未绑定且未提供手机号
    if (appStore.loginWay.coerceMobile * 1 && !data.hasBind && !data.mobile) {
        // 临时保存登录态
        userStore.tempLogin(data.token);
        // 切换到绑定手机号界面
        currentLoginMethod.value = LOGIN_STATUS.BIND;
        return;
    }
    // 否则直接执行正式登录
    userStore.login(data.token);
}

// 组件挂载时的生命周期钩子
onMounted(() => {
    // 如果没有登录设置，则发起请求获取
    if (!appStore.loginSettings) {
        appStore.getLoginSettings();
    }
});

// 组件卸载时的生命周期钩子
onUnmounted(() => {
    // 重置用户协议同意状态
    userStore.isAgreed = false;
});
</script>

<template>
    <!-- 登录页面的主容器，全屏高度，背景色根据深色模式适配 -->
    <div class="login-container flex h-screen flex-col overflow-y-auto bg-[#f9f9f9] dark:bg-[#000]">
        <!-- 左上角的 Logo 区域，固定定位 -->
        <h1 class="fixed top-8 left-8 flex items-center">
            <!-- 如果配置了 Logo 图片，则显示图片和名称 -->
            <template v-if="appStore.siteConfig?.webinfo.logo">
                <NuxtImg :src="appStore.siteConfig?.webinfo.logo" alt="Logo" class="size-12" />
                <span class="ml-2 text-3xl font-bold">
                    {{ appStore.siteConfig?.webinfo.name }}
                </span>
            </template>
            <!-- 没有 Logo 图片的时候显示全称 SVG -->
            <LogoFull v-else class="text-foreground h-8" filled :fontControlled="false" />
        </h1>
        
        <!-- 登录表单的主体区域，垂直居中显示 -->
        <div class="flex h-auto items-center justify-center pt-[15vh]">
            <div class="w-[370px] px-4">
                <!-- 标题头部 -->
                <div class="mb-8 space-y-3 text-center">
                    <h1 class="text-3xl font-bold">{{ t("login.title") }}</h1>
                    <p class="text-muted-foreground">
                        {{ t("login.subtitle") }}
                    </p>
                </div>
                
                <!-- 登录方式切换按钮区域 -->
                <div class="flex flex-col justify-center gap-4">
                    <!-- 遍历所有可用的登录方式 -->
                    <template v-for="(method, mIndex) in loginMethods" :key="mIndex">
                        <!-- 如果不是当前选中的方式，显示切换按钮 -->
                        <UButton
                            v-if="method.name != currentLoginMethod"
                            :leading-icon="method.icon"
                            variant="outline"
                            color="neutral"
                            size="lg"
                            :ui="{ base: 'flex-1 justify-center bg-transparent p-3' }"
                            @click="switchLoginMethod(method.name)"
                        >
                            {{ method.label }}
                        </UButton>
                    </template>
                    <!-- 下面是注释掉的其他第三方登录按钮示例（微信二维码、Google、Email） -->
                    <!-- <UButton ... > ... </UButton> -->
                </div>
                
                <!-- 分割线，当有多个登录方式时显示 -->
                <USeparator
                    v-if="loginMethods.length > 1"
                    :label="$t('login.orLoginTo')"
                    :ui="{
                        root: 'py-5',
                        label: 'text-xs text-foreground/60',
                    }"
                />
                
                <!-- 动态组件区域，渲染当前选中的登录组件（如账号登录、微信登录等） -->
                <div>
                    <component
                        :is="currentComponent"
                        v-if="currentComponent"
                        v-bind="currentComponentConfig"
                        @success="loginHandle"
                        @switch-to="switchLoginMethod"
                        @update:show-login-methods="showLoginMethods = $event"
                    />
                </div>
                
                <!-- 底部版权信息 -->
                <FooterCopyright
                    :copyright="appStore.siteConfig?.copyright as unknown as WebsiteCopyright[]"
                />
            </div>
        </div>
    </div>
</template>
