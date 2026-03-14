import { Injectable, Logger } from "@nestjs/common";

interface McpRequest {
    jsonrpc: "2.0";
    id: string | number;
    method: string;
    params?: Record<string, unknown>;
}

interface McpResponse {
    jsonrpc: "2.0";
    id: string | number;
    result?: unknown;
    error?: {
        code: number;
        message: string;
    };
}

interface McpToolCallResponse {
    jsonrpc: "2.0";
    id: string | number;
    result?: {
        content: Array<{
            type: string;
            text?: string;
            data?: string;
            mimeType?: string;
        }>;
        isError?: boolean;
    };
    error?: {
        code: number;
        message: string;
    };
}

export interface PublishContentParams {
    title: string;
    content: string;
    images?: string[];
    /**
     * 可选：用于在小红书中按标题搜索店内商品并挂载
     */
    productSearchTitle?: string;
}

export interface PublishResult {
    success: boolean;
    message: string;
    noteId?: string;
    noteUrl?: string;
}

export interface LoginStatusResult {
    isLoggedIn: boolean;
    message: string;
}

export interface LoginQrCodeResult {
    success: boolean;
    qrCodeUrl?: string;
    qrCodeBase64?: string;
    message: string;
}

@Injectable()
export class XhsPublishService {
    private readonly logger = new Logger(XhsPublishService.name);
    private readonly mcpServerUrl = process.env.XHS_MCP_URL || "http://172.17.0.1:18060/mcp";
    private sessionId: string | null = null;

    /**
     * 初始化 MCP 会话
     */
    private async initializeSession(): Promise<string | null> {
        const requestId = Date.now().toString();

        const request: McpRequest = {
            jsonrpc: "2.0",
            id: requestId,
            method: "initialize",
            params: {
                protocolVersion: "2024-11-05",
                capabilities: {},
                clientInfo: {
                    name: "buildingai-xhs-publisher",
                    version: "1.0.0",
                },
            },
        };

        this.logger.log("Initializing MCP session...");
        this.logger.debug(`Request: ${JSON.stringify(request)}`);

        try {
            const response = await fetch(this.mcpServerUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json, text/event-stream",
                },
                body: JSON.stringify(request),
            });

            if (!response.ok) {
                throw new Error(`MCP server returned ${response.status}: ${response.statusText}`);
            }

            // 获取 session ID from header
            const mcpSessionId = response.headers.get("mcp-session-id");
            if (mcpSessionId) {
                this.sessionId = mcpSessionId;
                this.logger.log(`MCP session initialized: ${mcpSessionId}`);
            }

            const result = (await response.json()) as McpResponse;
            this.logger.debug(`Initialize response: ${JSON.stringify(result)}`);

            if (result.error) {
                throw new Error(result.error.message);
            }

            // 发送 initialized 通知
            await this.sendInitializedNotification();

            return this.sessionId;
        } catch (error) {
            this.logger.error(`MCP session initialization failed: ${error.message}`);
            return null;
        }
    }

    /**
     * 发送 initialized 通知
     */
    private async sendInitializedNotification(): Promise<void> {
        const notification = {
            jsonrpc: "2.0",
            method: "notifications/initialized",
        };

        try {
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
            };

            if (this.sessionId) {
                headers["mcp-session-id"] = this.sessionId;
            }

            await fetch(this.mcpServerUrl, {
                method: "POST",
                headers,
                body: JSON.stringify(notification),
            });

            this.logger.debug("Sent initialized notification");
        } catch (error) {
            this.logger.warn(`Failed to send initialized notification: ${error.message}`);
        }
    }

    /**
     * 确保会话已初始化
     */
    private async ensureSession(): Promise<void> {
        if (!this.sessionId) {
            await this.initializeSession();
        }
    }

    /**
     * 调用 MCP 工具
     */
    private async callMcpTool(
        toolName: string,
        args: Record<string, unknown>,
    ): Promise<McpToolCallResponse> {
        // 确保会话已初始化
        await this.ensureSession();

        const requestId = Date.now().toString();

        const request: McpRequest = {
            jsonrpc: "2.0",
            id: requestId,
            method: "tools/call",
            params: {
                name: toolName,
                arguments: args,
            },
        };

        this.logger.log(`Calling MCP tool: ${toolName}`);
        this.logger.debug(`Request: ${JSON.stringify(request)}`);

        try {
            const response = await fetch(this.mcpServerUrl, {
                method: "POST",
                headers: this.buildHeaders(),
                body: JSON.stringify(request),
            });

            if (!response.ok) {
                // 如果是会话错误，尝试重新初始化
                if (response.status === 400 || response.status === 401) {
                    this.sessionId = null;
                    await this.ensureSession();
                    // 重试一次
                    return this.callMcpToolInternal(toolName, args);
                }
                throw new Error(`MCP server returned ${response.status}: ${response.statusText}`);
            }

            const result = (await response.json()) as McpToolCallResponse;
            this.logger.debug(`Response: ${JSON.stringify(result)}`);

            // 如果返回会话初始化错误，重新初始化并重试
            if (result.error?.message?.includes("session initialization")) {
                this.sessionId = null;
                await this.ensureSession();
                return this.callMcpToolInternal(toolName, args);
            }

            return result;
        } catch (error) {
            this.logger.error(`MCP tool call failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * 构建请求头
     */
    private buildHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
        };

        if (this.sessionId) {
            headers["mcp-session-id"] = this.sessionId;
        }

        return headers;
    }

    /**
     * 内部工具调用（不重试）
     */
    private async callMcpToolInternal(
        toolName: string,
        args: Record<string, unknown>,
    ): Promise<McpToolCallResponse> {
        const requestId = Date.now().toString();

        const request: McpRequest = {
            jsonrpc: "2.0",
            id: requestId,
            method: "tools/call",
            params: {
                name: toolName,
                arguments: args,
            },
        };

        const response = await fetch(this.mcpServerUrl, {
            method: "POST",
            headers: this.buildHeaders(),
            body: JSON.stringify(request),
        });

        if (!response.ok) {
            throw new Error(`MCP server returned ${response.status}: ${response.statusText}`);
        }

        return (await response.json()) as McpToolCallResponse;
    }

    /**
     * 检查小红书登录状态
     */
    async checkLoginStatus(): Promise<LoginStatusResult> {
        try {
            const response = await this.callMcpTool("check_login_status", {});

            if (response.error) {
                return {
                    isLoggedIn: false,
                    message: response.error.message,
                };
            }

            const content = response.result?.content?.[0]?.text || "";

            // 解析返回内容判断登录状态
            const isLoggedIn = content.includes("已登录") || content.includes("logged in");

            return {
                isLoggedIn,
                message: content,
            };
        } catch (error) {
            this.logger.error(`Check login status failed: ${error.message}`);
            return {
                isLoggedIn: false,
                message: `检查登录状态失败: ${error.message}`,
            };
        }
    }

    /**
     * 获取小红书登录二维码
     */
    async getLoginQrCode(): Promise<LoginQrCodeResult> {
        try {
            // 确保会话已初始化
            await this.ensureSession()

            if (!this.sessionId) {
                return {
                    success: false,
                    message: '小红书 MCP 服务未初始化，请检查服务配置',
                }
            }

            const response = await this.callMcpTool('get_login_qrcode', {})

            if (response.error) {
                this.logger.error(`Get login QR code error: ${response.error.message}`)
                return {
                    success: false,
                    message: `获取二维码失败: ${response.error.message}`,
                }
            }

            const content = response.result?.content || []
            let qrCodeUrl: string | undefined
            let qrCodeBase64: string | undefined
            let message = ''

            // 解析返回内容，可能包含图片或文本
            for (const item of content) {
                if (item.type === 'image') {
                    // MCP 图片格式: { type: "image", data: "base64...", mimeType: "image/png" }
                    if (item.data && item.mimeType) {
                        qrCodeBase64 = `data:${item.mimeType};base64,${item.data}`
                    } else if (item.text) {
                        if (item.text.startsWith('data:image')) {
                            qrCodeBase64 = item.text
                        } else if (item.text.startsWith('http')) {
                            qrCodeUrl = item.text
                        }
                    }
                } else if (item.type === 'text' && item.text) {
                    // 检查文本中是否包含 URL 或 base64
                    if (item.text.startsWith('http')) {
                        qrCodeUrl = item.text
                    } else if (item.text.startsWith('data:image')) {
                        qrCodeBase64 = item.text
                    } else {
                        message = item.text
                    }
                }
            }

            if (!qrCodeUrl && !qrCodeBase64) {
                this.logger.warn('No QR code found in response:', JSON.stringify(content))
                return {
                    success: false,
                    message: message || '获取二维码失败，请稍后重试',
                }
            }

            return {
                success: true,
                qrCodeUrl,
                qrCodeBase64,
                message: message || '请使用小红书 App 扫描二维码登录',
            }
        } catch (error) {
            this.logger.error(`Get login QR code failed:`, error)
            const errorMessage = error instanceof Error ? error.message : '未知错误'
            return {
                success: false,
                message: `获取登录二维码失败: ${errorMessage}`,
            }
        }
    }

    /**
     * 发布图文内容到小红书
     */
    async publishContent(params: PublishContentParams): Promise<PublishResult> {
        const { title, content, images, productSearchTitle } = params;

        this.logger.log(`📝 收到发布请求: title="${title}", images=${images?.length || 0}`);

        // 验证必填字段
        if (!title?.trim()) {
            this.logger.warn('❌ 标题为空');
            return {
                success: false,
                message: "标题不能为空",
            };
        }

        if (!content?.trim()) {
            this.logger.warn('❌ 内容为空');
            return {
                success: false,
                message: "正文内容不能为空",
            };
        }

        try {
            // 先检查登录状态
            this.logger.log('🔐 检查登录状态...');
            const loginStatus = await this.checkLoginStatus();
            this.logger.log(`🔐 登录状态: ${loginStatus.isLoggedIn ? '已登录' : '未登录'}`);
            
            if (!loginStatus.isLoggedIn) {
                return {
                    success: false,
                    message: "小红书登录已过期，请重新登录后再发布",
                };
            }

            // 构建发布参数
            const publishArgs: Record<string, unknown> = {
                title,
                content,
            };

            // 如果有商品搜索标题，传递给 MCP，用于在发布前按标题搜索并挂载店内商品
            if (productSearchTitle?.trim()) {
                // 注意：MCP 工具参数为下划线命名 product_search_title
                publishArgs.product_search_title = productSearchTitle.trim();
            }

            // 如果有图片，添加图片参数
            if (images && images.length > 0) {
                // 将相对路径转换为绝对路径（如果需要）
                const imageUrls = images.map((img) => {
                    if (img.startsWith("/")) {
                        // 如果是相对路径，转换为完整的服务器URL
                        // 注意：MCP服务器在Docker中运行，需要使用Docker宿主机IP而不是localhost
                        const serverUrl = process.env.SERVER_URL || "http://172.17.0.1:4090";
                        const fullUrl = `${serverUrl}${img}`;
                        this.logger.debug(`📸 图片路径转换: ${img} -> ${fullUrl}`);
                        return fullUrl;
                    }
                    return img;
                });
                publishArgs.images = imageUrls;
                this.logger.log(`📸 准备发布 ${imageUrls.length} 张图片`);
            }

            this.logger.log(`🚀 调用MCP发布工具...`);
            this.logger.debug(`发布参数: ${JSON.stringify(publishArgs, null, 2)}`);

            const response = await this.callMcpTool("publish_content", publishArgs);

            this.logger.log(`📡 MCP响应: ${JSON.stringify(response, null, 2)}`);

            if (response.error) {
                this.logger.error(`❌ MCP返回错误: ${response.error.message}`);
                return {
                    success: false,
                    message: `发布失败: ${response.error.message}`,
                };
            }

            const resultText = response.result?.content?.[0]?.text || "";
            const isError = response.result?.isError;

            this.logger.log(`📄 MCP结果文本: ${resultText}`);
            this.logger.log(`❓ 是否错误: ${isError}`);

            if (isError) {
                this.logger.error(`❌ MCP标记为错误: ${resultText}`);
                return {
                    success: false,
                    message: resultText || "发布失败，请稍后重试",
                };
            }

            // 尝试从返回内容中提取笔记ID和URL
            let noteId: string | undefined;
            let noteUrl: string | undefined;

            // 常见的返回格式解析
            const idMatch = resultText.match(/note[_-]?id[:\s]*([a-zA-Z0-9]+)/i);
            if (idMatch) {
                noteId = idMatch[1];
                this.logger.log(`📝 提取到笔记ID: ${noteId}`);
            }

            const urlMatch = resultText.match(/(https?:\/\/[^\s]+xiaohongshu[^\s]+)/i);
            if (urlMatch) {
                noteUrl = urlMatch[1];
                this.logger.log(`🔗 提取到笔记URL: ${noteUrl}`);
            }

            this.logger.log(`✅ 发布成功!`);
            return {
                success: true,
                message: resultText || "笔记发布成功！",
                noteId,
                noteUrl,
            };
        } catch (error) {
            this.logger.error(`❌ 发布异常: ${error.message}`, error.stack);
            return {
                success: false,
                message: `发布失败: ${error.message}`,
            };
        }
    }
}
