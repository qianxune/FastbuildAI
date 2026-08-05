import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { Repository } from "@buildingai/db/typeorm";
import { XhsImage } from "@buildingai/db/entities";
import { BaseService } from "@buildingai/base";
import { HttpError, HttpErrorFactory } from "@buildingai/errors";
import { SecretService } from "@buildingai/core/modules";
import { getProviderSecret } from "@buildingai/utils";
import { AiModelService } from "@modules/ai/model/services/ai-model.service";
import type { GenerateFromReferenceDto } from "../dto/generate-from-reference.dto";
import { XhsProductService } from "./xhs-product.service";
import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

const DASHSCOPE_API_V1_BASE =
    process.env.DASHSCOPE_BASE_URL?.replace(/\/$/, "") ||
    "https://dashscope.aliyuncs.com/api/v1";

const WANX_IMAGE_EDIT_CREATE_PATH = "/services/aigc/image2image/image-synthesis";

/** 官方文档中支持 parameters.strength 的 function 子集（其余能力不传 strength，避免接口报错） */
const WANX_FUNCTIONS_WITH_STRENGTH = new Set([
    "stylization_all",
    "stylization_local",
    "description_edit",
    "description_edit_with_mask",
]);

/** 轮询：间隔与最大次数（约 3 分钟） */
const DASHSCOPE_POLL_INTERVAL_MS = 2000;
const DASHSCOPE_POLL_MAX_ATTEMPTS = 90;

/**
 * 小红书图片服务
 * 处理图片上传、AI自动配图和历史图片查询
 */
@Injectable()
export class XhsImageService extends BaseService<XhsImage> {
    protected readonly logger = new Logger(XhsImageService.name);

    constructor(
        @InjectRepository(XhsImage)
        private readonly xhsImageRepository: Repository<XhsImage>,
        private readonly aiModelService: AiModelService,
        private readonly secretService: SecretService,
        private readonly xhsProductService: XhsProductService,
    ) {
        super(xhsImageRepository);
    }

    /**
     * 上传图片
     * @param file 上传的文件
     * @param userId 用户ID
     * @returns 图片记录
     */
    async upload(file: Express.Multer.File, userId: string): Promise<XhsImage> {
        try {
            // 验证文件格式
            const allowedFormats = [
                "image/jpeg",
                "image/jpg",
                "image/png",
                "image/gif",
                "image/webp",
            ];
            if (!allowedFormats.includes(file.mimetype)) {
                throw HttpErrorFactory.badRequest("不支持的图片格式，仅支持 jpg, png, gif, webp");
            }

            // 验证文件大小 (5MB)
            const maxSize = 5 * 1024 * 1024;
            if (file.size > maxSize) {
                throw HttpErrorFactory.badRequest("图片大小不能超过 5MB");
            }

            // 生成唯一文件名
            const ext = path.extname(file.originalname);
            const filename = `${uuidv4()}${ext}`;

            // 确定存储路径 - 使用当前工作目录作为项目根目录（Docker 中是 /buildingai）
            const projectRoot = process.cwd();
            const uploadDir = path.join(projectRoot, "storage", "uploads", "xhs-images");
            this.logger.debug(`Project root: ${projectRoot}`);
            this.logger.debug(`Upload directory: ${uploadDir}`);

            await fs.mkdir(uploadDir, { recursive: true });

            const filePath = path.join(uploadDir, filename);
            this.logger.debug(`Saving file to: ${filePath}`);

            // 保存文件
            await fs.writeFile(filePath, file.buffer);
            this.logger.log(`File saved successfully: ${filename}`);

            // 验证文件是否真的写入了
            const fileExists = await fs
                .access(filePath)
                .then(() => true)
                .catch(() => false);
            this.logger.debug(`File exists after write: ${fileExists}`);

            // 生成访问URL (使用 /uploads 前缀，与静态文件服务配置一致)
            const url = `/uploads/xhs-images/${filename}`;
            this.logger.debug(`Generated URL: ${url}`);

            // 创建图片记录
            const image = this.xhsImageRepository.create({
                url,
                type: "upload",
                userId,
            });

            return await this.xhsImageRepository.save(image);
        } catch (error) {
            this.logger.error(`Upload error: ${error.message}`, error.stack);
            if (error.status) {
                throw error;
            }
            throw HttpErrorFactory.internal("图片上传失败", { error: error.message });
        }
    }

    /**
     * AI自动配图
     * 根据笔记内容生成匹配的图片
     * @param content 笔记内容
     * @param userId 用户ID
     * @param modelId 可选的模型ID
     * @returns 图片记录
     */
    async generateAuto(content: string, userId: string, modelId?: string): Promise<XhsImage> {
        try {
            // 从内容生成图片提示词
            const prompt = this.buildImagePrompt(content);
            this.logger.log(`🎨 生成图片提示词: ${prompt}`);

            // 获取AI配置
            const { apiKey, baseURL } = await this.getImageGenerationConfig(modelId);

            // 调用智谱AI CogView API生成图片
            const tempUrl = await this.callCogViewApi(prompt, apiKey, baseURL);
            this.logger.log(`🖼️ 智谱AI返回临时URL: ${tempUrl}`);

            // 下载图片并保存到本地
            const localUrl = await this.downloadAndSaveImage(tempUrl);
            this.logger.log(`💾 图片已保存到本地: ${localUrl}`);

            // 创建图片记录
            const image = this.xhsImageRepository.create({
                url: localUrl,
                type: "auto",
                userId,
            });

            return await this.xhsImageRepository.save(image);
        } catch (error) {
            this.logger.error("自动配图失败:", error);
            throw HttpErrorFactory.internal("自动配图失败", { error: error.message });
        }
    }

    /**
     * 提示词 + 参考图：调用阿里云百炼万相通用图像编辑（异步任务 + 轮询），结果落库为 xhs_images
     */
    async generateFromReference(
        dto: GenerateFromReferenceDto,
        userId: string,
    ): Promise<XhsImage> {
        const pid = dto.productId?.trim();
        const refRaw = dto.referenceImageUrl?.trim();

        if (pid && refRaw) {
            throw HttpErrorFactory.badRequest("请勿同时传 productId 与 referenceImageUrl");
        }
        if (!pid && !refRaw) {
            throw HttpErrorFactory.badRequest("请提供 productId（商品主图）或 referenceImageUrl（图片地址）");
        }

        let referenceSource: string;
        if (pid) {
            const product = await this.xhsProductService.findOneForUser(pid, userId);
            const main = product.imageUrl?.trim();
            if (!main) {
                throw HttpErrorFactory.badRequest("该商品没有主图 imageUrl，无法作为参考图");
            }
            referenceSource = main;
        } else {
            referenceSource = refRaw!;
        }

        const apiKey = process.env.DASHSCOPE_API_KEY?.trim();
        if (!apiKey) {
            throw HttpErrorFactory.badRequest(
                "未配置 DASHSCOPE_API_KEY，无法调用万相图像编辑（北京地域 API Key）",
            );
        }

        const baseImageUrl = this.resolvePublicBaseImageUrl(referenceSource);
        const editFn = dto.imageEditFunction ?? "description_edit";

        let maskPublicUrl: string | undefined;
        if (editFn === "description_edit_with_mask") {
            const m = dto.maskImageUrl?.trim();
            if (!m) {
                throw HttpErrorFactory.badRequest(
                    "局部重绘须提供 maskImageUrl：涂抹图与参考图同尺寸，白色为待编辑区域（如背景），黑色为保留区域（主体）",
                );
            }
            maskPublicUrl = this.resolvePublicBaseImageUrl(m);
        }

        const strengthNum = dto.strength;
        const strength =
            strengthNum !== undefined &&
            strengthNum !== null &&
            !Number.isNaN(Number(strengthNum))
                ? Math.min(1, Math.max(0, Number(strengthNum)))
                : undefined;

        try {
            const taskId = await this.createWanxImageEditTask(baseImageUrl, dto.prompt.trim(), editFn, apiKey, {
                ...(maskPublicUrl ? { maskImageUrl: maskPublicUrl } : {}),
                ...(strength !== undefined ? { strength } : {}),
            });
            this.logger.log(`万相图像编辑任务已创建 task_id=${taskId}`);

            const resultUrl = await this.pollDashScopeTaskUntilImageUrl(taskId, apiKey);
            const localUrl = await this.downloadAndSaveImage(resultUrl, `reference-edit-${uuidv4()}.png`);
            this.logger.log(`参考图编辑结果已保存: ${localUrl}`);

            const image = this.xhsImageRepository.create({
                url: localUrl,
                type: "reference_edit",
                userId,
            });
            return await this.xhsImageRepository.save(image);
        } catch (error) {
            if (error instanceof HttpError) {
                throw error;
            }
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error("参考图生图失败:", error);
            throw HttpErrorFactory.internal("参考图生图失败", { error: msg });
        }
    }

    /**
     * 将参考地址解析为万相可拉取的公网 URL
     */
    resolvePublicBaseImageUrl(reference: string): string {
        const t = reference.trim();
        if (!t) {
            throw HttpErrorFactory.badRequest("参考图地址为空");
        }
        if (/^https?:\/\//i.test(t)) {
            return t;
        }
        if (t.startsWith("/")) {
            const origin = (process.env.APP_PUBLIC_ORIGIN || process.env.SERVER_URL || "")
                .trim()
                .replace(/\/$/, "");
            if (!origin) {
                throw HttpErrorFactory.badRequest(
                    "参考图为本站路径时，请配置环境变量 APP_PUBLIC_ORIGIN 或 SERVER_URL（对外可访问的根地址）",
                );
            }
            if (/localhost|127\.0\.0\.1/i.test(origin)) {
                throw HttpErrorFactory.badRequest(
                    "本站图片地址使用了 localhost，万相服务无法拉取，请使用公网可访问的 APP_PUBLIC_ORIGIN 或直接传 HTTPS 图片链接",
                );
            }
            return `${origin}${t}`;
        }
        throw HttpErrorFactory.badRequest("参考图地址须为 http(s) URL 或以 / 开头的本站路径");
    }

    private async createWanxImageEditTask(
        baseImageUrl: string,
        prompt: string,
        editFunction: string,
        apiKey: string,
        options?: { maskImageUrl?: string; strength?: number },
    ): Promise<string> {
        const url = `${DASHSCOPE_API_V1_BASE}${WANX_IMAGE_EDIT_CREATE_PATH}`;
        const input: Record<string, string> = {
            function: editFunction,
            prompt,
            base_image_url: baseImageUrl,
        };
        if (options?.maskImageUrl) {
            input.mask_image_url = options.maskImageUrl;
        }
        const parameters: Record<string, unknown> = { n: 1 };
        if (
            options?.strength !== undefined &&
            WANX_FUNCTIONS_WITH_STRENGTH.has(editFunction)
        ) {
            parameters.strength = options.strength;
        }
        const body = {
            model: "wanx2.1-imageedit",
            input,
            parameters,
        };

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
                "X-DashScope-Async": "enable",
            },
            body: JSON.stringify(body),
        });

        const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

        if (!response.ok) {
            const errMsg =
                (data.message as string) ||
                (data.msg as string) ||
                JSON.stringify(data).slice(0, 500);
            this.logger.error(`万相创建任务失败 HTTP ${response.status}: ${errMsg}`);
            throw new Error(`万相创建任务失败: ${response.status} ${errMsg}`);
        }

        const output = data.output as Record<string, unknown> | undefined;
        const taskId = (output?.task_id as string) || (data.task_id as string);
        if (!taskId) {
            this.logger.error("万相创建任务响应无 task_id:", data);
            throw new Error("万相创建任务响应异常，未返回 task_id");
        }
        return taskId;
    }

    private async pollDashScopeTaskUntilImageUrl(taskId: string, apiKey: string): Promise<string> {
        const queryUrl = `${DASHSCOPE_API_V1_BASE}/tasks/${encodeURIComponent(taskId)}`;

        for (let i = 0; i < DASHSCOPE_POLL_MAX_ATTEMPTS; i++) {
            if (i > 0) {
                await new Promise((r) => setTimeout(r, DASHSCOPE_POLL_INTERVAL_MS));
            }

            const response = await fetch(queryUrl, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
            });

            const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

            if (!response.ok) {
                const errMsg = (data.message as string) || JSON.stringify(data).slice(0, 300);
                throw new Error(`查询万相任务失败: ${response.status} ${errMsg}`);
            }

            const output = data.output as Record<string, unknown> | undefined;
            const status = (output?.task_status as string) || "";

            if (status === "FAILED" || status === "UNKNOWN") {
                const errMsg =
                    (output?.message as string) ||
                    (output?.code as string) ||
                    JSON.stringify(output || data).slice(0, 500);
                throw new Error(`万相任务失败: ${errMsg}`);
            }

            if (status === "SUCCEEDED") {
                const imageUrl = this.extractWanxTaskResultImageUrl(output);
                if (imageUrl) {
                    return imageUrl;
                }
                throw new Error("万相任务已成功但未解析到结果图 URL");
            }
        }

        throw new Error("万相任务轮询超时，请稍后重试");
    }

    private extractWanxTaskResultImageUrl(output: Record<string, unknown> | undefined): string | null {
        if (!output) {
            return null;
        }
        const results = output.results as Array<{ url?: string }> | undefined;
        if (results?.length && results[0]?.url) {
            return results[0].url!;
        }
        const renderUrls = output.render_urls as string[] | undefined;
        if (renderUrls?.length && renderUrls[0]) {
            return renderUrls[0];
        }
        if (typeof output.url === "string") {
            return output.url;
        }
        const submitOutputs = output.output_images as Array<{ url?: string }> | undefined;
        if (submitOutputs?.[0]?.url) {
            return submitOutputs[0].url!;
        }
        return null;
    }

    /**
     * 获取图片生成的AI配置
     */
    private async getImageGenerationConfig(
        modelId?: string,
    ): Promise<{ apiKey: string; baseURL: string }> {
        try {
            this.logger.log(`🔍 获取图片生成配置, modelId: ${modelId || "未提供"}`);

            // 如果提供了modelId，尝试从数据库获取配置
            if (modelId) {
                this.logger.log(`📦 尝试从数据库获取模型配置: ${modelId}`);
                const model = await this.aiModelService.findOne({
                    where: { id: modelId },
                    relations: ["provider"],
                });
                const modelInfo = model
                    ? JSON.stringify({
                          id: model.id,
                          name: model.name,
                          providerId: model.provider?.id,
                      })
                    : "未找到";
                this.logger.log(`📦 模型查询结果: ${modelInfo}`);

                if (model?.provider?.bindSecretId) {
                    this.logger.log(
                        `🔐 获取密钥配置, bindSecretId: ${model.provider.bindSecretId}`,
                    );
                    const providerSecret = await this.secretService.getConfigKeyValuePairs(
                        model.provider.bindSecretId,
                    );
                    this.logger.log(
                        `🔐 密钥配置键: ${Object.keys(providerSecret || {}).join(", ")}`,
                    );

                    const apiKey = getProviderSecret("apiKey", providerSecret);
                    const baseURL =
                        getProviderSecret("baseUrl", providerSecret) ||
                        "https://open.bigmodel.cn/api/paas/v4";

                    if (apiKey) {
                        this.logger.log(`✅ 从数据库获取到API密钥, baseURL: ${baseURL}`);
                        return { apiKey, baseURL };
                    } else {
                        this.logger.warn(`⚠️ 数据库中未找到apiKey`);
                    }
                } else {
                    this.logger.warn(`⚠️ 模型或provider未配置bindSecretId`);
                }
            }

            // 回退到环境变量配置
            this.logger.log(`🔄 回退到环境变量配置`);
            const apiKey = process.env.ZHIPU_API_KEY || process.env.OPENAI_API_KEY;
            const baseURL =
                process.env.ZHIPU_BASE_URL ||
                process.env.OPENAI_BASE_URL ||
                "https://open.bigmodel.cn/api/paas/v4";

            const zhipuStatus = apiKey ? "已设置" : "未设置";
            const openaiStatus = process.env.OPENAI_API_KEY ? "已设置" : "未设置";
            this.logger.log(
                `🔄 环境变量: ZHIPU_API_KEY=${zhipuStatus}, OPENAI_API_KEY=${openaiStatus}`,
            );

            if (!apiKey) {
                throw new Error("未配置图片生成API密钥，请设置 ZHIPU_API_KEY 环境变量");
            }

            return { apiKey, baseURL };
        } catch (error) {
            this.logger.error("获取图片生成配置失败:", error);
            throw error;
        }
    }

    /**
     * 调用智谱AI CogView API生成图片
     */
    private async callCogViewApi(prompt: string, apiKey: string, baseURL: string): Promise<string> {
        const url = `${baseURL}/images/generations`;

        this.logger.log(`📡 调用CogView API: ${url}`);

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "cogview-3-plus",
                prompt: prompt,
                size: "1024x1024",
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            this.logger.error(`CogView API错误: ${response.status} - ${errorText}`);
            throw new Error(`图片生成API调用失败: ${response.status}`);
        }

        const data = await response.json();

        if (!data.data?.[0]?.url) {
            this.logger.error("CogView API返回数据异常:", data);
            throw new Error("图片生成API返回数据异常");
        }

        return data.data[0].url;
    }

    /**
     * 下载远程图片并保存到本地存储
     */
    /**
     * 下载外部图片到本地，相同 URL 复用已缓存的文件，避免重复下载
     * @param imageUrl 外部图片URL
     * @param userId 用户ID
     * @returns 本地图片路径
     */
    async downloadExternalImage(imageUrl: string, userId: string): Promise<string> {
        // 验证URL格式
        let url: URL
        try {
            url = new URL(imageUrl)
        } catch {
            throw new Error(`无效的图片URL: ${imageUrl}`)
        }

        const projectRoot = process.cwd()
        const uploadDir = path.join(projectRoot, 'storage', 'uploads', 'xhs-images')
        await fs.mkdir(uploadDir, { recursive: true })

        // 用 URL 的 hash 生成确定性文件名（去掉查询参数以提高命中率）
        const urlForHash = `${url.origin}${url.pathname}`
        const urlHash = crypto.createHash('md5').update(urlForHash).digest('hex')
        const extFromPath = path.extname(url.pathname)
        // 先用 URL 中的扩展名（不含查询参数）来查找缓存文件
        const candidateExts = extFromPath ? [extFromPath] : ['.jpg', '.png', '.webp', '.gif']

        for (const candidateExt of candidateExts) {
            const cachedFilename = `product-${urlHash}${candidateExt}`
            const cachedFilePath = path.join(uploadDir, cachedFilename)
            const cachedLocalUrl = `/uploads/xhs-images/${cachedFilename}`
            try {
                await fs.access(cachedFilePath)
                this.logger.log(`♻️ 图片已缓存，跳过下载: ${cachedLocalUrl}`)
                return cachedLocalUrl
            } catch {
                // 文件不存在，继续尝试其他扩展名或下载
            }
        }

        const maxRetries = 3
        let lastError: Error | null = null

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                this.logger.log(`⬇️ 开始下载外部图片 (尝试 ${attempt}/${maxRetries}): ${imageUrl}`)

                // 下载图片，添加超时和重试
                const controller = new AbortController()
                const timeout = setTimeout(() => controller.abort(), 30000) // 30秒超时

                let response: Response
                try {
                    response = await fetch(imageUrl, {
                        signal: controller.signal,
                        headers: {
                            'User-Agent':
                                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            Accept: 'image/*,*/*',
                            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                            Referer: url.origin,
                        },
                    })
                } finally {
                    clearTimeout(timeout)
                }

                if (!response.ok) {
                    throw new Error(
                        `下载图片失败: HTTP ${response.status} ${response.statusText}`,
                    )
                }

                const arrayBuffer = await response.arrayBuffer()
                const buffer = Buffer.from(arrayBuffer)

                // 验证图片大小
                if (buffer.length === 0) {
                    throw new Error('下载的图片文件为空')
                }

                if (buffer.length > 10 * 1024 * 1024) {
                    throw new Error('图片文件过大（超过10MB）')
                }

                // 从URL路径或 Content-Type 确定扩展名
                let ext = extFromPath
                if (!ext) {
                    const contentType = response.headers.get('content-type')
                    if (contentType?.includes('jpeg') || contentType?.includes('jpg')) {
                        ext = '.jpg'
                    } else if (contentType?.includes('png')) {
                        ext = '.png'
                    } else if (contentType?.includes('webp')) {
                        ext = '.webp'
                    } else if (contentType?.includes('gif')) {
                        ext = '.gif'
                    } else {
                        ext = '.jpg'
                    }
                }

                // 使用确定性文件名保存，相同 URL 写到同一文件
                const filename = `product-${urlHash}${ext}`
                const filePath = path.join(uploadDir, filename)
                const localUrl = `/uploads/xhs-images/${filename}`

                await fs.writeFile(filePath, buffer)
                this.logger.log(`✅ 图片已保存: ${filePath} (${buffer.length} bytes)`)

                // 保存到数据库（同一文件可能已有记录，写入不影响功能）
                const image = this.xhsImageRepository.create({
                    url: localUrl,
                    type: 'upload',
                    userId,
                })
                await this.xhsImageRepository.save(image)

                return localUrl
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error))
                this.logger.warn(
                    `下载外部图片失败 (尝试 ${attempt}/${maxRetries}) [${imageUrl}]: ${lastError.message}`,
                )

                if (attempt < maxRetries) {
                    const waitTime = attempt * 1000
                    this.logger.log(`等待 ${waitTime}ms 后重试...`)
                    await new Promise((resolve) => setTimeout(resolve, waitTime))
                }
            }
        }

        const errorMessage = lastError?.message || '未知错误'
        this.logger.error(`下载外部图片失败，已重试 ${maxRetries} 次 [${imageUrl}]: ${errorMessage}`)
        throw new Error(`图片下载失败 (已重试${maxRetries}次): ${errorMessage}`)
    }

    /**
     * 下载并保存图片（私有方法，用于AI生成的图片）
     */
    private async downloadAndSaveImage(remoteUrl: string, filename?: string): Promise<string> {
        try {
            this.logger.log(`⬇️ 开始下载图片: ${remoteUrl}`);

            // 下载图片
            const response = await fetch(remoteUrl);
            if (!response.ok) {
                throw new Error(`下载图片失败: ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // 生成唯一文件名
            const finalName = filename ?? `ai-generated-${uuidv4()}.png`;

            // 确定存储路径
            const projectRoot = process.cwd();
            const uploadDir = path.join(projectRoot, "storage", "uploads", "xhs-images");
            await fs.mkdir(uploadDir, { recursive: true });

            const filePath = path.join(uploadDir, finalName);

            // 保存文件
            await fs.writeFile(filePath, buffer);
            this.logger.log(`✅ 图片已保存: ${filePath}`);

            // 返回本地访问URL
            return `/uploads/xhs-images/${filename}`;
        } catch (error) {
            this.logger.error("下载保存图片失败:", error);
            throw error;
        }
    }

    /**
     * 根据笔记内容构建图片生成提示词
     */
    private buildImagePrompt(content: string): string {
        // 提取关键词
        const keywords = this.extractKeywords(content);

        // 构建适合小红书风格的图片提示词
        const prompt = `小红书风格配图，${keywords}，高质量，精美，适合社交媒体分享，明亮的色调，吸引眼球`;

        return prompt;
    }

    /**
     * 获取用户的历史图片
     * @param userId 用户ID
     * @param page 页码
     * @param limit 每页数量
     * @returns 图片列表和总数
     */
    async findHistory(
        userId: string,
        page: number = 1,
        limit: number = 20,
    ): Promise<{ items: XhsImage[]; total: number; page: number; limit: number }> {
        try {
            const [items, total] = await this.xhsImageRepository.findAndCount({
                where: { userId },
                order: { createdAt: "DESC" },
                skip: (page - 1) * limit,
                take: limit,
            });

            return {
                items,
                total,
                page,
                limit,
            };
        } catch (error) {
            throw HttpErrorFactory.internal("获取历史图片失败", { error: error.message });
        }
    }

    /**
     * 从内容中提取关键词
     * @param content 内容文本
     * @returns 关键词字符串
     */
    private extractKeywords(content: string): string {
        // 简单的关键词提取逻辑
        // 实际应该使用更复杂的NLP算法
        const words = content
            .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, " ")
            .split(/\s+/)
            .filter((word) => word.length > 1)
            .slice(0, 10);

        return words.join(" ");
    }
}
