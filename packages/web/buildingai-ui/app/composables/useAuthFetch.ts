/**
 * useAuthFetch - 统一的 HTTP 请求工具 composable
 *
 * 自动处理：
 * - 认证 token 注入
 * - 错误处理和提示
 * - 响应数据解析
 * - 统一的错误消息格式
 */

/**
 * 请求配置选项
 */
export interface AuthFetchOptions {
    /**
     * 是否显示错误提示（默认 true）
     */
    showError?: boolean;

    /**
     * 自定义错误消息
     */
    errorMessage?: string;

    /**
     * 自定义请求头
     */
    headers?: Record<string, string>;
}

/**
 * 请求响应结果
 */
export interface AuthFetchResult<T> {
    /**
     * 响应数据（成功时）
     */
    data: T | null;

    /**
     * 错误消息（失败时）
     */
    error: string | null;
}

/**
 * useAuthFetch composable
 *
 * 提供统一的 HTTP 请求方法，自动处理认证和错误
 *
 * @example
 * ```typescript
 * const { get, post, put, del } = useAuthFetch()
 *
 * // GET 请求
 * const { data, error } = await get<XhsNote[]>('/api/xhs/notes')
 *
 * // POST 请求
 * const { data, error } = await post<XhsNote>('/api/xhs/notes', { title: '标题' })
 * ```
 */
export const useAuthFetch = () => {
    // 全局状态管理 - useUserStore 由 Nuxt 自动导入
    const userStore = useUserStore();

    // Toast 通知 - useMessage 由 Nuxt 自动导入
    const toast = useMessage();

    /**
     * 获取认证 token
     * @returns 认证 token
     * @throws 如果未登录则抛出错误
     */
    const getAuthToken = (): string => {
        const authToken = userStore.token || userStore.temporaryToken;
        if (!authToken) {
            throw new Error("请先登录");
        }
        return authToken;
    };

    /**
     * 解析错误响应
     * @param response - fetch 响应对象
     * @param defaultMessage - 默认错误消息
     * @returns 错误消息
     */
    const parseErrorResponse = async (
        response: Response,
        defaultMessage: string,
    ): Promise<string> => {
        try {
            const errorText = await response.text();
            try {
                const errorData = JSON.parse(errorText);
                return errorData.error?.message || errorData.message || defaultMessage;
            } catch {
                // 如果不是 JSON 格式，使用默认错误消息
                return defaultMessage;
            }
        } catch {
            return defaultMessage;
        }
    };

    /**
     * 处理错误
     * @param err - 错误对象
     * @param options - 请求选项
     * @param defaultMessage - 默认错误消息
     * @returns 错误消息
     */
    const handleError = (
        err: unknown,
        options: AuthFetchOptions,
        defaultMessage: string,
    ): string => {
        const errorMsg = err instanceof Error ? err.message : String(err);

        let errorMessage = options.errorMessage || defaultMessage;

        if (errorMsg.includes("登录")) {
            errorMessage = "请先登录";
        } else if (
            errorMsg.includes("网络") ||
            errorMsg.includes("network") ||
            errorMsg.includes("Failed to fetch")
        ) {
            errorMessage = "网络连接失败，请检查网络后重试";
        } else if (errorMsg) {
            errorMessage = errorMsg;
        }

        // 显示错误提示（默认显示）
        if (options.showError !== false) {
            toast.error(errorMessage);
        }

        return errorMessage;
    };

    /**
     * 解析响应数据
     * @param response - fetch 响应对象
     * @returns 解析后的数据
     */
    const parseResponseData = async <T>(response: Response): Promise<T> => {
        const responseData = await response.json();
        // API 返回格式: { code, message, data: ... }
        return (responseData.data !== undefined ? responseData.data : responseData) as T;
    };

    /**
     * GET 请求
     * @param url - 请求 URL
     * @param options - 请求选项
     * @returns 请求结果
     *
     * @example
     * ```typescript
     * // 基本用法
     * const { data, error } = await get<XhsNote[]>('/api/xhs/notes')
     *
     * // 带查询参数
     * const { data, error } = await get<PaginatedResponse<XhsNote>>('/api/xhs/notes?page=1&limit=20')
     *
     * // 禁用错误提示
     * const { data, error } = await get('/api/xhs/notes', { showError: false })
     * ```
     */
    const get = async <T = unknown>(
        url: string,
        options: AuthFetchOptions = {},
    ): Promise<AuthFetchResult<T>> => {
        try {
            const authToken = getAuthToken();

            const response = await fetch(url, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${authToken}`,
                    "Content-Type": "application/json",
                    ...options.headers,
                },
            });

            if (!response.ok) {
                const errorMessage = await parseErrorResponse(response, "请求失败");
                throw new Error(errorMessage);
            }

            const data = await parseResponseData<T>(response);

            return {
                data,
                error: null,
            };
        } catch (err) {
            const errorMessage = handleError(err, options, "请求失败");

            return {
                data: null,
                error: errorMessage,
            };
        }
    };

    /**
     * POST 请求
     * @param url - 请求 URL
     * @param body - 请求体
     * @param options - 请求选项
     * @returns 请求结果
     *
     * @example
     * ```typescript
     * // 基本用法
     * const { data, error } = await post<XhsNote>('/api/xhs/notes', { title: '标题', content: '内容' })
     *
     * // 自定义错误消息
     * const { data, error } = await post('/api/xhs/notes', body, { errorMessage: '创建笔记失败' })
     * ```
     */
    const post = async <T = unknown>(
        url: string,
        body?: unknown,
        options: AuthFetchOptions = {},
    ): Promise<AuthFetchResult<T>> => {
        try {
            const authToken = getAuthToken();

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${authToken}`,
                    "Content-Type": "application/json",
                    ...options.headers,
                },
                body: body ? JSON.stringify(body) : undefined,
            });

            if (!response.ok) {
                const errorMessage = await parseErrorResponse(response, "请求失败");
                throw new Error(errorMessage);
            }

            const data = await parseResponseData<T>(response);

            return {
                data,
                error: null,
            };
        } catch (err) {
            const errorMessage = handleError(err, options, "请求失败");

            return {
                data: null,
                error: errorMessage,
            };
        }
    };

    /**
     * PUT 请求
     * @param url - 请求 URL
     * @param body - 请求体
     * @param options - 请求选项
     * @returns 请求结果
     *
     * @example
     * ```typescript
     * // 基本用法
     * const { data, error } = await put<XhsNote>(`/api/xhs/notes/${id}`, { title: '新标题' })
     * ```
     */
    const put = async <T = unknown>(
        url: string,
        body?: unknown,
        options: AuthFetchOptions = {},
    ): Promise<AuthFetchResult<T>> => {
        try {
            const authToken = getAuthToken();

            const response = await fetch(url, {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${authToken}`,
                    "Content-Type": "application/json",
                    ...options.headers,
                },
                body: body ? JSON.stringify(body) : undefined,
            });

            if (!response.ok) {
                const errorMessage = await parseErrorResponse(response, "请求失败");
                throw new Error(errorMessage);
            }

            const data = await parseResponseData<T>(response);

            return {
                data,
                error: null,
            };
        } catch (err) {
            const errorMessage = handleError(err, options, "请求失败");

            return {
                data: null,
                error: errorMessage,
            };
        }
    };

    /**
     * DELETE 请求
     * @param url - 请求 URL
     * @param options - 请求选项
     * @returns 请求结果
     *
     * @example
     * ```typescript
     * // 基本用法
     * const { data, error } = await del(`/api/xhs/notes/${id}`)
     * ```
     */
    const del = async <T = unknown>(
        url: string,
        options: AuthFetchOptions = {},
    ): Promise<AuthFetchResult<T>> => {
        try {
            const authToken = getAuthToken();

            const response = await fetch(url, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${authToken}`,
                    "Content-Type": "application/json",
                    ...options.headers,
                },
            });

            if (!response.ok) {
                const errorMessage = await parseErrorResponse(response, "请求失败");
                throw new Error(errorMessage);
            }

            const data = await parseResponseData<T>(response);

            return {
                data,
                error: null,
            };
        } catch (err) {
            const errorMessage = handleError(err, options, "请求失败");

            return {
                data: null,
                error: errorMessage,
            };
        }
    };

    return {
        get,
        post,
        put,
        del,
    };
};
