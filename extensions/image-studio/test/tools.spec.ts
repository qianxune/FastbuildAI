import { TOOL_KEYS, TOOL_REGISTRY } from "../src/api/shared/tools";

describe("image studio tool registry", () => {
    it("preserves the twelve stable UI keys and eleven intended tools", () => {
        expect(TOOL_KEYS).toEqual([
            "main", "detail", "replica", "creative", "fusion", "sku",
            "retouch", "cutout", "watermark", "expand", "translate", "suggest",
        ]);
        expect(Object.values(TOOL_REGISTRY).filter((tool) => tool.status === "intended"))
            .toHaveLength(11);
    });

    it("disables cutout without advertising transparent segmentation", () => {
        expect(TOOL_REGISTRY.cutout).toEqual({ status: "disabled", requiredCapabilities: ["segmentation"] });
        expect(TOOL_REGISTRY.watermark).toEqual({ status: "intended", requiredCapabilities: ["reference-image"] });
    });

    it("requires actual image operations for image-based tools", () => {
        expect(TOOL_REGISTRY.creative.requiredCapabilities).toEqual(["text-to-image"]);
        expect(TOOL_REGISTRY.suggest.requiredCapabilities).toEqual(["vision"]);
        expect(TOOL_REGISTRY.fusion.requiredCapabilities).toContain("multi-image");
        expect(TOOL_REGISTRY.cutout.requiredCapabilities).toContain("segmentation");
        expect(TOOL_REGISTRY.expand.requiredCapabilities).toEqual(["reference-image"]);
        expect(TOOL_REGISTRY.translate.requiredCapabilities).toEqual(["reference-image"]);
    });
});