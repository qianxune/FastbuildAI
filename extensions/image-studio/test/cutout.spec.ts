import sharp from "sharp";
import { composeCutout, cutoutSourceSize, CutoutService } from "../src/api/modules/generation/services/cutout.service";

async function source() {
    return sharp(Buffer.from([255, 0, 0, 255, 0, 255, 0, 128]), { raw: { width: 2, height: 1, channels: 4 } }).png().toBuffer();
}

describe("local cutout composition", () => {
    it("checks the fixed revision cache without fetching or running models", async () => {
        const files = require("node:fs/promises");
        const fileStat = jest.spyOn(files, "stat").mockResolvedValue({ isFile: () => true, size: 224005088 } as never);
        try {
            await expect(CutoutService.ready()).resolves.toBe(true);
            expect(fileStat.mock.calls).toHaveLength(3);
            expect(fileStat.mock.calls.every(([filename]) => String(filename).includes("de15b22ba131738a16dff04aab8bdf8dc32e3ac1"))).toBe(true);
            fileStat.mockRejectedValueOnce(new Error("missing"));
            await expect(CutoutService.ready()).resolves.toBe(false);
        } finally { fileStat.mockRestore(); }
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
        await expect(new CutoutService().generate(Buffer.from("not an image"), null)).rejects.toThrow();
        await expect(cutoutSourceSize(Buffer.alloc(10 * 1024 * 1024 + 1))).rejects.toThrow();
    });
});