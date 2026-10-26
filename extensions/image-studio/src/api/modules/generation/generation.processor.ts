import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";

import { GENERATION_QUEUE, type GenerationJobData } from "./constants/generation.constants";
import { GenerationService } from "./services/generation.service";

@Processor(GENERATION_QUEUE, { maxStalledCount: 0, lockDuration: 120000 })
export class GenerationProcessor extends WorkerHost {
    /** 注入任务服务并初始化 BullMQ 消费者基类。 */
    constructor(private readonly generationService: GenerationService) {
        super();
    }

    /** 将队列任务交给生成服务，执行状态认领、推理及结果保存。 */
    async process(job: Job<GenerationJobData>) {
        await this.generationService.processTask(job.data);
    }

    /** 对执行失败且仍有任务数据的作业补偿失败状态及退款，忽略补偿异常。 */
    @OnWorkerEvent("failed")
    async onFailed(job: Job<GenerationJobData> | undefined) {
        if (job) {
            await this.generationService.failTask(job.data).catch(() => undefined);
        }
    }

    /** 对失去执行锁的作业按任务编号执行失败补偿，忽略补偿异常。 */
    @OnWorkerEvent("stalled")
    async onStalled(id: string) {
        await this.generationService.failStalledTask(id).catch(() => undefined);
    }
}
