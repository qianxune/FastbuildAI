import type { XhsProduct } from "@/types/xhs";

interface PublishResult {
    success: boolean;
    message: string;
    noteId?: string;
    noteUrl?: string;
}

interface DownloadImageResult {
    success: boolean;
    localPath?: string;
    error?: string;
}

/**
 * 小红书发布功能 Composable
 */
export const useXhsPublish = () => {
    const { post, get } = useAuthFetch();
    const toast = useMessage();

    /**
     * 下载外部图片到本地
     */
    const downloadImage = async (imageUrl: string): Promise<DownloadImageResult> => {
        try {
            console.log("🔽 调用下载API:", imageUrl);
            const { data, error } = await post<{
                success: boolean;
                localPath?: string;
                error?: string;
            }>("/api/xhs/images/download", { imageUrl }, { showError: false });

            console.log("🔽 下载API响应:", { data, error });

            // 检查 HTTP 错误
            if (error) {
                console.error("❌ HTTP错误:", error);
                return {
                    success: false,
                    error: error,
                };
            }

            // 检查业务逻辑错误
            if (!data || !data.success) {
                const errorMsg = data?.error || "下载图片失败";
                console.error("❌ 业务错误:", errorMsg);
                return {
                    success: false,
                    error: errorMsg,
                };
            }

            // 检查是否有本地路径
            if (!data.localPath) {
                console.error("❌ 响应中没有本地路径");
                return {
                    success: false,
                    error: "响应中没有本地路径",
                };
            }

            console.log("✅ 图片下载成功，本地路径:", data.localPath);
            return {
                success: true,
                localPath: data.localPath,
            };
        } catch (err) {
            console.error("❌ 图片下载异常:", imageUrl, err);
            return {
                success: false,
                error: err instanceof Error ? err.message : "下载图片失败",
            };
        }
    };

    /**
     * 发布笔记到小红书
     */
    const publishNote = async (params: {
        title: string;
        content: string;
        images: string[];
        productId?: string;
        /**
         * 可选：用于在小红书中按标题搜索店内商品并挂载
         */
        productSearchTitle?: string;
    }): Promise<PublishResult> => {
        try {
            console.log("📝 开始发布笔记:", {
                title: params.title,
                imageCount: params.images.length,
                productId: params.productId,
            });

            // 1. 下载所有图片到本地
            const localImages: string[] = [];
            const failedImages: string[] = [];

            for (const imageUrl of params.images) {
                // 如果已经是本地路径，直接使用
                if (imageUrl.startsWith("/uploads/")) {
                    localImages.push(imageUrl);
                    console.log("✅ 使用本地图片:", imageUrl);
                    continue;
                }

                // 下载外部图片
                console.log("⬇️ 开始下载图片:", imageUrl);
                const result = await downloadImage(imageUrl);
                if (result.success && result.localPath) {
                    localImages.push(result.localPath);
                    console.log("✅ 图片下载成功:", result.localPath);
                } else {
                    console.error("❌ 图片下载失败:", imageUrl, result.error);
                    failedImages.push(imageUrl);
                }
            }

            console.log("📊 图片下载结果:", {
                total: params.images.length,
                success: localImages.length,
                failed: failedImages.length,
                localImages,
            });

            // 如果所有图片都下载失败，但原本有图片，则返回失败
            if (localImages.length === 0 && params.images.length > 0) {
                const errorMsg = `所有图片下载失败 (${failedImages.length}/${params.images.length})`;
                console.error("❌", errorMsg);
                return {
                    success: false,
                    message: errorMsg,
                };
            }

            // 2. 发布到小红书（即使部分图片失败也继续）
            console.log("🚀 调用发布API:", {
                title: params.title,
                contentLength: params.content.length,
                imageCount: localImages.length,
            });

            const { data, error } = await post<PublishResult>("/api/xhs/publish", {
                title: params.title,
                content: params.content,
                images: localImages,
                productSearchTitle: params.productSearchTitle,
            });

            console.log("📡 发布API响应:", { data, error });

            if (error || !data) {
                const errorMsg = error || "发布失败";
                console.error("❌ 发布失败:", errorMsg);
                return {
                    success: false,
                    message: errorMsg,
                };
            }

            // 3. 如果发布成功，保存笔记到数据库
            if (data.success) {
                console.log("✅ 发布成功，保存到数据库");
                await saveNote({
                    title: params.title,
                    content: params.content,
                    coverImages: localImages,
                    mode: "ai-generate",
                    productId: params.productId,
                    xhsNoteId: data.noteId,
                    xhsNoteUrl: data.noteUrl,
                });
            } else {
                console.warn("⚠️ 发布返回失败:", data.message);
            }

            return data;
        } catch (err) {
            console.error("❌ 发布异常:", err);
            return {
                success: false,
                message: err instanceof Error ? err.message : "发布失败",
            };
        }
    };

    /**
     * 保存笔记到数据库
     */
    const saveNote = async (params: {
        title: string;
        content: string;
        coverImages: string[];
        mode: string;
        productId?: string;
        xhsNoteId?: string;
        xhsNoteUrl?: string;
    }) => {
        try {
            const { data, error } = await post("/api/xhs/notes", params);

            if (error) {
                toast.error("保存笔记失败");
                return null;
            }

            return data;
        } catch (err) {
            toast.error("保存笔记失败");
            return null;
        }
    };

    /**
     * 检查登录状态
     */
    const checkLoginStatus = async () => {
        try {
            const { data, error } = await get<{ isLoggedIn: boolean; message: string }>(
                "/api/xhs/publish/login-status",
            );

            if (error || !data) {
                return { isLoggedIn: false, message: "检查登录状态失败" };
            }

            return data;
        } catch (err) {
            return { isLoggedIn: false, message: "检查登录状态失败" };
        }
    };

    /**
     * 获取登录二维码
     */
    const getLoginQrCode = async () => {
        try {
            const { data, error } = await get<{ qrCode: string; message: string }>(
                "/api/xhs/publish/login-qrcode",
            );

            if (error || !data) {
                toast.error("获取二维码失败");
                return null;
            }

            return data;
        } catch (err) {
            toast.error("获取二维码失败");
            return null;
        }
    };

    return {
        publishNote,
        checkLoginStatus,
        getLoginQrCode,
        downloadImage,
    };
};
