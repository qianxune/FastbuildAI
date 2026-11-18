import { validateCreativeAsset } from "../src/api/shared/assets";
import { customModelPrompt, isCustomModelPrompt } from "../src/api/shared/custom-model";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import * as ts from "typescript";

function loadService() {
    const source = readFileSync(path.join(__dirname, "../src/api/modules/generation/services/asset-record.service.ts"), "utf8");
    const exports: Record<string, any> = {};
    class ConflictException extends Error {}
    const requireMock = (name: string) => {
        if (name.endsWith("/shared/assets")) return { validateCreativeAsset };
        if (name.endsWith("/shared/custom-model")) return { isCustomModelPrompt };
        if (name === "node:crypto") return require("node:crypto");
        if (name === "@nestjs/common") return { Injectable: () => () => undefined, ConflictException };
        if (name === "@buildingai/db/@nestjs/typeorm") return { InjectRepository: () => () => undefined };
        if (name === "@buildingai/errors") return { HttpErrorFactory: { badRequest: (message: string) => new Error(message), notFound: (message: string) => new Error(message) } };
        return { User: class {}, AssetRecord: class {}, ProductImageService: class {}, ImageGeneration: class ImageGeneration {}, ImageGenerationStatus: { COMPLETED: "completed" } };
    };
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true } }).outputText,
        { exports, require: requireMock });
    return exports.AssetRecordService;
}

function fixture() {
    let records: any[] = [];
    let locked = false;
    let tail = Promise.resolve();
    const repository: any = {
        create: jest.fn((value) => ({ id: `asset-${records.length}`, createdAt: new Date(), updatedAt: new Date(), ...value })),
        save: jest.fn(async (record) => { expect(locked).toBe(true); records = records.filter((item) => item.id !== record.id).concat(structuredClone(record)); return record; }),
        count: jest.fn(async ({ where }) => records.filter((item) => item.userId === where.userId).length),
        find: jest.fn(async ({ where }) => records.filter((item) => item.userId === where.userId)),
        findOne: jest.fn(async ({ where }) => structuredClone(records.find((item) => item.id === where.id && item.userId === where.userId) ?? null)),
        delete: jest.fn(async ({ id, userId }) => { expect(locked).toBe(true); const before = records.length; records = records.filter((item) => item.id !== id || item.userId !== userId); return { affected: before - records.length }; }),
    };
    const query: any = { where: jest.fn(() => query), andWhere: jest.fn(() => query), getCount: jest.fn(async () => { expect(locked).toBe(true); return 0; }) };
    repository.createQueryBuilder = jest.fn(() => query);
    const generations = { findOne: jest.fn(async (): Promise<any> => null) };
    const manager = {
        getRepository: jest.fn((entity?: { name?: string }) => entity?.name === "ImageGeneration" ? generations : repository),
        query: jest.fn(async () => []),
        findOneOrFail: jest.fn(async (_entity, options) => { expect(options.lock.mode).toBe("pessimistic_write"); locked = true; }),
        transaction: (work: (transaction: any) => Promise<any>) => {
            const result = tail.then(async () => { const before = structuredClone(records); try { return await work(manager); } catch (error) { records = before; throw error; } finally { locked = false; } });
            tail = result.then(() => undefined, () => undefined);
            return result;
        },
    };
    repository.manager = manager;
    const images = { list: jest.fn(async () => { expect(locked).toBe(true); return [{ id: imageId, metadataStatus: "ready" }]; }), read: jest.fn(async () => { expect(locked).toBe(true); return Buffer.from("image"); }), remove: jest.fn(),
        normalize: jest.fn(async () => ({ buffer: Buffer.from("image"), width: 100, height: 100 })) };
    const faces = { validate: jest.fn(async () => undefined) };
    const generatedImages = { read: jest.fn(async () => ({ buffer: Buffer.from("original"), mediaType: "image/png" })) };
    return { service: new (loadService())(repository, images, faces, generatedImages), repository, images, faces, generations, generatedImages, manager, query, isLocked: () => locked };
}

const imageId = "11111111-1111-4111-8111-111111111111";
const input = { kind: "reference", name: "场景参考", prompt: "", imageIds: [imageId] };

describe("creative asset input", () => {
    it("accepts an empty prompt and one owned-image reference shape", () => {
        expect(validateCreativeAsset(input)).toBeNull();
        expect(validateCreativeAsset({ ...input, kind: "model" })).toBeNull();
    });
    it("rejects unsupported fields and invalid names", () => {
        expect(validateCreativeAsset({ ...input, userId: imageId })).not.toBeNull();
        expect(validateCreativeAsset({ ...input, name: "  " })).not.toBeNull();
        expect(validateCreativeAsset({ ...input, name: "../escape" })).not.toBeNull();
        expect(validateCreativeAsset({ ...input, name: "a".repeat(121) })).not.toBeNull();
        expect(validateCreativeAsset({ ...input, kind: "generated" })).not.toBeNull();
    });
    it("bounds prompts and requires distinct valid images", () => {
        expect(validateCreativeAsset({ ...input, prompt: "a".repeat(1501) })).not.toBeNull();
        expect(validateCreativeAsset({ ...input, imageIds: [] })).not.toBeNull();
        expect(validateCreativeAsset({ ...input, imageIds: [imageId, imageId] })).not.toBeNull();
        expect(validateCreativeAsset({ ...input, imageIds: ["../escape"] })).not.toBeNull();
        expect(validateCreativeAsset({ ...input, kind: "model", imageIds: [imageId, "22222222-2222-4222-8222-222222222222"] })).not.toBeNull();
        expect(validateCreativeAsset(null)).not.toBeNull();
    });
});

describe("creative asset records", () => {
    it("checks apparel model snapshots on the caller transaction and tolerates rename only", async () => {
        const { service, manager, repository, images } = fixture();
        const model = await service.create("owner", { ...input, kind: "model", faceConsent: true });
        const check = (owner: string, id = model.id, snapshot = imageId) => service.withUserLock(owner,
            (transaction: unknown) => service.assertOwnedModel(transaction, owner, id, snapshot));
        await expect(check("owner")).resolves.toBeUndefined();
        expect(repository.findOne).toHaveBeenLastCalledWith({ where: { id: model.id, userId: "owner" } });
        await expect(check("other")).rejects.toThrow("目标模特");
        await expect(check("owner", "deleted")).rejects.toThrow("目标模特");
        await expect(check("owner", model.id, "22222222-2222-4222-8222-222222222222")).rejects.toThrow("目标模特");
        await service.update("owner", model.id, { ...input, kind: "model", name: "Renamed", expectedVersion: 1 });
        await expect(check("owner")).resolves.toBeUndefined();
        const reference = await service.create("owner", input);
        await expect(check("owner", reference.id)).rejects.toThrow("目标模特");
        repository.findOne.mockResolvedValueOnce({ kind: "model", imageIds: [imageId, imageId] });
        await expect(check("owner")).rejects.toThrow("目标模特");
        await service.remove("owner", model.id);
        await expect(check("owner")).rejects.toThrow("目标模特");
        expect(manager.getRepository).toHaveBeenCalled();
        expect(images.list).toHaveBeenCalledTimes(3);
    });

    it("persists owned references without copying files, exposing userId or calling generation", async () => {
        const { service, images } = fixture();
        const asset = await service.create("owner", input);
        expect(asset).toMatchObject({ ...input, version: 1 });
        expect(asset.userId).toBeUndefined();
        expect(images.read).toHaveBeenCalledWith("owner", imageId);
        expect(await service.list("other")).toEqual({ items: [], limit: 40 });
        expect(service.officialModels()).toEqual([]);
        await service.remove("owner", asset.id);
        expect(images.remove).not.toHaveBeenCalled();
    });

    it("defaults omitted prompt but rejects supplied userId, foreign files, unsafe reads and damaged metadata", async () => {
        const { service, images, repository } = fixture();
        expect((await service.create("owner", { kind: "model", name: "Model", imageIds: [imageId], faceConsent: true })).prompt).toBe("");
        await expect(service.create("owner", { ...input, userId: "other" })).rejects.toThrow();
        images.list.mockResolvedValueOnce([]);
        await expect(service.create("owner", input)).rejects.toThrow("不属于");
        images.list.mockResolvedValueOnce([{ id: imageId, metadataStatus: "unavailable" }]);
        await expect(service.create("owner", input)).rejects.toThrow("元数据");
        images.read.mockRejectedValueOnce(new Error("Unsafe file"));
        await expect(service.create("owner", input)).rejects.toThrow("Unsafe file");
        expect(repository.save).toHaveBeenCalledTimes(1);
    });

    it("requires the current version and isolates updates and deletion", async () => {
        const { service } = fixture();
        const asset = await service.create("owner", input);
        await expect(service.update("other", asset.id, { ...input, expectedVersion: 1 })).rejects.toThrow("不存在");
        await expect(service.remove("other", asset.id)).rejects.toThrow("不存在");
        await expect(service.update("owner", asset.id, input)).rejects.toThrow("版本");
        const updated = await service.update("owner", asset.id, { ...input, name: "New", expectedVersion: 1 });
        expect(updated).toMatchObject({ name: "New", version: 2 });
        await expect(service.update("owner", asset.id, { ...input, expectedVersion: 1 })).rejects.toThrow("已更新");
    });

    it("serializes concurrent updates and quota checks", async () => {
        const { service } = fixture();
        const asset = await service.create("owner", input);
        const updates = await Promise.allSettled([service.update("owner", asset.id, { ...input, expectedVersion: 1 }), service.update("owner", asset.id, { ...input, expectedVersion: 1 })]);
        expect(updates.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        for (let count = 1; count < 39; count += 1) await service.create("owner", input);
        const creates = await Promise.allSettled([service.create("owner", input), service.create("owner", input)]);
        expect(creates.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        expect((await service.list("owner")).items).toHaveLength(40);
    });

    it("checks image references on the caller transaction while the user lock remains held", async () => {
        const { service, manager, query } = fixture();
        query.getCount.mockResolvedValueOnce(1);
        await expect(service.withUserLock("owner", async (transaction: any) => {
            expect(transaction).toBe(manager);
            await service.assertImageUnreferenced(transaction, "owner", imageId);
        })).rejects.toThrow("引用");
        expect(query.andWhere).toHaveBeenCalledWith("asset.imageIds @> CAST(:imageIds AS jsonb)", { imageIds: JSON.stringify([imageId]) });
        expect(manager.query).toHaveBeenCalledWith("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["image-studio-products:owner"]);
    });

    it("rejects case-variant duplicate UUIDs and invalid version values", async () => {
        const { service } = fixture();
        const letterId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
        await expect(service.create("owner", { ...input, imageIds: [letterId, letterId.toUpperCase()] })).rejects.toThrow("重复");
        for (const expectedVersion of [undefined, null, "1", 0, -1, 1.5, 2147483647])
            await expect(service.update("owner", "asset", { ...input, expectedVersion })).rejects.toThrow("版本");
    });

    it("requires explicit consent and a successful server-side face check before saving uploaded models", async () => {
        const { service, faces, repository } = fixture();
        const model = { ...input, kind: "model" };
        await expect(service.create("owner", model)).rejects.toThrow("同意");
        await expect(service.create("owner", { ...model, faceConsent: false })).rejects.toThrow("同意");
        expect(faces.validate).not.toHaveBeenCalled();
        faces.validate.mockRejectedValueOnce(new Error("未成年风险"));
        await expect(service.create("owner", { ...model, faceConsent: true })).rejects.toThrow("未成年风险");
        expect(repository.save).not.toHaveBeenCalled();
        const record = await service.create("owner", { ...model, faceConsent: true });
        expect(record.faceConsent).toBeUndefined();
        expect(faces.validate).toHaveBeenLastCalledWith(Buffer.from("image"));
    });

    it("checks reference-to-model conversions and photo changes but not model renames or stale writes", async () => {
        const { service, faces, images } = fixture();
        const record = await service.create("owner", input);
        await expect(service.update("owner", record.id, { ...input, kind: "model", expectedVersion: 1 })).rejects.toThrow("同意");
        await service.update("owner", record.id, { ...input, kind: "model", expectedVersion: 1, faceConsent: true });
        await service.update("owner", record.id, { ...input, kind: "model", name: "Rename", expectedVersion: 2 });
        expect(faces.validate).toHaveBeenCalledTimes(1);
        const changedId = "22222222-2222-4222-8222-222222222222";
        images.list.mockResolvedValue([{ id: changedId, metadataStatus: "ready" }]);
        faces.validate.mockRejectedValueOnce(new Error("无清晰正脸"));
        await expect(service.update("owner", record.id, { ...input, kind: "model", imageIds: [changedId], expectedVersion: 3, faceConsent: true })).rejects.toThrow("无清晰正脸");
        expect((await service.list("owner")).items[0]).toMatchObject({ version: 3, imageIds: [imageId] });
        await expect(service.update("owner", record.id, { ...input, kind: "model", expectedVersion: 1, faceConsent: true })).rejects.toThrow("已更新");
        expect(faces.validate).toHaveBeenCalledTimes(2);
    });

    it("does not detect reference photos or send foreign and unreadable photos to Tencent", async () => {
        const { service, faces, images } = fixture();
        await service.create("owner", input);
        images.list.mockResolvedValueOnce([]);
        await expect(service.create("owner", { ...input, kind: "model", faceConsent: true })).rejects.toThrow("不属于");
        images.read.mockRejectedValueOnce(new Error("Unsafe file"));
        await expect(service.create("owner", { ...input, kind: "model", faceConsent: true })).rejects.toThrow("Unsafe file");
        expect(faces.validate).not.toHaveBeenCalled();
    });

    it("exempts only an owned, completed, text-only custom result matching the actual stored bytes", async () => {
        const { service, faces, generations, generatedImages, images } = fixture();
        const prompt = customModelPrompt({ gender: "女", appearance: "东亚", age: "青年", persona: "上班族", body: "匀称" });
        const generatedFrom = "33333333-3333-4333-8333-333333333333";
        const generation = { id: generatedFrom, prompt, toolKey: "creative", status: "completed", count: 1, images: [{ mediaType: "image/png" }] };
        const value = { ...input, kind: "model", prompt, generatedFrom };
        await expect(service.create("owner", value)).rejects.toThrow("生成来源");
        generations.findOne.mockResolvedValue(generation);
        const record = await service.create("owner", value);
        expect(generations.findOne).toHaveBeenLastCalledWith({ where: { id: generatedFrom, userId: "owner" } });
        expect(generatedImages.read).toHaveBeenCalledWith(generatedFrom, 0, generation.images[0]);
        expect(record.generatedFrom).toBeUndefined();
        expect(faces.validate).not.toHaveBeenCalled();
        for (const invalid of [{ status: "processing" }, { toolKey: "main" }, { count: 2 },
            { toolInput: { assetIds: [imageId] } }, { mainInput: {} }, { prompt: `${prompt} injected` }]) {
            generations.findOne.mockResolvedValueOnce({ ...generation, ...invalid });
            await expect(service.create("owner", value)).rejects.toThrow("生成来源");
        }
        images.normalize.mockResolvedValueOnce({ buffer: Buffer.from("different"), width: 100, height: 100 });
        await expect(service.create("owner", value)).rejects.toThrow("不一致");
        await expect(service.update("owner", record.id, { ...value, expectedVersion: 1 })).rejects.toThrow("不支持修改生成来源");
        expect(faces.validate).not.toHaveBeenCalled();
    });
});

function loadGenerationService() {
    const source = readFileSync(path.join(__dirname, "../src/api/modules/generation/services/generation.service.ts"), "utf8");
    const exports: Record<string, any> = {};
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true } }).outputText, {
        exports,
        require: (name: string) => {
            if (name === "@nestjs/common") return { Injectable: () => () => undefined, Inject: () => () => undefined, Optional: () => () => undefined, Logger: class {} };
            if (name === "@nestjs/bullmq") return { InjectQueue: () => () => undefined };
            if (name === "@buildingai/db/@nestjs/typeorm") return { InjectRepository: () => () => undefined };
            if (name === "@buildingai/errors") return { HttpErrorFactory: { badRequest: (message: string) => new Error(message) } };
            return {};
        },
    });
    return exports.GenerationService;
}

describe("asset image deletion protection", () => {
    it("normalizes UUID case when checking stored image references", async () => {
        const { service, manager, query } = fixture();
        const mixedId = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
        query.getCount.mockResolvedValueOnce(1);
        await expect(service.assertImageUnreferenced(manager, "owner", mixedId)).rejects.toThrow("引用");
        expect(query.andWhere).toHaveBeenCalledWith("asset.imageIds @> CAST(:imageIds AS jsonb)", {
            imageIds: JSON.stringify([mixedId.toLowerCase()]),
        });
    });

    function deletionFixture() {
        const assets = fixture();
        const history: any = { where: jest.fn(() => history), andWhere: jest.fn(() => history), getExists: jest.fn(async () => false) };
        const repository = { manager: assets.manager, createQueryBuilder: jest.fn(() => history) };
        const getRepository = assets.manager.getRepository;
        assets.manager.getRepository = jest.fn((entity?: any) => entity === undefined ? repository : getRepository());
        const remove = jest.fn(async () => { expect(assets.isLocked()).toBe(true); return { success: true }; });
        const GenerationService = loadGenerationService();
        const generation = new GenerationService(repository, undefined, undefined, undefined, { remove }, undefined, undefined, assets.service);
        return { ...assets, generation, history, remove, repository };
    }

    it("retains historical refusal and refuses asset references before removing the file", async () => {
        const { generation, history, query, remove } = deletionFixture();
        history.getExists.mockResolvedValueOnce(true);
        await expect(generation.removeProductImage("owner", imageId)).rejects.toThrow("生成记录");
        query.getCount.mockResolvedValueOnce(1);
        await expect(generation.removeProductImage("owner", imageId)).rejects.toThrow("引用");
        expect(remove).not.toHaveBeenCalled();
        expect(history.andWhere).toHaveBeenCalledWith("(generation.mainInput @> CAST(:input AS jsonb) OR generation.toolInput @> CAST(:input AS jsonb))", { input: JSON.stringify({ assetIds: [imageId] }) });
    });

    it("holds the same transaction lock through deletion, then rejects a queued save of that file", async () => {
        const { generation, service, images, remove, manager, isLocked } = deletionFixture();
        remove.mockImplementationOnce(async () => { expect(isLocked()).toBe(true); images.list.mockResolvedValue([]); return { success: true }; });
        const outcomes = await Promise.allSettled([generation.removeProductImage("owner", imageId), service.create("owner", input)]);
        expect(outcomes.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
        expect(remove).toHaveBeenCalledTimes(1);
        expect(manager.query).toHaveBeenCalledWith("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["image-studio-products:owner"]);
    });

    it("refuses queued deletion after a successful save under the same lock", async () => {
        const { generation, service, query, remove, repository } = deletionFixture();
        query.getCount.mockImplementation(async () => repository.manager.getRepository({}).count({ where: { userId: "owner" } }));
        const outcomes = await Promise.allSettled([service.create("owner", input), generation.removeProductImage("owner", imageId)]);
        expect(outcomes.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
        expect(remove).not.toHaveBeenCalled();
    });

    it("preserves positional construction without the optional asset service", async () => {
        const history: any = { where: () => history, andWhere: () => history, getExists: async () => false };
        const repository: any = { createQueryBuilder: () => history };
        const manager: any = { query: jest.fn(), getRepository: () => repository, transaction: async (work: any) => work(manager) };
        repository.manager = manager;
        const remove = jest.fn(async () => ({ success: true }));
        const generation = new (loadGenerationService())(repository, undefined, undefined, undefined, { remove }, undefined, undefined);
        await expect(generation.removeProductImage("owner", imageId)).resolves.toEqual({ success: true });
        expect(remove).toHaveBeenCalledTimes(1);
    });
});

describe("asset record migration", () => {
    function migrationFixture() {
        const source = readFileSync(path.join(__dirname, "../src/api/db/migrations/1793952000000-0.1.4-add-asset-record.ts"), "utf8");
        const exports: Record<string, any> = {};
        vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
            exports, require: () => ({ AssetRecord: class {} }),
        });
        const runner = {
            connection: { getMetadata: jest.fn(() => ({ schema: "image_studio", tableName: "asset_record" })) },
            startTransaction: jest.fn(), query: jest.fn(), commitTransaction: jest.fn(), rollbackTransaction: jest.fn(),
        };
        return { migration: new exports.AddAssetRecord1793952000000(), runner };
    }

    it("only creates the verified table and index idempotently without modifying original material data", async () => {
        const { migration, runner } = migrationFixture();
        await migration.up(runner);
        await migration.up(runner);
        expect(runner.query).toHaveBeenCalledTimes(4);
        expect(runner.query.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS "image_studio"."asset_record"');
        expect(runner.query.mock.calls[0][0]).toContain('"image_ids" jsonb NOT NULL');
        expect(runner.query.mock.calls[1][0]).toContain('CREATE INDEX IF NOT EXISTS "IDX_asset_record_user_updated"');
        expect(runner.commitTransaction).toHaveBeenCalledTimes(2);
        await expect(migration.down()).rejects.toThrow("forward-only");
    });

    it("rejects a wrong schema before any SQL and rolls back SQL failures", async () => {
        const { migration, runner } = migrationFixture();
        runner.connection.getMetadata.mockReturnValueOnce({ schema: "public", tableName: "asset_record" });
        await expect(migration.up(runner)).rejects.toThrow("metadata");
        expect(runner.query).not.toHaveBeenCalled();
        runner.query.mockRejectedValueOnce(new Error("DDL unavailable"));
        await expect(migration.up(runner)).rejects.toThrow("DDL unavailable");
        expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
        expect(runner.commitTransaction).not.toHaveBeenCalled();
    });
});