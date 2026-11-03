import { BaseBillingService } from "@buildingai/core/modules";
import { User } from "@buildingai/db/entities";
import { type DeepPartial, EntityManager } from "@buildingai/db/typeorm";
import { HttpErrorFactory } from "@buildingai/errors";
import { ExtensionBillingService } from "@buildingai/extension-sdk";
import { Injectable } from "@nestjs/common";

import {
    ImageGeneration,
    ImageGenerationStatus,
} from "../../../db/entities/image-generation.entity";
import { quoteGenerationCredits } from "../../../shared/billing";
import { validateToolWorkflow, type ToolWorkflowInput } from "../../../shared/tool-workflow";
import { GENERATION_FAILED, publicGenerationError } from "../constants/generation.constants";

@Injectable()
export class GenerationBillingService {
    /** 注入扩展积分收支服务与可用余额查询服务。 */
    constructor(
        private readonly extensionBilling: ExtensionBillingService,
        private readonly baseBilling: BaseBillingService,
    ) {}

    /** 查询用户当前可消费积分，不扣费也不创建生成任务。 */
    async balance(userId: string) {
        return { balance: await this.baseBilling.getSpendablePower(userId) };
    }

    /** 在调用方事务中按张数计价、保存任务并扣费；任一步失败均由事务回滚。 */
    async createTask(
        manager: EntityManager,
        input: DeepPartial<ImageGeneration> & { userId: string; count: number },
        rule: { power: number },
    ) {
        let amount: number;
        try {
            const sku = input.toolKey === "sku" && input.toolInput?.design?.skuRegions !== undefined && input.toolInput.count === input.count
                && validateToolWorkflow(input.toolInput as ToolWorkflowInput) === null;
            amount = quoteGenerationCredits(rule, input.count, sku ? "sku" : undefined).total;
        } catch {
            throw HttpErrorFactory.badRequest("所选模型的积分价格配置无效，请联系管理员");
        }
        const repository = manager.getRepository(ImageGeneration);
        const generation = await repository.save(
            repository.create({
                ...input,
                billingAmount: amount,
                billingStatus: amount > 0 ? "charged" : "free",
            }),
        );
        if (amount > 0) {
            await this.extensionBilling.deductUserPower(
                {
                    userId: input.userId,
                    amount,
                    associationNo: generation.id,
                    remark: `图片生成 ${input.count} 张`,
                },
                manager,
            );
        }
        return generation;
    }

    /** 锁定任务后将未结束任务标记为失败或取消；已扣费任务锁定用户并退款，避免重复退款。 */
    async finishUnsuccessful(
        manager: EntityManager,
        userId: string,
        id: string,
        status: ImageGenerationStatus.FAILED | ImageGenerationStatus.CANCELLED,
        failureMessage = GENERATION_FAILED,
    ) {
        const repository = manager.getRepository(ImageGeneration);
        const generation = await repository.findOne({
            where: { id, userId },
            lock: { mode: "pessimistic_write" },
        });
        if (!generation) throw HttpErrorFactory.notFound("生成记录不存在");
        if (
            ![ImageGenerationStatus.QUEUED, ImageGenerationStatus.PROCESSING].includes(
                generation.status,
            )
        ) {
            return generation;
        }
        if (generation.billingStatus === "charged") {
            if (!Number.isSafeInteger(generation.billingAmount) || generation.billingAmount <= 0) {
                throw new Error("Invalid charged task amount");
            }
            await manager.findOneOrFail(User, {
                where: { id: userId },
                lock: { mode: "pessimistic_write" },
            });
            await this.extensionBilling.addUserPower(
                {
                    userId,
                    amount: generation.billingAmount,
                    associationNo: generation.id,
                    remark:
                        status === ImageGenerationStatus.CANCELLED
                            ? "图片生成取消退款"
                            : "图片生成失败退款",
                },
                manager,
            );
            generation.billingStatus = "refunded";
        }
        generation.status = status;
        generation.images = [];
        generation.error = status === ImageGenerationStatus.FAILED ? publicGenerationError(failureMessage) : null;
        return repository.save(generation);
    }
}
