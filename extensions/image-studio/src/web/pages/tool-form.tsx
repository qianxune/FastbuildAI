import { LoaderCircle, Plus, Sparkles, Upload, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { TOOL_REGISTRY, type GenerationCapabilities, type ToolKey } from "../../api/shared/tools";
import {
    isToolEditKey, TOOL_EXPANSIONS, TOOL_LANGUAGES, TOOL_RATIOS, TOOL_WORKFLOWS,
    validateToolWorkflow, type ToolWorkflowInput,
} from "../../api/shared/tool-workflow";
import {
    loadProductThumbnail, useGenerationBilling, useProductImagesQuery, useUploadProductImageMutation,
} from "../services/generation";
import { useToolSuggestionsMutation } from "../services/tool-generation";
import ImageEditForm from "./image-edit-form";
import SpecializedToolForm from "./specialized-tool-form";
import SkuToolForm from "./sku-tool-form";
import ApparelToolForm from "./apparel-tool-form";
import { isApparelToolKey } from "../../api/shared/apparel-workflow";
import { isSpecializedTool } from "./specialized-workflow";
import type { ImageGeneration } from "../services/types";
import type { AssetApplication } from "../../api/shared/assets";
import MaterialPicker from "./material-picker";

export interface ToolFormProps {
    tool: ToolKey;
    capabilities: GenerationCapabilities;
    locked: boolean;
    defaultCount?: number;
    annotationTarget?: HTMLElement | null;
    onEditSource?: () => void;
    onOpenAssets?: () => void;
    taskSnapshot?: ImageGeneration | null;
    requestedAsset?: AssetApplication | null;
    onAssetConsumed?: (requestId: number, applied: boolean, message?: string) => void;
    onSubmit: (input: ToolWorkflowInput) => Promise<void>;
}

function ProductThumbnail({ id }: { id: string }) {
    const [url, setUrl] = useState("");
    const [failed, setFailed] = useState(false);
    const element = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        setUrl("");
        setFailed(false);
        let disposed = false;
        let visible = false;
        let release: (() => void) | undefined;
        let observer: IntersectionObserver | undefined;
        const updateVisibility = (nextVisible: boolean) => {
            if (disposed || visible === nextVisible) return;
            visible = nextVisible;
            release?.();
            release = undefined;
            setUrl("");
            setFailed(false);
            if (visible) release = loadProductThumbnail(id, setUrl, () => setFailed(true));
        };
        const target = element.current;
        if (typeof IntersectionObserver !== "function" || !target) {
            updateVisibility(true);
        } else {
            try {
                observer = new IntersectionObserver((entries) => {
                    for (const entry of entries) {
                        if (entry.target === target) updateVisibility(entry.isIntersecting);
                    }
                }, { rootMargin: "0px", threshold: 0 });
                observer.observe(target);
            } catch {
                observer?.disconnect();
                updateVisibility(true);
            }
        }
        return () => {
            disposed = true;
            observer?.disconnect();
            release?.();
            release = undefined;
        };
    }, [id]);
    return <span ref={element} style={{ display: "grid", placeItems: "center", width: "100%", height: "100%" }}>
        {url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> :
            failed ? "加载失败" : <LoaderCircle size={18} aria-label="加载图片" />}
    </span>;
}

const UNAVAILABLE_MESSAGES: Partial<Record<ToolKey, { title: string; description: string }>> = {
    cutout: { title: "透明抠图暂不可用", description: "当前未接入透明分割引擎。白底图不等于透明抠图，请联系管理员接入支持透明通道输出的引擎。" },
};

export default function ToolForm(props: ToolFormProps) {
    if (props.tool === "sku" || props.tool === "apparel_sku") return <SkuToolForm key={props.tool} {...props} tool={props.tool} />;
    if (isApparelToolKey(props.tool)) return <ApparelToolForm key={props.tool} {...props} tool={props.tool} />;
    if (props.tool === "watermark" || props.tool === "translate" || props.tool === "retouch" || props.tool === "recolor" || props.tool === "expand" || props.tool === "redraw" || props.tool === "cutout") return <ImageEditForm key={props.tool} {...props} tool={props.tool} />;
    if (isSpecializedTool(props.tool)) return <SpecializedToolForm key={props.tool} {...props} tool={props.tool} />;
    if (!isToolEditKey(props.tool) && props.tool !== "suggest") {
        const message = UNAVAILABLE_MESSAGES[props.tool];
        return <section className="ftpl show main-product-form" aria-label="工具不可用">
            <div className="workflow-message error" role="status">
                {message?.title ?? "当前没有可用的工具模型"}
                {message && <p>{message.description}</p>}
            </div>
        </section>;
    }
    return <ToolWorkspace key={props.tool} {...props} />;
}

export function ToolWorkspace({ tool, capabilities, locked, onSubmit }: ToolFormProps) {
    const workflow = TOOL_WORKFLOWS[tool as keyof typeof TOOL_WORKFLOWS];
    const suggestion = tool === "suggest";
    const availability = capabilities.tools.find((item) => item.key === tool);
    const models = capabilities.models.filter((model) =>
        availability?.status === "available" &&
        TOOL_REGISTRY[tool].requiredCapabilities.every((capability) => model.capabilities.includes(capability) &&
            availability.modelIdsByCapability[capability]?.includes(model.id)) &&
        (suggestion || (model.maxReferenceImages ?? 1) >= workflow.minAssets));
    const [modelChoice, setModelChoice] = useState("");
    const model = models.find((item) => item.id === modelChoice) ?? models[0];
    const [productName, setProductName] = useState("");
    const [instructions, setInstructions] = useState("");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [count, setCount] = useState(1);
    const [ratio, setRatio] = useState<ToolWorkflowInput["ratio"]>("1:1");
    const [language, setLanguage] = useState<typeof TOOL_LANGUAGES[number]>("简体中文");
    const [variant, setVariant] = useState("");
    const [expansion, setExpansion] = useState<typeof TOOL_EXPANSIONS[number]>("surround");
    const [authorized, setAuthorized] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    const [result, setResult] = useState("");
    const operation = useRef(false);
    const mounted = useRef(true);
    const fileInput = useRef<HTMLInputElement>(null);
    const id = useId();
    const products = useProductImagesQuery();
    const upload = useUploadProductImageMutation();
    const analysis = useToolSuggestionsMutation();
    const billing = useGenerationBilling(model?.id ?? "", count, !suggestion && !locked);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);
    const assetIds = selectedIds.filter((assetId) => products.data?.some((image) => image.id === assetId));
    const selectionKey = assetIds.join(",");
    useEffect(() => {
        setResult("");
    }, [productName, model?.id, selectionKey, language]);
    const limit = suggestion ? 5 : Math.min(5, model?.maxReferenceImages ?? 1);
    const input: ToolWorkflowInput = {
        tool: tool as ToolWorkflowInput["tool"], modelId: model?.id ?? "", assetIds,
        productName: productName.trim(), instructions: instructions.trim(), count, ratio,
        ...(tool === "sku" ? { variant: variant.trim() } : {}),
        ...(tool === "expand" ? { expansion } : {}),
        ...(tool === "translate" ? { targetLanguage: language } : {}),
        ...(tool === "watermark" ? { authorized } : {}),
    };
    const invalid = suggestion ? !model || !productName.trim() || assetIds.length < 1 : Boolean(validateToolWorkflow(input));
    const busy = locked || pending || upload.isPending || analysis.isPending;
    const canSubmit = !busy && !invalid && assetIds.length <= limit && (suggestion || billing.ready);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!canSubmit || operation.current) return;
        operation.current = true;
        setPending(true);
        setError("");
        setResult("");
        try {
            if (suggestion) {
                const response = await analysis.mutateAsync({ modelId: model!.id, assetIds, productName: productName.trim(), language });
                if (mounted.current) setResult(response.suggestions);
            } else {
                await onSubmit(input);
            }
        } catch (failure) {
            if (mounted.current) setError(failure instanceof Error ? failure.message : suggestion ? "分析失败，请稍后重试" : "提交失败，请稍后重试");
        } finally {
            operation.current = false;
            if (mounted.current) setPending(false);
        }
    }

    async function uploadFile(file?: File) {
        if (!file || busy || operation.current) return;
        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024 || file.size === 0) {
            setError("请选择不超过 10 MiB 的 PNG、JPEG 或 WebP 图片");
            return;
        }
        operation.current = true;
        setPending(true);
        setError("");
        try {
            const image = await upload.mutateAsync(file);
            if (mounted.current) {
                setSelectedIds((current) => current.length < limit ? [...current, image.id] : current);
            }
        } catch {
            if (mounted.current) setError("上传失败，请稍后重试");
        } finally {
            operation.current = false;
            if (mounted.current) setPending(false);
        }
    }

    return <form className="ftpl show main-product-form" aria-label={workflow.name} onSubmit={submit}>
        <div className="form-head"><h2>{workflow.name}</h2></div>
        {!models.length && <p className="workflow-message error" role="status">当前没有可用模型，请联系管理员配置工具所需能力后刷新。</p>}
        <fieldset disabled={busy} className="main-fields" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <div className="field">
                <label className="f-label" htmlFor={`${id}-product`}>商品名称</label>
                <input id={`${id}-product`} className="text-in" value={productName} maxLength={100} required onChange={(event) => setProductName(event.target.value)} />
            </div>
            <div className="field">
                <label className="f-label" htmlFor={`${id}-model`}>模型</label>
                <select id={`${id}-model`} className="sel" value={model?.id ?? ""} onChange={(event) => setModelChoice(event.target.value)}>
                    {!models.length && <option value="">没有可用模型</option>}
                    {models.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
            </div>
            <div className="field">
                <div className="image-upload-heading">
                    <span className="f-label image-upload-title">{tool === "replica" ? "商品图与构图参考" : "参考图片"} ({assetIds.length}/{limit})</span>
                    <div className="image-upload-library"><MaterialPicker selectedIds={assetIds} max={limit} disabled={busy}
                        onChange={(ids) => { if (!busy) setSelectedIds(ids); }} /></div>
                </div>
                {assetIds.length > 0 ? <div className="image-upload-thumbnails">
                    {assetIds.map((assetId, index) => <div key={assetId} className="specialized-thumbnail">
                        <ProductThumbnail id={assetId} />
                        <button type="button" className="specialized-remove" aria-label={`移除参考图片 ${index + 1}`} title="移除选择" disabled={busy}
                            onClick={() => setSelectedIds((current) => current.filter((value) => value !== assetId))}><X size={15} /></button>
                    </div>)}
                    {assetIds.length < limit && <button type="button" className="image-upload-add" title="继续添加图片" aria-label="继续添加图片" disabled={busy} onClick={() => fileInput.current?.click()}><Plus size={20} /></button>}
                </div> : <div className="image-upload-area">
                    <button type="button" className="image-upload-zone" title="上传商品图" aria-label="上传商品图" disabled={busy || assetIds.length >= limit} onClick={() => fileInput.current?.click()}>
                        <span className="image-upload-command"><Upload size={16} /><span>上传图片</span></span>
                        <span className="image-upload-hint">最多 {limit} 张 · PNG / JPEG / WebP · 每张不超过 10 MB</span>
                    </button>
                </div>}
                <input ref={fileInput} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    void uploadFile(file);
                }} />
                {products.isPending && <div role="status">加载商品图...</div>}
                {products.isError && <div className="workflow-message error" role="alert">商品图加载失败</div>}
                {!products.isPending && !products.isError && !products.data?.length && <div role="status">暂无商品图</div>}
                {assetIds.length < workflow.minAssets && <div role="status">至少选择 {workflow.minAssets} 张图片</div>}
                {assetIds.length > limit && <div role="alert">当前模型最多支持 {limit} 张参考图</div>}
            </div>
            {!suggestion && <div className="field">
                <label className="f-label" htmlFor={`${id}-instructions`}>编辑要求</label>
                <textarea id={`${id}-instructions`} className="text-in" rows={3} maxLength={1500} value={instructions} onChange={(event) => setInstructions(event.target.value)} />
            </div>}
            {tool === "sku" && <div className="field">
                <label className="f-label" htmlFor={`${id}-variant`}>SKU 变化</label>
                <input id={`${id}-variant`} className="text-in" required maxLength={300} value={variant} onChange={(event) => setVariant(event.target.value)} />
            </div>}
            {tool === "expand" && <div className="field">
                <label className="f-label" htmlFor={`${id}-expansion`}>扩展方向</label>
                <select id={`${id}-expansion`} className="sel" value={expansion} onChange={(event) => setExpansion(event.target.value as typeof expansion)}>
                    {TOOL_EXPANSIONS.map((value) => <option key={value} value={value}>{{ horizontal: "横向", vertical: "纵向", surround: "四周" }[value]}</option>)}
                </select>
            </div>}
            {(suggestion || tool === "translate") && <div className="field">
                <label className="f-label" htmlFor={`${id}-language`}>目标语言</label>
                <select id={`${id}-language`} className="sel" value={language} onChange={(event) => setLanguage(event.target.value as typeof language)}>
                    {TOOL_LANGUAGES.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
            </div>}
            {!suggestion && <div className="main-settings-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 120px), 1fr))", gap: 12 }}>
                <div className="field"><label className="f-label" htmlFor={`${id}-count`}>生成数量</label>
                    <select id={`${id}-count`} className="sel" value={count} onChange={(event) => setCount(Number(event.target.value))}>
                        {[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value} 张</option>)}
                    </select>
                </div>
                <div className="field"><label className="f-label" htmlFor={`${id}-ratio`}>图片比例</label>
                    <select id={`${id}-ratio`} className="sel" value={ratio} onChange={(event) => setRatio(event.target.value as typeof ratio)}>
                        {TOOL_RATIOS.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                </div>
            </div>}
            {tool === "watermark" && <label className="f-label" htmlFor={`${id}-rights`} style={{ whiteSpace: "normal" }}>
                <input id={`${id}-rights`} type="checkbox" required checked={authorized} onChange={(event) => setAuthorized(event.target.checked)} />
                我确认拥有该图片及水印的权利，或已获得处理授权
            </label>}
            {!suggestion && <div role="status">{billing.costText}</div>}
            <button type="submit" className="opt" disabled={!canSubmit}>
                {pending ? <LoaderCircle size={18} /> : <Sparkles size={18} />} {suggestion ? "分析商品" : "生成图片"}
            </button>
        </fieldset>
        {error && <div className="workflow-message error" role="alert">{error}</div>}
        {result && <output aria-label="产品建议" style={{ display: "block", whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxWidth: "100%" }}>{result}</output>}
    </form>;
}