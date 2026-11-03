/// <reference types="jest" />

import { GenerationImageService } from "../src/api/modules/generation/services/generation-image.service";
import { lstat, mkdir, readFile, realpath, rm, writeFile } from "fs/promises";
import { GENERATION_STORAGE_RESTRICTED } from "../src/api/modules/generation/constants/generation.constants";

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

    it("deletes only the recorded cloud objects on removal and cancellation cleanup", async () => {
        const { service, cloud } = fixture();
        const images = await service.persist(id, [input, input]);
        await service.remove(id, images);
        expect(cloud.deleteObject.mock.calls.map((call) => call[1])).toEqual(
            images.map((image) => image.storage!.key),
        );
        cloud.deleteObject.mockClear().mockRejectedValue(new Error("unavailable"));
        await expect(service.cleanup(id, images)).resolves.toHaveLength(2);
        expect(cloud.deleteObject).toHaveBeenCalledTimes(2);
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
        expect(rm).toHaveBeenCalledTimes(1);
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
        expect(rm).toHaveBeenCalledTimes(1);
    });
});