import { BaseService } from "@buildingai/base";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { XhsGroup, XhsNote } from "@buildingai/db/entities";
import { Repository } from "@buildingai/db/typeorm";
import { HttpErrorFactory } from "@buildingai/errors";
import { Injectable } from "@nestjs/common";

import { CreateGroupDto } from "../dto";

/**
 * 小红书笔记分组服务
 * 提供分组的CRUD操作和业务逻辑
 */
@Injectable()
export class XhsGroupService extends BaseService<XhsGroup> {
    /**
     * 构造函数
     *
     * @param groupRepository 分组仓库
     * @param noteRepository 笔记仓库
     */
    constructor(
        @InjectRepository(XhsGroup)
        private readonly groupRepository: Repository<XhsGroup>,
        @InjectRepository(XhsNote)
        private readonly noteRepository: Repository<XhsNote>,
    ) {
        super(groupRepository);
    }

    /**
     * 创建分组
     *
     * @param dto 创建分组DTO
     * @param userId 用户ID
     * @returns 创建的分组
     */
    async createGroup(dto: CreateGroupDto, userId: string): Promise<XhsGroup> {
        // 检查分组名称是否重复
        const existingGroup = await this.groupRepository.findOne({
            where: { name: dto.name, userId },
        });

        if (existingGroup) {
            throw HttpErrorFactory.badRequest("分组名称已存在");
        }

        const group = this.groupRepository.create({
            ...dto,
            userId,
            isDefault: false,
        });

        return await this.groupRepository.save(group);
    }

    /**
     * 获取用户所有分组
     *
     * @param userId 用户ID
     * @returns 分组列表
     */
    async findByUser(userId: string): Promise<XhsGroup[]> {
        return await this.groupRepository.find({
            where: { userId },
            order: { isDefault: "DESC", createdAt: "ASC" },
        });
    }

    /**
     * 更新分组
     *
     * @param id 分组ID
     * @param name 新的分组名称
     * @param userId 用户ID
     * @returns 更新后的分组
     */
    async updateGroup(id: string, name: string, userId: string): Promise<XhsGroup> {
        // 验证分组是否存在且属于当前用户
        const group = await this.groupRepository.findOne({
            where: { id, userId },
        });

        if (!group) {
            throw HttpErrorFactory.notFound("分组不存在或无权限访问");
        }

        // 检查新名称是否与其他分组重复
        const existingGroup = await this.groupRepository.findOne({
            where: { name, userId },
        });

        if (existingGroup && existingGroup.id !== id) {
            throw HttpErrorFactory.badRequest("分组名称已存在");
        }

        await this.groupRepository.update(id, { name });

        return await this.groupRepository.findOne({ where: { id } });
    }

    /**
     * 删除分组
     * 删除前将该分组下的所有笔记移动到默认分组
     *
     * @param id 分组ID
     * @param userId 用户ID
     */
    async deleteGroup(id: string, userId: string): Promise<void> {
        // 验证分组是否存在且属于当前用户
        const group = await this.groupRepository.findOne({
            where: { id, userId },
        });

        if (!group) {
            throw HttpErrorFactory.notFound("分组不存在或无权限访问");
        }

        // 不能删除默认分组
        if (group.isDefault) {
            throw HttpErrorFactory.badRequest("不能删除默认分组");
        }

        // 获取或创建默认分组
        let defaultGroup = await this.groupRepository.findOne({
            where: { userId, isDefault: true },
        });

        if (!defaultGroup) {
            // 如果没有默认分组，创建一个
            defaultGroup = await this.groupRepository.save({
                name: "默认分组",
                userId,
                isDefault: true,
            });
        }

        // 将该分组下的所有笔记移动到默认分组
        await this.noteRepository.update({ groupId: id, userId }, { groupId: defaultGroup.id });

        // 删除分组
        await this.groupRepository.delete(id);
    }

    /**
     * 确保用户有默认分组
     *
     * @param userId 用户ID
     * @returns 默认分组
     */
    async ensureDefaultGroup(userId: string): Promise<XhsGroup> {
        let defaultGroup = await this.groupRepository.findOne({
            where: { userId, isDefault: true },
        });

        if (!defaultGroup) {
            defaultGroup = await this.groupRepository.save({
                name: "默认分组",
                userId,
                isDefault: true,
            });
        }

        return defaultGroup;
    }
}
