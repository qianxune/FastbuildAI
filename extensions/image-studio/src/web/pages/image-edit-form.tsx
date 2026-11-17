import { Popover, PopoverContent, PopoverTrigger } from "@buildingai/ui/components/ui/popover";
import { ArrowDown, ArrowDownLeft, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUp, ArrowUpLeft, ArrowUpRight, Check, ChevronDown, ChevronsLeftRight, Eraser, Languages, LoaderCircle, Maximize2, Paintbrush, Palette, RefreshCw, Scan, Scissors, Settings2, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { TOOL_REGISTRY } from "../../api/shared/tools";
import { EXPAND_POSITIONS, RECOLOR_COLORS, RETOUCH_MODES, TOOL_LANGUAGES, TOOL_RATIOS, TOOL_WORKFLOWS, toolWorkflowSize, validateToolWorkflow, type ToolWorkflowInput } from "../../api/shared/tool-workflow";
import { loadProductImage, useGenerationBilling, useProductImagesQuery, useUploadProductImageMutation } from "../services/generation";
import type { ProductImage } from "../services/types";
import { AssetRolePicker, SkuRegionEditor } from "./specialized-components";
import { expansionRegion, recordWatermarkEdit, stepWatermarkHistory, validImageFile, type Region, type WatermarkHistory, type WatermarkMark } from "./specialized-workflow";
import { WatermarkCanvas, WatermarkMarkList } from "./watermark-editor";
import type { ToolFormProps } from "./tool-form";
import "../styles/specialized-forms.css";
import "../styles/image-edit-form.css";

export function RetouchPreview() {
    const [split, setSplit] = useState(50);
    const [failed, setFailed] = useState(false);
    return <div className="cstate show retouch-preview"><div className="retouch-preview-content">
        {!failed && <figure className="retouch-example-stage">
            <img src="/extension/image-studio/images/perfume-after.jpg" alt="香水瓶精修效果示例" onError={() => setFailed(true)} />
            <img src="/extension/image-studio/images/perfume-before.jpg" alt="香水瓶原图示例" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} onError={() => setFailed(true)} />
            <span className="retouch-example-line" style={{ left: `${split}%` }} aria-hidden="true"><ChevronsLeftRight size={18} /></span>
            <span className="retouch-example-label retouch-example-before">原图示例</span><span className="retouch-example-label retouch-example-after">精修示例</span>
            <input type="range" min={0} max={100} value={split} aria-label="原图与精修示例对比" onChange={(event) => setSplit(Number(event.target.value))} />
        </figure>}
        <h3>产品精修</h3>
    </div></div>;
}

export function ExpansionPreview({ image, ratio, scale, position, onReady }: {
    image?: ProductImage; ratio: ToolWorkflowInput["ratio"]; scale: number;
    position: typeof EXPAND_POSITIONS[number]["id"]; onReady: (ready: boolean) => void;
}) {
    const [loaded, setLoaded] = useState<{ id: string; url: string; version: number }>();
    const loadVersion = useRef(0);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let active = true;
        const version = ++loadVersion.current;
        setLoaded(undefined); setFailed(false); onReady(false);
        if (!image) return;
        const release = loadProductImage(image.id, (url) => { if (active) setLoaded({ id: image.id, url, version }); }, () => { if (active) { setFailed(true); onReady(false); } });
        return () => { active = false; ++loadVersion.current; release(); onReady(false); };
    }, [image?.id, attempt, onReady]);
    const region = image ? expansionRegion(image.width, image.height, ratio, scale, position) : undefined;
    const [width = 1, height = 1] = ratio.split(":").map(Number);
    return <div className="expansion-preview">
        <header><h3>{image ? "扩图布局预览" : "智能扩图"}</h3><span>{image ? ratio : "素材示例"}</span></header>
        <div className="expansion-preview-viewport">
            {image ? <figure className="expansion-preview-stage" aria-label="扩图布局预览" style={{ aspectRatio: `${width} / ${height}`, width: `min(100%, 600px, ${60 * width / height}cqh)` }}>
                {failed ? <button type="button" className="expansion-preview-reload" aria-label="重新加载扩图原图" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={18} />加载失败，重试</button> : loaded?.id === image.id && region ?
                    <div className="expansion-preview-image" style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }}>
                        <img key={loaded.url} src={loaded.url} alt={image.name || "扩图原图"} draggable={false} onLoad={() => { if (loaded.version === loadVersion.current) onReady(true); }} onError={() => { if (loaded.version === loadVersion.current) { setFailed(true); onReady(false); } }} />
                    </div> : <span className="specialized-loading" role="status" aria-label={region ? "扩图原图加载中" : "请填写有效的原图占比"}><LoaderCircle size={22} /></span>}
            </figure> : <figure className="expansion-preview-example"><img src="/extension/image-studio/images/mug-scene.jpg" alt="智能扩图素材示例" /></figure>}
        </div>
    </div>;
}

const EXPAND_ICONS = [ArrowUpLeft, ArrowUp, ArrowUpRight, ArrowLeft, Scan, ArrowRight, ArrowDownLeft, ArrowDown, ArrowDownRight];
const CUTOUT_COLORS = [{ name: "透明", value: null }, { name: "白色", value: "#ffffff" }, { name: "浅蓝", value: "#c4e0f4" },
    { name: "蓝色", value: "#287be5" }, { name: "红色", value: "#e73535" }, { name: "深红", value: "#a52639" }];

export function RecolorPreview({ image, onReady }: { image?: ProductImage; onReady: (ready: boolean) => void }) {
    const [loaded, setLoaded] = useState<{ id: string; url: string; version: number }>();
    const version = useRef(0);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let active = true;
        const currentVersion = ++version.current;
        setLoaded(undefined); setFailed(false); onReady(false);
        if (!image) return;
        const release = loadProductImage(image.id, (url) => { if (active) setLoaded({ id: image.id, url, version: currentVersion }); }, () => { if (active) { setFailed(true); onReady(false); } });
        return () => { active = false; ++version.current; release(); onReady(false); };
    }, [image?.id, attempt, onReady]);
    return <div className="recolor-preview" aria-label="商品换色原图预览">
        <div className="recolor-preview-viewport">
            {image ? failed ? <button type="button" className="recolor-preview-reload" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={18} />原图加载失败，重试</button>
                : loaded?.id === image.id ? <figure className="recolor-preview-stage"><img key={loaded.url} src={loaded.url} alt={image.name || "商品换色原图"} draggable={false}
                    onLoad={() => { if (loaded.version === version.current) onReady(true); }} onError={() => { if (loaded.version === version.current) { setFailed(true); onReady(false); } }} /><figcaption>原图</figcaption></figure>
                    : <span className="specialized-loading" role="status" aria-label="商品换色原图加载中"><LoaderCircle size={22} /></span>
                : <figure className="recolor-preview-stage recolor-preview-example"><img src="/extension/image-studio/images/mug-scene.jpg" alt="商品换色素材示例" /><figcaption>素材示例</figcaption></figure>}
        </div>
    </div>;
}

export default function ImageEditForm({ tool, capabilities, locked, onSubmit, annotationTarget, onEditSource, taskSnapshot }: Omit<ToolFormProps, "tool"> & { tool: "watermark" | "translate" | "retouch" | "recolor" | "expand" | "redraw" | "cutout" }) {
    const id = useId();
    const [images, setImages] = useState<ProductImage[]>([]);
    const [modelChoice, setModelChoice] = useState("");
    const [ratio, setRatio] = useState<ToolWorkflowInput["ratio"]>("1:1");
    const [language, setLanguage] = useState<typeof TOOL_LANGUAGES[number]>("English");
    const [protectSubject, setProtectSubject] = useState(true);
    const [authorized, setAuthorized] = useState(false);
    const [region, setRegion] = useState<Region>();
    const [regionOpen, setRegionOpen] = useState(false);
    const [markHistory, setMarkHistory] = useState<WatermarkHistory>({ marks: [], past: [], future: [] });
    const [selectedMark, setSelectedMark] = useState("");
    const [sourceReady, setSourceReady] = useState(false);
    const sourcePicker = useRef<HTMLInputElement>(null);
    const regionalLayout = tool === "redraw" || tool === "cutout" || tool === "recolor";
    const canvasLayout = (tool === "watermark" && annotationTarget !== undefined) || tool === "redraw";
    const expansionLayout = tool === "expand" && annotationTarget !== undefined;
    const [backgroundColor, setBackgroundColor] = useState<string | null>(null);
    const [customBackground, setCustomBackground] = useState(false);
    const [customColor, setCustomColor] = useState("#4090ff");
    const [productColor, setProductColor] = useState<string>("#a52639");
    const [customProductColor, setCustomProductColor] = useState(false);
    const [expandScale, setExpandScale] = useState(80);
    const [customScale, setCustomScale] = useState(false);
    const [expandPosition, setExpandPosition] = useState<typeof EXPAND_POSITIONS[number]["id"]>("center");
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [instructions, setInstructions] = useState("");
    const [retouchMode, setRetouchMode] = useState<typeof RETOUCH_MODES[number]["id"]>("overall");
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    const settingsTrigger = useRef<HTMLButtonElement>(null);
    const operation = useRef(false);
    const mounted = useRef(true);
    const current = useRef({ images, locked, marks: markHistory.marks });
    current.current = { images, locked, marks: markHistory.marks };
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const products = useProductImagesQuery();
    const upload = useUploadProductImageMutation();
    const restoredTask = useRef<string | undefined>(undefined);
    useEffect(() => {
        const saved = taskSnapshot?.toolInput;
        if ((tool !== "cutout" && tool !== "recolor") || !taskSnapshot || saved?.tool !== tool || restoredTask.current === taskSnapshot.id
            || !products.isSuccess || products.isPending || products.isFetching || products.isError || !products.data
            || pending || upload.isPending || operation.current) return;
        const color = tool === "cutout" ? saved.design?.backgroundColor : saved.design?.productColor;
        if ((tool === "recolor" && color === null) || (color !== null && (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)))) return;
        restoredTask.current = taskSnapshot.id;
        const source = products.data.find((image) => image.id === saved.assetIds[0]);
        setImages(source ? [source] : []); setSourceReady(false);
        setModelChoice(saved.modelId); setRatio(saved.ratio);
        if (tool === "cutout") {
            setBackgroundColor(color?.toLowerCase() ?? null);
            setCustomBackground(!CUTOUT_COLORS.some((preset) => preset.value === (color?.toLowerCase() ?? null)));
        } else if (color) {
            setProductColor(color.toLowerCase());
            setCustomProductColor(!RECOLOR_COLORS.some((preset) => preset.value === color.toLowerCase()));
        }
        if (color) setCustomColor(color.toLowerCase());
        setError(source ? "" : "原任务素材已删除或不可用，请重新上传；生成结果仍可预览和下载");
    }, [tool, taskSnapshot?.id, products.data, products.isSuccess, products.isPending, products.isFetching, products.isError, pending, upload.isPending]);
    const availability = capabilities.tools.find((item) => item.key === tool);
    const models = capabilities.models.filter((item) => availability?.status === "available"
        && TOOL_REGISTRY[tool].requiredCapabilities.every((capability) => item.capabilities.includes(capability)
            && availability.modelIdsByCapability[capability]?.includes(item.id)) && (item.maxReferenceImages ?? 1) >= 1);
    const model = modelChoice ? capabilities.models.find((item) => item.id === modelChoice) : models[0];
    const capable = Boolean(model && models.some((item) => item.id === model.id));
    const liveModel = useRef({ id: model?.id, capable });
    liveModel.current = { id: model?.id, capable };
    const busy = locked || pending || upload.isPending;
    const billing = useGenerationBilling(model?.id ?? "", 1, !locked && capable);
    useEffect(() => {
        if (!products.isSuccess || products.isPending || products.isFetching || products.isError || !products.data
            || pending || upload.isPending || operation.current) return;
        if (current.current.images.some((image) => !products.data.some((item) => item.id === image.id))) {
            current.current = { ...current.current, images: [] };
            setImages([]); setRegion(undefined); setRegionOpen(false); setAuthorized(false);
            setMarkHistory({ marks: [], past: [], future: [] }); setSelectedMark(""); setSourceReady(false);
            if (canvasLayout || expansionLayout || regionalLayout) onEditSource?.();
        }
    }, [products.data, products.isSuccess, products.isPending, products.isFetching, products.isError, pending, upload.isPending]);
    const referenceAssets = tool === "redraw" ? markHistory.marks.flatMap((mark) => mark.referenceAsset ? [mark.referenceAsset.id] : []) : [];
    const assetIds = [...new Set([...images.map((image) => image.id), ...referenceAssets])];
    const input: ToolWorkflowInput = { tool, modelId: model?.id ?? "", assetIds, instructions: tool === "cutout" || tool === "redraw" || tool === "recolor" ? "" : instructions.trim(), count: 1, ratio,
        ...(tool === "redraw" ? { design: { redrawRegions: markHistory.marks.map((mark) => mark.region), redrawEdits: markHistory.marks.map((mark) => ({ instruction: mark.instruction?.trim() ?? "", ...(mark.referenceAsset ? { referenceAssetId: mark.referenceAsset.id } : {}) })) } } : tool === "cutout" ? { design: { backgroundColor } }
            : tool === "recolor" ? { design: { productColor } } : tool === "watermark" ? { authorized, design: canvasLayout ? { watermarkRegions: markHistory.marks.map((mark) => mark.region) } : { watermarkRegion: region } } : tool === "retouch" ? { design: { retouchMode } } : tool === "expand" ? { expansion: "surround", design: { expandScale, expandPosition } } : { targetLanguage: language, design: { protectSubject } }) };
    const validation = tool === "redraw" && assetIds.length > (model?.maxReferenceImages ?? 1) ? "当前模型参考图数量不足，请移除参考图或在高级设置中更换模型"
        : tool === "redraw" && products.isSuccess && products.data && referenceAssets.some((assetId) => !products.data.some((image) => image.id === assetId)) ? "参考素材已失效，请重新选择"
        : tool === "expand" && customScale && (!Number.isInteger(expandScale) || expandScale < 1 || expandScale > 99) ? "自定义原图占比须为 1–99 的整数" : validateToolWorkflow(input);
    const canSubmit = !busy && capable && billing.ready && validation === null && (!(canvasLayout || expansionLayout || regionalLayout) || sourceReady);

    function replaceImages(next: ProductImage[], internal = false) {
        if (!mounted.current || current.current.locked || (!internal && (busy || operation.current))) return;
        if (next.length > 1) { setError("每次只能编辑 1 张图片"); return; }
        if (next[0]?.id !== current.current.images[0]?.id) {
            current.current = { ...current.current, marks: [] };
            setRegion(undefined); setRegionOpen(false); setAuthorized(false);
            setMarkHistory({ marks: [], past: [], future: [] }); setSelectedMark(""); setSourceReady(false);
            if (tool === "expand") { setExpandScale(80); setCustomScale(false); setExpandPosition("center"); }
            if (tool === "redraw") setInstructions("");
            if (tool === "cutout") { setBackgroundColor(null); setCustomBackground(false); }
            if (canvasLayout || expansionLayout || regionalLayout) onEditSource?.();
            if (next[0]) {
                const sourceRatio = next[0].width / next[0].height;
                const distance = (value: typeof TOOL_RATIOS[number]) => { const [width, height] = value.split(":").map(Number); return width && height ? Math.abs(Math.log(sourceRatio / (width / height))) : Infinity; };
                setRatio(TOOL_RATIOS.reduce((closest, value) => distance(value) < distance(closest) ? value : closest));
            }
        }
        current.current = { ...current.current, images: next };
        setImages(next); setError("");
    }

    async function uploadFiles(files: File[], replace = false, markId?: string) {
        const file = files[0];
        if (!file || busy || operation.current || current.current.locked) return;
        if (markId && !current.current.marks.some((mark) => mark.id === markId)) return;
        if (files.length !== 1 || (!markId && !replace && current.current.images.length)) { setError("每次只能编辑 1 张图片，请先移除当前图片"); return; }
        if (!validImageFile(file)) { setError("请选择不超过 10 MiB 的 PNG、JPEG 或 WebP 图片"); return; }
        operation.current = true; setPending(true); setError("");
        const uploadModel = { ...liveModel.current };
        const sourceId = current.current.images[0]?.id;
        try {
            const image = await upload.mutateAsync(file);
            if (!mounted.current) return;
            if (current.current.locked || liveModel.current.id !== uploadModel.id || liveModel.current.capable !== uploadModel.capable) {
                setError("图片已上传至素材库；当前状态已变化，请稍后重新选择素材"); return;
            }
            if (markId) {
                if (sourceId !== current.current.images[0]?.id || !current.current.marks.some((mark) => mark.id === markId)) {
                    setError("图片已上传至素材库；原图或标注已变化，请重新选择参考图"); return;
                }
                changeMarkDetails(markId, { referenceAsset: image }, true);
            } else replaceImages([image], true);
        } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "上传失败，请稍后重试"); }
        finally { operation.current = false; if (mounted.current) setPending(false); }
    }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy || operation.current || current.current.locked) return;
        if (!canSubmit) { setError(validation || (!capable ? tool === "cutout" ? "腾讯云抠图尚未配置" : "请选择支持参考图编辑的可用模型" : !sourceReady && regionalLayout ? "原图尚未加载完成" : billing.costText)); return; }
        operation.current = true; setPending(true); setError("");
        try { await onSubmit(input); }
        catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "提交失败，请稍后重试"); }
        finally { operation.current = false; if (mounted.current) setPending(false); }
    }

    function changeMarks(marks: WatermarkMark[]) {
        if (busy || operation.current || current.current.locked || !mounted.current) return;
        current.current = { ...current.current, marks };
        setMarkHistory((history) => recordWatermarkEdit(history, marks));
        if (!marks.some((mark) => mark.id === selectedMark)) setSelectedMark("");
        if (canvasLayout) onEditSource?.();
    }
    function changeMarkDetails(markId: string, patch: Pick<WatermarkMark, "instruction" | "referenceAsset">, internal = false) {
        if (!mounted.current || current.current.locked || (!internal && (busy || operation.current))) return;
        if (!current.current.marks.some((mark) => mark.id === markId)) return;
        const marks = current.current.marks.map((mark) => mark.id === markId ? { ...mark, ...patch } : mark);
        const references = new Set(marks.flatMap((mark) => mark.referenceAsset ? [mark.referenceAsset.id] : []));
        if (references.has(current.current.images[0]?.id ?? "")) { setError("请上传不同于原图的标注参考图"); return; }
        if (references.size + 1 > (model?.maxReferenceImages ?? 1)) { setError("当前模型参考图数量不足，请更换模型或移除参考图"); return; }
        current.current = { ...current.current, marks };
        setMarkHistory((history) => recordWatermarkEdit(history, marks)); setError(""); onEditSource?.();
    }
    function changeInstructions(value: string) {
        if (busy || current.current.locked || operation.current || !mounted.current) return;
        setInstructions(value); if (regionalLayout || expansionLayout) onEditSource?.();
    }
    const editorProps = { image: images[0], history: markHistory, selected: selectedMark, disabled: busy, onChange: changeMarks,
        onSelect: (id: string) => { if (!busy && !current.current.locked) { setSelectedMark(id); if (canvasLayout) onEditSource?.(); } },
        onHistory: (direction: "undo" | "redo") => { if (!busy && !current.current.locked && !operation.current) { setMarkHistory((history) => stepWatermarkHistory(history, direction)); setSelectedMark(""); } }, onReady: setSourceReady,
        ...(tool === "redraw" ? { variant: "redraw" as const }
            : tool === "cutout" ? { variant: "cutout" as const, readOnly: true } : {}) };

    function changeExpansion(scale: number, position: typeof expandPosition, custom = customScale) {
        if (busy || operation.current || current.current.locked || !mounted.current) return;
        setExpandScale(scale); setExpandPosition(position); setCustomScale(custom);
        if (expansionLayout) onEditSource?.();
    }

    function changeBackground(value: string | null, custom = false) {
        if (busy || current.current.locked || operation.current || !mounted.current || (value !== null && !/^#[0-9a-f]{6}$/i.test(value))) return;
        setBackgroundColor(value); setCustomBackground(custom); if (custom && value) setCustomColor(value); onEditSource?.();
    }
    function changeProductColor(value: string, custom = false) {
        if (busy || current.current.locked || operation.current || !mounted.current || !/^#[0-9a-f]{6}$/i.test(value)) return;
        setProductColor(value.toLowerCase()); setCustomProductColor(custom); if (custom) setCustomColor(value.toLowerCase()); onEditSource?.();
    }
    const footer = <footer className={`specialized-footer${tool === "redraw" ? " redraw-action-bar" : ""}${tool === "cutout" ? " cutout-action-bar" : ""}`}>
        <Popover open={settingsOpen} onOpenChange={setSettingsOpen} modal={false}>
            <PopoverTrigger asChild><button ref={settingsTrigger} type="button" className="image-edit-settings-trigger" disabled={busy}><Settings2 size={16} />高级设置<span>{tool === "cutout" ? "原图" : ratio}</span><ChevronDown size={14} /></button></PopoverTrigger>
            <PopoverContent className="main-settings-popover image-edit-settings" side="top" align="start" sideOffset={8} collisionPadding={12}
                container={settingsTrigger.current?.closest<HTMLElement>(".studio-app") ?? undefined} aria-label="编辑高级设置">
                <header><h3>高级设置</h3><button type="button" aria-label="关闭高级设置" title="关闭高级设置" onClick={() => setSettingsOpen(false)}><X size={16} /></button></header>
                <fieldset disabled={busy}>
                        <label htmlFor={`${id}-model`}>{tool === "cutout" ? "抠图服务" : "生成模型"}<select id={`${id}-model`} aria-label="生成模型" value={model?.id ?? ""} onChange={(event) => setModelChoice(event.target.value)}>
                        {!model && <option value="">请选择模型</option>}{model && !capable && <option value={model.id}>{model.name}（不可用）</option>}
                        {models.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                    {tool === "cutout" ? <div className="cutout-output-size"><span>输出尺寸</span><strong>{images[0] ? `${images[0].width} × ${images[0].height}` : "原图尺寸"}</strong><span>PNG</span></div>
                        : <label htmlFor={`${id}-ratio`}>图片比例<select id={`${id}-ratio`} aria-label="图片比例" value={ratio} onChange={(event) => { if (!busy && !current.current.locked) { setRatio(event.target.value as typeof ratio); if (expansionLayout || regionalLayout) onEditSource?.(); } }}>
                            {TOOL_RATIOS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}
                            {tool === "recolor" && <div className="cutout-output-size"><span>输出尺寸</span><strong>{toolWorkflowSize(input).replace("x", " × ")}</strong></div>}
                </fieldset>
            </PopoverContent>
        </Popover>
        {regionalLayout && <span className="regional-output-summary">{tool === "cutout" ? images[0] ? `${images[0].width} × ${images[0].height} · PNG` : "原图 · PNG" : `${ratio} · 2K`}</span>}
        <div className="specialized-submit-row">{tool !== "retouch" && tool !== "expand" && !regionalLayout && <span className="specialized-cost" role="status">{billing.costText}</span>}<button type="submit" form={`${id}-image-edit`} className="specialized-primary" disabled={!canSubmit}>
            {pending ? <LoaderCircle size={17} /> : tool === "watermark" ? <Eraser size={17} /> : tool === "retouch" ? <Sparkles size={17} /> : tool === "recolor" ? <Palette size={17} /> : tool === "expand" ? <Maximize2 size={17} /> : tool === "redraw" ? <Paintbrush size={17} /> : tool === "cutout" ? <Scissors size={17} /> : <Languages size={17} />}
            {tool === "watermark" ? "开始去水印" : tool === "retouch" ? "立即生成" : tool === "recolor" ? "立即换色" : tool === "expand" ? "立即扩图" : tool === "redraw" ? "立即重绘" : tool === "cutout" ? "立即抠图" : "开始翻译"}{(tool === "retouch" || tool === "expand" || regionalLayout) && <small>{billing.costText}</small>}</button></div>
    </footer>;

    return <form id={`${id}-image-edit`} className={`ftpl show specialized-form image-edit-form image-edit-${tool}${canvasLayout || regionalLayout ? " watermark-side-form" : ""}`} aria-label={TOOL_WORKFLOWS[tool].name} data-workflow={tool} onSubmit={submit} noValidate>
        {(canvasLayout || tool === "cutout") && (annotationTarget ? createPortal(<WatermarkCanvas {...editorProps} />, annotationTarget) : regionalLayout && annotationTarget === undefined && <WatermarkCanvas {...editorProps} />)}
        {expansionLayout && annotationTarget && createPortal(<ExpansionPreview image={images[0]} ratio={ratio} scale={expandScale} position={expandPosition} onReady={setSourceReady} />, annotationTarget)}
        {tool === "recolor" && (annotationTarget ? createPortal(<RecolorPreview image={images[0]} onReady={setSourceReady} />, annotationTarget) : annotationTarget === undefined && <RecolorPreview image={images[0]} onReady={setSourceReady} />)}
        {tool !== "retouch" && tool !== "expand" && !canvasLayout && !regionalLayout && <header className="specialized-heading"><h2>{TOOL_WORKFLOWS[tool].name}</h2>{tool === "watermark" ? <Eraser size={22} /> : <Languages size={22} />}</header>}
            {!capable && <p className="specialized-message" role="status">{tool === "cutout" ? "腾讯云抠图未配置，请联系管理员启用 COS 存储及数据万象后刷新。" : "当前模型不可用于参考图编辑，请选择可用模型或联系管理员配置。"}</p>}
        <fieldset className="specialized-fields" disabled={busy}>
            <section className="specialized-band"><AssetRolePicker label={tool === "retouch" || tool === "expand" || canvasLayout || regionalLayout ? "上传图片" : "待编辑图片"} images={images} max={1} disabled={busy} original={!canvasLayout} dropzone={tool === "retouch" || tool === "expand" || regionalLayout} appearance={regionalLayout ? "links" : "default"} allowReplacement={regionalLayout} previewRegion={tool === "watermark" && !canvasLayout ? region : undefined}
                onChange={(next) => replaceImages(next)} onFiles={(files) => uploadFiles(files, regionalLayout)} />
                {(canvasLayout || expansionLayout || regionalLayout) && images.length > 0 && <div className="watermark-source-actions">
                    {tool !== "recolor" && <button type="button" disabled={busy} onClick={() => onEditSource?.()}><Scan size={14} />重新编辑</button>}
                    <button type="button" disabled={busy} onClick={() => sourcePicker.current?.click()}><RefreshCw size={14} />重新上传</button>
                </div>}
                {(canvasLayout || expansionLayout || regionalLayout) && <input ref={sourcePicker} type="file" hidden accept="image/png,image/jpeg,image/webp" aria-label={tool === "expand" ? "重新上传扩图原图" : tool === "redraw" ? "重新上传重绘原图" : tool === "cutout" ? "重新上传抠图原图" : tool === "recolor" ? "重新上传换色原图" : "重新上传水印原图"} disabled={busy}
                    onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = "";
                        if (busy || operation.current || current.current.locked || !files.length) return;
                        if (files.length !== 1 || !files[0] || !validImageFile(files[0])) { setError("请选择不超过 10 MiB 的 PNG、JPEG 或 WebP 图片"); return; }
                        void uploadFiles(files, true);
                    }} />}
            </section>
            {tool === "cutout" && <section className="specialized-band"><h3 id={`${id}-background`}>背景颜色</h3><div className="cutout-color-swatches" role="radiogroup" aria-labelledby={`${id}-background`}>
                {CUTOUT_COLORS.map((color) => <label key={color.name} title={color.name} className="cutout-color-choice"><input type="radio" name={`${id}-background-color`} aria-label={`背景颜色：${color.name}`} value={color.value ?? "transparent"} checked={!customBackground && backgroundColor === color.value} disabled={busy}
                    onChange={() => changeBackground(color.value)} /><span className={`cutout-color-preview${color.value === null ? " cutout-color-transparent" : ""}`} style={{ backgroundColor: color.value ?? undefined, color: ["蓝色", "红色", "深红"].includes(color.name) ? "#fff" : "#263240" }}><Check size={15} /></span></label>)}
                <label className="cutout-custom-color" data-selected={customBackground} title="自定义背景颜色">{customBackground ? <Check size={15} /> : <Palette size={20} />}<input type="color" id={`${id}-custom-color`} aria-label="自定义背景颜色" value={customColor} disabled={busy} onChange={(event) => changeBackground(event.target.value, true)} /></label>
            </div></section>}
            {tool === "recolor" && <section className="specialized-band"><h3 id={`${id}-product-color`}>商品颜色</h3><div className="cutout-color-swatches recolor-color-swatches" role="radiogroup" aria-labelledby={`${id}-product-color`}>
                {RECOLOR_COLORS.map((color) => <label key={color.value} title={color.name} className="cutout-color-choice"><input type="radio" name={`${id}-product-color`} aria-label={`商品颜色：${color.name}`} value={color.value} checked={!customProductColor && productColor === color.value} disabled={busy}
                    onChange={() => changeProductColor(color.value)} /><span className="cutout-color-preview" style={{ backgroundColor: color.value }}><Check size={15} /></span></label>)}
                <label className="cutout-custom-color" data-selected={customProductColor} style={customProductColor ? { background: productColor } : undefined} title="自定义商品颜色">{customProductColor ? <Check size={15} /> : <Palette size={20} />}<input type="color" id={`${id}-custom-product-color`} aria-label="自定义商品颜色" value={customColor} disabled={busy} onChange={(event) => changeProductColor(event.target.value, true)} /></label>
            </div><output className="recolor-selected-color" aria-live="polite">{customProductColor ? "自定义" : RECOLOR_COLORS.find((color) => color.value === productColor)?.name} · {productColor.toUpperCase()}</output></section>}
            {tool === "redraw" && <section className="specialized-band redraw-descriptions" aria-label="重绘描述">
                <header className="redraw-descriptions-heading"><h3>重绘描述</h3><span>{markHistory.marks.filter((mark) => mark.instruction?.trim() || mark.referenceAsset).length}/3</span></header>
                {markHistory.marks.map((mark, index) => <div key={mark.id} className="redraw-description-row" data-selected={selectedMark === mark.id}>
                    <div className="redraw-description-content"><button type="button" className="redraw-description-label" aria-label={`选择标注描述 ${index + 1}`} disabled={busy} onClick={() => editorProps.onSelect(mark.id)}>标注{index + 1}</button>
                        <textarea id={`${id}-instructions-${mark.id}`} aria-label={`标注${index + 1}重绘描述`} placeholder="请输入您要重绘的内容，例如：更换颜色…" rows={2} maxLength={1500} value={mark.instruction ?? ""}
                            onFocus={() => editorProps.onSelect(mark.id)} onChange={(event) => changeMarkDetails(mark.id, { instruction: event.target.value })} />
                    </div>
                    <AssetRolePicker label={`标注${index + 1}参考图`} images={mark.referenceAsset ? [mark.referenceAsset] : []} max={1} appearance="compact" allowReplacement disabled={busy || !capable || (model?.maxReferenceImages ?? 1) < 2}
                        onChange={(next) => { if (next.length <= 1) changeMarkDetails(mark.id, { referenceAsset: next[0] }); }} onFiles={(files) => uploadFiles(files, true, mark.id)} />
                    <button type="button" className="redraw-description-remove" aria-label={`删除标注 ${index + 1}`} title="删除标注" disabled={busy} onClick={() => changeMarks(markHistory.marks.filter((item) => item.id !== mark.id))}><X size={12} /></button>
                </div>)}
                {!markHistory.marks.length && <span className="redraw-description-empty" role="status">尚无标注</span>}
                {markHistory.marks.some((mark) => mark.instruction?.trim() || mark.referenceAsset) && validation && <p className="specialized-message" role="status">{validation}</p>}
            </section>}
            {tool === "retouch" && <section className="specialized-band"><h3 id={`${id}-mode-label`}>精修模式</h3><div className="retouch-modes" role="radiogroup" aria-labelledby={`${id}-mode-label`}>
                {RETOUCH_MODES.map((mode) => <label key={mode.id} className="retouch-mode"><input type="radio" name={`${id}-retouch-mode`} value={mode.id} checked={retouchMode === mode.id} aria-label={mode.label} onChange={() => setRetouchMode(mode.id)} /><span>{mode.label}</span></label>)}
            </div></section>}
            {tool === "expand" && <>
                <section className="specialized-band"><h3>原图占比</h3><div className="expansion-scale-presets" role="radiogroup" aria-label="原图占比">
                    {[100, 80, 60, 50].map((value) => <label key={value} className="retouch-mode"><input type="radio" name={`${id}-expand-scale`} aria-label={`原图占比 ${value}%`} checked={!customScale && expandScale === value} onChange={() => changeExpansion(value, expandPosition, false)} /><span>{value}%</span></label>)}
                </div><label className="expansion-custom-scale" htmlFor={`${id}-expand-scale`}><input id={`${id}-expand-scale`} type="number" min={1} max={99} step={1} aria-label="自定义原图占比" aria-invalid={customScale && (!Number.isInteger(expandScale) || expandScale < 1 || expandScale > 99)} placeholder="自定义" value={customScale && Number.isFinite(expandScale) ? expandScale : ""} onChange={(event) => changeExpansion(event.target.value === "" ? NaN : Number(event.target.value), expandPosition, true)} /><span>%</span></label></section>
                <section className="specialized-band"><h3>原图位置</h3><div className="expansion-position-grid" role="radiogroup" aria-label="原图位置">{EXPAND_POSITIONS.map((position, index) => {
                    const Icon = EXPAND_ICONS[index] ?? Scan;
                    return <label key={position.id} className="retouch-mode" title={position.label}><input type="radio" name={`${id}-expand-position`} aria-label={`原图位置：${position.label}`} checked={expandPosition === position.id} onChange={() => changeExpansion(expandScale, position.id)} /><span><Icon size={18} /></span></label>;
                })}</div></section>
            </>}
            {tool === "watermark" ? <section className="specialized-band">
                {canvasLayout ? <WatermarkMarkList {...editorProps} /> : <><div className="specialized-section-heading"><h3>水印区域</h3><div className="image-edit-region-actions">
                    <button type="button" disabled={busy || !images.length} title="区域作为模型编辑参考，不是像素蒙版" onClick={() => setRegionOpen(true)}><Scan size={16} />{region ? "重新框选" : "框选区域"}</button>
                    {region && <button type="button" disabled={busy} title="清除水印区域" aria-label="清除水印区域" onClick={() => setRegion(undefined)}><Trash2 size={16} /></button>}
                </div></div>
                <p className="specialized-note" role="status">{region ? `已选区域 · ${Math.round(region.width * 100)}% × ${Math.round(region.height * 100)}%` : "尚未选择区域"}</p></>}
                <label className="image-edit-check"><input id={`${id}-rights`} type="checkbox" checked={authorized} onChange={(event) => setAuthorized(event.target.checked)} />我拥有图片权利或已获去水印授权</label>
            </section> : tool === "translate" ? <section className="specialized-band">
                <label className="specialized-field" htmlFor={`${id}-language`}>目标语言<select id={`${id}-language`} aria-label="目标语言" value={language} onChange={(event) => setLanguage(event.target.value as typeof language)}>
                    {TOOL_LANGUAGES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                <label className="image-edit-check" title="保留商品及包装上的文字，仅翻译周边排版文字"><input id={`${id}-protect`} type="checkbox" checked={protectSubject} onChange={(event) => setProtectSubject(event.target.checked)} />保护商品主体</label>
            </section> : null}
            {tool !== "cutout" && tool !== "redraw" && tool !== "recolor" && <section className="specialized-band"><label className="specialized-field" htmlFor={`${id}-instructions`}>补充要求（选填）<textarea id={`${id}-instructions`} rows={3} maxLength={1500} value={instructions} onChange={(event) => changeInstructions(event.target.value)} /></label></section>}
        </fieldset>
        {regionOpen && images[0] && <SkuRegionEditor key={images[0].id} title="框选水印区域" image={images[0]} region={region} disabled={busy}
            onChange={(next) => { if (!busy && !current.current.locked) setRegion(next); }} onClose={() => setRegionOpen(false)} />}
        {footer}
        {error && <p className="specialized-message specialized-error" role="alert">{error}</p>}
    </form>;
}