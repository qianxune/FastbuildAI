import { BaseService } from "@buildingai/base";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { XhsNote } from "@buildingai/db/entities";
import { In, Repository } from "@buildingai/db/typeorm";
import { HttpErrorFactory } from "@buildingai/errors";
import { Injectable } from "@nestjs/common";

import { CreateNoteDto, QueryNoteDto, UpdateNoteDto } from "../dto";

/**
 * 小红书笔记服务
 * 提供笔记的CRUD操作和业务逻辑
 */
@Injectable()
export class XhsNoteService extends BaseService<XhsNote> {
    /**
     * 构造函数
     *
     * @param noteRepository 笔记仓库
     */
    constructor(
        @InjectRepository(XhsNote)
        private readonly noteRepository: Repository<XhsNote>,
    ) {
        super(noteRepository);
    }

    /**
     * 创建笔记
     *
     * @param dto 创建笔记DTO
     * @param userId 用户ID
     * @returns 创建的笔记
     */
    async createNote(dto: CreateNoteDto, userId: string): Promise<XhsNote> {
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
     * 搜索笔记
     *
     * @param userId 用户ID
     * @param keyword 搜索关键词
     * @returns 搜索结果
     */
    async search(userId: string, keyword: string) {
        const queryBuilder = this.noteRepository
            .createQueryBuilder("note")
            .leftJoinAndSelect("note.group", "group")
            .where("note.userId = :userId", { userId })
            .andWhere(
                "(note.title ILIKE :keyword OR note.content ILIKE :keyword)",
                { keyword: `%${keyword}%` }
            )
            .orderBy("note.createdAt", "DESC");

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