import "reflect-metadata";
import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import * as nest from "@nestjs/common";
import * as ts from "typescript";

function controllerHarness(service: Record<string, unknown> = {}) {
    const source = readFileSync(path.join(__dirname, "../src/api/modules/generation/controllers/web/generation.controller.ts"), "utf8");
    const exports: any = {};
    const extensionController = jest.fn(() => () => undefined);
    const skipTransform = jest.fn(() => () => undefined);
    const playground = jest.fn(() => () => undefined);
    runInNewContext(ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, experimentalDecorators: true, emitDecoratorMetadata: true, target: ts.ScriptTarget.ES2022,
    } }).outputText, {
        exports, Reflect, require: (name: string) => {
            if (name === "@nestjs/common") return nest;
            if (name === "class-validator") return require("class-validator");
            if (name === "@buildingai/core/decorators") return { ExtensionWebController: extensionController };
            if (name === "@buildingai/decorators/skip-transform.decorator") return { SkipTransform: skipTransform };
            if (name === "@buildingai/decorators/playground.decorator") return { Playground: playground };
            if (name === "@nestjs/platform-express") return { FileInterceptor: () => class {} };
            return {};
        },
    });
    const readProductThumbnail = jest.fn().mockResolvedValue(Buffer.from("bounded png"));
    const readProductImage = jest.fn().mockResolvedValue(Buffer.from("original"));
    return { source, extensionController, playground, skipTransform, readProductThumbnail, readProductImage,
        controller: new exports.GenerationController({ readProductThumbnail, readProductImage, ...service }) };
}

it("keeps the thumbnail inside the authenticated controller before the original dynamic route", async () => {
    const view = controllerHarness();
    expect(view.extensionController).toHaveBeenCalledWith("generations");
    expect(view.source).not.toMatch(/Public|SkipAuth|AllowAnonymous/);
    expect(view.source.indexOf('@Get("product-images/:id/thumbnail")')).toBeLessThan(view.source.indexOf('@Get("product-images/:id")'));
    expect(view.source).toMatch(/productThumbnail\(@Playground\(\) user: UserPlayground, @Param\("id", ParseUUIDPipe\) id: string\)/);
    const handler = view.controller.productThumbnail;
    expect(Reflect.getMetadata("path", handler)).toBe("product-images/:id/thumbnail");
    expect(Reflect.getMetadata("__headers__", handler)).toEqual(expect.arrayContaining([
        { name: "Cache-Control", value: "private, no-store" },
        { name: "X-Content-Type-Options", value: "nosniff" },
    ]));
    const file = await view.controller.productThumbnail({ id: "owner" }, "asset");
    expect(file).toBeInstanceOf(nest.StreamableFile);
    expect(file.getHeaders()).toEqual({ type: "image/png", disposition: undefined, length: 11 });
    expect(view.readProductThumbnail).toHaveBeenCalledWith("owner", "asset");
    expect(view.readProductImage).not.toHaveBeenCalled();
    expect(view.skipTransform).toHaveBeenCalled();
    view.readProductThumbnail.mockRejectedValueOnce(new Error("not found"));
    await expect(view.controller.productThumbnail({ id: "other" }, "asset")).rejects.toThrow("not found");
    await view.controller.productImage({ id: "owner" }, "asset");
    expect(view.readProductImage).toHaveBeenCalledWith("owner", "asset");
});

it("keeps metadata and group routes user-scoped inside the authenticated controller", async () => {
    const service = {
        updateProductImage: jest.fn(), listProductImageGroups: jest.fn(),
        createProductImageGroup: jest.fn(), changeProductImageGroup: jest.fn(),
    };
    const { controller, source } = controllerHarness(service);
    const user = { id: "current-user" };
    await controller.updateProductImage(user, "asset", { name: "Front", group: "Shop" });
    await controller.productImageGroups(user);
    await controller.createProductImageGroup(user, { name: "Shop" });
    await controller.renameProductImageGroup(user, "Shop", { name: "New" });
    await controller.deleteProductImageGroup(user, "New");
    expect(service.updateProductImage).toHaveBeenCalledWith(user.id, "asset", { name: "Front", group: "Shop" });
    expect(service.listProductImageGroups).toHaveBeenCalledWith(user.id);
    expect(service.createProductImageGroup).toHaveBeenCalledWith(user.id, "Shop");
    expect(service.changeProductImageGroup.mock.calls).toEqual([[user.id, "Shop", "New"], [user.id, "New"]]);
    expect(source).not.toMatch(/Public|SkipAuth|AllowAnonymous/);
    expect(Reflect.getMetadata("path", controller.updateProductImage)).toBe("product-images/:id");
    expect(Reflect.getMetadata("method", controller.updateProductImage)).toBe(nest.RequestMethod.PATCH);
    expect(Reflect.getMetadata("path", controller.productImageGroups)).toBe("product-image-groups");
    expect(Reflect.getMetadata("method", controller.deleteProductImageGroup)).toBe(nest.RequestMethod.DELETE);
});

it("validates typed metadata and group bodies without accepting client ownership or unknown fields", async () => {
    const { controller } = controllerHarness();
    const body = (method: string, index: number) => {
        const parameters = Reflect.getMetadata("__routeArguments__", controller.constructor, method);
        const parameter = Object.values(parameters).find((entry: any) => entry.index === index) as { pipes: nest.ValidationPipe[] };
        return { pipe: parameter.pipes[0], metatype: Reflect.getMetadata("design:paramtypes", Object.getPrototypeOf(controller), method)[index] };
    };
    const metadata = body("updateProductImage", 2);
    const group = body("createProductImageGroup", 1);
    await expect(metadata.pipe.transform({ name: "Front", group: "" }, { type: "body", metatype: metadata.metatype })).resolves.toMatchObject({ name: "Front", group: "" });
    for (const invalid of [{ name: "" }, { name: 7 }, { group: "x".repeat(61) }, { name: "x".repeat(121) }, { userId: "other" }, { unknown: true }]) {
        await expect(metadata.pipe.transform(invalid, { type: "body", metatype: metadata.metatype })).rejects.toThrow();
    }
    for (const invalid of [{}, { name: "" }, { name: 7 }, { name: "x".repeat(61) }, { name: "Shop", userId: "other" }]) {
        await expect(group.pipe.transform(invalid, { type: "body", metatype: group.metatype })).rejects.toThrow();
    }
    const parameters = Reflect.getMetadata("__routeArguments__", controller.constructor, "updateProductImage");
    const identifier = Object.values(parameters).find((entry: any) => entry.index === 1) as { pipes: Array<typeof nest.ParseUUIDPipe> };
    expect(identifier.pipes).toContain(nest.ParseUUIDPipe);
});