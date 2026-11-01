jest.mock("@buildingai/errors", () => ({
    HttpErrorFactory: { notFound: (message: string) => new Error(message) },
}));
jest.mock("fs/promises", () => ({
    realpath: jest.fn(), lstat: jest.fn(), readFile: jest.fn(),
}));

import { randomBytes } from "node:crypto";
import { lstat, readFile, realpath } from "fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ProductImageService } from "../src/api/modules/generation/services/product-image.service";

const owner = "11111111-1111-4111-8111-111111111111";
const asset = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const service = new ProductImageService();
const pngSignature = Buffer.from("89504e470d0a1a0a", "hex");

async function ownedImage(width: number, height: number) {
    const original = await sharp(randomBytes(width * height * 4), {
        raw: { width, height, channels: 4 },
    }).png().toBuffer();
    const directory = path.resolve(process.cwd(), "../../extensions/image-studio/storage/private/products", owner);
    const filename = path.join(directory, `${asset}.png`);
    (realpath as jest.Mock).mockImplementation(async (value: string) => {
        if (value === directory || value === filename) return value;
        throw new Error(`ENOENT: private path ${value}`);
    });
    (lstat as jest.Mock).mockResolvedValue({ isFile: () => true, isSymbolicLink: () => false, size: original.length });
    (readFile as jest.Mock).mockResolvedValue(original);
    return { original, filename };
}

beforeEach(() => jest.resetAllMocks());

it("reads the owned private original and returns a bounded PNG without modifying it", async () => {
    const { original, filename } = await ownedImage(1024, 512);
    const thumbnail = await service.readThumbnail(owner, asset);
    expect(readFile).toHaveBeenCalledWith(filename);
    expect(thumbnail.subarray(0, 8)).toEqual(pngSignature);
    expect(thumbnail.length).toBeLessThanOrEqual(256 * 1024);
    expect(await sharp(thumbnail).metadata()).toEqual(expect.objectContaining({ format: "png", width: 256, height: 128 }));
    await expect(service.read(owner, asset)).resolves.toEqual(original);
});

it("never enlarges a small image", async () => {
    await ownedImage(64, 80);
    const thumbnail = await service.readThumbnail(owner, asset);
    expect(await sharp(thumbnail).metadata()).toEqual(expect.objectContaining({ width: 64, height: 80 }));
});

it.each([other, "../private"])("rejects unknown asset %s with no path disclosure", async (id) => {
    await ownedImage(64, 64);
    await expect(service.readThumbnail(owner, id)).rejects.toThrow(/^商品图不存在或已删除，请重新上传$/);
    expect(readFile).not.toHaveBeenCalled();
});

it("rejects another owner's asset before reading bytes", async () => {
    await ownedImage(64, 64);
    await expect(service.readThumbnail(other, asset)).rejects.toThrow(/^商品图不存在或已删除，请重新上传$/);
    expect(readFile).not.toHaveBeenCalled();
});

it("hides decoder details for a corrupt PNG", async () => {
    await ownedImage(64, 64);
    (readFile as jest.Mock).mockResolvedValue(Buffer.concat([pngSignature, Buffer.from("corrupt")]));
    await expect(service.readThumbnail(owner, asset)).rejects.toThrow(/^商品图不存在或已删除，请重新上传$/);
});