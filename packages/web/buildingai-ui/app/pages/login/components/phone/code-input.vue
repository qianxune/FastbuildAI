<script setup lang="ts">
// import { DotLottieVue } from "@lottiefiles/dotlottie-vue"; // 注释掉的 Lottie 动画组件

// 导入短信类型常量
import { SMS_TYPE } from "@buildingai/constants/web";
// 导入登录响应类型
import type { LoginResponse } from "@buildingai/service/webapi/user";
// 导入发送短信和登录 API
import { apiAuthLogin, apiSmsSend } from "@buildingai/service/webapi/user";

// 定义组件属性
const props = defineProps<{
    phone: string; // 接收手机号
}>();

// 定义组件事件
const emits = defineEmits<{
    (e: "back"): void;                      // 返回上一步
    (e: "success", v: LoginResponse): void; // 登录成功
}>();

// 获取消息提示工具
const toast = useMessage();

// 登录状态管理
const loginState = reactive({
    succeed: false, // 是否成功
    error: "",      // 错误信息
});

// 验证码输入状态
const codeState = reactive<{
    phone: string;
    code: number[]; // 存储输入的验证码数组
}>({
    phone: "",
    code: [],
});

// 获取验证码按钮状态
const codeBtnState = ref<{
    isCounting: boolean; // 是否正在倒计时
    text: string;        // 按钮文本
}>({
    isCounting: false,
    text: "获取验证码",
});

// 重新发送验证码的函数
async function sendCode() {
    // 如果正在倒计时，阻止重复点击
    if (codeBtnState.value.isCounting === true) return;
    codeBtnState.value.text = "正在发送中";

    try {
        // 调用发送短信 API
        await apiSmsSend({
            scene: SMS_TYPE.LOGIN,
            mobile: props.phone,
        });
        toast.success("验证码已发送，请注意查收", {
            title: "发送成功",
            duration: 3000,
        });
        
        // 开始倒计时
        codeBtnState.value.isCounting = true;
        let count = 60;
        codeBtnState.value.text = `${count}s`;
        const interval = setInterval(() => {
            count--;
            codeBtnState.value.text = `${count}s`;
            if (count === 0) {
                clearInterval(interval);
                codeBtnState.value.isCounting = false;
                codeBtnState.value.text = "重新发送";
            }
        }, 1000);
    } catch (error) {
        // 发送失败处理
        console.error("发送验证码失败:", error);
        toast.error("验证码发送失败，请稍后重试", {
            title: "发送失败",
            duration: 3000,
        });
        codeBtnState.value.isCounting = false;
        codeBtnState.value.text = "重新发送";
    }
}

/**
 * 监听验证码输入完成
 * 当验证码输入完成后，自动触发表单验证
 */
async function handlePinInputComplete() {
    if (Array.isArray(codeState.code) && codeState.code.length === 4) {
        try {
            const data: LoginResponse = await apiAuthLogin({
                terminal: 4,
                scene: 2,
                account: props.phone,
                code: codeState.code.join(""),
            });
            loginState.error = "";
            loginState.succeed = true;
            setTimeout(() => {
                emits("success", data);
            }, 200);
        } catch (error) {
            loginState.error = error as string;
        }
    }
}

// 组件挂载时自动开始发送验证码（进入该页面通常意味着已完成手机号输入并点击了下一步）
onMounted(() => {
    sendCode();
});
</script>

<template>
    <div class="grid h-full grid-cols-2">
        <!-- 左侧输入区域 -->
        <div class="flex w-[300px] flex-col justify-between p-8">
            <div>
                <!-- 返回按钮 -->
                <div class="mb-6">
                    <UButton icon="i-lucide-chevron-left" @click="emits('back')" />
                </div>
                <h2 class="mt-8 mb-2 text-2xl font-bold">输入验证码</h2>
                <p class="text-muted-foreground mb-8 text-sm">验证码已发送至 {{ phone }}</p>

                <div class="flex flex-col">
                    <!-- 验证码输入表单 -->
                    <UForm ref="form" :state="codeState">
                        <UFormField label="" name="code" :error="loginState.error">
                            <!-- PinInput 组件，用于输入多位验证码 -->
                            <UPinInput
                                v-model="codeState.code"
                                :length="4"
                                size="xl"
                                type="number"
                                class="mb-6"
                                :highlight="true"
                                :color="loginState.succeed ? 'success' : 'neutral'"
                                @update:model-value="handlePinInputComplete"
                            />
                        </UFormField>
                    </UForm>

                    <!-- 重新发送验证码按钮 -->
                    <UButton
                        variant="link"
                        size="lg"
                        class="text-sm"
                        :disabled="codeBtnState.isCounting"
                        :ui="{ base: 'pl-0' }"
                        @click="sendCode"
                    >
                        {{ codeBtnState.text }}
                    </UButton>
                </div>
            </div>
        </div>

        <!-- 右侧动画区域 -->
        <Motion
            :initial="{ opacity: 0, x: 20 }"
            :animate="{ opacity: 1, x: 0 }"
            :transition="{
                type: 'spring',
                stiffness: 300,
                damping: 50,
                delay: 0.2,
            }"
            class="relative h-full w-full"
        >
            <!-- Lottie 动画组件（已注释） -->
            <!-- <DotLottieVue
                class="absolute top-[-150px] left-[-130px] z-10 h-[756px] w-[504px]"
                autoplay
                src="assets/lottie/verification-code.lottie"
            /> -->
        </Motion>
    </div>
</template>
