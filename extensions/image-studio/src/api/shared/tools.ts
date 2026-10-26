export type ToolCapability =
    | "text-to-image"
    | "vision"
    | "reference-image"
    | "image-edit"
    | "inpaint"
    | "outpaint"
    | "segmentation"
    | "multi-image";

export interface ToolDefinition {
    readonly status: "intended" | "disabled";
    readonly requiredCapabilities: readonly ToolCapability[];
}

export const TOOL_REGISTRY = {
    main: { status: "intended", requiredCapabilities: ["reference-image"] },
    detail: {
        status: "intended",
        requiredCapabilities: ["vision", "text-to-image", "reference-image"],
    },
    replica: { status: "intended", requiredCapabilities: ["reference-image"] },
    creative: { status: "intended", requiredCapabilities: ["text-to-image"] },
    fusion: {
        status: "intended",
        requiredCapabilities: ["reference-image", "multi-image"],
    },
    sku: { status: "intended", requiredCapabilities: ["vision", "reference-image"] },
    retouch: { status: "intended", requiredCapabilities: ["image-edit"] },
    cutout: { status: "intended", requiredCapabilities: ["segmentation"] },
    watermark: { status: "disabled", requiredCapabilities: [] },
    expand: { status: "intended", requiredCapabilities: ["outpaint"] },
    translate: { status: "intended", requiredCapabilities: ["vision", "inpaint", "image-edit"] },
    suggest: { status: "intended", requiredCapabilities: ["vision"] },
} as const satisfies Record<string, ToolDefinition>;

export type ToolKey = keyof typeof TOOL_REGISTRY;

export const TOOL_KEYS = Object.keys(TOOL_REGISTRY) as ToolKey[];

export interface CapabilityModel {
    id: string;
    name: string;
    model: string;
    provider: string;
    providerCode: string;
    capabilities: ToolCapability[];
}

export interface ToolAvailability {
    key: ToolKey;
    status: "available" | "unavailable";
    requiredCapabilities: readonly ToolCapability[];
    modelIdsByCapability: Partial<Record<ToolCapability, string[]>>;
    reason: "tool_disabled" | "unsupported_capabilities" | null;
    limits: { sizes: readonly string[] | null; maxInputImages: number | null };
}

export interface GenerationCapabilities {
    models: CapabilityModel[];
    tools: ToolAvailability[];
}
