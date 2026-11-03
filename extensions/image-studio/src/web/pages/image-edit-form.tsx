import { Popover, PopoverContent, PopoverTrigger } from "@buildingai/ui/components/ui/popover";
import { ChevronDown, ChevronsLeftRight, Eraser, Languages, LoaderCircle, Scan, Settings2, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { TOOL_REGISTRY } from "../../api/shared/tools";
import { RETOUCH_MODES, TOOL_LANGUAGES, TOOL_RATIOS, TOOL_WORKFLOWS, validateToolWorkflow, type ToolWorkflowInput } from "../../api/shared/tool-workflow";
import { useGenerationBilling, useProductImagesQuery, useUploadProductImageMutation } from "../services/generation";
import type { ProductImage } from "../services/types";
import { AssetRolePicker, SkuRegionEditor } from "./specialized-components";
import { validImageFile, type Region } from "./specialized-workflow";
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

export default function ImageEditForm({ tool, capabilities, locked, onSubmit }: Omit<ToolFormProps, "tool"> & { tool: "watermark" | "translate" | "retouch" }) {
    const id = useId();
    const [images, setImages] = useState<ProductImage[]>([]);
    const [modelChoice, setModelChoice] = useState("");
    const [ratio, setRatio] = useState<ToolWorkflowInput["ratio"]>("1:1");
    const [language, setLanguage] = useState<typeof TOOL_LANGUAGES[number]>("English");
    const [protectSubject, setProtectSubject] = useState(true);
    const [authorized, setAuthorized] = useState(false);
    const [region, setRegion] = useState<Region>();
    const [regionOpen, setRegionOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [instructions, setInstructions] = useState("");
    const [retouchMode, setRetouchMode] = useState<typeof RETOUCH_MODES[number]["id"]>("overall");
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    const settingsTrigger = useRef<HTMLButtonElement>(null);
    const operation = useRef(false);
    const mounted = useRef(true);
    const current = useRef({ images, locked });
    current.current = { images, locked };
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const products = useProductImagesQuery();
    const upload = useUploadProductImageMutation();
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
        }
    }, [products.data, products.isSuccess, products.isPending, products.isFetching, products.isError, pending, upload.isPending]);
    const input: ToolWorkflowInput = { tool, modelId: model?.id ?? "", assetIds: images.map((image) => image.id), instructions: instructions.trim(), count: 1, ratio,
        ...(tool === "watermark" ? { authorized, design: { watermarkRegion: region } } : tool === "retouch" ? { design: { retouchMode } } : { targetLanguage: language, design: { protectSubject } }) };
    const validation = validateToolWorkflow(input);
    const canSubmit = !busy && capable && billing.ready && validation === null;

    function replaceImages(next: ProductImage[], internal = false) {
        if (!mounted.current || current.current.locked || (!internal && (busy || operation.current))) return;
        if (next.length > 1) { setError("每次只能编辑 1 张图片"); return; }
        if (next[0]?.id !== current.current.images[0]?.id) {
            setRegion(undefined); setRegionOpen(false); setAuthorized(false);
            if (next[0]) {
                const sourceRatio = next[0].width / next[0].height;
                const distance = (value: typeof TOOL_RATIOS[number]) => { const [width, height] = value.split(":").map(Number); return width && height ? Math.abs(Math.log(sourceRatio / (width / height))) : Infinity; };
                setRatio(TOOL_RATIOS.reduce((closest, value) => distance(value) < distance(closest) ? value : closest));
            }
        }
        current.current = { ...current.current, images: next };
        setImages(next); setError("");
    }

    async function uploadFiles(files: File[]) {
        const file = files[0];
        if (!file || busy || operation.current || current.current.locked) return;
        if (files.length !== 1 || current.current.images.length) { setError("每次只能编辑 1 张图片，请先移除当前图片"); return; }
        if (!validImageFile(file)) { setError("请选择不超过 10 MiB 的 PNG、JPEG 或 WebP 图片"); return; }
        operation.current = true; setPending(true); setError("");
        const uploadModel = { ...liveModel.current };
        try {
            const image = await upload.mutateAsync(file);
            if (!mounted.current) return;
            if (current.current.locked || liveModel.current.id !== uploadModel.id || liveModel.current.capable !== uploadModel.capable) {
                setError("图片已上传至素材库；当前状态已变化，请稍后重新选择素材"); return;
            }
            replaceImages([image], true);
        } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "上传失败，请稍后重试"); }
        finally { operation.current = false; if (mounted.current) setPending(false); }
    }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy || operation.current || current.current.locked) return;
        if (!canSubmit) { setError(validation || (!capable ? "请选择支持参考图编辑的可用模型" : billing.costText)); return; }
        operation.current = true; setPending(true); setError("");
        try { await onSubmit(input); }
        catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "提交失败，请稍后重试"); }
        finally { operation.current = false; if (mounted.current) setPending(false); }
    }

    return <form className={`ftpl show specialized-form image-edit-form image-edit-${tool}`} aria-label={TOOL_WORKFLOWS[tool].name} data-workflow={tool} onSubmit={submit} noValidate>
        {tool !== "retouch" && <header className="specialized-heading"><h2>{TOOL_WORKFLOWS[tool].name}</h2>{tool === "watermark" ? <Eraser size={22} /> : <Languages size={22} />}</header>}
        {!capable && <p className="specialized-message" role="status">当前模型不可用于参考图编辑，请选择可用模型或联系管理员配置。</p>}
        <fieldset className="specialized-fields" disabled={busy}>
            <section className="specialized-band"><AssetRolePicker label={tool === "retouch" ? "上传图片" : "待编辑图片"} images={images} max={1} disabled={busy} original dropzone={tool === "retouch"} previewRegion={tool === "watermark" ? region : undefined}
                onChange={(next) => replaceImages(next)} onFiles={uploadFiles} /></section>
            {tool === "retouch" && <section className="specialized-band"><h3 id={`${id}-mode-label`}>精修模式</h3><div className="retouch-modes" role="radiogroup" aria-labelledby={`${id}-mode-label`}>
                {RETOUCH_MODES.map((mode) => <label key={mode.id} className="retouch-mode"><input type="radio" name={`${id}-retouch-mode`} value={mode.id} checked={retouchMode === mode.id} aria-label={mode.label} onChange={() => setRetouchMode(mode.id)} /><span>{mode.label}</span></label>)}
            </div></section>}
            {tool === "watermark" ? <section className="specialized-band">
                <div className="specialized-section-heading"><h3>水印区域</h3><div className="image-edit-region-actions">
                    <button type="button" disabled={busy || !images.length} title="区域作为模型编辑参考，不是像素蒙版" onClick={() => setRegionOpen(true)}><Scan size={16} />{region ? "重新框选" : "框选区域"}</button>
                    {region && <button type="button" disabled={busy} title="清除水印区域" aria-label="清除水印区域" onClick={() => setRegion(undefined)}><Trash2 size={16} /></button>}
                </div></div>
                <p className="specialized-note" role="status">{region ? `已选区域 · ${Math.round(region.width * 100)}% × ${Math.round(region.height * 100)}%` : "尚未选择区域"}</p>
                <label className="image-edit-check"><input id={`${id}-rights`} type="checkbox" checked={authorized} onChange={(event) => setAuthorized(event.target.checked)} />我拥有图片权利或已获去水印授权</label>
            </section> : tool === "translate" ? <section className="specialized-band">
                <label className="specialized-field" htmlFor={`${id}-language`}>目标语言<select id={`${id}-language`} aria-label="目标语言" value={language} onChange={(event) => setLanguage(event.target.value as typeof language)}>
                    {TOOL_LANGUAGES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                <label className="image-edit-check" title="保留商品及包装上的文字，仅翻译周边排版文字"><input id={`${id}-protect`} type="checkbox" checked={protectSubject} onChange={(event) => setProtectSubject(event.target.checked)} />保护商品主体</label>
            </section> : null}
            <section className="specialized-band"><label className="specialized-field" htmlFor={`${id}-instructions`}>补充要求（选填）<textarea id={`${id}-instructions`} rows={3} maxLength={1500} value={instructions} onChange={(event) => setInstructions(event.target.value)} /></label></section>
        </fieldset>
        {regionOpen && images[0] && <SkuRegionEditor key={images[0].id} title="框选水印区域" image={images[0]} region={region} disabled={busy}
            onChange={(next) => { if (!busy && !current.current.locked) setRegion(next); }} onClose={() => setRegionOpen(false)} />}
        <footer className="specialized-footer">
            <Popover open={settingsOpen} onOpenChange={setSettingsOpen} modal={false}>
                <PopoverTrigger asChild><button ref={settingsTrigger} type="button" className="image-edit-settings-trigger" disabled={busy}><Settings2 size={16} />高级设置<span>{ratio}</span><ChevronDown size={14} /></button></PopoverTrigger>
                <PopoverContent className="main-settings-popover image-edit-settings" side="top" align="start" sideOffset={8} collisionPadding={12}
                    container={settingsTrigger.current?.closest<HTMLElement>(".studio-app") ?? undefined} aria-label="编辑高级设置">
                    <header><h3>高级设置</h3><button type="button" aria-label="关闭高级设置" title="关闭高级设置" onClick={() => setSettingsOpen(false)}><X size={16} /></button></header>
                    <fieldset disabled={busy}>
                        <label htmlFor={`${id}-model`}>生成模型<select id={`${id}-model`} aria-label="生成模型" value={model?.id ?? ""} onChange={(event) => setModelChoice(event.target.value)}>
                            {!model && <option value="">请选择模型</option>}{model && !capable && <option value={model.id}>{model.name}（不可用）</option>}
                            {models.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                        <label htmlFor={`${id}-ratio`}>图片比例<select id={`${id}-ratio`} aria-label="图片比例" value={ratio} onChange={(event) => setRatio(event.target.value as typeof ratio)}>
                            {TOOL_RATIOS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                    </fieldset>
                </PopoverContent>
            </Popover>
            <div className="specialized-submit-row">{tool !== "retouch" && <span className="specialized-cost" role="status">{billing.costText}</span>}<button type="submit" className="specialized-primary" disabled={!canSubmit}>
                {pending ? <LoaderCircle size={17} /> : tool === "watermark" ? <Eraser size={17} /> : tool === "retouch" ? <Sparkles size={17} /> : <Languages size={17} />}{tool === "watermark" ? "开始去水印" : tool === "retouch" ? "立即生成" : "开始翻译"}{tool === "retouch" && <small>{billing.costText}</small>}</button></div>
        </footer>
        {error && <p className="specialized-message specialized-error" role="alert">{error}</p>}
    </form>;
}