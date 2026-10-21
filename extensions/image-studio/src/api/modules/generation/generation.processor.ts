import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";

import { GENERATION_QUEUE, type GenerationJobData, GenerationService } from "./services/generation.service";

@Processor(GENERATION_QUEUE, { maxStalledCount: 0, lockDuration: 120000 })
export class GenerationProcessor extends WorkerHost {
    constructor(private readonly generationService: GenerationService) {
        super();
    }

    async process(job: Job<GenerationJobData>) {
        await this.generationService.processTask(job.data);
    }

    @OnWorkerEvent("failed")
    async onFailed(job: Job<GenerationJobData> | undefined) {
        if (job) {
            await this.generationService.failTask(job.data).catch(() => undefined);
        }
    }

    @OnWorkerEvent("stalled")
    async onStalled(id: string) {
        await this.generationService.failStalledTask(id).catch(() => undefined);
    }
}