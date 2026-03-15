import { BaseService } from "@buildingai/base";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { PromptTemplate, PromptTemplateGroup } from "@buildingai/db/entities";
import { Repository } from "@buildingai/db/typeorm";
import { HttpErrorFactory } from "@buildingai/errors";
import { Injectable, Logger } from "@nestjs/common";

import {
    CreatePromptTemplateDto,
    CreatePromptTemplateGroupDto,
    QueryPromptTemplatesDto,
    UpdatePromptTemplateDto,
    UpdatePromptTemplateGroupDto,
} from "../dto";

@Injectable()
export class XhsPromptTemplateService extends BaseService<PromptTemplate> {
    protected readonly logger = new Logger(XhsPromptTemplateService.name);

    constructor(
        @InjectRepository(PromptTemplate)
        private readonly templateRepository: Repository<PromptTemplate>,
        @InjectRepository(PromptTemplateGroup)
        private readonly groupRepository: Repository<PromptTemplateGroup>,
    ) {
        super(templateRepository);
    }

    // ======================== 分组 CRUD ========================

    async findAllGroups(): Promise<Array<PromptTemplateGroup & { templateCount: number }>> {
        const groups = await this.groupRepository.find({
            order: { sortOrder: "ASC", createdAt: "ASC" },
        });

        const counts = await this.templateRepository
            .createQueryBuilder("t")
            .select("t.group_id", "groupId")
            .addSelect("COUNT(*)", "count")
            .where("t.group_id IS NOT NULL")
            .groupBy("t.group_id")
            .getRawMany<{ groupId: string; count: string }>();

        const countMap = new Map(counts.map((c) => [c.groupId, Number(c.count)]));
        return groups.map((g) => ({ ...g, templateCount: countMap.get(g.id) ?? 0 }));
    }

    async createGroup(dto: CreatePromptTemplateGroupDto): Promise<PromptTemplateGroup> {
        const existing = await this.groupRepository.findOne({ where: { name: dto.name } });
        if (existing) throw HttpErrorFactory.badRequest("分组名称已存在");

        const group = this.groupRepository.create({
            name: dto.name,
            sortOrder: dto.sortOrder ?? 0,
        });
        return this.groupRepository.save(group);
    }

    async updateGroup(id: string, dto: UpdatePromptTemplateGroupDto): Promise<PromptTemplateGroup> {
        const group = await this.groupRepository.findOne({ where: { id } });
        if (!group) throw HttpErrorFactory.notFound("分组不存在");

        if (dto.name && dto.name !== group.name) {
            const existing = await this.groupRepository.findOne({ where: { name: dto.name } });
            if (existing) throw HttpErrorFactory.badRequest("分组名称已存在");
        }

        Object.assign(group, dto);
        return this.groupRepository.save(group);
    }

    async deleteGroup(id: string): Promise<void> {
        const group = await this.groupRepository.findOne({ where: { id } });
        if (!group) throw HttpErrorFactory.notFound("分组不存在");

        const count = await this.templateRepository.count({ where: { groupId: id } });
        if (count > 0) {
            // 将该组下模板的 groupId 置为 null（未分组）
            await this.templateRepository
                .createQueryBuilder()
                .update()
                .set({ groupId: null })
                .where("group_id = :id", { id })
                .execute();
        }
        await this.groupRepository.delete(id);
    }

    // ======================== 模板 CRUD ========================

    async findAllWithGroups(query: QueryPromptTemplatesDto): Promise<{
        items: PromptTemplate[];
        groups: PromptTemplateGroup[];
        defaultTemplateId: string | null;
    }> {
        const qb = this.templateRepository
            .createQueryBuilder("t")
            .leftJoinAndSelect("t.group", "g")
            .orderBy("g.sort_order", "ASC", "NULLS LAST")
            .addOrderBy("t.sort_order", "ASC");

        if (query.groupId) {
            qb.where("t.group_id = :groupId", { groupId: query.groupId });
        }

        // forSelect: 只返回启用的模板
        if (query.forSelect === "true") {
            qb.andWhere("t.status = 1");
        }

        const items = await qb.getMany();
        const groups = await this.groupRepository.find({
            order: { sortOrder: "ASC", createdAt: "ASC" },
        });
        const defaultTemplate = items.find((t) => t.isDefault);
        return {
            items,
            groups,
            defaultTemplateId: defaultTemplate?.id ?? null,
        };
    }

    async findById(id: string): Promise<PromptTemplate> {
        const template = await this.templateRepository.findOne({
            where: { id },
            relations: ["group"],
        });
        if (!template) throw HttpErrorFactory.notFound("提示词模板不存在");
        return template;
    }

    async createTemplate(dto: CreatePromptTemplateDto): Promise<PromptTemplate> {
        if (dto.groupId) {
            const group = await this.groupRepository.findOne({ where: { id: dto.groupId } });
            if (!group) throw HttpErrorFactory.badRequest("所选分组不存在");
        }

        const template = this.templateRepository.create({
            name: dto.name,
            content: dto.content,
            status: dto.status ?? 1,
            groupId: dto.groupId ?? null,
            isDefault: false,
            sortOrder: dto.sortOrder ?? 0,
        });
        return this.templateRepository.save(template);
    }

    async updateTemplate(id: string, dto: UpdatePromptTemplateDto): Promise<PromptTemplate> {
        const template = await this.findById(id);

        if (dto.groupId) {
            const group = await this.groupRepository.findOne({ where: { id: dto.groupId } });
            if (!group) throw HttpErrorFactory.badRequest("所选分组不存在");
        }

        if (dto.name !== undefined) template.name = dto.name;
        if (dto.content !== undefined) template.content = dto.content;
        if (dto.status !== undefined) template.status = dto.status;
        if (dto.sortOrder !== undefined) template.sortOrder = dto.sortOrder;

        if (dto.clearGroup) {
            template.groupId = null;
        } else if (dto.groupId !== undefined) {
            template.groupId = dto.groupId;
        }

        return this.templateRepository.save(template);
    }

    async deleteTemplate(id: string): Promise<void> {
        const template = await this.findById(id);
        await this.templateRepository.delete(id);

        // 若删除的是默认模板，将第一条启用模板设为默认
        if (template.isDefault) {
            const first = await this.templateRepository.findOne({
                where: { status: 1 },
                order: { sortOrder: "ASC", createdAt: "ASC" },
            });
            if (first) {
                await this.templateRepository.update(first.id, { isDefault: true });
            }
        }
    }

    async setDefault(id: string): Promise<PromptTemplate> {
        const template = await this.findById(id);

        // 清除其他默认
        await this.templateRepository
            .createQueryBuilder()
            .update()
            .set({ isDefault: false })
            .where("id != :id", { id })
            .execute();

        template.isDefault = true;
        return this.templateRepository.save(template);
    }

    /**
     * 根据 ID 获取模板内容（用于批量生成时替换变量）
     */
    async getTemplateContent(id: string): Promise<string> {
        const template = await this.templateRepository.findOne({
            where: { id, status: 1 },
            select: ["id", "content"],
        });
        if (!template) throw HttpErrorFactory.notFound("提示词模板不存在或已禁用");
        return template.content;
    }
}
