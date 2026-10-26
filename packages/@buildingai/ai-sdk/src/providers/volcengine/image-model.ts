import type { ImageModelV3 } from "@ai-sdk/provider";

import type { BaseProviderSettings } from "../../types";

function safeErrorIdentifier(value: unknown) {
    return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(value)
        ? value
        : undefined;
}

export function createVolcengineImageModel(settings: BaseProviderSettings, modelId: string) {
    return {
        specificationVersion: "v3",
        provider: "volcengine",
        modelId,
        maxImagesPerCall: 1,
        supportsReferenceImages: true,
        async doGenerate(options) {
            if (options.mask || options.n !== 1) {
                throw new Error("Unsupported Volcengine image operation");
            }
            const images = options.files?.map((file) => {
                if (file.type !== "file" || !["image/png", "image/jpeg", "image/webp"].includes(file.mediaType)) {
                    throw new Error("Volcengine requires inline reference images");
                }
                const base64 = typeof file.data === "string" ? file.data : Buffer.from(file.data).toString("base64");
                return `data:${file.mediaType};base64,${base64}`;
            });
            const timestamp = new Date();
            const response = await fetch(`${settings.baseURL?.replace(/\/+$/, "")}/images/generations`, {
                method: "POST",
                headers: {
                    ...settings.headers,
                    "Content-Type": "application/json",
                    Authorization: settings.apiKey?.startsWith("Bearer ") ? settings.apiKey : `Bearer ${settings.apiKey}`,
                },
                signal: options.abortSignal ?? AbortSignal.timeout(settings.timeout ?? 300000),
                body: JSON.stringify({
                    model: modelId,
                    prompt: options.prompt,
                    image: images?.length === 1 ? images[0] : images?.length ? images : undefined,
                    size: options.size ?? "2048x2048",
                    seed: options.seed,
                    response_format: "b64_json",
                    sequential_image_generation: /^doubao-seedream-5-0-(?:flash|pro)(?:-|$)/.test(modelId)
                        ? undefined
                        : "disabled",
                    watermark: false,
                }),
            });
            if (!response.ok) {
                let code = "VOLCENGINE_IMAGE_HTTP_ERROR";
                const reader = response.body?.getReader();
                try {
                    const chunks: Uint8Array[] = [];
                    let length = 0;
                    while (reader) {
                        const chunk = await reader.read();
                        if (chunk.done) break;
                        length += chunk.value.byteLength;
                        if (length > 16 * 1024) break;
                        chunks.push(chunk.value);
                    }
                    if (length <= 16 * 1024) {
                        const detail: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
                        if (detail && typeof detail === "object" && "error" in detail &&
                            detail.error && typeof detail.error === "object" && "code" in detail.error) {
                            code = safeErrorIdentifier(detail.error.code) ?? code;
                        }
                    }
                } catch {} finally {
                    await reader?.cancel().catch(() => undefined);
                }
                throw Object.assign(new Error(`Volcengine image request failed (${response.status})`), {
                    code,
                    statusCode: response.status,
                    requestId: safeErrorIdentifier(
                        response.headers.get("x-request-id") ?? response.headers.get("x-tt-logid"),
                    ),
                });
            }
            const reader = response.body?.getReader();
            if (!reader) throw Object.assign(new Error("Empty Volcengine image response"), {
                code: "VOLCENGINE_EMPTY_IMAGE_RESPONSE",
            });
            const chunks: Uint8Array[] = [];
            let length = 0;
            try {
                while (true) {
                    const chunk = await reader.read();
                    if (chunk.done) break;
                    length += chunk.value.byteLength;
                    if (length > 30 * 1024 * 1024) throw Object.assign(new Error("Volcengine image response exceeds limit"), {
                        code: "VOLCENGINE_IMAGE_RESPONSE_TOO_LARGE",
                    });
                    chunks.push(chunk.value);
                }
            } finally {
                await reader.cancel();
            }
            const data: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (!data || typeof data !== "object" || !("data" in data) || !Array.isArray(data.data) ||
                data.data.length !== 1 || typeof data.data[0]?.b64_json !== "string" || !data.data[0].b64_json) {
                throw Object.assign(new Error("Invalid Volcengine image response"), {
                    code: "VOLCENGINE_INVALID_IMAGE_RESPONSE",
                });
            }
            return {
                images: [data.data[0].b64_json as string],
                warnings: [],
                response: { timestamp, modelId, headers: Object.fromEntries(response.headers.entries()) },
            };
        },
    } satisfies ImageModelV3 & { supportsReferenceImages: boolean };
}