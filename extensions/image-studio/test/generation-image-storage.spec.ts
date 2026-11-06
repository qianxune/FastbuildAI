/// <reference types="jest" />

import { GenerationImageService } from "../src/api/modules/generation/services/generation-image.service";
import { lstat, mkdir, readFile, realpath, rm, writeFile } from "fs/promises";
import { GENERATION_STORAGE_RESTRICTED } from "../src/api/modules/generation/constants/generation.constants";
import sharp from "sharp";

jest.mock("@buildingai/core/modules", () => ({ CloudStorageService: class {} }));
jest.mock("@buildingai/db/@nestjs/typeorm", () => ({ InjectRepository: () => () => undefined }));
jest.mock("@buildingai/db/entities", () => ({ StorageConfig: class {} }));
jest.mock("@buildingai/db/typeorm", () => ({ Repository: class {} }));
jest.mock("@buildingai/errors", () => ({
    HttpErrorFactory: {
        badRequest: (message: string) => new Error(message),
        notFound: (message: string) => new Error(message),
    },
}));
jest.mock("fs/promises", () => ({
    lstat: jest.fn(), mkdir: jest.fn(), readFile: jest.fn(), realpath: jest.fn(),
    rm: jest.fn(), writeFile: jest.fn(),
}));

describe("generated image storage", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const configId = "22222222-2222-4222-8222-222222222222";
    const buffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
        "base64",
    );
    const input = { base64: buffer.toString("base64"), mediaType: "image/png" };

    function fixture(storageType = "cos") {
        const config = {
            id: configId, isActive: true, storageType,
            config: { bucket: "test-bucket", region: "ap-guangzhou", accessKey: "test", secretKey: "test" },
        };
        const repository = { findOne: jest.fn().mockResolvedValue(config) };
        const cloud = {
            upload: jest.fn().mockResolvedValue({}),
            readBuffer: jest.fn().mockResolvedValue(buffer),
            deleteObject: jest.fn().mockResolvedValue(undefined),
        };
        const service = new GenerationImageService(
            repository as unknown as ConstructorParameters<typeof GenerationImageService>[0],
            cloud as unknown as ConstructorParameters<typeof GenerationImageService>[1],
        );
        return { config, repository, cloud, service };
    }

    beforeEach(() => {
        jest.resetAllMocks();
        (realpath as jest.Mock).mockImplementation(async (filename) => filename);
        (lstat as jest.Mock).mockResolvedValue({
            isFile: () => true, isSymbolicLink: () => false, size: buffer.length,
        });
        (readFile as jest.Mock).mockResolvedValue(buffer);
    });

    it("uploads decoded images using the enabled COS config without local writes", async () => {
        const { service, cloud, repository, config } = fixture();
        const images = await service.persist(id, [input, input]);
        expect(repository.findOne).toHaveBeenCalledWith({ where: { isActive: true } });
        expect(cloud.upload).toHaveBeenCalledTimes(2);
        expect(cloud.upload.mock.calls[0][0]).toMatchObject({
            storageConfig: config, path: images[0].storage!.key,
            file: { buffer, mimetype: "image/png", size: buffer.length },
        });
        expect(images[0]).toMatchObject({
            url: service.url(id, 0), mediaType: "image/png",
            storage: { type: "cos", configId, bucket: "test-bucket", region: "ap-guangzhou" },
        });
        expect(images[0].storage!.key).toMatch(new RegExp(`^image-studio/generated/${id}/[a-f0-9-]+/0\\.png$`));
        expect(JSON.stringify(images)).not.toContain("secretKey");
        expect(mkdir).not.toHaveBeenCalled();
        expect(writeFile).not.toHaveBeenCalled();
    });

    it("reads from the recorded config and bucket even after the active bucket changes", async () => {
        const { service, cloud, repository, config } = fixture();
        const [image] = await service.persist(id, [input]);
        config.isActive = false;
        config.config.bucket = "another-bucket";
        expect(await service.read(id, 0, image)).toEqual({ buffer, mediaType: "image/png" });
        expect(repository.findOne).toHaveBeenLastCalledWith({ where: { id: configId } });
        expect(cloud.readBuffer).toHaveBeenCalledWith(
            expect.objectContaining({ config: expect.objectContaining({ bucket: "test-bucket" }) }),
            image.storage!.key, 20 * 1024 * 1024,
        );
        expect(readFile).not.toHaveBeenCalled();
    });
    it("persists, reads and removes ten SKU images without broadening ordinary storage batches", async () => {
        const { service, cloud } = fixture();
        const batch = Array.from({ length: 10 }, () => input);
        await expect(service.persist(id, batch)).rejects.toThrow();
        const images = await service.persist(id, batch, "sku");
        expect(images).toHaveLength(10);
        expect(await service.read(id, 9, images[9]!)).toEqual({ buffer, mediaType: "image/png" });
        await expect(service.read(id, 10, images[9]!)).rejects.toThrow();
        await expect(service.persist(id, [...batch, input], "sku")).rejects.toThrow();
        await service.remove(id, images);
        expect(cloud.deleteObject).toHaveBeenCalledTimes(20);
    });

    it("deletes only the recorded cloud objects on removal and cancellation cleanup", async () => {
        const { service, cloud } = fixture();
        const images = await service.persist(id, [input, input]);
        await service.remove(id, images);
        expect(cloud.deleteObject.mock.calls.map((call) => call[1])).toEqual(
            expect.arrayContaining(images.flatMap((image) => [image.storage!.key, image.storage!.key + ".thumbnail-v1.webp"])),
        );
        cloud.deleteObject.mockClear().mockRejectedValue(new Error("unavailable"));
        await expect(service.cleanup(id, images)).resolves.toHaveLength(2);
        expect(cloud.deleteObject).toHaveBeenCalledTimes(4);
        expect(rm).not.toHaveBeenCalled();
    });

    it("compensates all attempted keys on a partial upload failure without falling back locally", async () => {
        const { service, cloud } = fixture();
        cloud.upload.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("upload failed"));
        await expect(service.persist(id, [input, input])).rejects.toThrow("upload failed");
        expect(cloud.deleteObject.mock.calls.map((call) => call[1])).toEqual(
            cloud.upload.mock.calls.map((call) => call[0].path),
        );
        expect(writeFile).not.toHaveBeenCalled();
    });

    it("keeps the original upload error if compensation also fails", async () => {
        const { service, cloud } = fixture();
        cloud.upload.mockRejectedValue(new Error("original upload failure"));
        cloud.deleteObject.mockRejectedValue(new Error("cleanup failure"));
        await expect(service.persist(id, [input])).rejects.toThrow("original upload failure");
    });

    it.each([{ statusCode: 451 }, { code: "UnavailableForLegalReasons" }])("reports COS restriction %p without leaking responses or bypassing storage", async (details) => {
        const { service, cloud } = fixture();
        const failure = Object.assign(new Error("private COS response and credentials"), details);
        cloud.upload.mockRejectedValue(failure);
        cloud.deleteObject.mockRejectedValue(new Error("cleanup unavailable"));
        await expect(service.persist(id, [input])).rejects.toMatchObject({ message: GENERATION_STORAGE_RESTRICTED, cause: failure });
        expect(cloud.upload).toHaveBeenCalledTimes(1);
        expect(cloud.deleteObject).toHaveBeenCalledTimes(1);
        expect(writeFile).not.toHaveBeenCalled();
    });

    it.each([null, { storageType: "oss" }])("rejects unavailable or unsupported storage without local fallback", async (config) => {
        const { service, repository, cloud } = fixture();
        repository.findOne.mockResolvedValue(config);
        await expect(service.persist(id, [input])).rejects.toThrow();
        expect(cloud.upload).not.toHaveBeenCalled();
        expect(writeFile).not.toHaveBeenCalled();
    });

    it("rejects invalid input before resolving storage or uploading", async () => {
        const { service, repository, cloud } = fixture();
        await expect(service.persist(id, [{ ...input, base64: "bm90LWFuLWltYWdl" }])).rejects.toThrow();
        expect(repository.findOne).not.toHaveBeenCalled();
        expect(cloud.upload).not.toHaveBeenCalled();
    });

    it("rejects an object key belonging to another task before cloud reads or deletes", async () => {
        const { service, cloud } = fixture();
        const [image] = await service.persist(id, [input]);
        image.storage!.key = image.storage!.key.replace(id, configId);
        await expect(service.read(id, 0, image)).rejects.toThrow();
        await expect(service.remove(id, [image])).rejects.toThrow();
        expect(cloud.readBuffer).not.toHaveBeenCalled();
        expect(cloud.deleteObject).not.toHaveBeenCalled();
    });

    it("validates cloud response signatures instead of returning arbitrary object contents", async () => {
        const { service, cloud } = fixture();
        const [image] = await service.persist(id, [input]);
        cloud.readBuffer.mockResolvedValue(Buffer.from("not an image"));
        await expect(service.read(id, 0, image)).rejects.toThrow();
    });

    it("preserves local saves, reads and deletes when local storage is enabled", async () => {
        const { service, cloud } = fixture("local");
        const [image] = await service.persist(id, [input]);
        expect(image).toEqual({ url: service.url(id, 0), mediaType: "image/png" });
        expect(writeFile).toHaveBeenCalledWith(
            expect.stringContaining(`${id}-0.png`), buffer, { flag: "wx", mode: 0o600 },
        );
        await expect(service.read(id, 0, image)).resolves.toEqual({ buffer, mediaType: "image/png" });
        await service.remove(id, [image]);
        expect(rm).toHaveBeenCalledTimes(2);
        expect(cloud.upload).not.toHaveBeenCalled();
    });

    it("still reads and removes historical local images after COS activation", async () => {
        const { service, cloud } = fixture();
        const image = {
            url: `/image-studio/uploads/generated/${id}-1-${configId}.png`, mediaType: "image/png",
        };
        await expect(service.read(id, 0, image)).resolves.toEqual({ buffer, mediaType: "image/png" });
        await service.remove(id, [image]);
        expect(cloud.readBuffer).not.toHaveBeenCalled();
        expect(cloud.deleteObject).not.toHaveBeenCalled();
        expect(rm).toHaveBeenCalledTimes(2);
    });

    it("materializes a bounded WebP for historical COS images once across concurrent requests", async () => {
        const { service, cloud } = fixture();
        const original = await sharp({ create: { width: 1600, height: 1000, channels: 4, background: { r: 20, g: 90, b: 80, alpha: 0.5 } } }).png().toBuffer();
        const image = { url: service.url(id, 0), mediaType: "image/png", storage: {
            type: "cos" as const, configId, bucket: "test-bucket", region: "ap-guangzhou",
            key: `image-studio/generated/${id}/${configId}/0.png`,
        } };
        const stored = new Map<string, Buffer>();
        cloud.readBuffer.mockImplementation(async (_config, key) => {
            if (key === image.storage.key) return original;
            if (stored.has(key)) return stored.get(key)!;
            throw Object.assign(new Error("missing"), { statusCode: 404 });
        });
        cloud.upload.mockImplementation(async ({ path, file }) => { stored.set(path, file.buffer); return {}; });
        const [first, concurrent] = await Promise.all([
            service.readThumbnail(id, 0, image), service.readThumbnail(id, 0, image),
        ]);
        expect(first).toEqual(concurrent);
        expect(first.mediaType).toBe("image/webp");
        const metadata = await sharp(first.buffer).metadata();
        expect(metadata.width).toBe(512);
        expect(metadata.height).toBe(320);
        expect(metadata.hasAlpha).toBe(true);
        expect(first.buffer.length).toBeLessThan(original.length);
        await service.readThumbnail(id, 0, image);
        expect(cloud.readBuffer.mock.calls.filter((call) => call[1] === image.storage.key)).toHaveLength(1);
        expect(cloud.upload).toHaveBeenCalledTimes(1);
        expect(cloud.upload.mock.calls[0][0]).toMatchObject({ privateObject: true, file: { mimetype: "image/webp" } });
        expect(await service.read(id, 0, image)).toEqual({ buffer: original, mediaType: "image/png" });
    });

    it("rejects invalid thumbnail references before reading COS", async () => {
        const { service, cloud } = fixture();
        const image = { url: service.url(id, 0), mediaType: "image/png", storage: {
            type: "cos" as const, configId, bucket: "test-bucket", region: "ap-guangzhou",
            key: `image-studio/generated/${configId}/${configId}/0.png`,
        } };
        await expect(service.readThumbnail(id, 0, image)).rejects.toThrow();
        expect(cloud.readBuffer).not.toHaveBeenCalled();
        expect(cloud.upload).not.toHaveBeenCalled();
    });

    it("prepares new thumbnails from generated bytes and keeps successful originals when the thumbnail upload fails", async () => {
        const { service, cloud } = fixture();
        const original = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 30, g: 70, b: 80, alpha: 1 } } }).png().toBuffer();
        cloud.upload.mockImplementation(async ({ file }) => {
            if (file.mimetype === "image/webp") throw new Error("thumbnail unavailable");
            return {};
        });
        const images = await service.persist(id, [{ base64: original.toString("base64"), mediaType: "image/png" }]);
        expect(images).toHaveLength(1);
        expect(cloud.upload.mock.calls.map((call) => call[0].file.mimetype)).toEqual(["image/png", "image/webp"]);
        expect(cloud.readBuffer).not.toHaveBeenCalled();
        expect(cloud.deleteObject).toHaveBeenCalledTimes(1);
        expect(cloud.deleteObject.mock.calls[0][1]).toBe(images[0].storage!.key + ".thumbnail-v1.webp");
    });

    it("does not read a full original when COS denies thumbnail access", async () => {
        const { service, cloud } = fixture();
        const image = { url: service.url(id, 0), mediaType: "image/png", storage: {
            type: "cos" as const, configId, bucket: "test-bucket", region: "ap-guangzhou",
            key: `image-studio/generated/${id}/${configId}/0.png`,
        } };
        cloud.readBuffer.mockRejectedValue(Object.assign(new Error("denied"), { statusCode: 403 }));
        await expect(service.readThumbnail(id, 0, image)).rejects.toThrow("缩略图暂不可用");
        expect(cloud.readBuffer).toHaveBeenCalledTimes(1);
        expect(cloud.readBuffer.mock.calls[0][1]).toContain(".thumbnail-v1.webp");
        expect(cloud.upload).not.toHaveBeenCalled();
    });

    it("rejects oversized local derivatives before reading any bytes or falling back to the original", async () => {
        const { service, cloud } = fixture("local");
        (lstat as jest.Mock).mockResolvedValue({ isFile: () => true, isSymbolicLink: () => false, size: 256 * 1024 + 1 });
        await expect(service.readThumbnail(id, 0, { url: service.url(id, 0), mediaType: "image/png" })).rejects.toThrow();
        expect(readFile).not.toHaveBeenCalled(); expect(writeFile).not.toHaveBeenCalled(); expect(cloud.readBuffer).not.toHaveBeenCalled();
    });

    it("waits for active thumbnail reads, blocks new reads throughout deletion, and evicts cached bytes", async () => {
        const { service, cloud } = fixture();
        const image = { url: service.url(id, 0), mediaType: "image/png", storage: {
            type: "cos" as const, configId, bucket: "test-bucket", region: "ap-guangzhou",
            key: `image-studio/generated/${id}/${configId}/0.png`,
        } };
        const thumbnail = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 20, g: 60, b: 70 } } }).webp().toBuffer();
        let resolveRead: (buffer: Buffer) => void;
        cloud.readBuffer.mockImplementation(() => new Promise<Buffer>((resolve) => { resolveRead = resolve; }));
        const read = service.readThumbnail(id, 0, image);
        await new Promise<void>((resolve) => setImmediate(resolve));
        const removal = service.remove(id, [image]);
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(cloud.deleteObject).not.toHaveBeenCalled();
        await expect(service.readThumbnail(id, 0, image)).rejects.toThrow("图片不存在");
        resolveRead!(thumbnail); await read; await removal;
        expect(cloud.deleteObject.mock.calls.map((call) => call[1])).toEqual([image.storage.key, image.storage.key + ".thumbnail-v1.webp"]);
        cloud.readBuffer.mockRejectedValue(Object.assign(new Error("missing"), { code: "NoSuchKey" }));
        await expect(service.readThumbnail(id, 0, image)).rejects.toThrow();
        expect(cloud.readBuffer).toHaveBeenCalledTimes(3);
    });

    it("still compensates the original when deleting a derivative fails", async () => {
        const { service, cloud } = fixture();
        const image = { url: service.url(id, 0), mediaType: "image/png", storage: {
            type: "cos" as const, configId, bucket: "test-bucket", region: "ap-guangzhou",
            key: `image-studio/generated/${id}/${configId}/0.png`,
        } };
        cloud.deleteObject.mockImplementation(async (_config, key) => { if (key.endsWith(".webp")) throw new Error("cleanup failed"); });
        await service.cleanup(id, [image]);
        expect(cloud.deleteObject.mock.calls.map((call) => call[1])).toContain(image.storage.key);
        expect(cloud.deleteObject).toHaveBeenCalledTimes(2);
    });
});