import { FolderOpen, LoaderCircle, RefreshCw, Search, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { APPAREL_WORKFLOWS, NAIL_HAND_STYLES, OUTFIT_STYLES, TRYON_SCENES, UGC_OUTFIT_SCENES, UGC_OUTFIT_STYLES, type ApparelToolKey } from "../../api/shared/apparel-workflow";
import { TOOL_PLATFORMS, TOOL_RATIOS } from "../../api/shared/tool-workflow";
import { useAssetsQuery } from "../services/assets";
import { useGenerationBilling, useProductImagesQuery, useUploadProductImageMutation } from "../services/generation";
import type { ProductImage } from "../services/types";
import { APPAREL_PREVIEW_IMAGES, apparelModels, apparelNeedsModel, buildApparelInput, createApparelDraft, readableApparelImage, restoreApparelDraft, savedModelCatalog, type ApparelDraft } from "./apparel-workflow";
import { MaterialDialog } from "./material-picker";
import { AssetRolePicker, ProtectedAsset } from "./specialized-components";
import { referenceLimit, validImageFile } from "./specialized-workflow";
import type { ToolFormProps } from "./tool-form";
import { TOOL_LABELS } from "./workspace-navigation";
import "../styles/specialized-forms.css";

export function ModelAssetPicker({ value, disabled, onChange, onOpenAssets }: {
    value?: ApparelDraft["target"]; disabled: boolean; onChange: (target?: ApparelDraft["target"]) => void; onOpenAssets?: () => void;
}) {
    const assets = useAssetsQuery(), products = useProductImagesQuery();
    const [open, setOpen] = useState(false), [search, setSearch] = useState("");
    const live = useRef({ disabled, onChange, onOpenAssets }); live.current = { disabled, onChange, onOpenAssets };
    const trigger = useRef<HTMLButtonElement>(null);
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const editable = () => mounted.current && !live.current.disabled;
    const rows = savedModelCatalog(assets.data?.items ?? [], products.data ?? []);
    const selected = rows.find(({ asset, image }) => asset.id === value?.modelAssetId && image.id === value?.modelImageId);
    const failed = assets.isError || products.isError;
    const settled = assets.isSuccess && products.isSuccess && !assets.isFetching && !products.isFetching && !failed;
    const currentCatalog = useRef({ rows, settled }); currentCatalog.current = { rows, settled };
    const filtered = rows.filter(({ asset }) => asset.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
    const close = () => { setOpen(false); trigger.current?.focus(); };
    return <section className="apparel-model-picker" aria-label="目标模特">
        <h3>目标模特</h3>
        <div className="apparel-model-selection">
            {selected && settled && <span className="apparel-model-thumbnail"><ProtectedAsset image={selected.image} /></span>}
            <span>{selected?.asset.name || (value ? "已选模特不可用" : "未选择模特")}</span>
            <button ref={trigger} type="button" disabled={disabled} aria-expanded={open} onClick={() => { if (editable()) setOpen(true); }}><UserRound size={16} />我的模特</button>
            {value && <button type="button" title="移除目标模特" aria-label="移除目标模特" disabled={disabled}
                onClick={() => { if (editable()) live.current.onChange(undefined); }}><X size={16} /></button>}
        </div>
        {open && <MaterialDialog title="我的模特" busy={disabled} onClose={close}>
            <label className="apparel-model-search"><Search size={16} /><input type="search" aria-label="搜索我的模特" placeholder="搜索模特名称" maxLength={120} value={search} disabled={disabled}
                onChange={(event) => { if (editable()) setSearch(event.target.value); }} /></label>
            {failed ? <p role="alert">模特目录加载失败<button type="button" disabled={disabled || assets.isFetching || products.isFetching}
                onClick={() => { if (editable()) { void assets.refetch(); void products.refetch(); } }}><RefreshCw size={16} />重试</button></p>
                : !settled ? <p role="status"><LoaderCircle size={18} />正在加载我的模特</p>
                : <div className="apparel-model-grid">{filtered.map(({ asset, image }) =>
                    <button type="button" key={asset.id} aria-label={`选择模特 ${asset.name}`} aria-pressed={selected?.asset.id === asset.id} disabled={disabled}
                        onClick={() => { if (editable() && currentCatalog.current.settled && currentCatalog.current.rows.some((row) => row.asset.id === asset.id && row.image.id === image.id)) {
                            live.current.onChange({ modelAssetId: asset.id, modelImageId: image.id }); close();
                        } }}>
                        <span className="apparel-model-photo"><ProtectedAsset image={image} /></span><strong>{asset.name}</strong>
                    </button>)}</div>}
            {settled && !rows.length && <p role="status">暂无可用的我的模特</p>}
            {settled && rows.length > 0 && !filtered.length && <p role="status">没有匹配的模特</p>}
            <button type="button" disabled={disabled || !onOpenAssets} onClick={() => { if (editable() && live.current.onOpenAssets) { close(); live.current.onOpenAssets(); } }}><FolderOpen size={16} />资产库</button>
        </MaterialDialog>}
    </section>;
}

const SOURCE_LABELS: Record<Exclude<ApparelToolKey, "apparel_sku">, string> = {
    tryon: "服装参考图", model_swap: "原模特穿着图", outfit: "服饰图片", fabric: "材料参考图",
    ugc_outfit: "穿搭服饰图", nail_tryon: "美甲参考图", dewrinkle: "服装原图",
};

export default function ApparelToolForm({ tool, capabilities, locked, defaultCount, taskSnapshot, annotationTarget, onEditSource, onSubmit, onOpenAssets }: Omit<ToolFormProps, "tool"> & { tool: Exclude<ApparelToolKey, "apparel_sku"> }) {
    const [draft, setDraft] = useState(() => createApparelDraft(tool, defaultCount));
    const [pending, setPending] = useState(false), [error, setError] = useState("");
    const [loadedIds, setLoadedIds] = useState<Set<string>>(() => new Set());
    const operation = useRef(false), mounted = useRef(true), restored = useRef<string | undefined>(undefined);
    const products = useProductImagesQuery(), assets = useAssetsQuery(), upload = useUploadProductImageMutation();
    const current = useRef({ draft, locked, externalLocked: locked, products, assets, capable: false, modelId: "", limit: 0 });
    const selectedIds = [...draft.sourceAssetIds, ...(apparelNeedsModel(draft) && draft.target ? [draft.target.modelImageId] : []), ...(tool === "fabric" && draft.styleAssetId ? [draft.styleAssetId] : [])];
    const models = apparelModels(capabilities, tool, selectedIds.length);
    const model = draft.modelId ? capabilities.models.find((item) => item.id === draft.modelId) : models[0];
    const capable = Boolean(model && models.some((item) => item.id === model.id));
    const limit = referenceLimit(model);
    const busy = locked || pending || upload.isPending;
    current.current = { draft, locked: busy, externalLocked: locked, products, assets, capable, modelId: model?.id ?? "", limit };
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    useEffect(() => {
        if (!taskSnapshot || taskSnapshot.toolKey !== tool || restored.current === taskSnapshot.id || operation.current || pending) return;
        restored.current = taskSnapshot.id;
        try { const next = restoreApparelDraft(taskSnapshot, tool); current.current.draft = next; setDraft(next); setError(""); }
        catch (failure) { setError(failure instanceof Error ? failure.message : "历史参数无法恢复"); }
    }, [taskSnapshot, tool, pending]);
    const editable = () => mounted.current && !current.current.locked && !operation.current;
    const catalogReady = products.isSuccess && !products.isFetching && !products.isError
        && (!apparelNeedsModel(draft) || (assets.isSuccess && !assets.isFetching && !assets.isError));
    const billing = useGenerationBilling(model?.id ?? "", draft.count, !busy && capable);
    const readiness = useRef(new Map<string, (ready: boolean) => void>());
    function imageReady(id: string) {
        if (!readiness.current.has(id)) readiness.current.set(id, (ready) => {
            if (mounted.current) setLoadedIds((previous) => { const next = new Set(previous); if (ready) next.add(id); else next.delete(id); return next; });
        });
        return readiness.current.get(id)!;
    }
    const imageFor = (id: string): ProductImage => products.data?.find((image) => image.id === id)
        ?? { id, name: "图片不可用", mediaType: "image/png", width: 0, height: 0, size: 0 };
    let input: ReturnType<typeof buildApparelInput> | undefined, validation = "";
    try {
        if (!catalogReady) throw new Error("请等待素材与模特目录加载完成");
        input = buildApparelInput({ ...draft, modelId: model?.id ?? "" }, capabilities, assets.data?.items ?? [], products.data ?? []);
    } catch (failure) { validation = failure instanceof Error ? failure.message : "请检查服饰输入"; }
    const canSubmit = !busy && Boolean(input) && capable && billing.ready && selectedIds.every((id) => loadedIds.has(id));
    const submission = useRef({ canSubmit, input, validation, capabilities, catalogReady });
    submission.current = { canSubmit, input, validation, capabilities, catalogReady };

    function change(update: Partial<ApparelDraft>, internal = false) {
        if ((!internal && !editable()) || !mounted.current || current.current.externalLocked) return false;
        const next = { ...current.current.draft, ...update, modelId: update.modelId ?? current.current.modelId };
        const ids = [...next.sourceAssetIds, ...(apparelNeedsModel(next) && next.target ? [next.target.modelImageId] : []), ...(tool === "fabric" && next.styleAssetId ? [next.styleAssetId] : [])];
        const previous = current.current.draft;
        const previousIds = [...previous.sourceAssetIds, ...(apparelNeedsModel(previous) && previous.target ? [previous.target.modelImageId] : []), ...(tool === "fabric" && previous.styleAssetId ? [previous.styleAssetId] : [])];
        const adding = ids.some((id) => !previousIds.includes(id));
        if (new Set(ids.map((id) => id.toLowerCase())).size !== ids.length || next.sourceAssetIds.length > APPAREL_WORKFLOWS[tool].maxSources
            || (adding && ids.length > current.current.limit)) { setError("素材角色重复或超出当前模型参考图上限"); return false; }
        current.current.draft = next; setDraft(next); setError(""); onEditSource?.(); return true;
    }

    async function uploadFiles(files: File[], role: "source" | "style") {
        if (!files.length || !editable()) return;
        const live = current.current;
        const remaining = role === "style" ? 1 : APPAREL_WORKFLOWS[tool].maxSources - live.draft.sourceAssetIds.length;
        if (!submission.current.catalogReady || !live.capable || files.some((file) => !validImageFile(file)) || files.length > remaining
            || selectedIds.length - (role === "style" && draft.styleAssetId ? 1 : 0) + files.length > live.limit) {
            setError("请检查图片格式、素材目录、角色上限与模型容量"); return;
        }
        operation.current = true; setPending(true); setError("");
        const draftAtStart = live.draft, modelId = live.modelId;
        const uploaded: ProductImage[] = [];
        try {
            for (const file of files) {
                const image = await upload.mutateAsync(file); uploaded.push(image);
                if (!mounted.current) return;
                if (current.current.externalLocked || current.current.modelId !== modelId || !current.current.capable || current.current.draft !== draftAtStart) {
                    setError("图片已上传至素材库；当前状态已变化，请重新选择素材"); return;
                }
            }
            if (!mounted.current || current.current.externalLocked) return;
            const update = role === "style" ? { styleAssetId: uploaded[0]!.id } : { sourceAssetIds: [...draftAtStart.sourceAssetIds, ...uploaded.map((image) => image.id)] };
            change(update, true);
        } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "上传失败；已上传的图片保留在素材库"); }
        finally { operation.current = false; if (mounted.current) setPending(false); }
    }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!editable()) return;
        if (!submission.current.canSubmit || !submission.current.input) { setError(submission.current.validation || "请等待参考图片加载并检查费用"); return; }
        const live = current.current;
        try {
            const checked = buildApparelInput({ ...live.draft, modelId: live.modelId }, submission.current.capabilities, live.assets.data?.items ?? [], live.products.data ?? []);
            operation.current = true; setPending(true); setError(""); await onSubmit(checked);
        } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "提交失败"); }
        finally { operation.current = false; if (mounted.current) setPending(false); }
    }

    const sourceLabel = SOURCE_LABELS[tool];
    const select = (label: string, field: "scene" | "style", options: readonly string[]) => <label className="specialized-field">{label}<select aria-label={label} value={draft[field]}
        onChange={(event) => change({ [field]: event.target.value })}>{options.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>;
    const originals = <section className="apparel-originals" aria-label="输入参考预览">{selectedIds.length ? selectedIds.map((id) => <figure key={id}>
        <ProtectedAsset image={imageFor(id)} original available={readableApparelImage(imageFor(id))} onReady={imageReady(id)} /><figcaption>{id === draft.target?.modelImageId ? "目标模特" : id === draft.styleAssetId ? "款式参考" : "原始参考"}</figcaption></figure>)
        : <figure className="apparel-input-example"><img src={APPAREL_PREVIEW_IMAGES[tool]} alt={`${TOOL_LABELS[tool]}素材示例`} loading="lazy" referrerPolicy="no-referrer" /><figcaption>素材示例</figcaption></figure>}</section>;
    return <form className={`ftpl show specialized-form apparel-form apparel-${tool}`} aria-label={TOOL_LABELS[tool]} data-workflow={tool} onSubmit={submit} noValidate>
        <fieldset className="specialized-fields" disabled={busy}>
            <section className="specialized-band"><AssetRolePicker label={sourceLabel} images={draft.sourceAssetIds.map(imageFor)} max={Math.min(APPAREL_WORKFLOWS[tool].maxSources, limit)} disabled={busy} dropzone appearance="links"
                onChange={(images) => change({ sourceAssetIds: images.map((image) => image.id) })} onFiles={(files) => uploadFiles(files, "source")} /></section>
            {tool === "fabric" && <section className="specialized-band">
                <label className="specialized-field">服装类别<input aria-label="服装类别" maxLength={60} value={draft.category} onChange={(event) => change({ category: event.target.value })} /></label>
                <label className="specialized-field">服装结构要求<textarea aria-label="服装结构要求" maxLength={1500} rows={3} value={draft.garmentDescription} onChange={(event) => change({ garmentDescription: event.target.value })} /></label>
                <div className="apparel-modes" role="group" aria-label="输出方式">{(["flat", "worn"] as const).map((mode) => <label key={mode}><input type="radio" name={`${tool}-mode`} checked={draft.outputMode === mode}
                    aria-label={mode === "flat" ? "平铺成衣" : "指定模特穿着"} onChange={() => change({ outputMode: mode, ...(mode === "flat" ? { target: undefined } : {}) })} />{mode === "flat" ? "平铺成衣" : "指定模特穿着"}</label>)}</div>
                <AssetRolePicker label="款式参考图" images={draft.styleAssetId ? [imageFor(draft.styleAssetId)] : []} max={Math.min(1, limit)} disabled={busy} allowReplacement
                    onChange={(images) => change({ styleAssetId: images[0]?.id })} onFiles={(files) => uploadFiles(files, "style")} />
            </section>}
            {apparelNeedsModel(draft) && <ModelAssetPicker value={draft.target} disabled={busy} onChange={(target) => change({ target })} onOpenAssets={onOpenAssets} />}
            <section className="specialized-band specialized-grid">
                {tool === "tryon" && select("试穿场景", "scene", TRYON_SCENES)}
                {tool === "ugc_outfit" && select("穿搭场景", "scene", UGC_OUTFIT_SCENES)}
                {(tool === "outfit" || tool === "ugc_outfit") && select("模特风格", "style", tool === "outfit" ? OUTFIT_STYLES : UGC_OUTFIT_STYLES)}
                {tool === "nail_tryon" && select("手部风格", "style", NAIL_HAND_STYLES)}
                {tool === "outfit" && <label className="specialized-field">平台<select aria-label="平台" value={draft.platform} onChange={(event) => change({ platform: event.target.value as ApparelDraft["platform"] })}>{TOOL_PLATFORMS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}
                <label className="specialized-field">补充要求<textarea aria-label="补充要求" maxLength={1500} rows={3} value={draft.instructions} onChange={(event) => change({ instructions: event.target.value })} /></label>
            </section>
            {annotationTarget === undefined && originals}
            <section className="specialized-band specialized-grid">
                <label className="specialized-field">生成模型<select aria-label="生成模型" value={model?.id ?? ""} onChange={(event) => change({ modelId: event.target.value })}>
                    {!model && <option value="">没有可用模型</option>}{model && !capable && <option value={model.id}>{model.name}（不支持当前输入）</option>}{models.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label className="specialized-field">图片比例<select aria-label="图片比例" value={draft.ratio} onChange={(event) => change({ ratio: event.target.value as ApparelDraft["ratio"] })}>{TOOL_RATIOS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                {tool !== "dewrinkle" && <label className="specialized-field">生成数量<input type="number" aria-label="生成数量" min={1} max={4} value={draft.count} onChange={(event) => change({ count: Number(event.target.value) })} /></label>}
            </section>
        </fieldset>
        {!capable && <p className="specialized-message" role="status">当前模型不支持所选素材，已选图片已保留。</p>}
        {(products.isError || (apparelNeedsModel(draft) && assets.isError)) && <button type="button" disabled={busy} onClick={() => { if (editable()) { void products.refetch(); if (apparelNeedsModel(draft)) void assets.refetch(); } }}><RefreshCw size={16} />重新加载目录</button>}
        <footer className="specialized-footer"><p className="specialized-validation" role="status">{validation}</p><div className="specialized-submit-row"><span role="status">{billing.costText}</span>
            <button type="submit" className="specialized-primary" disabled={!canSubmit}>{pending && <LoaderCircle size={17} />}生成图片{tool === "dewrinkle" ? " × 1" : ` × ${draft.count}`}</button></div></footer>
        {error && <p className="specialized-message specialized-error" role="alert">{error}</p>}
        {annotationTarget && createPortal(originals, annotationTarget)}
    </form>;
}