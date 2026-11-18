import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import sharp from "sharp";
import ts from "typescript";

const face = (attributes = {}, quality = {}) => ({
    Width: 160, Height: 160,
    FaceAttributesInfo: { Age: 28, Pitch: 0, Yaw: 0, Roll: 0, Mask: false, ...attributes },
    FaceQualityInfo: { Score: 90, Sharpness: 95, ...quality },
});
const payload = (faces: unknown[] = [face()]) => ({
    Response: { FaceInfos: faces, FaceModelVersion: "3.0", RequestId: "test-request" },
});

function fixture() {
    const repository = { findOne: jest.fn(async (): Promise<any> => ({
        id: "storage", config: { bucket: "private", region: "ap-guangzhou", accessKey: "test-access", secretKey: "test-secret" },
    })) };
    const request = jest.fn(async (_url: string, _options: RequestInit) => new Response(JSON.stringify(payload())));
    const logs: string[] = [];
    const exports: any = {};
    const source = readFileSync(path.join(__dirname, "../src/api/modules/generation/services/model-face.service.ts"), "utf8");
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true, esModuleInterop: true } }).outputText, {
        exports, Buffer, AbortSignal, Date, Error, fetch: request,
        require: (name: string) => {
            if (name === "@nestjs/common") return { Injectable: () => () => undefined, Logger: class { warn(value: string) { logs.push(value); } log(value: string) { logs.push(value); } } };
            if (name === "@buildingai/db/@nestjs/typeorm") return { InjectRepository: () => () => undefined };
            if (name === "@buildingai/errors") return { HttpErrorFactory: { badRequest: (message: string) => new Error(message) } };
            if (name === "sharp") return sharp;
            if (name === "node:crypto") return require("node:crypto");
            return {};
        },
    });
    return { service: new exports.ModelFaceService(repository), request, repository, logs };
}

describe("Tencent uploaded-model face detection", () => {
    let image: Buffer;
    beforeAll(async () => { image = await sharp({ create: { width: 100, height: 100, channels: 3, background: "white" } }).png().toBuffer(); });

    it("sends a signed, bounded single request for two faces and explicitly enabled attributes/quality", async () => {
        const { service, request, logs } = fixture();
        await expect(service.validate(image)).resolves.toBeUndefined();
        expect(request).toHaveBeenCalledTimes(1);
        const [url, options] = request.mock.calls[0]!;
        expect(url).toBe("https://iai.tencentcloudapi.com");
        expect(options).toMatchObject({ method: "POST", redirect: "error", headers: {
            "X-TC-Action": "DetectFace", "X-TC-Version": "2018-03-01",
            Authorization: expect.stringMatching(/^TC3-HMAC-SHA256 Credential=test-access\/\d{4}-\d{2}-\d{2}\/iai\/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=[a-f0-9]{64}$/),
        } });
        const body = JSON.parse(String(options.body));
        expect(body).toMatchObject({ MaxFaceNum: 2, MinFaceSize: 34, NeedFaceAttributes: 1, NeedQualityDetection: 1, FaceModelVersion: "3.0" });
        expect(body.Url).toBeUndefined();
        expect(Buffer.byteLength(body.Image)).toBeLessThanOrEqual(5 * 1024 * 1024);
        expect((await sharp(Buffer.from(body.Image, "base64")).metadata()).format).toBe("jpeg");
        expect(logs.join("")).not.toMatch(/test-access|test-secret|FaceAttributesInfo|Age|Image/);
    });

    it.each<[unknown[], string]>([
        [[], "未检测到"], [[face(), face()], "一位"],
        [[face({ Age: 17 })], "未成年"], [[face({ Age: null })], "不完整"],
        [[face({ Age: 101 })], "不完整"], [[face({ Age: "28" })], "不完整"],
        [[face({ Pitch: 11 })], "正脸"], [[face({ Yaw: -11 })], "正脸"],
        [[face({ Roll: 21 })], "正脸"], [[face({ Mask: true })], "遮挡"],
        [[face({}, { Score: 69 })], "质量"], [[face({}, { Sharpness: 79 })], "清晰"],
        [[{ ...face(), FaceQualityInfo: null }], "不完整"],
    ])("rejects unsuitable or incomplete results %# before saving", async (faces, message) => {
        const { service, request } = fixture();
        request.mockResolvedValue(new Response(JSON.stringify(payload(faces))));
        await expect(service.validate(image)).rejects.toThrow(message);
        expect(request).toHaveBeenCalledTimes(1);
    });

    it("accepts the documented exact quality, frontal-pose and adult-risk boundaries", async () => {
        const { service, request } = fixture();
        request.mockResolvedValue(new Response(JSON.stringify(payload([face(
            { Age: 18, Pitch: -10, Yaw: 10, Roll: -20 }, { Score: 70, Sharpness: 80 },
        )]))));
        await expect(service.validate(image)).resolves.toBeUndefined();
    });

    it("caches only passing image hashes briefly, not rejected results or unavailable configurations", async () => {
        const { service, request, repository } = fixture();
        await service.validate(image);
        await service.validate(Buffer.from(image));
        expect(request).toHaveBeenCalledTimes(1);
        repository.findOne.mockResolvedValueOnce(null);
        await expect(service.validate(image)).rejects.toThrow("配置");
        const other = fixture();
        other.request.mockImplementation(async () => new Response(JSON.stringify(payload([]))));
        await expect(other.service.validate(image)).rejects.toThrow("未检测到");
        await expect(other.service.validate(image)).rejects.toThrow("未检测到");
        expect(other.request).toHaveBeenCalledTimes(2);
    });

    it.each([
        ["AuthFailure.SignatureFailure", "权限"],
        ["UnauthorizedOperation", "权限"],
        ["ResourceUnavailable.NotExist", "开通"],
        ["ResourceUnavailable.LowBalance", "余额"],
        ["RequestLimitExceeded", "繁忙"],
        ["FailedOperation.RequestLimitExceeded", "繁忙"],
        ["FailedOperation.RequestTimeout", "超时"],
    ])("reports %s without exposing provider messages or retrying", async (code, message) => {
        const { service, request, logs } = fixture();
        request.mockResolvedValue(new Response(JSON.stringify({ Response: {
            Error: { Code: code, Message: "sensitive-provider-detail" }, RequestId: "test-request",
        } })));
        await expect(service.validate(image)).rejects.toThrow(message);
        expect(request).toHaveBeenCalledTimes(1);
        expect(logs.join("")).not.toContain("sensitive-provider-detail");
    });

    it.each(["invalid-json", "large-response", "timeout", "missing-result"])("fails closed on %s", async (mode) => {
        const { service, request } = fixture();
        if (mode === "timeout") request.mockRejectedValue(Object.assign(new Error("private"), { name: "TimeoutError" }));
        else request.mockResolvedValue(new Response(mode === "invalid-json" ? "<html>error</html>" :
            mode === "large-response" ? " ".repeat(64 * 1024 + 1) : JSON.stringify({ Response: {} })));
        await expect(service.validate(image)).rejects.toThrow(/检测.*(超时|失败|不完整|不可用)/);
        expect(request).toHaveBeenCalledTimes(1);
    });

    it("rejects invalid sources locally without sending bytes", async () => {
        const { service, request } = fixture();
        await expect(service.validate(Buffer.from("invalid"))).rejects.toThrow("照片");
        expect(request).not.toHaveBeenCalled();
    });

    it("rechecks an expired passing result instead of treating a previous decision as permanent", async () => {
        const now = jest.spyOn(Date, "now").mockReturnValue(1800000000000);
        try {
            const { service, request } = fixture();
            await service.validate(image);
            now.mockReturnValue(1800000000000 + 5 * 60 * 1000);
            await service.validate(image);
            expect(request).toHaveBeenCalledTimes(2);
        } finally { now.mockRestore(); }
    });
});
