import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import * as ts from "typescript";

const asset = "22222222-2222-4222-8222-222222222222";
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function png(size = 24, width = 256, height = 128) {
    const bytes = new Uint8Array(size);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
    new DataView(bytes.buffer).setUint32(16, width);
    new DataView(bytes.buffer).setUint32(20, height);
    return new Blob([bytes], { type: "image/png" });
}

function harness(prefix = "/api/") {
    const get = jest.fn().mockResolvedValue({ data: png() });
    const createObjectURL = jest.fn().mockReturnValue("blob:thumbnail");
    const revokeObjectURL = jest.fn();
    const onLoad = jest.fn();
    const onError = jest.fn();
    const exports: any = {};
    const source = readFileSync(path.join(__dirname, "../src/web/services/generation.ts"), "utf8");
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        transformers: { before: [(context) => {
            const visit: ts.Visitor = (node) => ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword
                ? ts.factory.createIdentifier("testImportMeta") : ts.visitEachChild(node, visit, context);
            return (file) => ts.visitNode(file, visit) as ts.SourceFile;
        }] },
    });
    runInNewContext(compiled.outputText, {
        exports, Blob, Uint8Array, DataView, AbortController,
        URL: { createObjectURL, revokeObjectURL }, testImportMeta: { env: { VITE_APP_WEB_API_PREFIX: prefix } },
        require: (name: string) => name === "./base" ? { apiHttpClient: { instance: { get } } } : {},
    });
    return { get, createObjectURL, revokeObjectURL, onLoad, onError, exports,
        load: (id = asset) => exports.loadProductThumbnail(id, onLoad, onError) as () => void };
}

it("uses only the authenticated thumbnail route and revokes its URL exactly once", async () => {
    const view = harness();
    const dispose = view.load();
    await flush();
    expect(view.get).toHaveBeenCalledWith(`/image-studio/api/generations/product-images/${asset}/thumbnail`, {
        responseType: "blob", signal: expect.any(AbortSignal), withCredentials: false,
    });
    expect(view.onLoad).toHaveBeenCalledWith("blob:thumbnail");
    expect(view.onError).not.toHaveBeenCalled();
    dispose(); dispose();
    expect(view.get.mock.calls[0][1].signal.aborted).toBe(true);
    expect(view.revokeObjectURL).toHaveBeenCalledTimes(1);
});

it.each([
    png(256 * 1024 + 1), png(24, 257, 128), png(24, 128, 257), png(24, 0, 128),
    new Blob([], { type: "image/png" }), new Blob(["fake png"], { type: "image/png" }),
    new Blob(["<svg/>"], { type: "image/svg+xml" }), { code: 20000, data: "not a blob" },
])("rejects unsafe thumbnail responses without allocating a URL", async (data) => {
    const view = harness();
    view.get.mockResolvedValue({ data });
    const dispose = view.load();
    await flush();
    expect(view.createObjectURL).not.toHaveBeenCalled();
    expect(view.onError).toHaveBeenCalledTimes(1);
    dispose();
});

it("accepts the exact 256 KiB boundary", async () => {
    const view = harness();
    view.get.mockResolvedValue({ data: png(256 * 1024) });
    const dispose = view.load();
    await flush();
    expect(view.onLoad).toHaveBeenCalledTimes(1);
    dispose();
});

it.each([["../secret", "api"], [asset, "../api"], [asset, "https://external.test"]])("rejects invalid selectors before requesting", async (id, prefix) => {
    const view = harness(prefix);
    const dispose = view.load(id);
    await flush();
    expect(view.get).not.toHaveBeenCalled();
    expect(view.onError).toHaveBeenCalledWith();
    dispose();
});

it.each([false, true])("suppresses late responses and errors after disposal (%s)", async (reject) => {
    const view = harness();
    let finish!: (value: any) => void;
    view.get.mockReturnValue(new Promise((resolve, rejectRequest) => { finish = reject ? rejectRequest : resolve; }));
    const dispose = view.load();
    dispose();
    finish(reject ? new Error("private upstream details") : { data: png() });
    await flush();
    expect(view.createObjectURL).not.toHaveBeenCalled();
    expect(view.onLoad).not.toHaveBeenCalled();
    expect(view.onError).not.toHaveBeenCalled();
});

it("preserves the original image getter and its separate full-size route", async () => {
    const view = harness();
    view.get.mockResolvedValue({ data: new Blob([new Uint8Array(300 * 1024)], { type: "image/png" }) });
    const dispose = view.exports.loadProductImage(asset, view.onLoad, view.onError);
    await flush();
    expect(view.get.mock.calls[0][0]).toBe(`/image-studio/api/generations/product-images/${asset}`);
    expect(view.onLoad).toHaveBeenCalledTimes(1);
    dispose();
});