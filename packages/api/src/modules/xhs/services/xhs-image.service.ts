import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { Repository } from "@buildingai/db/typeorm";
import { XhsImage } from "@buildingai/db/entities";
import { BaseService } from "@buildingai/base";
import { HttpErrorFactory } from "@buildingai/errors";
import { SecretService } from "@buildingai/core/modules";
import { getProviderSecret } from "@buildingai/utils";
import { AiModelService } from "@modules/ai/model/services/ai-model.service";
import * as fs from "fs/promises";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";

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
    private async downloadAndSaveImage(remoteUrl: string): Promise<string> {
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
            const filename = `ai-generated-${uuidv4()}.png`;

            // 确定存储路径
            const projectRoot = process.cwd();
            const uploadDir = path.join(projectRoot, "storage", "uploads", "xhs-images");
            await fs.mkdir(uploadDir, { recursive: true });

            const filePath = path.join(uploadDir, filename);

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
