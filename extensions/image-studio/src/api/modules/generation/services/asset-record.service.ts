import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { User } from "@buildingai/db/entities";
import { EntityManager, Repository } from "@buildingai/db/typeorm";
import { HttpErrorFactory } from "@buildingai/errors";
import { ConflictException, Injectable } from "@nestjs/common";
import { AssetRecord } from "../../../db/entities/asset-record.entity";
import { validateCreativeAsset, type CreativeAsset, type CreativeAssetInput } from "../../../shared/assets";
import { ProductImageService } from "./product-image.service";

export const ASSET_RECORD_LIMIT = 40;

@Injectable()
export class AssetRecordService {
    constructor(
        @InjectRepository(AssetRecord) private readonly repository: Repository<AssetRecord>,
        private readonly productImageService: ProductImageService,
    ) {}

    async withUserLock<T>(userId: string, work: (manager: EntityManager) => Promise<T>): Promise<T> {
        return this.repository.manager.transaction(async (manager) => {
            await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`image-studio-products:${userId}`]);
            await this.lockUser(manager, userId);
            return work(manager);
        });
    }

    async lockUser(manager: EntityManager, userId: string) {
        await manager.findOneOrFail(User, { where: { id: userId }, lock: { mode: "pessimistic_write" } });
    }

    async list(userId: string) {
        const items = await this.repository.find({ where: { userId }, order: { updatedAt: "DESC", id: "DESC" }, take: ASSET_RECORD_LIMIT });
        return { items: items.map((item) => this.publicRecord(item)), limit: ASSET_RECORD_LIMIT };
    }

    officialModels(): CreativeAsset[] {
        return [];
    }

    async create(userId: string, value: unknown) {
        const input = this.input(value);
        return this.withUserLock(userId, async (manager) => {
            const repository = manager.getRepository(AssetRecord);
            if (await repository.count({ where: { userId } }) >= ASSET_RECORD_LIMIT)
                throw HttpErrorFactory.badRequest("资产资料已达 40 条上限");
            await this.checkImages(userId, input.imageIds);
            return this.publicRecord(await repository.save(repository.create({ ...input, userId, version: 1 })));
        });
    }

    async update(userId: string, id: string, value: unknown) {
        if (!value || typeof value !== "object" || Array.isArray(value)) throw HttpErrorFactory.badRequest("资产资料无效");
        const { expectedVersion, ...fields } = value as Record<string, unknown>;
        if (!Number.isSafeInteger(expectedVersion) || (expectedVersion as number) < 1 || (expectedVersion as number) >= 2147483647)
            throw HttpErrorFactory.badRequest("请提供有效的资产版本");
        const input = this.input(fields);
        return this.withUserLock(userId, async (manager) => {
            const repository = manager.getRepository(AssetRecord);
            const record = await repository.findOne({ where: { id, userId } });
            if (!record) throw HttpErrorFactory.notFound("资产资料不存在");
            if (record.version !== expectedVersion) throw new ConflictException("资产资料已更新，请刷新后重试");
            await this.checkImages(userId, input.imageIds);
            Object.assign(record, input, { version: record.version + 1 });
            return this.publicRecord(await repository.save(record));
        });
    }

    async remove(userId: string, id: string) {
        return this.withUserLock(userId, async (manager) => {
            const result = await manager.getRepository(AssetRecord).delete({ id, userId });
            if (!result.affected) throw HttpErrorFactory.notFound("资产资料不存在");
            return { success: true };
        });
    }

    async assertOwnedModel(manager: EntityManager, userId: string, assetId: string, imageId: string) {
        const record = await manager.getRepository(AssetRecord).findOne({ where: { id: assetId, userId } });
        if (!record || record.kind !== "model" || !Array.isArray(record.imageIds) || record.imageIds.length !== 1
            || record.imageIds[0]?.toLowerCase() !== imageId.toLowerCase())
            throw HttpErrorFactory.badRequest("目标模特不存在或图片已更换，请重新选择模特");
    }

    async assertImageUnreferenced(manager: EntityManager, userId: string, imageId: string) {
        const referenced = await manager.getRepository(AssetRecord).createQueryBuilder("asset")
            .where("asset.userId = :userId", { userId })
            .andWhere("asset.imageIds @> CAST(:imageIds AS jsonb)", { imageIds: JSON.stringify([imageId.toLowerCase()]) })
            .getCount();
        if (referenced) throw HttpErrorFactory.badRequest("图片已被模特或创作参考引用，请先删除或修改资产资料");
    }

    private input(value: unknown): CreativeAssetInput {
        const normalized = value && typeof value === "object" && !Array.isArray(value)
            ? { ...value, prompt: (value as Record<string, unknown>).prompt === undefined ? "" : (value as Record<string, unknown>).prompt }
            : value;
        const error = validateCreativeAsset(normalized);
        if (error) throw HttpErrorFactory.badRequest(error);
        const input = normalized as CreativeAssetInput;
        const imageIds = input.imageIds.map((id) => id.toLowerCase());
        if (new Set(imageIds).size !== imageIds.length) throw HttpErrorFactory.badRequest("请选择不重复的参考图片");
        return { kind: input.kind, name: input.name.trim(), prompt: input.prompt, imageIds };
    }

    private async checkImages(userId: string, imageIds: string[]) {
        const images = await this.productImageService.list(userId);
        for (const id of imageIds) {
            const image = images.find((item) => item.id.toLowerCase() === id);
            if (!image) throw HttpErrorFactory.badRequest("参考图片不存在或不属于当前用户");
            if (image.metadataStatus !== "ready") throw HttpErrorFactory.badRequest("素材元数据不可用，原图仍保留");
            await this.productImageService.read(userId, image.id);
        }
    }

    private publicRecord(record: AssetRecord): CreativeAsset {
        return {
            id: record.id, kind: record.kind, name: record.name, prompt: record.prompt,
            imageIds: [...record.imageIds], version: record.version,
            createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString(),
        };
    }
}