import { TOOL_KEYS, TOOL_REGISTRY } from "../src/api/shared/tools";

describe("image studio tool registry", () => {
    it("preserves stable UI keys and adds regional redraw with intended cutout", () => {
        expect(TOOL_KEYS).toEqual([
            "main", "detail", "replica", "creative", "fusion", "sku",
            "retouch", "recolor", "redraw", "cutout", "watermark", "expand", "translate", "suggest",
        ]);
        expect(Object.values(TOOL_REGISTRY).filter((tool) => tool.status === "intended"))
            .toHaveLength(14);
    });

    it("requires genuine segmentation for intended cutout and reference guidance for redraw", () => {
        expect(TOOL_REGISTRY.cutout).toEqual({ status: "intended", requiredCapabilities: ["segmentation"] });
        expect(TOOL_REGISTRY.redraw).toEqual({ status: "intended", requiredCapabilities: ["reference-image"] });
        expect(TOOL_REGISTRY.recolor).toEqual({ status: "intended", requiredCapabilities: ["reference-image"] });
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