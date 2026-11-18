import { Check, Eye, FolderOpen, Image as ImageIcon, Pencil, Plus, RefreshCw, Search, SlidersHorizontal, Sparkles, Trash2, Upload, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { validateCreativeAsset, type CreativeAsset, type CreativeAssetKind } from "../../api/shared/assets";
import { useAssetsQuery, useDeleteAssetMutation, useOfficialModelsQuery, useSaveAssetMutation } from "../services/assets";
import { useProductImagesQuery, useUploadProductImageMutation } from "../services/generation";
import { materialError, materialName, uploadMaterials, validMaterialLabel } from "../services/materials";
import type { ProductImage } from "../services/types";
import { assetFormDirty } from "./asset-draft";
import CustomModel from "./custom-model";
import { MaterialDialog, MaterialPagination, MaterialThumbnail } from "./material-picker";
import MaterialsView, { MaterialPreview } from "./materials";
import "../styles/assets.css";

type AssetUse = (asset: CreativeAsset) => Promise<boolean>;
const TABS = [{ id: "recent", label: "最近保存" }, { id: "reference", label: "创作参考" }, { id: "model", label: "我的模特" }, { id: "images", label: "图片素材" }] as const;

export function AssetEditor({ kind, original, limitReached, locked, onClose, onSaved, onUse }: {
    kind: CreativeAssetKind; original?: CreativeAsset; limitReached: boolean; locked: boolean;
    onClose: () => void; onSaved: (asset: CreativeAsset) => void; onUse: AssetUse;
}) {
    const products = useProductImagesQuery();
    const official = useOfficialModelsQuery();
    const upload = useUploadProductImageMutation();
    const save = useSaveAssetMutation();
    const [name, setName] = useState(original?.name ?? "");
    const [prompt, setPrompt] = useState(original?.prompt ?? "");
    const [imageIds, setImageIds] = useState<string[]>([...(original?.imageIds ?? [])]);
    const [modelTab, setModelTab] = useState(original ? "upload" : "custom");
    const [customBusy, setCustomBusy] = useState(false);
    const [customDirty, setCustomDirty] = useState(false);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [uploaded, setUploaded] = useState<ProductImage[]>([]);
    const [errors, setErrors] = useState<string[]>([]);
    const [retryFiles, setRetryFiles] = useState<File[]>([]);
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [pending, setPending] = useState(false);
    const [saved, setSaved] = useState<CreativeAsset | undefined>(original);
    const [message, setMessage] = useState("");
    const [consentedImage, setConsentedImage] = useState("");
    const [checkingFace, setCheckingFace] = useState(false);
    const operation = useRef(false);
    const mounted = useRef(true);
    const abort = useRef<AbortController | undefined>(undefined);
    const input = useRef<HTMLInputElement>(null);
    const initial = useRef({ name: original?.name ?? "", prompt: original?.prompt ?? "", imageIds: [...(original?.imageIds ?? [])] });
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; abort.current?.abort(); }; }, []);
    const busy = pending || upload.isPending || save.isPending || customBusy;
    const current = { name, prompt, imageIds };
    const dirty = assetFormDirty(current, initial.current) || customDirty;
    const selectionLimit = kind === "model" ? 1 : 5;
    const images = [...(products.data ?? []), ...uploaded.filter((image) => !products.data?.some((item) => item.id === image.id))];
    const filtered = images.filter((image) => materialName(image).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
    const pages = Math.max(1, Math.ceil(filtered.length / 12));
    const currentPage = Math.min(page, pages);
    const invalid = validateCreativeAsset({ kind, ...current, name: name.trim() });
    const missing = imageIds.some((id) => !images.some((image) => image.id === id));
    const needsFaceCheck = kind === "model" && imageIds.length === 1 && (!saved || saved.kind !== "model" || saved.imageIds[0]?.toLowerCase() !== imageIds[0]?.toLowerCase());
    const faceConsent = needsFaceCheck && consentedImage === imageIds[0];
    const canSave = !busy && !invalid && validMaterialLabel(name.trim()) && !missing && (!needsFaceCheck || faceConsent) && products.isSuccess && !products.isFetching && (Boolean(saved) || !limitReached);
    const showForm = kind === "reference" || modelTab === "upload";

    function close() {
        if (operation.current || busy) return;
        if (dirty && !window.confirm("尚有未保存的修改，确定关闭？已上传的图片会保留在图片素材中。")) return;
        onClose();
    }

    async function uploadFiles(files: File[]) {
        if (!files.length || busy || operation.current || !products.isSuccess || products.isFetching) return;
        const availableSlots = selectionLimit - imageIds.length;
        if (files.length > availableSlots) { setErrors([`本次最多可上传并选择 ${availableSlots} 张，请减少文件数量或先移除选择`]); return; }
        operation.current = true; setPending(true); setErrors([]); setMessage("");
        setProgress({ done: 0, total: files.length });
        const failed: File[] = [];
        abort.current = new AbortController();
        try {
            const result = await uploadMaterials(files, async (file) => {
                try { return await upload.mutateAsync(file); }
                catch (reason) { failed.push(file); throw reason; }
            }, abort.current.signal, (done, total) => { if (mounted.current) setProgress({ done, total }); });
            if (!mounted.current) return;
            setUploaded((previous) => [...previous, ...result.uploaded]);
            setImageIds((previous) => [...new Set([...previous, ...result.uploaded.map((image) => image.id)])]);
            setErrors(result.errors); setRetryFiles(failed);
        } catch (reason) { if (mounted.current) setErrors([materialError(reason)]); }
        finally { operation.current = false; if (mounted.current) setPending(false); }
    }

    async function persist(use: boolean) {
        if (!canSave || operation.current || (use && locked)) return;
        operation.current = true; setPending(true); setErrors([]); setMessage("");
        setCheckingFace(needsFaceCheck);
        try {
            const nextInput = { kind, name: name.trim(), prompt, imageIds: [...imageIds] };
            const record = saved && !assetFormDirty(nextInput, saved) ? saved : await save.mutateAsync({
                input: nextInput, original: saved, ...(needsFaceCheck ? { faceConsent: true } : {}),
            });
            if (!mounted.current) return;
            setSaved(record); setName(record.name);
            initial.current = { name: record.name, prompt: record.prompt, imageIds: [...record.imageIds] };
            onSaved(record);
            if (use) {
                setMessage("已保存，正在填入创意生图草稿...");
                try {
                    const applied = await onUse({ ...record, imageIds: [...record.imageIds] });
                    if (mounted.current) { setMessage(applied ? "已保存并填入创意生图草稿，尚未生成" : "已保存；已取消替换草稿"); if (applied) onClose(); }
                } catch (reason) { if (mounted.current) setErrors([`已保存，未能使用：${materialError(reason)}`]); }
            } else { setMessage("已保存"); onClose(); }
        } catch (reason) { if (mounted.current) setErrors([`保存失败：${materialError(reason)}。输入已保留；版本冲突时请关闭后重新编辑。`]); }
        finally { operation.current = false; if (mounted.current) { setPending(false); setCheckingFace(false); } }
    }

    return <MaterialDialog className={`asset-dialog asset-dialog-${kind}${kind === "model" && modelTab === "custom" ? " asset-dialog-custom" : ""}`} title={original ? kind === "model" ? "编辑模特" : "编辑创作参考" : kind === "model" ? "创建专属模特" : "新建创作参考"} onClose={close} busy={busy}>
        {kind === "model" && <div className="assets-tabs" role="tablist" aria-label="模特来源">
            {[...(!original ? [{ id: "custom", label: "定制模特" }] : []), { id: "official", label: "官方模特" }, { id: "upload", label: "上传模特" }].map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={modelTab === tab.id} disabled={busy}
                onClick={() => { if (!busy) setModelTab(tab.id); }}>{tab.label}</button>)}
        </div>}
        {kind === "model" && !original && <CustomModel active={modelTab === "custom"} locked={locked} limitReached={limitReached} onBusyChange={setCustomBusy} onDirtyChange={setCustomDirty} onClose={onClose} onSaved={onSaved} />}
        {kind === "model" && modelTab === "official" && <section className="assets-empty" role="tabpanel" aria-label="官方模特">
            <UserRound size={36} />
            {official.isPending ? <p role="status">正在加载官方模特...</p> : official.isError ? <><p role="alert">官方目录加载失败</p><button type="button" disabled={official.isFetching} onClick={() => void official.refetch()}><RefreshCw size={16} />重试</button></> :
                <p>{official.data?.length ? "官方目录暂未开放选用" : "暂无可用的授权官方模特"}</p>}
            <button type="button" onClick={() => setModelTab("upload")}><Upload size={16} />上传模特</button>
        </section>}
        {showForm && <form className="asset-editor" noValidate onSubmit={(event) => { event.preventDefault(); void persist(false); }}>
            <label><span>{kind === "model" ? "模特名称" : "参考名称"}<span className="asset-required"> *</span></span><input autoFocus aria-label="资产名称" placeholder={kind === "model" ? "请输入模特名称" : "请输入参考名称"} required maxLength={120} disabled={busy} value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label>{kind === "model" ? "描述" : "Prompt"}<textarea aria-label="资产 Prompt" placeholder={kind === "model" ? "请输入模特描述" : "请输入 Prompt"} maxLength={1500} rows={4} disabled={busy} value={prompt} onChange={(event) => setPrompt(event.target.value)} /></label>
            <div className="assets-picker-heading image-upload-heading">
                <div className="image-upload-title"><h3>{kind === "model" ? "模特照片" : "参考内容"}<span className="asset-required"> *</span></h3><span>{imageIds.length} / {selectionLimit}</span></div>
                <div className="image-upload-library">
                    <button className="asset-existing-picker materials-picker-trigger" type="button" title="从素材库选择" aria-label="从素材库选择" disabled={busy || !products.isSuccess || products.isFetching} onClick={() => setPickerOpen((previous) => !previous)}><FolderOpen size={16} /><span>从素材库选择</span></button>
                </div>
            </div>
            {imageIds.length > 0 ? <div className="assets-selection image-upload-thumbnails" aria-label="已选资产图片">
                {imageIds.map((imageId, index) => {
                    const image = images.find((item) => item.id === imageId);
                    return <div className="assets-selected" key={imageId}>{image ? <MaterialThumbnail image={image} /> : <span role="alert">图片已不存在</span>}
                        <button type="button" title="移除选择" aria-label={`移除图片 ${index + 1}`} disabled={busy} onClick={() => setImageIds((previous) => previous.filter((id) => id !== imageId))}><X size={16} /></button></div>;
                })}
                {imageIds.length < selectionLimit && <button className="image-upload-add" type="button" aria-label="继续添加图片" title="继续添加图片" disabled={busy || !products.isSuccess || products.isFetching} onClick={() => input.current?.click()}><Plus size={20} /></button>}
            </div> : <div className="image-upload-area">
                <button className="image-upload-zone" type="button" disabled={busy || !products.isSuccess || products.isFetching || imageIds.length >= selectionLimit} onClick={() => input.current?.click()}>
                    <span className="image-upload-command"><Upload size={16} /><span>上传图片</span></span>
                    <span className="image-upload-hint">最多 {selectionLimit} 张 · PNG / JPEG / WebP · 每张不超过 10 MB</span>
                </button>
            </div>}
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple={kind === "reference"} hidden disabled={busy}
                onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void uploadFiles(files); }} />
            {kind === "model" && (!saved || needsFaceCheck) && <section className="asset-face-notice" aria-label="模特照片检测说明" aria-busy={checkingFace}>
                <label><input type="checkbox" aria-label="同意照片检测" checked={faceConsent} disabled={busy || imageIds.length !== 1}
                    onChange={(event) => setConsentedImage(event.target.checked ? imageIds[0]! : "")} /><span>我确认照片中的人物已成年且拥有使用授权，并同意将照片发送腾讯云进行人脸检测。</span></label>
                {checkingFace && <p className="asset-face-progress" role="status"><RefreshCw size={14} aria-hidden="true" /><span>正在检测并保存，请稍候...</span></p>}
            </section>}
            <div hidden={!pickerOpen} className="asset-picker-panel">
            <label className="assets-search"><Search size={16} /><input aria-label="搜索已有图片" type="search" value={search} disabled={busy} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
            {products.isPending ? <p role="status">正在加载图片素材...</p> : products.isError ? <p role="alert">图片素材加载失败 <button type="button" disabled={products.isFetching} onClick={() => void products.refetch()}><RefreshCw size={16} />重试</button></p> : <>
                {!filtered.length && <p className="assets-empty">暂无图片素材</p>}
                <div className="assets-image-picker">{filtered.slice((currentPage - 1) * 12, currentPage * 12).map((image) => <div className="assets-image-option" key={image.id}>
                    <MaterialThumbnail image={image} /><label><input type="checkbox" aria-label={`选择 ${materialName(image)}`} checked={imageIds.includes(image.id)}
                        disabled={busy || (!imageIds.includes(image.id) && imageIds.length >= selectionLimit)} onChange={() => setImageIds((previous) => previous.includes(image.id) ? previous.filter((id) => id !== image.id) : previous.length < selectionLimit ? [...previous, image.id] : previous)} />{materialName(image)}</label>
                </div>)}</div><MaterialPagination page={currentPage} pages={pages} onChange={setPage} disabled={busy} />
            </>}
            </div>
            {progress.total > 0 && <div role="status"><progress aria-label="资产图片上传进度" value={progress.done} max={progress.total} /> {progress.done} / {progress.total}</div>}
            {errors.map((error, index) => <p className="materials-warning" role="alert" key={index}>{error}</p>)}
            {retryFiles.length > 0 && <button type="button" disabled={busy} onClick={() => void uploadFiles(retryFiles)}><RefreshCw size={16} />重试失败上传（{retryFiles.length}）</button>}
            {message && <p role="status">{message}</p>}
            {invalid && (name || imageIds.length > 0) && <p className="assets-validation" role="status">{invalid}</p>}
            {!saved && limitReached && <p role="alert">资产已达 40 条上限，请先删除不用的资料</p>}
            {missing && <p role="alert">部分图片已不存在，请移除并重新选择</p>}
            <footer><button type="button" title="取消" aria-label="取消" disabled={busy} onClick={close}><X size={16} /></button>
                <button type="submit" aria-label="保存" disabled={!canSave}>{checkingFace ? "检测并保存中..." : pending ? "保存中..." : kind === "model" ? "保存模特" : "保存参考"}</button>
                <button type="button" aria-label="保存并使用" disabled={!canSave || locked} title={locked ? "当前任务结束后可使用" : "保存并使用"} onClick={() => void persist(true)}><Sparkles size={16} /></button></footer>
        </form>}
    </MaterialDialog>;
}

export default function AssetsView({ active = true, locked, onUse, onUseImage }: { active?: boolean; locked: boolean; onUse: AssetUse; onUseImage: (image: ProductImage) => void }) {
    const assets = useAssetsQuery();
    const products = useProductImagesQuery();
    const remove = useDeleteAssetMutation();
    const [tab, setTab] = useState<typeof TABS[number]["id"]>("recent");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [editor, setEditor] = useState<{ kind: CreativeAssetKind; original?: CreativeAsset }>();
    const [deleting, setDeleting] = useState<CreativeAsset>();
    const [preview, setPreview] = useState<ProductImage>();
    const [pending, setPending] = useState(false);
    const [message, setMessage] = useState("");
    const operation = useRef(false);
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const records = assets.data?.items ?? [];
    const filtered = records.filter((record) => (tab === "recent" || record.kind === tab) && record.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id));
    const entries = [
        ...filtered.map((record) => ({ key: `asset-${record.id}`, name: record.name, date: record.updatedAt, record, image: undefined as ProductImage | undefined })),
        ...(tab === "recent" ? (products.data ?? []).filter((image) => materialName(image).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
            .map((image) => ({ key: `image-${image.id}`, name: materialName(image), date: image.createdAt ?? "", image, record: undefined as CreativeAsset | undefined })) : []),
    ].sort((left, right) => right.date.localeCompare(left.date) || right.key.localeCompare(left.key));
    const pages = Math.max(1, Math.ceil(entries.length / 12));
    const currentPage = Math.min(page, pages);
    const limitReached = records.length >= Math.min(40, assets.data?.limit ?? 40);
    async function use(record: CreativeAsset) {
        if (locked || pending || operation.current) return;
        operation.current = true; setPending(true); setMessage("");
        try { const applied = await onUse({ ...record, imageIds: [...record.imageIds] }); if (mounted.current) setMessage(applied ? "已填入创意生图草稿，尚未生成" : "已取消替换草稿"); }
        catch (reason) { if (mounted.current) setMessage(`未能使用：${materialError(reason)}`); }
        finally { operation.current = false; if (mounted.current) setPending(false); }
    }
    return <><section className="assets-view" aria-label="资产库" hidden={!active}>
        <header className="assets-heading"><h2>资产库</h2></header>
        <div className="assets-tabs" role="tablist" aria-label="资产分类">{TABS.map((item) => <button type="button" role="tab" key={item.id} aria-selected={tab === item.id}
            disabled={pending} onClick={() => { setTab(item.id); setPage(1); setSearch(""); }}>{item.label}</button>)}</div>
        {message && <p role="status" className="assets-message">{message}</p>}
        <div hidden={tab !== "images"} role="tabpanel" aria-label="图片素材"><MaterialsView onUse={onUseImage} /></div>
        {tab !== "images" && <div role="tabpanel" aria-label={TABS.find((item) => item.id === tab)?.label}>
            <div className="assets-toolbar"><label className="assets-search"><Search size={17} /><input type="search" aria-label="搜索资产名称" placeholder="搜索资产名称" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
                <span>{records.length} / 40</span><button type="button" title="刷新资产" aria-label="刷新资产" disabled={assets.isFetching || pending} onClick={() => void assets.refetch()}><RefreshCw size={17} /></button></div>
            {assets.isPending ? <p role="status">正在加载资产...</p> : assets.isError ? <p className="materials-warning" role="alert">资产加载失败，请刷新重试</p> : <>
                {tab === "recent" && products.isError && <p role="alert">图片素材加载失败 <button type="button" onClick={() => void products.refetch()}><RefreshCw size={16} />重试</button></p>}
                {!entries.length && search && <div className="assets-empty"><p>没有匹配的资产</p></div>}
                <div className="assets-grid">
                    <article className="asset-create-card">
                        {tab === "model" ? <UserRound size={22} /> : <SlidersHorizontal size={22} />}
                        <h3>{tab === "model" ? "创建专属模特" : tab === "reference" ? "新建创作参考" : "新建资产"}</h3>
                        <div className="asset-create-actions">
                            {tab !== "reference" && <button type="button" disabled={pending || limitReached || !assets.isSuccess || assets.isFetching} onClick={() => setEditor({ kind: "model" })}>新建专属模特</button>}
                            {tab !== "model" && <button type="button" disabled={pending || limitReached || !assets.isSuccess || assets.isFetching} onClick={() => setEditor({ kind: "reference" })}>新建创作参考</button>}
                        </div>
                    </article>
                    {entries.slice((currentPage - 1) * 12, currentPage * 12).map((entry) => {
                    if (entry.image) return <article className="asset-card" key={entry.key}><MaterialThumbnail image={entry.image} />
                        <div className="asset-card-body"><span>图片素材</span><h3>{entry.name}</h3><p>{entry.image.width} × {entry.image.height} px</p>
                            <footer><button type="button" disabled={locked || pending} onClick={() => onUseImage(entry.image!)}><Check size={16} />使用</button>
                                <button type="button" title={`预览 ${entry.name}`} aria-label={`预览 ${entry.name}`} onClick={() => setPreview(entry.image)}><Eye size={16} /></button></footer>
                        </div></article>;
                    const record = entry.record!;
                    const image = products.data?.find((item) => item.id === record.imageIds[0]);
                    const missing = products.isSuccess && !products.isFetching && record.imageIds.some((id) => !products.data.some((item) => item.id === id));
                    return <article className="asset-card" key={record.id}>{image ? <MaterialThumbnail image={image} /> : <div className="asset-placeholder"><ImageIcon size={30} /></div>}
                        <div className="asset-card-body"><span>{record.kind === "model" ? "人物参考" : "风格参考"} · {record.imageIds.length} 张</span><h3>{record.name}</h3><p>{record.prompt || "未填写 Prompt"}</p>
                            {missing && <p role="alert">图片已不存在，请编辑资料</p>}
                            <footer><button type="button" disabled={locked || pending || missing || !products.isSuccess || products.isFetching} onClick={() => void use(record)}><Check size={16} />使用</button>
                                <button type="button" title={`预览 ${record.name}`} aria-label={`预览 ${record.name}`} disabled={!image} onClick={() => setPreview(image)}><Eye size={16} /></button>
                                <button type="button" title={`编辑 ${record.name}`} aria-label={`编辑 ${record.name}`} disabled={pending} onClick={() => setEditor({ kind: record.kind, original: record })}><Pencil size={16} /></button>
                                <button type="button" title={`删除 ${record.name}`} aria-label={`删除 ${record.name}`} disabled={pending} onClick={() => setDeleting(record)}><Trash2 size={16} /></button></footer>
                        </div></article>;
                })}</div><MaterialPagination page={currentPage} pages={pages} onChange={setPage} disabled={pending} />
            </>}
        </div>}
    </section>
        {preview && <MaterialPreview image={preview} onClose={() => setPreview(undefined)} />}
        {editor && <AssetEditor key={editor.original?.id ?? editor.kind} {...editor} locked={locked} limitReached={limitReached} onClose={() => setEditor(undefined)} onUse={onUse}
            onSaved={(record) => { setTab(record.kind); setSearch(""); setPage(1); setMessage("已保存"); }} />}
        {deleting && <MaterialDialog title="删除资产" busy={pending} onClose={() => { if (!operation.current) setDeleting(undefined); }}>
            <p>删除“{deleting.name}”？仅删除资产资料，原图片和已填入的草稿不变。</p>
            <footer><button type="button" disabled={pending} onClick={() => setDeleting(undefined)}><X size={16} />取消</button><button type="button" className="materials-danger" disabled={pending} onClick={async () => {
                if (operation.current) return;
                operation.current = true; setPending(true);
                try { await remove.mutateAsync(deleting.id); if (mounted.current) { setDeleting(undefined); setMessage("资产资料已删除，原图片保留"); } }
                catch (reason) { if (mounted.current) setMessage(materialError(reason)); }
                finally { operation.current = false; if (mounted.current) setPending(false); }
            }}><Trash2 size={16} />删除资料</button></footer>
            {message && <p role="alert">{message}</p>}
        </MaterialDialog>}
    </>;
}