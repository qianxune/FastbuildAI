import { Popover, PopoverContent, PopoverTrigger } from "@buildingai/ui/components/ui/popover";
import { ChevronDown, CirclePlus, LoaderCircle, Pencil, Scan, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { SKU_LIMIT, SKU_REGION_LIMIT, TOOL_RATIOS, validateToolWorkflow, type ToolWorkflowInput } from "../../api/shared/tool-workflow";
import { useGenerationBilling, useProductImagesQuery, useUploadProductImageMutation } from "../services/generation";
import type { ProductImage } from "../services/types";
import { MaterialDialog } from "./material-picker";
import { AssetRolePicker, ProtectedAsset } from "./specialized-components";
import { APPAREL_PREVIEW_IMAGES, apparelModels, apparelSkuInput, assertApparelCatalog } from "./apparel-workflow";
import { buildSpecializedInput, recordWatermarkEdit, referenceLimit, specializedModels, stepWatermarkHistory, validImageFile,
    type WatermarkHistory, type WatermarkMark } from "./specialized-workflow";
import type { ToolFormProps } from "./tool-form";
import { WatermarkCanvas } from "./watermark-editor";
import "../styles/specialized-forms.css";
import "../styles/image-edit-form.css";

type Edit = { instruction: string; image?: ProductImage };
type Variant = { id: string; name: string; edits: Record<string, Edit> };
const emptyHistory = (): WatermarkHistory => ({ marks: [], past: [], future: [] });
const ignore = () => undefined;

export function SkuTemplatePreview({ image, regions, onReady, apparel = false }: { image?: ProductImage; regions: WatermarkMark[]; onReady: (ready: boolean) => void; apparel?: boolean }) {
    return <div className="sku-template-preview" aria-label="SKU 模板预览">{image ?
        <WatermarkCanvas image={image} history={{ marks: regions, past: [], future: [] }} selected="" disabled variant="sku" readOnly
            onSelect={ignore} onChange={ignore} onHistory={ignore} onReady={onReady} /> :
        <div className="sku-template-empty"><figure><img src={apparel ? APPAREL_PREVIEW_IMAGES.apparel_sku : "/extension/image-studio/images/mug-scene.jpg"} alt={apparel ? "服装模板素材示例" : "杯子模板素材示例"} /><figcaption>模板示例</figcaption></figure><h3>{apparel ? "服饰 SKU" : "商品 SKU"}</h3></div>}
    </div>;
}

export function SkuRegionsModal({ image, regions, disabled, onApply, onClose }: {
    image: ProductImage; regions: WatermarkMark[]; disabled: boolean; onApply: (regions: WatermarkMark[]) => void; onClose: () => void;
}) {
    const [history, setHistory] = useState<WatermarkHistory>(() => ({ ...emptyHistory(), marks: regions }));
    const [selected, setSelected] = useState("");
    const [ready, setReady] = useState(false);
    const current = useRef({ disabled, imageId: image.id, mounted: true });
    current.current = { ...current.current, disabled, imageId: image.id };
    useEffect(() => { current.current.mounted = true; return () => { current.current.mounted = false; }; }, []);
    const editable = () => current.current.mounted && !current.current.disabled && current.current.imageId === image.id;
    return <MaterialDialog title="选择变体区域" busy={disabled} onClose={() => { if (editable()) onClose(); }}>
        <div className="sku-region-modal">
            <WatermarkCanvas image={image} history={history} selected={selected} disabled={disabled} variant="sku" onReady={setReady}
                onSelect={(value) => { if (editable()) setSelected(value); }}
                onChange={(marks) => { if (editable() && marks.length <= SKU_REGION_LIMIT) setHistory((value) => recordWatermarkEdit(value, marks)); }}
                onHistory={(direction) => { if (editable()) setHistory((value) => stepWatermarkHistory(value, direction)); }} />
            <footer><span role="status">变体区域 {history.marks.length} / {SKU_REGION_LIMIT}</span>
                <button type="button" onClick={() => { if (editable()) onClose(); }} disabled={disabled}><X size={16} />取消</button>
                <button type="button" className="materials-primary" disabled={disabled || !ready || !history.marks.length}
                    onClick={() => { if (editable() && ready && history.marks.length > 0 && history.marks.length <= SKU_REGION_LIMIT) onApply(history.marks); }}><Scan size={16} />确定</button>
            </footer>
        </div>
    </MaterialDialog>;
}

export default function SkuToolForm({ tool = "sku", capabilities, locked, onSubmit, annotationTarget, onEditSource, taskSnapshot }: Omit<ToolFormProps, "tool"> & { tool?: "sku" | "apparel_sku" }) {
    const apparel = tool === "apparel_sku";
    const id = useId();
    const [template, setTemplate] = useState<ProductImage>();
    const [regions, setRegions] = useState<WatermarkMark[]>([]);
    const [variants, setVariants] = useState<Variant[]>([{ id: "sku-1", name: "SKU 1", edits: {} }]);
    const [modelChoice, setModelChoice] = useState("");
    const [ratio, setRatio] = useState<ToolWorkflowInput["ratio"]>("1:1");
    const [instructions, setInstructions] = useState("");
    const [regionOpen, setRegionOpen] = useState(false);
    const [advanced, setAdvanced] = useState(false);
    const [ready, setReady] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    const nextVariant = useRef(2);
    const replacementInput = useRef<HTMLInputElement>(null);
    const operation = useRef(false);
    const mounted = useRef(true);
    const restored = useRef<string | undefined>(undefined);
    const [loadedReferences, setLoadedReferences] = useState<Set<string>>(() => new Set());
    const referenceReadiness = useRef(new Map<string, (ready: boolean) => void>());
    const current = useRef({ template, regions, variants, locked });
    current.current = { template, regions, variants, locked };
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const products = useProductImagesQuery();
    const upload = useUploadProductImageMutation();
    const references = [...new Map(variants.flatMap((variant) => regions.flatMap((region) => {
        const image = variant.edits[region.id]?.image;
        return image ? [[image.id, image] as const] : [];
    }))).values()];
    const models = apparel ? apparelModels(capabilities, "apparel_sku", (template ? 1 : 0) + references.length)
        : specializedModels(capabilities, "sku", (template ? 1 : 0) + references.length);
    const model = modelChoice ? capabilities.models.find((value) => value.id === modelChoice) : models[0];
    const capable = Boolean(model && models.some((value) => value.id === model.id));
    const limit = referenceLimit(model);
    const liveModel = useRef({ id: model?.id, limit, capable });
    liveModel.current = { id: model?.id, limit, capable };
    const billing = useGenerationBilling(model?.id ?? "", variants.length, !locked && capable, tool);
    const busy = locked || pending || upload.isPending;
    const liveBusy = useRef(busy); liveBusy.current = busy;
    const editable = () => mounted.current && !current.current.locked && !operation.current && !liveBusy.current;

    useEffect(() => {
        if (!apparel || !taskSnapshot || taskSnapshot.toolKey !== tool || restored.current === taskSnapshot.id || operation.current || pending
            || !products.isSuccess || products.isFetching || products.isError) return;
        restored.current = taskSnapshot.id;
        const saved = taskSnapshot.toolInput;
        if (!saved || saved.tool !== tool || validateToolWorkflow(saved) || !saved.design?.skuRegions || !saved.design.skuVariants) {
            setError("历史服饰 SKU 参数无效，结果仍可查看"); return;
        }
        const lookup = (imageId: string): ProductImage => products.data?.find((image) => image.id === imageId)
            ?? { id: imageId, name: "图片不可用", width: 0, height: 0, mediaType: "image/png", size: 0 };
        const nextTemplate = lookup(saved.assetIds[0]!);
        const nextRegions = saved.design.skuRegions.map((region) => ({ ...region, region: { ...region.region } }));
        const nextVariants = saved.design.skuVariants.map((variant, index) => ({ id: `sku-${index + 1}`, name: variant.name,
            edits: Object.fromEntries((variant.edits ?? []).map((edit) => [edit.regionId, { instruction: edit.instruction,
                ...(edit.referenceAssetId ? { image: lookup(edit.referenceAssetId) } : {}) }])) }));
        current.current = { ...current.current, template: nextTemplate, regions: nextRegions, variants: nextVariants };
        setTemplate(nextTemplate); setRegions(nextRegions); setVariants(nextVariants); nextVariant.current = nextVariants.length + 1;
        setModelChoice(saved.modelId); setRatio(saved.ratio); setInstructions(saved.instructions ?? ""); setReady(false); setRegionOpen(false); setError("");
    }, [apparel, tool, taskSnapshot, products.data, products.isSuccess, products.isFetching, products.isError, pending]);

    useEffect(() => {
        if (apparel) return;
        if (!products.isSuccess || products.isPending || products.isFetching || products.isError || !products.data || pending || upload.isPending || operation.current) return;
        const ids = new Set(products.data.map((image) => image.id));
        const live = current.current;
        if (live.template && !ids.has(live.template.id)) {
            setTemplate(undefined); setRegions([]); setRegionOpen(false); setReady(false);
            setVariants((values) => values.map((variant) => ({ ...variant, edits: {} })));
            onEditSource?.();
        } else if (live.variants.some((variant) => Object.values(variant.edits).some((edit) => edit.image && !ids.has(edit.image.id)))) {
            setVariants((values) => values.map((variant) => ({ ...variant, edits: Object.fromEntries(Object.entries(variant.edits).map(([key, edit]) =>
                [key, edit.image && !ids.has(edit.image.id) ? { instruction: edit.instruction } : edit])) })));
            onEditSource?.();
        }
    }, [apparel, products.data, products.isSuccess, products.isPending, products.isFetching, products.isError, pending, upload.isPending, onEditSource]);

    let input: ToolWorkflowInput | undefined;
    let validation = "";
    try {
        input = buildSpecializedInput({ tool: "sku", modelId: model?.id ?? "", primary: template ? [template.id] : [], references: references.map((image) => image.id),
            productName: "", brand: "", platform: "淘宝", language: "简体中文", description: "", instructions, count: variants.length, ratio, modules: [], outputModules: [], replicaMode: "style", fusionPreset: "",
            skuRegions: regions.map(({ id: regionId, region }) => ({ id: regionId, region })),
            skuVariants: variants.map((variant) => ({ name: variant.name, instruction: "", edits: regions.map((region) => ({ regionId: region.id,
                instruction: variant.edits[region.id]?.instruction ?? "", ...(variant.edits[region.id]?.image ? { referenceAssetId: variant.edits[region.id]!.image!.id } : {}) })) })) }, limit);
        if (apparel) {
            input = apparelSkuInput(input);
            if (!products.isSuccess || products.isFetching || products.isError) throw new Error("请等待素材目录加载完成");
            assertApparelCatalog(input, [], products.data ?? []);
        }
    } catch (failure) { input = undefined; validation = failure instanceof Error ? failure.message : "请检查 SKU 输入"; }
    const canSubmit = !busy && capable && billing.ready && ready && Boolean(input)
        && (!apparel || references.every((image) => loadedReferences.has(image.id)));
    const submission = useRef({ input, canSubmit, validation }); submission.current = { input, canSubmit, validation };
    const costLabel = billing.quote?.isSuccess && !billing.insufficient ? `本次消耗${billing.quote.data.total}积分` : billing.costText;

    function changeTemplate(images: ProductImage[], internal = false) {
        if ((!internal && !editable()) || !mounted.current || current.current.locked) return false;
        if (images.length > 1 || (images.length && !liveModel.current.limit)) { setError("请选择一张 SKU 模板图"); return false; }
        if (model) setModelChoice(model.id);
        const image = images[0];
        if (image?.id !== current.current.template?.id) {
            current.current = { ...current.current, template: image, regions: [], variants: current.current.variants.map((variant) => ({ ...variant, edits: {} })) };
            setTemplate(image); setRegions([]); setVariants(current.current.variants); setReady(false); onEditSource?.();
        }
        setRegionOpen(Boolean(image));
        setError(""); return true;
    }

    function updateVariant(variantId: string, change: (variant: Variant) => Variant, internal = false) {
        if ((!internal && !editable()) || !mounted.current || current.current.locked) return;
        const values = current.current.variants.map((variant) => variant.id === variantId ? change(variant) : variant);
        current.current = { ...current.current, variants: values }; setVariants(values); setError(""); onEditSource?.();
    }

    function changeReference(variantId: string, regionId: string, images: ProductImage[], internal = false) {
        if ((!internal && !editable()) || !mounted.current || current.current.locked || images.length > 1 || !current.current.regions.some((region) => region.id === regionId)
            || !current.current.variants.some((variant) => variant.id === variantId)) return false;
        const image = images[0];
        if (image?.id === current.current.template?.id) { setError("模板图不能同时作为变体参考图"); return false; }
        const values = current.current.variants.map((variant) => variant.id === variantId ? { ...variant, edits: { ...variant.edits,
            [regionId]: { ...variant.edits[regionId], instruction: variant.edits[regionId]?.instruction ?? "", image } } } : variant);
        const selected = new Set(values.flatMap((variant) => Object.values(variant.edits).flatMap((edit) => edit.image ? [edit.image.id] : [])));
        if (image && selected.size + 1 > liveModel.current.limit) { setError(`当前模型最多支持 ${liveModel.current.limit} 张参考图（含模板图）`); return false; }
        if (model) setModelChoice(model.id);
        current.current = { ...current.current, variants: values }; setVariants(values); setError(""); onEditSource?.(); return true;
    }

    async function uploadFiles(files: File[], target?: { variantId: string; regionId: string }, replace = false) {
        if (!files.length || !editable()) return;
        const file = files[0];
        if (files.length !== 1 || !file || !validImageFile(file)) { setError("请选择一张不超过 10 MiB 的 PNG、JPEG 或 WebP 图片"); return; }
        if (!target && template && !replace) { setError("模板图最多一张，请使用重新上传"); return; }
        if (!model || !capable) { setError("请选择可用的参考图编辑模型"); return; }
        if (apparel && (!products.isSuccess || products.isFetching || products.isError)) {
            setError("请等待素材目录加载完成后重试"); return;
        }
        operation.current = true; setPending(true); setError("");
        const modelId = model.id, imageId = template?.id;
        try {
            const image = await upload.mutateAsync(file);
            if (!mounted.current) return;
            if (current.current.locked || liveModel.current.id !== modelId || !liveModel.current.capable || current.current.template?.id !== imageId) {
                setError("图片已上传至素材库；当前状态已变化，请重新选择素材"); return;
            }
            if (target) changeReference(target.variantId, target.regionId, [image], true);
            else changeTemplate([image], true);
        } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "上传失败，请稍后重试"); }
        finally { operation.current = false; if (mounted.current) setPending(false); }
    }

    function applyRegions(marks: WatermarkMark[]) {
        if (!editable() || !template || current.current.template?.id !== template.id || !marks.length || marks.length > SKU_REGION_LIMIT) return;
        const values = current.current.variants.map((variant) => ({ ...variant, edits: Object.fromEntries(marks.map((mark) => [mark.id, variant.edits[mark.id] ?? { instruction: "" }])) }));
        current.current = { ...current.current, regions: marks, variants: values }; setRegions(marks); setVariants(values); setRegionOpen(false); setError(""); onEditSource?.();
    }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!editable()) return;
        const latest = submission.current;
        if (!latest.canSubmit || !latest.input) { setError(latest.validation || "请等待参考图加载并检查费用"); return; }
        operation.current = true; setPending(true); setError("");
        try { await onSubmit(latest.input); }
        catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "提交失败，请稍后重试"); }
        finally { operation.current = false; if (mounted.current) setPending(false); }
    }

    const preview = <><SkuTemplatePreview image={template} regions={regions} onReady={setReady} apparel={apparel} />
        {apparel && references.length > 0 && <section className="apparel-originals" aria-label="SKU 区域参考预览">{references.map((image) => {
            if (!referenceReadiness.current.has(image.id)) referenceReadiness.current.set(image.id, (loaded) => {
                if (mounted.current) setLoadedReferences((previous) => { const next = new Set(previous); if (loaded) next.add(image.id); else next.delete(image.id); return next; });
            });
            return <figure key={image.id}><ProtectedAsset image={image} original available={image.width > 0 && image.height > 0} onReady={referenceReadiness.current.get(image.id)} /><figcaption>区域参考</figcaption></figure>;
        })}</section>}</>;
    return <form className="ftpl show specialized-form specialized-sku sku-form" aria-label={apparel ? "服饰SKU变体" : "商品SKU图"} data-workflow={tool} onSubmit={submit} noValidate>
        {!capable && <p className="specialized-message" role="status">{modelChoice ? "所选模型不支持当前输入，已选素材已保留。" : "当前没有可用的 SKU 图片模型。"}</p>}
        <fieldset className="specialized-fields" disabled={busy}>
            <section className="specialized-band sku-template-section">
                <AssetRolePicker appearance="links" label="SKU 模板图" title="SKU模板图" images={template ? [template] : []} max={Math.min(1, limit)} disabled={busy} dropzone
                    description={apparel ? undefined : <p className="sku-hint">选一张结构最完整的成品图作为模板，框选要跟随SKU变动的区域，最多支持{SKU_REGION_LIMIT}个SKU变体区域</p>}
                    onChange={changeTemplate} onFiles={(files) => uploadFiles(files)} />
                {template && <div className="sku-template-actions">
                    <button type="button" disabled={busy} onClick={() => { if (editable()) { onEditSource?.(); setRegionOpen(true); } }}>重新编辑</button>
                    <button type="button" className="sku-muted-button" disabled={busy || !capable} onClick={() => replacementInput.current?.click()}>重新上传</button>
                </div>}
                <input ref={replacementInput} type="file" hidden accept="image/png,image/jpeg,image/webp" aria-label="重新上传 SKU 模板图" disabled={busy || !capable}
                    onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void uploadFiles(files, undefined, true); }} />
            </section>
            <section className="sku-list-section" aria-label="SKU 清单">
                <div className="sku-list-heading"><h3>SKU清单（{variants.length}/{SKU_LIMIT}）</h3>
                    <button type="button" className="sku-add" aria-label="添加 SKU" disabled={busy || !template || !regions.length || variants.length >= SKU_LIMIT} onClick={() => {
                        if (!editable() || !current.current.template || !current.current.regions.length || current.current.variants.length >= SKU_LIMIT) return;
                        const sequence = nextVariant.current++;
                        const values = [...current.current.variants, { id: `sku-${sequence}`, name: `SKU ${sequence}`, edits: Object.fromEntries(regions.map((region) => [region.id, { instruction: "" }])) }];
                        current.current = { ...current.current, variants: values }; setVariants(values); onEditSource?.();
                    }}><CirclePlus size={16} />添加SKU</button>
                </div>
                {variants.map((variant, index) => ({ variant, index })).reverse().map(({ variant, index }) => <article key={variant.id} className="sku-variant" data-variant-id={variant.id}>
                    <div className="sku-variant-heading"><label className="sku-name" title="点击修改名称"><input aria-label={`SKU ${index + 1} 名称`} maxLength={60} value={variant.name}
                        onChange={(event) => updateVariant(variant.id, (value) => ({ ...value, name: event.target.value }))} /><Pencil size={15} aria-hidden="true" /></label>
                        <button type="button" className="sku-icon-button" title={`删除 SKU ${index + 1}`} aria-label={`删除 SKU ${index + 1}`} disabled={busy || variants.length === 1} onClick={() => {
                            if (!editable() || current.current.variants.length === 1) return;
                            const values = current.current.variants.filter((value) => value.id !== variant.id);
                            current.current = { ...current.current, variants: values }; setVariants(values); onEditSource?.();
                        }}><Trash2 size={16} /></button>
                    </div>
                    {!regions.length && <button type="button" className="sku-pick-region" disabled={busy || !template} onClick={() => { if (editable()) { onEditSource?.(); setRegionOpen(true); } }}><Scan size={16} />选择变体区域</button>}
                    {regions.map((region, regionIndex) => {
                        const edit = variant.edits[region.id] ?? { instruction: "" };
                        const label = `SKU ${index + 1} 变体区域 ${regionIndex + 1}`;
                        return <div key={region.id} className="sku-region-edit" data-region-id={region.id}>
                            <AssetRolePicker appearance="links" uploadLink label={label} title={<><span className="sku-region-dot" aria-hidden="true" />变体区域{regionIndex + 1}</>}
                                images={edit.image ? [edit.image] : []} max={limit > 1 ? 1 : 0} disabled={busy} allowReplacement
                                onChange={(images) => changeReference(variant.id, region.id, images)} onFiles={(files) => uploadFiles(files, { variantId: variant.id, regionId: region.id })} />
                            <textarea aria-label={`${label} 变化要求`} placeholder="文字说明（选填），如：改为绿色" rows={1} maxLength={300} value={edit.instruction}
                                onChange={(event) => updateVariant(variant.id, (value) => ({ ...value, edits: { ...value.edits, [region.id]: { ...edit, instruction: event.target.value } } }))} />
                            {apparel && <label className="apparel-color">区域颜色<input type="color" aria-label={`${label} 颜色`} disabled={busy}
                                value={edit.instruction.match(/#[0-9a-f]{6}/i)?.[0] ?? "#000000"} onChange={(event) => {
                                    const color = event.target.value;
                                    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
                                    updateVariant(variant.id, (value) => {
                                        const previous = value.edits[region.id] ?? { instruction: "" };
                                        const text = previous.instruction.replace(/(?:^|\n)区域颜色：#[0-9a-f]{6}/gi, "");
                                        const instruction = `${text}${text ? "\n" : ""}区域颜色：${color.toUpperCase()}`;
                                        return instruction.length <= 300 ? { ...value, edits: { ...value.edits, [region.id]: { ...previous, instruction } } } : value;
                                    });
                                }} /></label>}
                        </div>;
                    })}
                </article>)}
            </section>
        </fieldset>
        {regionOpen && template && <SkuRegionsModal key={template.id} image={template} regions={regions} disabled={busy} onApply={applyRegions} onClose={() => { if (editable()) setRegionOpen(false); }} />}
        {annotationTarget ? createPortal(preview, annotationTarget) : annotationTarget === undefined ? preview : null}
        <footer className="specialized-footer sku-footer">
            <Popover modal={false} open={advanced && !busy} onOpenChange={(open) => { if (editable()) setAdvanced(open); }}>
                <PopoverTrigger asChild><button type="button" className="sku-settings-trigger" disabled={busy}><span className="sku-settings-label">高级设置</span>
                    <span className="sku-chip">比例 {ratio}</span><span className="sku-chip">画质 2K</span><ChevronDown size={16} /></button></PopoverTrigger>
                <PopoverContent className="sku-settings-popover" side="top" align="end" sideOffset={8} collisionPadding={12}>
                    <fieldset className="specialized-fields" disabled={busy}>
                        <label>生成模型<select aria-label="SKU 生成模型" value={model?.id ?? ""} onChange={(event) => { if (editable()) setModelChoice(event.target.value); }}>
                            {!model && <option value="">没有可用模型</option>}{model && !capable && <option value={model.id}>{model.name}（不支持当前输入）</option>}
                            {models.map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
                        <div className="sku-ratio-options" role="group" aria-label="SKU 图片比例">{TOOL_RATIOS.map((value) => <label key={value}>
                            <input type="radio" name={`${id}-ratio`} aria-label={`SKU 比例 ${value}`} checked={ratio === value} onChange={() => { if (editable()) { setRatio(value); onEditSource?.(); } }} /><span>{value}</span></label>)}</div>
                        <p className="sku-quality-note">画质：2K（当前模型固定输出）</p>
                        <label className="specialized-field" htmlFor={`${id}-instructions`}>补充要求<textarea id={`${id}-instructions`} rows={2} maxLength={1500} value={instructions}
                            onChange={(event) => { if (editable()) { setInstructions(event.target.value); onEditSource?.(); } }} /></label>
                    </fieldset>
                </PopoverContent>
            </Popover>
            {validation && <p className="specialized-validation" role="status">{validation}</p>}
            <button type="submit" className="specialized-primary sku-submit" disabled={!canSubmit}>{pending && <LoaderCircle size={17} />}<strong>生成SKU图 × {variants.length}</strong>
                <small role="status">{costLabel}</small></button>
        </footer>
        {error && <p className="specialized-message specialized-error" role="alert">{error}</p>}
    </form>;
}