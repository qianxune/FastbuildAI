import type { NestExpressApplication } from "@nestjs/platform-express";
import express from "express";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import * as path from "path";
import request from "supertest";

jest.mock("@buildingai/config/app.config", () => ({ AppConfig: {} }), { virtual: true });
jest.mock(
    "@buildingai/core/modules",
    () => ({
        getCachedExtensionList: () => [{ identifier: "image-studio", enabled: true }],
    }),
    { virtual: true },
);
jest.mock("@buildingai/logger", () => ({ TerminalLogger: {} }), { virtual: true });

import { setAssetsDir } from "./system";

describe("extension entry serving", () => {
    let rootDir: string;
    let indexPath: string;
    let server: ReturnType<typeof express>;

    beforeEach(async () => {
        rootDir = mkdtempSync(path.join(tmpdir(), "buildingai-entry-"));
        const publicDir = path.join(rootDir, "extensions", "image-studio", ".output", "public");
        mkdirSync(publicDir, { recursive: true });
        indexPath = path.join(publicDir, "index.html");
        writeFileSync(indexPath, '<script src="/extension/image-studio/assets/old.js"></script>');
        server = express();
        const app = {
            use: server.use.bind(server),
            useStaticAssets: (dir: string, options: { prefix: string }) =>
                server.use(options.prefix, express.static(dir, { index: false })),
        };
        const cwd = jest.spyOn(process, "cwd").mockReturnValue(path.join(rootDir, "packages", "api"));
        try {
            await setAssetsDir(app as NestExpressApplication);
        } finally {
            cwd.mockRestore();
        }
    });

    afterEach(() => {
        rmSync(rootDir, { recursive: true, force: true });
    });

    it("serves the rebuilt entry without restarting the backend", async () => {
        await request(server).get("/extension/image-studio/").expect(200);
        const rebuiltHtml = '<script src="/extension/image-studio/assets/new.js"></script>';
        writeFileSync(indexPath, rebuiltHtml);

        const response = await request(server).get("/extension/image-studio/").expect(200);

        expect(response.text).toBe(rebuiltHtml);
        expect(response.headers["content-type"]).toContain("text/html");
    });

    it("keeps serving the current entry for nested workspace routes", async () => {
        writeFileSync(indexPath, "<main>Updated workspace</main>");

        const response = await request(server).get("/extension/image-studio/studio").expect(200);

        expect(response.text).toBe("<main>Updated workspace</main>");
        await request(server).get("/extension/other").expect(404);
    });
});
