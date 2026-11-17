jest.mock("@buildingai/errors", () => ({
    HttpErrorFactory: {
        badRequest: (message: string) => new Error(message),
        notFound: (message: string) => new Error(message),
    },
}));

import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { ProductImageService } from "../src/api/modules/generation/services/product-image.service";

const filesystem = jest.requireActual<typeof import("fs/promises")>("fs/promises");
const owner = "11111111-1111-4111-8111-111111111111";
let root: string;
let service: ProductImageService;
let buffer: Buffer;

function instance(directory: (userId: string) => string = () => root) {
    const result = new ProductImageService();
    Object.defineProperty(result, "directory", { value: directory });
    return result;
}

beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "materials-test-"));
    service = instance();
    buffer = await sharp({ create: { width: 64, height: 64, channels: 3, background: "white" } }).png().toBuffer();
});

afterEach(async () => {
    jest.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
});

it("keeps metadata durable without changing the original bytes", async () => {
    const image = await service.upload(owner, { buffer, mimetype: "image/png" });
    const before = await readFile(path.join(root, `${image.id}.png`));
    await service.createGroup(owner, "Catalog");
    await service.updateMetadata(owner, image.id, { name: "Product front", group: "Catalog" });
    expect(await instance().list(owner)).toEqual([expect.objectContaining({ name: "Product front", group: "Catalog" })]);
    expect(await readFile(path.join(root, `${image.id}.png`))).toEqual(before);
    expect((await readdir(root)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
});

it("keeps empty groups durable and moves metadata, not files, when a group is renamed or deleted", async () => {
    await service.createGroup(owner, "Empty");
    expect(await instance().groups(owner)).toEqual(["Empty"]);
    const image = await service.upload(owner, { buffer, mimetype: "image/png" });
    await service.updateMetadata(owner, image.id, { group: "Empty" });
    await service.changeGroup(owner, "Empty", "New");
    expect(await service.list(owner)).toEqual([expect.objectContaining({ group: "New" })]);
    await service.changeGroup(owner, "New");
    expect(await instance().groups(owner)).toEqual([]);
    expect(await service.list(owner)).toEqual([expect.objectContaining({ group: "" })]);
    expect(await service.read(owner, image.id)).toEqual(buffer);
});

it("supports legacy files and absent directories without manufacturing metadata", async () => {
    const id = randomUUID();
    await writeFile(path.join(root, `${id}.png`), buffer);
    expect(await service.list(owner)).toEqual([expect.objectContaining({ id, name: `素材-${id.slice(0, 8)}`, group: "", metadataStatus: "ready" })]);
    expect(await service.groups(owner)).toEqual([]);
    const missing = instance(() => path.join(root, "missing"));
    expect(await missing.list(owner)).toEqual([]);
    expect(await missing.groups(owner)).toEqual([]);
});

it.each(["{broken", "null", JSON.stringify({ version: 1, groups: ["../escape"], images: {} }),
    JSON.stringify({ version: 1, groups: [], images: { wrong: { name: "Bad", group: "" } } }), "x".repeat(65537)])(
    "exposes original files but fails closed on damaged metadata: %s", async (contents) => {
        const id = randomUUID();
        await writeFile(path.join(root, `${id}.png`), buffer);
        await writeFile(path.join(root, ".materials.json"), contents);
        expect(await service.list(owner)).toEqual([expect.objectContaining({ id, metadataStatus: "unavailable" })]);
        await expect(service.groups(owner)).rejects.toThrow("原图仍保留");
        await expect(service.updateMetadata(owner, id, { name: "New" })).rejects.toThrow("原图仍保留");
        await expect(service.upload(owner, { buffer, mimetype: "image/png" })).rejects.toThrow("原图仍保留");
        await expect(service.remove(owner, id)).rejects.toThrow("删除失败");
        expect(await service.read(owner, id)).toEqual(buffer);
        expect(await readFile(path.join(root, ".materials.json"), "utf8")).toBe(contents);
    },
);

it.each(["", "../escape", "a/b", "a\\b", " bad", "bad ", "..", "a\u0000b", "a\u202eb", "a*", "x".repeat(121)])(
    "rejects unsafe labels without altering originals: %s", async (name) => {
        const image = await service.upload(owner, { buffer, mimetype: "image/png" });
        await expect(service.createGroup(owner, name)).rejects.toThrow();
        await expect(service.updateMetadata(owner, image.id, { name })).rejects.toThrow();
        expect(await service.read(owner, image.id)).toEqual(buffer);
    },
);

it("rejects unknown groups, duplicate groups, unknown metadata properties and foreign IDs", async () => {
    const image = await service.upload(owner, { buffer, mimetype: "image/png" });
    await service.createGroup(owner, "One");
    await service.createGroup(owner, "Two");
    await expect(service.createGroup(owner, "One")).rejects.toThrow();
    await expect(service.changeGroup(owner, "One", "Two")).rejects.toThrow();
    await expect(service.updateMetadata(owner, image.id, { group: "Missing" })).rejects.toThrow();
    await expect(service.updateMetadata(owner, image.id, {})).rejects.toThrow();
    await expect(service.updateMetadata(owner, image.id, { name: "Good", path: "bad" } as any)).rejects.toThrow();
    await expect(service.updateMetadata(owner, "../escape", { name: "Good" })).rejects.toThrow();
    expect(await service.read(owner, image.id)).toEqual(buffer);
});

it("allows uploads beyond forty images and preserves the full catalog after reloading", async () => {
    await service.createGroup(owner, "Empty");
    await writeFile(path.join(root, ".materials-old.tmp"), "unrelated temporary file");
    await writeFile(path.join(root, "readme.txt"), "not an image");
    const images: Record<string, { name: string; group: string }> = {};
    for (let count = 0; count < 40; count += 1) {
        const id = randomUUID();
        await writeFile(path.join(root, `${id}.png`), buffer);
        images[id] = { name: `Original ${count}`, group: "Empty" };
    }
    await writeFile(path.join(root, ".materials.json"), JSON.stringify({ version: 1, groups: ["Empty"], images }));
    const image = await service.upload(owner, { buffer, mimetype: "image/png", originalname: "C:\\fakepath\\Front.png" });
    expect(image.name).toBe("Front");
    const reloaded = instance();
    const listed = await reloaded.list(owner);
    expect(listed).toHaveLength(41);
    expect(listed.every((entry) => entry.metadataStatus === "ready")).toBe(true);
    expect(listed).toEqual(expect.arrayContaining(Object.entries(images).map(([id, metadata]) => expect.objectContaining({ id, ...metadata }))));
    await reloaded.updateMetadata(owner, image.id, { name: "After forty", group: "Empty" });
    expect(await instance().list(owner)).toContainEqual(expect.objectContaining({ id: image.id, name: "After forty", group: "Empty" }));
    expect(await reloaded.read(owner, image.id)).toEqual(buffer);
    expect(await readFile(path.join(root, ".materials-old.tmp"), "utf8")).toBe("unrelated temporary file");
});

it("isolates user catalogs and rejects symlinked catalogs, user directories and originals", async () => {
    const isolated = instance((userId) => path.join(root, userId));
    const other = randomUUID();
    const image = await isolated.upload(owner, { buffer, mimetype: "image/png" });
    await isolated.createGroup(owner, "Private");
    expect(await isolated.list(other)).toEqual([]);
    expect(await isolated.groups(other)).toEqual([]);
    await expect(isolated.read(other, image.id)).rejects.toThrow();
    await expect(isolated.updateMetadata(other, image.id, { name: "Foreign" })).rejects.toThrow();
    await mkdir(path.join(root, "outside"));
    await symlink(path.join(root, owner), path.join(root, other));
    await expect(isolated.read(other, image.id)).rejects.toThrow();
    await expect(isolated.list(other)).rejects.toThrow();
    const symlinkId = randomUUID();
    await symlink(path.join(root, owner, `${image.id}.png`), path.join(root, `${symlinkId}.png`));
    await expect(service.read(owner, symlinkId)).rejects.toThrow();
    await symlink(path.join(root, owner, ".materials.json"), path.join(root, ".materials.json"));
    await expect(service.groups(owner)).rejects.toThrow();
    await expect(service.createGroup(owner, "Bad")).rejects.toThrow();
    expect(await isolated.read(owner, image.id)).toEqual(buffer);
});

it("removes metadata and the requested original only after a normal authorized removal", async () => {
    const image = await service.upload(owner, { buffer, mimetype: "image/png" });
    await service.createGroup(owner, "Keep empty");
    await expect(service.remove(owner, image.id)).resolves.toEqual({ success: true });
    expect(await service.list(owner)).toEqual([]);
    expect(await service.groups(owner)).toEqual(["Keep empty"]);
    expect(JSON.parse(await readFile(path.join(root, ".materials.json"), "utf8")).images).toEqual({});
});

it("preserves original bytes and durable metadata when original deletion is rejected", async () => {
    const image = await service.upload(owner, { buffer, mimetype: "image/png" });
    await service.createGroup(owner, "Catalog");
    await service.updateMetadata(owner, image.id, { name: "Product front", group: "Catalog" });
    const catalog = await readFile(path.join(root, ".materials.json"));
    const remove = jest.spyOn(filesystem, "rm").mockRejectedValueOnce(
        Object.assign(new Error("Original deletion denied"), { code: "EACCES" }),
    );

    await expect(service.remove(owner, image.id)).rejects.toThrow("删除失败");

    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(path.join(root, `${image.id}.png`), { force: true });
    expect(await service.read(owner, image.id)).toEqual(buffer);
    expect(await readFile(path.join(root, ".materials.json"))).toEqual(catalog);
    expect(await instance().list(owner)).toEqual([
        expect.objectContaining({ id: image.id, name: "Product front", group: "Catalog", metadataStatus: "ready" }),
    ]);
});

it("reports deletion success with pending cleanup when the atomic catalog save fails", async () => {
    const image = await service.upload(owner, { buffer, mimetype: "image/png" });
    const other = await service.upload(owner, { buffer, mimetype: "image/png", originalname: "Other.png" });
    await service.createGroup(owner, "Catalog");
    await service.updateMetadata(owner, image.id, { name: "Product front", group: "Catalog" });
    const catalog = await readFile(path.join(root, ".materials.json"));
    const rename = jest.spyOn(filesystem, "rename").mockRejectedValueOnce(
        Object.assign(new Error("Catalog replacement denied"), { code: "EACCES" }),
    );

    await expect(service.remove(owner, image.id)).resolves.toEqual({ success: true, metadataCleanupPending: true });

    expect(rename).toHaveBeenCalledTimes(1);
    await expect(readFile(path.join(root, `${image.id}.png`))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(instance().read(owner, image.id)).rejects.toThrow("商品图不存在或已删除");
    await expect(instance().readThumbnail(owner, image.id)).rejects.toThrow("商品图不存在或已删除");
    expect(await readFile(path.join(root, ".materials.json"))).toEqual(catalog);
    expect(await service.read(owner, other.id)).toEqual(buffer);
    expect(await instance().list(owner)).toEqual([
        expect.objectContaining({ id: other.id, name: "Other", group: "", metadataStatus: "ready" }),
    ]);
    expect(await service.groups(owner)).toEqual(["Catalog"]);
    expect((await readdir(root)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
});

it("keeps legacy removal idempotent for originals without metadata and missing paths", async () => {
    const id = randomUUID();
    await writeFile(path.join(root, `${id}.png`), buffer);
    await expect(service.remove(owner, id)).resolves.toEqual({ success: true });
    await expect(readFile(path.join(root, `${id}.png`))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(service.remove(owner, id)).resolves.toEqual({ success: true });
    await expect(instance(() => path.join(root, "missing")).remove(owner, id)).resolves.toEqual({ success: true });
    expect(await readdir(root)).toEqual([]);
});