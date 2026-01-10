import { getProvider, TextGenerator } from "@buildingai/ai-sdk";
import { BaseService } from "@buildingai/base";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { XhsNote } from "@buildingai/db/entities";
import { In, Repository } from "@buildingai/db/typeorm";
import { HttpErrorFactory } from "@buildingai/errors";
import { Injectable, Logger } from "@nestjs/common";
import type { Response } from "express";
import type { ChatCompletionMessageParam } from "openai/resources/index";

import { CreateNoteDto, GenerateNoteDto, QueryNoteDto, SearchNoteDto, UpdateNoteDto } from "../dto";
import { ContentModerationService } from "./content-moderation.service";

/**
 * 小红书笔记服务
 * 提供笔记的CRUD操作和业务逻辑
 */
@Injectable()
export class XhsNoteService extends BaseService<XhsNote> {
    protected readonly logger = new Logger(XhsNoteService.name);

    /**
     * 构造函数
     *
     * @param noteRepository 笔记仓库
     * @param contentModerationService 内容审核服务
     */
    constructor(
        @InjectRepository(XhsNote)
        private readonly noteRepository: Repository<XhsNote>,
        private readonly contentModerationService: ContentModerationService,
    ) {
        super(noteRepository);
    }

    /**
     * 流式生成笔记内容
     *
     * @param dto 生成笔记DTO
     * @param res Express响应对象，用于SSE流式输出
     */
    async generateStream(dto: GenerateNoteDto, res: Response): Promise<void> {
        try {
            // 设置SSE响应头
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Headers", "Cache-Control");

            // 输入验证
            if (!dto.content || dto.content.trim().length === 0) {
                throw HttpErrorFactory.badRequest("输入内容不能为空");
            }

            // 内容审核 - 检查生成输入
            const moderationResult = this.contentModerationService.moderateGenerationInput(dto.content);
            if (!moderationResult.isValid) {
                throw HttpErrorFactory.badRequest(moderationResult.message || "输入内容包含不当信息，请修改后重试");
            }

            // 获取AI提供者和配置
            const provider = await this.getAIProvider();
            const client = new TextGenerator(provider);

            // 构建消息内容
            const messages = this.buildMessages(dto);

            // 设置5秒超时
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => {
                    reject(HttpErrorFactory.timeout("生成超时，请稍后重试"));
                }, 5000);
            });

            // 开始流式生成
            const streamPromise = this.performStreamGeneration(client, messages, res);

            // 等待生成完成或超时
            await Promise.race([streamPromise, timeoutPromise]);

        } catch (error) {
            this.logger.error("生成笔记内容失败", error);
            
            let errorMessage = "生成失败，请稍后重试";
            let errorCode = "GENERATION_ERROR";

            // 根据错误类型设置不同的错误信息
            if (error.message?.includes("超时")) {
                errorMessage = "生成超时，请稍后重试";
                errorCode = "TIMEOUT_ERROR";
            } else if (error.message?.includes("输入内容")) {
                errorMessage = error.message;
                errorCode = "VALIDATION_ERROR";
            } else if (error.message?.includes("AI服务")) {
                errorMessage = "AI服务暂时不可用，请稍后重试";
                errorCode = "AI_SERVICE_ERROR";
            }
            
            // 发送错误事件
            res.write(`data: ${JSON.stringify({
                type: "error",
                code: errorCode,
                message: errorMessage,
                timestamp: new Date().toISOString()
            })}\n\n`);
            
            res.write("data: [DONE]\n\n");
            res.end();
        }
    }

    /**
     * 获取AI提供者
     */
    private async getAIProvider() {
        try {
            // 使用默认的OpenAI提供者，可以根据需要配置其他提供者
            const providerName = "openai";
            
            // 简化配置，使用环境变量或默认配置
            const config = {
                apiKey: process.env.OPENAI_API_KEY || "your-api-key-here",
                baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
            };
            
            return getProvider(providerName, config);
        } catch (error) {
            this.logger.error("获取AI提供者失败", error);
            throw HttpErrorFactory.internal("AI服务配置错误");
        }
    }

    /**
     * 根据生成模式构建消息
     */
    private buildMessages(dto: GenerateNoteDto): ChatCompletionMessageParam[] {
        const { content, mode, style = "活泼", emojiFrequency = "适中" } = dto;

        let systemPrompt = "";
        let userPrompt = "";

        switch (mode) {
            case "ai-generate":
                systemPrompt = `你是一个专业的小红书内容创作助手。请根据用户提供的主题，生成符合小红书风格的笔记内容。

要求：
1. 生成吸引人的标题和详细的正文内容
2. 风格：${style}
3. 适当添加emoji表情，频率：${emojiFrequency}
4. 内容要有趣、实用、易读
5. 使用小红书常见的表达方式和格式

请按以下格式输出：
标题：[生成的标题]
正文：[生成的正文内容]`;
                userPrompt = `请为以下主题生成小红书笔记内容：${content}`;
                break;

            case "ai-compose":
                systemPrompt = `你是一个专业的小红书内容创作助手。请根据用户提供的草稿内容，进行扩写和优化，使其更符合小红书风格。

要求：
1. 保持原有内容的核心思想
2. 扩展内容，使其更丰富详细
3. 风格：${style}
4. 适当添加emoji表情，频率：${emojiFrequency}
5. 优化语言表达，使其更生动有趣
6. 添加合适的标题

请按以下格式输出：
标题：[生成的标题]
正文：[优化后的正文内容]`;
                userPrompt = `请优化和扩写以下内容：${content}`;
                break;

            case "add-emoji":
                systemPrompt = `你是一个专业的小红书内容创作助手。请为用户提供的笔记内容添加合适的emoji表情符号。

要求：
1. 保持原有内容不变，只添加emoji
2. emoji频率：${emojiFrequency}
3. emoji要与内容相关且自然
4. 不要过度使用emoji
5. 保持内容的可读性

请按以下格式输出：
标题：[添加emoji后的标题]
正文：[添加emoji后的正文内容]`;
                userPrompt = `请为以下内容添加合适的emoji：${content}`;
                break;

            default:
                throw new Error("不支持的生成模式");
        }

        return [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ];
    }

    /**
     * 执行流式生成
     */
    private async performStreamGeneration(
        client: TextGenerator,
        messages: ChatCompletionMessageParam[],
        res: Response
    ): Promise<void> {
        try {
            const stream = await client.chat.stream({
                model: "gpt-3.5-turbo",
                messages,
                temperature: 0.7,
                max_tokens: 2000,
            });

            let fullContent = "";

            // 发送开始事件
            res.write(`data: ${JSON.stringify({
                type: "start",
                message: "开始生成内容..."
            })}\n\n`);

            // 处理流式响应
            for await (const chunk of stream) {
                if (chunk.choices[0].delta.content) {
                    const content = chunk.choices[0].delta.content;
                    fullContent += content;

                    // 发送内容块
                    res.write(`data: ${JSON.stringify({
                        type: "chunk",
                        data: content
                    })}\n\n`);
                }
            }

            // 验证生成的内容不为空
            if (!fullContent.trim()) {
                throw new Error("AI服务返回空内容，请重试");
            }

            // 发送完成事件
            res.write(`data: ${JSON.stringify({
                type: "complete",
                message: "生成完成",
                fullContent
            })}\n\n`);

            // 发送结束标记
            res.write("data: [DONE]\n\n");
            res.end();

        } catch (error) {
            this.logger.error("流式生成过程中出错", error);
            throw new Error("AI服务生成失败，请稍后重试");
        }
    }

    /**
     * 创建笔记
     *
     * @param dto 创建笔记DTO
     * @param userId 用户ID
     * @returns 创建的笔记
     */
    async createNote(dto: CreateNoteDto, userId: string): Promise<XhsNote> {
        // 内容审核 - 检查笔记内容
        const moderationResult = this.contentModerationService.moderateNoteContent(dto.title, dto.content);
        if (!moderationResult.isValid) {
            throw HttpErrorFactory.badRequest(moderationResult.message || "笔记内容包含不当信息，请修改后重试");
        }

        // 计算字数
        const wordCount = dto.content.length;

        const note = this.noteRepository.create({
            ...dto,
            userId,
            wordCount,
        });

        return await this.noteRepository.save(note);
    }

    /**
     * 根据用户ID查询笔记列表
     *
     * @param userId 用户ID
     * @param query 查询条件
     * @returns 笔记列表和分页信息
     */
    async findByUser(userId: string, query: QueryNoteDto) {
        const { page = 1, limit = 20, groupId, keyword, sortBy = "createdAt", sortOrder = "DESC" } = query;

        const queryBuilder = this.noteRepository
            .createQueryBuilder("note")
            .leftJoinAndSelect("note.group", "group")
            .where("note.userId = :userId", { userId });

        // 分组筛选
        if (groupId) {
            queryBuilder.andWhere("note.groupId = :groupId", { groupId });
        }

        // 关键词搜索
        if (keyword) {
            queryBuilder.andWhere(
                "(note.title ILIKE :keyword OR note.content ILIKE :keyword)",
                { keyword: `%${keyword}%` }
            );
        }

        // 排序
        queryBuilder.orderBy(`note.${sortBy}`, sortOrder);

        // 分页
        const skip = (page - 1) * limit;
        queryBuilder.skip(skip).take(limit);

        const [items, total] = await queryBuilder.getManyAndCount();

        return {
            items,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    /**
     * 根据ID获取笔记详情
     *
     * @param id 笔记ID
     * @param userId 用户ID
     * @returns 笔记详情
     */
    async findById(id: string, userId: string): Promise<XhsNote> {
        const note = await this.noteRepository.findOne({
            where: { id, userId },
            relations: ["group"],
        });

        if (!note) {
            throw HttpErrorFactory.notFound("笔记不存在或无权限访问");
        }

        return note;
    }

    /**
     * 更新笔记
     *
     * @param id 笔记ID
     * @param dto 更新数据
     * @param userId 用户ID
     * @returns 更新后的笔记
     */
    async updateNote(id: string, dto: UpdateNoteDto, userId: string): Promise<XhsNote> {
        // 验证笔记是否存在且属于当前用户
        const note = await this.noteRepository.findOne({
            where: { id, userId },
        });

        if (!note) {
            throw HttpErrorFactory.notFound("笔记不存在或无权限访问");
        }

        // 内容审核 - 如果更新了标题或内容，需要进行审核
        if (dto.title || dto.content) {
            const titleToCheck = dto.title || note.title;
            const contentToCheck = dto.content || note.content;
            
            const moderationResult = this.contentModerationService.moderateNoteContent(titleToCheck, contentToCheck);
            if (!moderationResult.isValid) {
                throw HttpErrorFactory.badRequest(moderationResult.message || "笔记内容包含不当信息，请修改后重试");
            }
        }

        // 如果更新了内容，重新计算字数
        const updateData: Partial<XhsNote> = { ...dto };
        if (dto.content) {
            updateData.wordCount = dto.content.length;
        }

        await this.noteRepository.update(id, updateData);

        return await this.noteRepository.findOne({
            where: { id },
            relations: ["group"],
        });
    }

    /**
     * 删除笔记
     *
     * @param id 笔记ID
     * @param userId 用户ID
     */
    async deleteNote(id: string, userId: string): Promise<void> {
        // 验证笔记是否存在且属于当前用户
        const note = await this.noteRepository.findOne({
            where: { id, userId },
        });

        if (!note) {
            throw HttpErrorFactory.notFound("笔记不存在或无权限访问");
        }

        await this.noteRepository.delete(id);
    }

    /**
     * 搜索笔记 - 使用PostgreSQL全文搜索
     *
     * @param userId 用户ID
     * @param searchDto 搜索参数
     * @returns 搜索结果
     */
    async search(userId: string, searchDto: SearchNoteDto) {
        const { keyword, exact = false } = searchDto;

        if (!keyword || keyword.trim().length === 0) {
            return {
                items: [],
                total: 0,
            };
        }

        const queryBuilder = this.noteRepository
            .createQueryBuilder("note")
            .leftJoinAndSelect("note.group", "group")
            .where("note.userId = :userId", { userId });

        if (exact) {
            // 精确匹配：使用 plainto_tsquery 进行精确短语匹配
            queryBuilder.andWhere(
                "to_tsvector('english', note.title || ' ' || note.content) @@ plainto_tsquery('english', :keyword)",
                { keyword }
            );
        } else {
            // 模糊匹配：结合全文搜索和ILIKE查询
            // 首先尝试全文搜索，然后回退到ILIKE模糊匹配
            const tsqueryKeyword = keyword.split(/\s+/).join(' & '); // 将空格分隔的词用 & 连接
            
            queryBuilder.andWhere(
                `(
                    to_tsvector('english', note.title || ' ' || note.content) @@ to_tsquery('english', :tsquery)
                    OR note.title ILIKE :ilike
                    OR note.content ILIKE :ilike
                )`,
                { 
                    tsquery: tsqueryKeyword,
                    ilike: `%${keyword}%`
                }
            );
        }

        // 按相关性排序：全文搜索匹配的排在前面，然后按创建时间倒序
        if (exact) {
            queryBuilder.orderBy(
                "ts_rank(to_tsvector('english', note.title || ' ' || note.content), plainto_tsquery('english', :keyword))",
                "DESC"
            ).addOrderBy("note.createdAt", "DESC");
        } else {
            queryBuilder.orderBy(
                `CASE 
                    WHEN to_tsvector('english', note.title || ' ' || note.content) @@ to_tsquery('english', :tsquery) THEN 1
                    ELSE 2
                END`,
                "ASC"
            ).addOrderBy(
                "ts_rank(to_tsvector('english', note.title || ' ' || note.content), to_tsquery('english', :tsquery))",
                "DESC"
            ).addOrderBy("note.createdAt", "DESC");
        }

        const items = await queryBuilder.getMany();

        return {
            items,
            total: items.length,
        };
    }

    /**
     * 批量删除笔记
     *
     * @param ids 笔记ID列表
     * @param userId 用户ID
     * @returns 删除的数量
     */
    async batchDelete(ids: string[], userId: string): Promise<number> {
        // 验证所有笔记都属于当前用户
        const notes = await this.noteRepository.find({
            where: { id: In(ids), userId },
        });

        if (notes.length !== ids.length) {
            throw HttpErrorFactory.forbidden("部分笔记不存在或无权限访问");
        }

        const result = await this.noteRepository.delete({ id: In(ids), userId });
        return result.affected || 0;
    }

    /**
     * 批量移动笔记到指定分组
     *
     * @param ids 笔记ID列表
     * @param groupId 目标分组ID
     * @param userId 用户ID
     * @returns 更新的数量
     */
    async batchMove(ids: string[], groupId: string, userId: string): Promise<number> {
        // 验证所有笔记都属于当前用户
        const notes = await this.noteRepository.find({
            where: { id: In(ids), userId },
        });

        if (notes.length !== ids.length) {
            throw HttpErrorFactory.forbidden("部分笔记不存在或无权限访问");
        }

        const result = await this.noteRepository.update(
            { id: In(ids), userId },
            { groupId }
        );

        return result.affected || 0;
    }
}