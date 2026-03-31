import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, LessThanOrEqual, In } from "typeorm";
import { Cron } from "@buildingai/core/@nestjs/schedule";
import {
    XhsPublishSchedule,
    XhsPublishScheduleItem,
    PublishScheduleStatus,
    PublishScheduleItemStatus,
    XhsNote,
    XhsProduct,
} from "@buildingai/db";
import { CreatePublishScheduleDto } from "../dto/create-publish-schedule.dto";
import { QueryPublishScheduleDto } from "../dto/query-publish-schedule.dto";
import { XhsPublishService } from "./xhs-publish.service";

@Injectable()
export class XhsPublishScheduleService {
    private readonly logger = new Logger(XhsPublishScheduleService.name);

    constructor(
        @InjectRepository(XhsPublishSchedule)
        private readonly scheduleRepository: Repository<XhsPublishSchedule>,
        @InjectRepository(XhsPublishScheduleItem)
        private readonly scheduleItemRepository: Repository<XhsPublishScheduleItem>,
        @InjectRepository(XhsNote)
        private readonly noteRepository: Repository<XhsNote>,
        @InjectRepository(XhsProduct)
        private readonly productRepository: Repository<XhsProduct>,
        private readonly publishService: XhsPublishService,
    ) {}

    /**
     * 创建发布计划
     */
    async createSchedule(userId: string, dto: CreatePublishScheduleDto) {
        const { noteIds, startTime, interval } = dto;

        // 验证笔记是否存在且属于当前用户
        const notes = await this.noteRepository.find({
            where: {
                id: In(noteIds),
                userId,
            },
        });

        if (notes.length !== noteIds.length) {
            throw new NotFoundException("部分笔记不存在或无权访问");
        }

        // 创建发布计划
        const schedule = this.scheduleRepository.create({
            userId,
            status: PublishScheduleStatus.PENDING,
            startTime: new Date(startTime),
            interval,
            totalCount: noteIds.length,
            publishedCount: 0,
        });

        await this.scheduleRepository.save(schedule);

        // 创建发布计划项
        const startTimeDate = new Date(startTime);
        const items = noteIds.map((noteId, index) => {
            const scheduledTime = new Date(startTimeDate.getTime() + index * interval * 60 * 1000);

            return this.scheduleItemRepository.create({
                scheduleId: schedule.id,
                noteId,
                scheduledTime,
                status: PublishScheduleItemStatus.PENDING,
                order: index + 1,
                retryCount: 0,
            });
        });

        await this.scheduleItemRepository.save(items);

        return {
            schedule,
            items,
        };
    }

    /**
     * 获取发布计划列表
     */
    async getSchedules(userId: string, query: QueryPublishScheduleDto) {
        const { page = 1, limit = 10, status } = query;

        const queryBuilder = this.scheduleRepository
            .createQueryBuilder("schedule")
            .where("schedule.userId = :userId", { userId });

        if (status) {
            queryBuilder.andWhere("schedule.status = :status", { status });
        }

        const [items, total] = await queryBuilder
            .orderBy("schedule.createdAt", "DESC")
            .skip((page - 1) * limit)
            .take(limit)
            .getManyAndCount();

        return {
            items,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    /**
     * 获取发布计划详情
     */
    async getScheduleDetail(userId: string, scheduleId: string) {
        const schedule = await this.scheduleRepository.findOne({
            where: {
                id: scheduleId,
                userId,
            },
        });

        if (!schedule) {
            throw new NotFoundException("发布计划不存在");
        }

        const items = await this.scheduleItemRepository.find({
            where: {
                scheduleId,
            },
            order: {
                order: "ASC",
            },
        });

        // 加载笔记信息
        const noteIds = items.map((item) => item.noteId);
        const notes = await this.noteRepository.find({
            where: {
                id: In(noteIds),
            },
        });

        const noteMap = new Map(notes.map((note) => [note.id, note]));

        const itemsWithNotes = items.map((item) => ({
            ...item,
            note: noteMap.get(item.noteId),
        }));

        return {
            schedule,
            items: itemsWithNotes,
        };
    }

    /**
     * 暂停发布计划
     */
    async pauseSchedule(userId: string, scheduleId: string) {
        const schedule = await this.scheduleRepository.findOne({
            where: {
                id: scheduleId,
                userId,
            },
        });

        if (!schedule) {
            throw new NotFoundException("发布计划不存在");
        }

        if (
            schedule.status !== PublishScheduleStatus.PENDING &&
            schedule.status !== PublishScheduleStatus.RUNNING
        ) {
            throw new Error("只能暂停待执行或执行中的计划");
        }

        schedule.status = PublishScheduleStatus.PAUSED;
        await this.scheduleRepository.save(schedule);

        return schedule;
    }

    /**
     * 恢复发布计划
     */
    async resumeSchedule(userId: string, scheduleId: string) {
        const schedule = await this.scheduleRepository.findOne({
            where: {
                id: scheduleId,
                userId,
            },
        });

        if (!schedule) {
            throw new NotFoundException("发布计划不存在");
        }

        if (schedule.status !== PublishScheduleStatus.PAUSED) {
            throw new Error("只能恢复已暂停的计划");
        }

        schedule.status = PublishScheduleStatus.PENDING;
        await this.scheduleRepository.save(schedule);

        return schedule;
    }

    /**
     * 取消发布计划
     */
    async cancelSchedule(userId: string, scheduleId: string) {
        const schedule = await this.scheduleRepository.findOne({
            where: {
                id: scheduleId,
                userId,
            },
        });

        if (!schedule) {
            throw new NotFoundException("发布计划不存在");
        }

        if (
            schedule.status === PublishScheduleStatus.COMPLETED ||
            schedule.status === PublishScheduleStatus.CANCELLED
        ) {
            throw new Error("已完成或已取消的计划无法取消");
        }

        schedule.status = PublishScheduleStatus.CANCELLED;
        await this.scheduleRepository.save(schedule);

        return schedule;
    }

    /**
     * 重试失败的笔记
     */
    async retryFailedItems(userId: string, scheduleId: string, itemIds: string[]) {
        const schedule = await this.scheduleRepository.findOne({
            where: {
                id: scheduleId,
                userId,
            },
        });

        if (!schedule) {
            throw new NotFoundException("发布计划不存在");
        }

        const items = await this.scheduleItemRepository.find({
            where: {
                id: In(itemIds),
                scheduleId,
                status: PublishScheduleItemStatus.FAILED,
            },
        });

        if (items.length === 0) {
            throw new NotFoundException("没有找到可重试的失败项");
        }

        // 重置状态为待发布
        for (const item of items) {
            item.status = PublishScheduleItemStatus.PENDING;
            item.error = null;
            item.scheduledTime = new Date(); // 立即发布
        }

        await this.scheduleItemRepository.save(items);

        return items;
    }

    /**
     * 定时任务：检查并发布到期的笔记
     * 每分钟执行一次
     */
    @Cron("*/1 * * * *", {
        name: "xhs-publish-schedule-check",
        timeZone: "Asia/Shanghai",
    })
    async checkAndPublish() {
        const now = new Date();

        // 查找所有待发布的计划项
        const items = await this.scheduleItemRepository.find({
            where: {
                status: PublishScheduleItemStatus.PENDING,
                scheduledTime: LessThanOrEqual(now),
            },
            take: 10, // 每次最多处理10条
        });

        if (items.length === 0) {
            return;
        }

        this.logger.log(`找到 ${items.length} 条待发布的笔记`);

        for (const item of items) {
            try {
                // 检查计划状态
                const schedule = await this.scheduleRepository.findOne({
                    where: { id: item.scheduleId },
                });

                if (!schedule) {
                    continue;
                }

                // 跳过已暂停或已取消的计划
                if (
                    schedule.status === PublishScheduleStatus.PAUSED ||
                    schedule.status === PublishScheduleStatus.CANCELLED
                ) {
                    continue;
                }

                // 更新计划状态为执行中
                if (schedule.status === PublishScheduleStatus.PENDING) {
                    schedule.status = PublishScheduleStatus.RUNNING;
                    await this.scheduleRepository.save(schedule);
                }

                // 更新项状态为发布中
                item.status = PublishScheduleItemStatus.PUBLISHING;
                await this.scheduleItemRepository.save(item);

                // 获取笔记信息
                const note = await this.noteRepository.findOne({
                    where: { id: item.noteId },
                });

                if (!note) {
                    throw new Error("笔记不存在");
                }

                // 关联商品的妙手/外部商品 ID（用于小红书挂商品）
                let productSearchId: string | undefined;
                if (note.productId) {
                    const product = await this.productRepository.findOne({
                        where: { id: note.productId },
                        select: ["externalProductId"],
                    });
                    const ext = product?.externalProductId?.trim();
                    if (ext) {
                        productSearchId = ext;
                    }
                }

                // 准备图片列表
                const images: string[] = [];
                if (note.coverImages && note.coverImages.length > 0) {
                    images.push(...note.coverImages);
                }

                // 发布笔记
                const result = await this.publishService.publishContent({
                    title: note.title,
                    content: note.content,
                    images,
                    productSearchId,
                });

                if (result.success) {
                    // 发布成功
                    item.status = PublishScheduleItemStatus.PUBLISHED;
                    item.publishedTime = new Date();
                    item.error = null;

                    // 更新笔记发布状态
                    note.isPublished = true;
                    note.publishedAt = new Date();
                    note.xhsNoteId = result.noteId;
                    note.xhsNoteUrl = result.noteUrl;
                    await this.noteRepository.save(note);

                    // 更新计划已发布数
                    schedule.publishedCount += 1;

                    // 检查是否全部完成
                    if (schedule.publishedCount >= schedule.totalCount) {
                        schedule.status = PublishScheduleStatus.COMPLETED;
                    }

                    await this.scheduleRepository.save(schedule);

                    this.logger.log(`笔记 ${note.id} 发布成功`);
                } else {
                    // 发布失败
                    item.status = PublishScheduleItemStatus.FAILED;
                    item.error = result.message;
                    item.retryCount += 1;

                    this.logger.error(`笔记 ${note.id} 发布失败: ${result.message}`);
                }

                await this.scheduleItemRepository.save(item);
            } catch (error) {
                this.logger.error(`发布笔记 ${item.noteId} 时出错:`, error);

                item.status = PublishScheduleItemStatus.FAILED;
                item.error = error.message || "发布异常";
                item.retryCount += 1;
                await this.scheduleItemRepository.save(item);
            }

            // 避免请求过快
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
    }
}
