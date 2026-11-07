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
        requiredCapabilities: ["reference-image"],
    },
    replica: { status: "intended", requiredCapabilities: ["reference-image", "multi-image"] },
    creative: { status: "intended", requiredCapabilities: ["text-to-image"] },
    fusion: {
        status: "intended",
        requiredCapabilities: ["reference-image", "multi-image"],
    },
    sku: { status: "intended", requiredCapabilities: ["reference-image"] },
    retouch: { status: "intended", requiredCapabilities: ["reference-image"] },
    recolor: { status: "intended", requiredCapabilities: ["reference-image"] },
    redraw: { status: "intended", requiredCapabilities: ["reference-image"] },
    cutout: { status: "intended", requiredCapabilities: ["segmentation"] },
    watermark: { status: "intended", requiredCapabilities: ["reference-image"] },
    expand: { status: "intended", requiredCapabilities: ["reference-image"] },
    translate: { status: "intended", requiredCapabilities: ["reference-image"] },
    suggest: { status: "intended", requiredCapabilities: ["vision"] },
} as const satisfies Record<string, ToolDefinition>;

export type ToolKey = keyof typeof TOOL_REGISTRY;
export const LOCAL_CUTOUT_MODEL_ID = "00000000-0000-4000-8000-000000000001";

export const TOOL_KEYS = Object.keys(TOOL_REGISTRY) as ToolKey[];

export interface CapabilityModel {
    id: string;
    name: string;
    model: string;
    provider: string;
    providerCode: string;
    capabilities: ToolCapability[];
    maxReferenceImages?: number;
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
