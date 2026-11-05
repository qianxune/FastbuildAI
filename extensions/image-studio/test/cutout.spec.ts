import sharp from "sharp";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
jest.mock("@buildingai/core/modules", () => ({ CloudStorageService: class {} }));
jest.mock("@buildingai/db/entities", () => ({ StorageConfig: class {} }));
jest.mock("@buildingai/db/@nestjs/typeorm", () => ({ InjectRepository: () => () => undefined }));
import { composeCutout, cutoutSourceSize, CutoutService } from "../src/api/modules/generation/services/cutout.service";

const config = { id: "cos", storageType: "cos", config: { bucket: "test-1250000000", region: "ap-guangzhou", accessKey: "test", secretKey: "test" } };
const repository = { findOne: jest.fn().mockResolvedValue(config) };
const storage = { upload: jest.fn(), matting: jest.fn(), deleteObject: jest.fn() };
const service = () => new CutoutService(repository as never, storage as never);

async function source() {
    return sharp(Buffer.from([255, 0, 0, 255, 0, 255, 0, 128]), { raw: { width: 2, height: 1, channels: 4 } }).png().toBuffer();
}

describe("Tencent cutout composition", () => {
    beforeEach(() => { jest.clearAllMocks(); repository.findOne.mockResolvedValue(config); });
    it("uploads a private temporary input, processes once and deletes it", async () => {
        const output = await source();
        storage.matting.mockResolvedValue(output);
        const result = await service().generate(output, null);
        expect((await sharp(result).metadata()).hasAlpha).toBe(true);
        expect(storage.upload).toHaveBeenCalledWith(expect.objectContaining({ storageConfig: config, privateObject: true, path: expect.stringMatching(/^image-studio\/cutout-temp\/.+\/source\.png$/) }));
        expect(storage.matting).toHaveBeenCalledTimes(1);
        expect(storage.deleteObject).toHaveBeenCalledWith(config, storage.upload.mock.calls[0]![0].path);
    });
    it("cleans up after a paid request fails without retrying", async () => {
        storage.matting.mockRejectedValueOnce(new Error("AccessDenied"));
        await expect(service().generate(await source(), null)).rejects.toThrow();
        expect(storage.matting).toHaveBeenCalledTimes(1);
        expect(storage.deleteObject).toHaveBeenCalledTimes(1);
    });
    it("rejects invalid provider images and preserves cleanup", async () => {
        storage.matting.mockResolvedValueOnce(Buffer.from("<html>error</html>"));
        await expect(service().generate(await source(), null)).rejects.toThrow();
        expect(storage.deleteObject).toHaveBeenCalledTimes(1);
    });
    it("requires active Tencent configuration", async () => {
        repository.findOne.mockResolvedValueOnce(null);
        await expect(service().generate(await source(), null)).rejects.toThrow();
        expect(storage.upload).not.toHaveBeenCalled();
    });
    it("creates real PNG alpha and preserves the source's existing transparency", async () => {
        const result = await composeCutout(await source(), { data: new Uint8Array([0, 128]), width: 2, height: 1 }, null);
        expect(await cutoutSourceSize(result)).toEqual({ width: 2, height: 1 });
        expect((await sharp(result).metadata()).hasAlpha).toBe(true);
        const pixels = await sharp(result).raw().toBuffer();
        expect(pixels[3]).toBe(0);
        expect(pixels[7]).toBe(64);
        expect([...pixels.subarray(4, 7)]).toEqual([0, 255, 0]);
    });
    it("composites selected colors onto the matte rather than pretending a flat PNG is transparent", async () => {
        const result = await composeCutout(await source(), { data: new Uint8Array([0, 255]), width: 2, height: 1 }, "#ffffff");
        expect((await sharp(result).metadata()).hasAlpha).toBe(false);
        const pixels = await sharp(result).raw().toBuffer();
        expect([...pixels.subarray(0, 3)]).toEqual([255, 255, 255]);
        expect(pixels[4]).toBe(255);
    });
    it.each(["red", "transparent", "#fff", "#gggggg", "url(https://external.test)"])("rejects invalid colors %s", async (color) => {
        await expect(composeCutout(await source(), { data: new Uint8Array([0, 255]), width: 2, height: 1 }, color)).rejects.toThrow();
    });
    it.each([{ data: new Uint8Array([255]), width: 2, height: 1 }, { data: new Uint8Array([255, 255]), width: 1, height: 2 }])("rejects mismatched masks %#", async (mask) => {
        await expect(composeCutout(await source(), mask, null)).rejects.toThrow("Invalid alpha mask");
    });
    it("rejects invalid sources before downloading a model", async () => {
        await expect(service().generate(Buffer.from("not an image"), null)).rejects.toThrow();
        await expect(cutoutSourceSize(Buffer.alloc(10 * 1024 * 1024 + 1))).rejects.toThrow();
    });
});

describe("signed COS matting download", () => {
    function fixture() {
        const getObjectUrl = jest.fn().mockReturnValue("https://private.test/signed");
        const download = jest.fn();
        const putObject = jest.fn();
        const exports: Record<string, any> = {};
        const code = ts.transpileModule(readFileSync("../../packages/core/src/modules/cloud-storage/services/cos-storage.service.ts", "utf8"), {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true, esModuleInterop: true },
        }).outputText;
        runInNewContext(code, { exports, Buffer, AbortSignal, fetch: download, require: (name: string) => {
            if (name === "@nestjs/common") return { Injectable: () => (value: unknown) => value };
            if (name === "cos-nodejs-sdk-v5") return class { getObjectUrl = getObjectUrl; putObject = putObject; };
            return {};
        } });
        return { client: new exports.CosStorageService({}), getObjectUrl, download, putObject };
    }
    it("forces private ACL only for explicitly private uploads", async () => {
        const state = fixture();
        const file = { originalname: "source.png", mimetype: "image/png", buffer: await source() };
        await state.client.upload({ storageConfig: config, path: "private/source.png", file, privateObject: true });
        expect(state.putObject).toHaveBeenCalledWith(expect.objectContaining({ Headers: expect.objectContaining({ "x-cos-acl": "private" }) }));
        await state.client.upload({ storageConfig: config, path: "existing/source.png", file });
        expect(state.putObject.mock.calls[1]![0].Headers).not.toHaveProperty("x-cos-acl");
    });
    it("signs the private object and processing parameters and bounds the only request", async () => {
        const state = fixture();
        const image = await source();
        state.download.mockResolvedValue(new Response(image, { headers: { "content-type": "image/png" } }));
        await expect(state.client.matting(config, "private/source.png", 1000)).resolves.toEqual(image);
        expect(state.getObjectUrl).toHaveBeenCalledWith(expect.objectContaining({ Sign: true, Method: "GET", Protocol: "https:", Expires: 300,
            Bucket: config.config.bucket, Region: config.config.region, Key: "private/source.png", Query: { "ci-process": "AIPicMatting", "center-layout": "0" } }));
        expect(state.download).toHaveBeenCalledWith("https://private.test/signed", expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }));
        expect(state.download).toHaveBeenCalledTimes(1);
    });
    it.each([403, 400, 451, 500])("does not retry HTTP %s or expose response bodies", async (status) => {
        const state = fixture();
        state.download.mockResolvedValue(new Response("secret response", { status }));
        await expect(state.client.matting(config, "private/source.png", 1000)).rejects.toMatchObject({ statusCode: status, message: "Tencent matting request failed" });
        expect(state.download).toHaveBeenCalledTimes(1);
    });
    it.each([
        { body: "<html>error</html>", headers: { "content-type": "text/html" }, limit: 1000 },
        { body: "large", headers: { "content-type": "image/png", "content-length": "1001" }, limit: 1000 },
        { body: "large", headers: { "content-type": "image/png" }, limit: 2 },
        { body: "", headers: { "content-type": "image/png" }, limit: 1000 },
    ])("rejects invalid, empty or oversized responses %#", async ({ body, headers, limit }) => {
        const state = fixture();
        state.download.mockResolvedValue(new Response(body, { headers }));
        await expect(state.client.matting(config, "private/source.png", limit)).rejects.toThrow();
        expect(state.download).toHaveBeenCalledTimes(1);
    });
});