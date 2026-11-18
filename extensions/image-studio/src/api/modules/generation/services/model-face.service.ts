import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { StorageConfig } from "@buildingai/db/entities";
import { Repository } from "@buildingai/db/typeorm";
import { HttpErrorFactory } from "@buildingai/errors";
import { Injectable, Logger } from "@nestjs/common";
import { createHash, createHmac } from "node:crypto";
import sharp from "sharp";

const HOST = "iai.tencentcloudapi.com";
const CONTENT_TYPE = "application/json; charset=utf-8";
const MAX_RESPONSE_BYTES = 64 * 1024;
const CACHE_MS = 5 * 60 * 1000;
const CACHE_LIMIT = 128;
export const MODEL_FACE_POLICY = {
    minAge: 18, minQuality: 70, minSharpness: 80, minFaceSize: 64,
    maxPitch: 10, maxYaw: 10, maxRoll: 20,
} as const;

function object(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function integer(value: unknown, min: number, max: number): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function authorization(accessKey: string, secretKey: string, timestamp: number, body: string) {
    const hash = (value: string) => createHash("sha256").update(value).digest("hex");
    const hmac = (key: string | Buffer, value: string) => createHmac("sha256", key).update(value).digest();
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const scope = `${date}/iai/tc3_request`;
    const headers = `content-type:${CONTENT_TYPE}\nhost:${HOST}\nx-tc-action:detectface\n`;
    const signedHeaders = "content-type;host;x-tc-action";
    const canonical = ["POST", "/", "", headers, signedHeaders, hash(body)].join("\n");
    const signingKey = hmac(hmac(hmac(`TC3${secretKey}`, date), "iai"), "tc3_request");
    const signature = createHmac("sha256", signingKey)
        .update(["TC3-HMAC-SHA256", String(timestamp), scope, hash(canonical)].join("\n")).digest("hex");
    return `TC3-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

@Injectable()
export class ModelFaceService {
    private readonly logger = new Logger(ModelFaceService.name);
    private readonly passed = new Map<string, number>();

    constructor(@InjectRepository(StorageConfig) private readonly repository: Repository<StorageConfig>) {}

    async validate(source: Buffer): Promise<void> {
        const config = await this.repository.findOne({ where: { isActive: true, storageType: "cos" } });
        const accessKey: unknown = config?.config?.accessKey;
        const secretKey: unknown = config?.config?.secretKey;
        if (!config || typeof accessKey !== "string" || !accessKey.trim() || typeof secretKey !== "string" || !secretKey.trim())
            this.unavailable("NOT_CONFIGURED", "腾讯云人脸检测未配置，请联系管理员配置 COS 凭据并开通人脸检测服务");
        const key = `${config.id}:${createHash("sha256").update(source).digest("hex")}`;
        if ((this.passed.get(key) ?? 0) > Date.now()) return;
        this.passed.delete(key);
        const image = await this.image(source);
        const body = JSON.stringify({
            Image: image, MaxFaceNum: 2, MinFaceSize: 34,
            NeedFaceAttributes: 1, NeedQualityDetection: 1, FaceModelVersion: "3.0",
        });
        const timestamp = Math.floor(Date.now() / 1000);
        let response: Response;
        let value: unknown;
        try {
            response = await fetch(`https://${HOST}`, {
                method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
                headers: {
                    "Content-Type": CONTENT_TYPE, Authorization: authorization(accessKey, secretKey, timestamp, body),
                    "X-TC-Action": "DetectFace", "X-TC-Version": "2018-03-01", "X-TC-Timestamp": String(timestamp),
                },
                body,
            });
            value = await this.json(response);
        } catch (error) {
            const timeout = object(error) && (error.name === "TimeoutError" || error.name === "AbortError");
            this.unavailable(timeout ? "TIMEOUT" : "REQUEST_FAILED", timeout
                ? "腾讯云人脸检测超时，请稍后重试，照片尚未保存为模特"
                : "腾讯云人脸检测失败，请稍后重试，照片尚未保存为模特");
        }
        if (!object(value) || !object(value.Response))
            this.unavailable("INVALID_RESPONSE", "腾讯云人脸检测结果不完整，请稍后重试");
        const result = value.Response;
        const requestId = typeof result.RequestId === "string" && /^[a-z0-9-]{1,128}$/i.test(result.RequestId) ? result.RequestId : undefined;
        if (object(result.Error)) {
            const code = typeof result.Error.Code === "string" && /^[a-z0-9.]{1,120}$/i.test(result.Error.Code) ? result.Error.Code : "PROVIDER_ERROR";
            if (code.startsWith("AuthFailure") || code.startsWith("UnauthorizedOperation"))
                this.unavailable(code, "腾讯云人脸检测权限不足，请联系管理员检查凭据与 iai:DetectFace 权限", requestId);
            if (code === "ResourceUnavailable.NotExist")
                this.unavailable(code, "腾讯云人脸检测服务尚未开通或计费状态未就绪，请联系管理员开通服务", requestId);
            if (code.startsWith("ResourceUnavailable.") || code === "ResourcesSoldOut.ChargeStatusException")
                this.unavailable(code, "腾讯云人脸检测账号余额或服务状态异常，请联系管理员检查计费与开通状态", requestId);
            if (code.startsWith("RequestLimitExceeded") || code === "FailedOperation.RequestLimitExceeded")
                this.unavailable(code, "腾讯云人脸检测繁忙，请稍后重试", requestId);
            if (code === "FailedOperation.RequestTimeout")
                this.unavailable(code, "腾讯云人脸检测超时，请稍后重试", requestId);
            if (code === "InvalidParameterValue.NoFaceInPhoto")
                throw HttpErrorFactory.badRequest("未检测到清晰人脸，请重新上传成年人的正脸照片");
            this.unavailable(code, "腾讯云人脸检测暂时不可用，请联系管理员检查服务状态", requestId);
        }
        if (!response.ok || !requestId || result.FaceModelVersion !== "3.0" || !Array.isArray(result.FaceInfos))
            this.unavailable("INVALID_RESPONSE", "腾讯云人脸检测结果不完整，请稍后重试", requestId);
        this.check(result.FaceInfos);
        for (const [cached, expires] of this.passed) if (expires <= Date.now()) this.passed.delete(cached);
        if (this.passed.size >= CACHE_LIMIT) this.passed.delete(this.passed.keys().next().value!);
        this.passed.set(key, Date.now() + CACHE_MS);
        this.logger.log(JSON.stringify({ event: "model_face_detection_passed", requestId }));
    }

    private async image(source: Buffer) {
        try {
            if (!Buffer.isBuffer(source) || !source.length || source.length > 10 * 1024 * 1024) throw new Error("invalid source");
            const image = sharp(source, { limitInputPixels: 4096 * 4096, animated: false, failOn: "warning" });
            const metadata = await image.metadata();
            if (!metadata.width || !metadata.height || metadata.width < 64 || metadata.height < 64
                || !["png", "jpeg", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) !== 1) throw new Error("invalid source");
            const encoded = (await image.rotate().flatten({ background: "#ffffff" })
                .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
                .jpeg({ quality: 85 }).toBuffer()).toString("base64");
            if (encoded.length > 5 * 1024 * 1024) throw new Error("source too large");
            return encoded;
        } catch {
            throw HttpErrorFactory.badRequest("模特照片无法检测，请重新上传清晰、完整且不超过 10 MB 的静态照片");
        }
    }

    private async json(response: Response): Promise<unknown> {
        if (!response.body || Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) throw new Error("invalid response");
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
            for (;;) {
                const chunk = await reader.read();
                if (chunk.done) break;
                size += chunk.value.length;
                if (size > MAX_RESPONSE_BYTES) throw new Error("response too large");
                chunks.push(chunk.value);
            }
            return JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } finally {
            await reader.cancel();
            reader.releaseLock();
        }
    }

    private check(faces: unknown[]) {
        if (!faces.length) throw HttpErrorFactory.badRequest("未检测到清晰人脸，请重新上传成年人的正脸照片");
        if (faces.length !== 1) throw HttpErrorFactory.badRequest("请仅上传一位成年人的清晰正脸照片，不支持多人合照");
        const face = faces[0];
        const attributes = object(face) && face.FaceAttributesInfo;
        const quality = object(face) && face.FaceQualityInfo;
        if (!object(face) || !object(attributes) || !object(quality)
            || !integer(attributes.Age, 0, 100) || !integer(attributes.Pitch, -30, 30)
            || !integer(attributes.Yaw, -30, 30) || !integer(attributes.Roll, -180, 180) || typeof attributes.Mask !== "boolean"
            || !integer(quality.Score, 0, 100) || !integer(quality.Sharpness, 0, 100)
            || !integer(face.Width, 1, 4096) || !integer(face.Height, 1, 4096))
            throw HttpErrorFactory.badRequest("人脸检测结果不完整，无法确认照片是否适用，请更换清晰正脸照片");
        if (attributes.Age < MODEL_FACE_POLICY.minAge)
            throw HttpErrorFactory.badRequest("照片存在未成年风险，请上传拥有授权的成年人照片；估龄不代表真实年龄核验");
        if (Math.abs(attributes.Pitch) > MODEL_FACE_POLICY.maxPitch || Math.abs(attributes.Yaw) > MODEL_FACE_POLICY.maxYaw
            || Math.abs(attributes.Roll) > MODEL_FACE_POLICY.maxRoll)
            throw HttpErrorFactory.badRequest("请上传面部朝向镜头的正脸照片，避免侧脸、低头或歪头");
        if (attributes.Mask) throw HttpErrorFactory.badRequest("人脸存在遮挡，请移除口罩并重新上传清晰正脸照片");
        if (quality.Score < MODEL_FACE_POLICY.minQuality)
            throw HttpErrorFactory.badRequest("人脸照片质量不足，请使用光线均匀、面部无遮挡的照片");
        if (quality.Sharpness < MODEL_FACE_POLICY.minSharpness || face.Width < MODEL_FACE_POLICY.minFaceSize || face.Height < MODEL_FACE_POLICY.minFaceSize)
            throw HttpErrorFactory.badRequest("人脸不够清晰或占比过小，请上传清晰的正脸近照");
    }

    private unavailable(reason: string, message: string, requestId?: string): never {
        this.logger.warn(JSON.stringify({ event: "model_face_detection_unavailable", reason, requestId }));
        throw HttpErrorFactory.badRequest(message);
    }
}
