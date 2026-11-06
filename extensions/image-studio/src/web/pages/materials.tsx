import { Download, Eye, FolderOpen, FolderPlus, Pencil, Plus, RefreshCw, Square, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { loadProductImage, useDeleteProductImageMutation, useProductImagesQuery, useUploadProductImageMutation } from "../services/generation";
import {
    deleteMaterials, downloadMaterialBlob, fetchMaterialOriginal, filterMaterials, materialError, materialName,
    materialsZip, reconcileMaterialIds, uploadMaterials, useMaterialGroupMutation, useMaterialGroupsQuery,
    useMaterialMetadataMutation, validMaterialLabel, type MaterialFilters,
} from "../services/materials";
import type { ProductImage } from "../services/types";
import { MaterialDialog, MaterialFilterBar, MaterialPagination, MaterialThumbnail } from "./material-picker";
import "../styles/materials.css";

type Editor = { kind: "image"; image: ProductImage } | { kind: "create" } | { kind: "rename" | "delete-group"; name: string };

function MaterialEditor({ editor, groups, onClose, onSave }: {
    editor: Editor; groups: string[]; onClose: () => void;
    onSave: (name: string, group: string) => Promise<void>;
}) {
    const [name, setName] = useState(editor.kind === "image" ? materialName(editor.image) : editor.kind === "create" ? "" : editor.name);
    const [group, setGroup] = useState(editor.kind === "image" ? editor.image.group ?? "" : "");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const deleting = editor.kind === "delete-group";
    const title = editor.kind === "image" ? "编辑素材" : editor.kind === "create" ? "新建分组" : deleting ? "删除分组" : "重命名分组";
    return <MaterialDialog title={title} onClose={onClose} busy={saving}>
        <form onSubmit={async (event) => {
            event.preventDefault();
            if (saving) return;
            const trimmed = name.trim();
            if (!deleting && !validMaterialLabel(trimmed, editor.kind === "image" ? 120 : 60)) {
                setError("名称不能为空，且不能包含路径、控制字符或特殊文件名字符"); return;
            }
            setSaving(true); setError("");
            try { await onSave(trimmed, group); if (mounted.current) onClose(); }
            catch (reason) { if (mounted.current) setError(materialError(reason)); }
            finally { if (mounted.current) setSaving(false); }
        }}>
            {deleting ? <p>删除分组“{name}”？其中素材将移至默认分组，原图不会删除。</p> :
                <label>名称<input autoFocus required aria-label="素材或分组名称" value={name} disabled={saving}
                    maxLength={editor.kind === "image" ? 120 : 60} onChange={(event) => setName(event.target.value)} /></label>}
            {editor.kind === "image" && <label>所属分组<select aria-label="素材所属分组" value={group} disabled={saving}
                onChange={(event) => setGroup(event.target.value)}><option value="">默认分组</option>
                {groups.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>}
            {error && <p role="alert" className="materials-warning">{error}</p>}
            <footer><button type="button" disabled={saving} onClick={onClose}><X size={16} />取消</button>
                <button type="submit" disabled={saving} className={deleting ? "materials-danger" : "materials-primary"}>
                    {deleting ? <Trash2 size={16} /> : <Pencil size={16} />}{saving ? "保存中..." : deleting ? "删除分组" : "保存"}</button></footer>
        </form>
    </MaterialDialog>;
}

export function MaterialPreview({ image, onClose }: { image: ProductImage; onClose: () => void }) {
    const [url, setUrl] = useState("");
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        setFailed(false); setUrl("");
        return loadProductImage(image.id, setUrl, () => setFailed(true));
    }, [image.id, attempt]);
    return <MaterialDialog title={materialName(image)} onClose={onClose}>
        {url ? <img className="materials-preview" src={url} alt={materialName(image)} /> : failed ?
            <p role="alert">原图加载失败 <button type="button" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={16} />重试</button></p> :
            <p role="status">正在加载原图...</p>}
        <p>{image.width} × {image.height} px · {(image.size / 1024).toFixed(0)} KB</p>
    </MaterialDialog>;
}

export default function MaterialsView({ onUse }: { onUse?: (image: ProductImage) => void } = {}) {
    const query = useProductImagesQuery();
    const groups = useMaterialGroupsQuery();
    const upload = useUploadProductImageMutation();
    const remove = useDeleteProductImageMutation();
    const metadata = useMaterialMetadataMutation();
    const changeGroup = useMaterialGroupMutation();
    const [filters, setFilters] = useState<MaterialFilters>({ search: "", group: "*", date: "" });
    const [page, setPage] = useState(1);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [editor, setEditor] = useState<Editor>();
    const [preview, setPreview] = useState<ProductImage>();
    const [deleting, setDeleting] = useState<ProductImage[]>();
    const [busy, setBusy] = useState("");
    const [report, setReport] = useState<string[]>([]);
    const [progress, setProgress] = useState("");
    const input = useRef<HTMLInputElement>(null);
    const operation = useRef<AbortController | null>(null);
    const mounted = useRef(true);
    const images = query.data ?? [];
    const filtered = filterMaterials(images, filters);
    const pages = Math.max(1, Math.ceil(filtered.length / 24));
    const currentPage = Math.min(page, pages);
    const visible = filtered.slice((currentPage - 1) * 24, currentPage * 24);
    const selected = images.filter((image) => selectedIds.includes(image.id));
    const locked = Boolean(busy || metadata.isPending || changeGroup.isPending);
    const activeGroup = filters.group !== "*" && filters.group !== "" ? filters.group : undefined;
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; operation.current?.abort(); };
    }, []);
    useEffect(() => {
        if (query.isSuccess) setSelectedIds((current) => reconcileMaterialIds(current, query.data));
    }, [query.isSuccess, query.data]);
    useEffect(() => {
        if (groups.isSuccess && filters.group !== "*" && filters.group !== "" && !groups.data.includes(filters.group)) {
            setFilters((current) => ({ ...current, group: "*" })); setPage(1);
        }
    }, [groups.isSuccess, groups.data, filters.group]);
    const changeFilters = (next: MaterialFilters) => { setFilters(next); setPage(1); };
    const run = async (label: string, action: (signal: AbortSignal) => Promise<string[]>) => {
        if (operation.current) return;
        const controller = new AbortController();
        operation.current = controller; setBusy(label); setReport([]); setProgress("");
        try {
            const messages = await action(controller.signal);
            if (mounted.current) setReport(messages);
        } catch (reason) {
            if (mounted.current) setReport([controller.signal.aborted ? "操作已停止，已完成的变更保留" : materialError(reason)]);
        } finally {
            operation.current = null;
            if (mounted.current) { setBusy(""); setProgress(""); }
        }
    };
    const download = (items: ProductImage[], archive: boolean) => void run("准备下载", async (signal) => {
        const first = items[0];
        if (!first) throw new Error("请先选择素材");
        const blob = archive ? await materialsZip(items, fetchMaterialOriginal, signal) : await fetchMaterialOriginal(first.id, signal);
        signal.throwIfAborted();
        downloadMaterialBlob(blob, archive ? "image-studio-materials.zip" : `${materialName(first).replace(/[/\\]/g, "_")}.png`);
        return ["文件已准备并提交浏览器下载"];
    });
    return <section className="materials-view" aria-label="素材库">
        <header className="materials-heading"><div><FolderOpen size={24} /><h1>素材库</h1><span>{images.length} / 40</span></div>
            <div><button type="button" title="刷新素材库" aria-label="刷新素材库" disabled={locked || query.isFetching || groups.isFetching}
                onClick={() => { void query.refetch(); void groups.refetch(); }}><RefreshCw size={17} /></button>
                <button type="button" className="materials-primary" disabled={locked || !query.isSuccess || query.isFetching || images.length >= 40}
                    onClick={() => input.current?.click()}><Upload size={17} />上传素材</button></div>
        </header>
        <input ref={input} type="file" className="materials-sr" tabIndex={-1} aria-label="上传素材文件" multiple accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
                const files = Array.from(event.target.files ?? []); event.target.value = "";
                if (!files.length) return;
                void run("上传素材", async (signal) => {
                    const result = await uploadMaterials(files, images.length, (file) => upload.mutateAsync(file), signal,
                        (done, total) => { if (mounted.current) setProgress(`${done} / ${total}`); });
                    return [`已上传 ${result.uploaded.length} 张素材`, ...result.errors];
                });
            }} />
        <MaterialFilterBar filters={filters} groups={groups.data ?? []} disabled={locked} onChange={changeFilters} />
        <div className="materials-group-tools">
            <button type="button" disabled={locked || !groups.isSuccess} onClick={() => setEditor({ kind: "create" })}><FolderPlus size={16} />新建分组</button>
            {activeGroup && <><button type="button" title="重命名当前分组" aria-label="重命名当前分组" disabled={locked || !groups.isSuccess}
                onClick={() => setEditor({ kind: "rename", name: activeGroup })}><Pencil size={16} /></button>
                <button type="button" title="删除当前分组" aria-label="删除当前分组" disabled={locked || !groups.isSuccess}
                    onClick={() => setEditor({ kind: "delete-group", name: activeGroup })}><Trash2 size={16} /></button></>}
        </div>
        {groups.isError && <p className="materials-warning" role="alert">分组加载失败，仍可查看原图素材 <button type="button"
            onClick={() => void groups.refetch()}><RefreshCw size={16} />重试分组</button></p>}
        {images.some((image) => image.metadataStatus === "unavailable") && <p className="materials-warning" role="alert">部分名称或分组暂不可用，原图仍保留，请联系管理员检查元数据。</p>}
        <div className="materials-count"><span>{filtered.length} 张素材 · 已选 {selected.length} 张</span>
            {busy && <span role="status">{busy} {progress} <button type="button" title="停止后续操作" aria-label="停止后续操作"
                onClick={() => operation.current?.abort()}><Square size={14} /></button></span>}</div>
        <div className="materials-batch">
            <label><input type="checkbox" aria-label="选择本页素材" checked={visible.length > 0 && visible.every((image) => selectedIds.includes(image.id))}
                disabled={locked || !query.isSuccess || !visible.length} onChange={(event) => setSelectedIds((current) => event.target.checked ?
                    [...new Set([...current, ...visible.map((image) => image.id)])] : current.filter((id) => !visible.some((image) => image.id === id)))} /> 本页</label>
            <button type="button" title="取消全部选择" aria-label="取消全部选择" disabled={locked || !selected.length} onClick={() => setSelectedIds([])}><X size={16} /></button>
            <button type="button" disabled={locked || !query.isSuccess || !selected.length} onClick={() => download(selected, true)}><Download size={16} />下载 ZIP ({selected.length})</button>
            <button type="button" className="materials-danger" disabled={locked || !query.isSuccess || !selected.length}
                onClick={() => setDeleting(selected)}><Trash2 size={16} />删除 ({selected.length})</button>
        </div>
        {report.length > 0 && <div className="materials-report" role="status" aria-live="polite">{report.map((message, index) => <p key={index}>{message}</p>)}</div>}
        {query.isPending ? <p className="materials-empty" role="status">正在加载素材...</p> : query.isError ?
            <div className="materials-empty" role="alert"><FolderOpen size={36} /><p>素材加载失败，已有选择保持不变</p><button type="button"
                onClick={() => void query.refetch()}><RefreshCw size={16} />重新加载</button></div> : !filtered.length ?
                <div className="materials-empty"><FolderOpen size={36} /><p>{images.length ? "没有符合条件的素材" : "素材库暂无图片"}</p>
                    {!images.length && <button type="button" disabled={locked} onClick={() => input.current?.click()}><Plus size={16} />上传素材</button>}</div> :
                <div className="materials-grid">{visible.map((image) => <article className="material-item" key={image.id} data-selected={selectedIds.includes(image.id)}>
                    <MaterialThumbnail image={image} />
                    <label className="material-choice"><input type="checkbox" checked={selectedIds.includes(image.id)} aria-label={`选择 ${materialName(image)}`}
                        disabled={locked} onChange={() => setSelectedIds((current) => current.includes(image.id) ? current.filter((id) => id !== image.id) : [...current, image.id])} />
                        <span title={materialName(image)}>{materialName(image)}</span></label>
                    <div className="material-caption"><small>{image.group || "默认分组"}</small><small>{image.width} × {image.height} px · {(image.size / 1024).toFixed(0)} KB</small>
                        <time dateTime={image.createdAt}>{image.createdAt ? new Date(image.createdAt).toLocaleDateString() : "日期未知"}</time></div>
                    <div className="material-actions">
                        <button type="button" title="预览原图" aria-label={`预览 ${materialName(image)}`} disabled={locked} onClick={() => setPreview(image)}><Eye size={16} /></button>
                        <button type="button" title="编辑名称与分组" aria-label={`编辑 ${materialName(image)}`} disabled={locked || !groups.isSuccess}
                            onClick={() => setEditor({ kind: "image", image })}><Pencil size={16} /></button>
                        <button type="button" title="下载原图" aria-label={`下载 ${materialName(image)}`} disabled={locked} onClick={() => download([image], false)}><Download size={16} /></button>
                        <button type="button" title="删除素材" aria-label={`删除 ${materialName(image)}`} disabled={locked} onClick={() => setDeleting([image])}><Trash2 size={16} /></button>
                        {onUse && <button type="button" disabled={locked} onClick={() => onUse(image)}><Plus size={16} />使用</button>}
                    </div>
                </article>)}</div>}
        <MaterialPagination page={currentPage} pages={pages} onChange={setPage} disabled={locked} />
        {editor && <MaterialEditor editor={editor} groups={groups.data ?? []} onClose={() => setEditor(undefined)} onSave={async (name, group) => {
            if (editor.kind === "image") await metadata.mutateAsync({ id: editor.image.id, name, group });
            else if (editor.kind === "create") await changeGroup.mutateAsync({ kind: "create", name });
            else if (editor.kind === "rename") { await changeGroup.mutateAsync({ kind: "rename", name: editor.name, next: name }); changeFilters({ ...filters, group: name }); }
            else { await changeGroup.mutateAsync({ kind: "delete", name: editor.name }); changeFilters({ ...filters, group: "" }); }
        }} />}
        {preview && <MaterialPreview image={preview} onClose={() => setPreview(undefined)} />}
        {deleting && <MaterialDialog title="删除素材" onClose={() => setDeleting(undefined)}>
            <p>确认删除 {deleting.length} 张素材？此操作无法撤销。已用于生成记录的素材将保留并报告原因。</p>
            <footer><button type="button" onClick={() => setDeleting(undefined)}><X size={16} />取消</button>
                <button type="button" className="materials-danger" onClick={() => {
                    const targets = deleting; setDeleting(undefined);
                    void run("删除素材", async (signal) => {
                        const result = await deleteMaterials(targets, (id) => remove.mutateAsync(id), signal);
                        return [`已删除 ${result.removed.length} 张；保留 ${targets.length - result.removed.length} 张`, ...result.errors];
                    });
                }}><Trash2 size={16} />确认删除</button></footer>
        </MaterialDialog>}
    </section>;
}