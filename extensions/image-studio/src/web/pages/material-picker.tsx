import { ChevronLeft, ChevronRight, FolderOpen, Image as ImageIcon, RefreshCw, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { loadProductThumbnail, useProductImagesQuery } from "../services/generation";
import {
    filterMaterials, materialName, reconcileMaterialIds, toggleMaterialId, useMaterialGroupsQuery,
    type MaterialFilters,
} from "../services/materials";
import type { ProductImage } from "../services/types";
import "../styles/materials.css";

export function MaterialDialog({ title, onClose, busy = false, children, className = "" }: {
    title: string; onClose: () => void; busy?: boolean; children: ReactNode; className?: string;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    useEffect(() => {
        const dialog = ref.current;
        const previous = document.activeElement as HTMLElement | null;
        const overflow = document.body.style.overflow;
        dialog?.showModal();
        document.body.style.overflow = "hidden";
        return () => {
            dialog?.close();
            document.body.style.overflow = overflow;
            if (previous?.isConnected) previous.focus();
        };
    }, []);
    return <dialog ref={ref} className={`materials-dialog ${className}`} aria-labelledby={titleId}
        onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
        onClick={(event) => { if (!busy && event.target === event.currentTarget) onClose(); }}>
        <div className="materials-dialog-body">
            <header><h2 id={titleId}>{title}</h2><button type="button" title="关闭" aria-label="关闭"
                disabled={busy} onClick={onClose}><X size={18} /></button></header>
            {children}
        </div>
    </dialog>;
}

export function MaterialThumbnail({ image }: { image: ProductImage }) {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);
    const [loaded, setLoaded] = useState<{ id: string; url: string }>();
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
        }, { rootMargin: "160px" });
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);
    useEffect(() => {
        setFailed(false);
        setLoaded(undefined);
        if (!visible) return;
        return loadProductThumbnail(image.id, (url) => setLoaded({ id: image.id, url }), () => setFailed(true));
    }, [image.id, visible, attempt]);
    return <div ref={ref} className="material-thumbnail">
        {loaded?.id === image.id ? <img src={loaded.url} alt={materialName(image)} loading="lazy" decoding="async" /> : failed ?
            <button type="button" title="重试缩略图" aria-label={`重试 ${materialName(image)} 缩略图`}
                onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={18} />重试</button> :
            <span role="status" aria-label="缩略图加载中"><ImageIcon size={28} /></span>}
    </div>;
}

export function MaterialFilterBar({ filters, groups, onChange, disabled = false, includeDate = true }: {
    filters: MaterialFilters; groups: string[]; onChange: (filters: MaterialFilters) => void; disabled?: boolean; includeDate?: boolean;
}) {
    return <div className="materials-filters">
        <label className="materials-search"><Search size={16} /><span className="materials-sr">搜索素材名称</span>
            <input type="search" placeholder="搜索素材名称" aria-label="搜索素材名称" maxLength={120} value={filters.search} disabled={disabled}
                onChange={(event) => onChange({ ...filters, search: event.target.value })} /></label>
        <label>分组<select aria-label="筛选素材分组" value={filters.group} disabled={disabled}
            onChange={(event) => onChange({ ...filters, group: event.target.value })}>
            <option value="*">全部分组</option><option value="">默认分组</option>
            {groups.map((group) => <option key={group} value={group}>{group}</option>)}
        </select></label>
        {includeDate && <label>上传日期<input type="date" aria-label="上传日期" value={filters.date} disabled={disabled}
            onChange={(event) => onChange({ ...filters, date: event.target.value })} /></label>}
        {(filters.search || filters.group !== "*" || filters.date) && <button type="button" title="清空筛选" aria-label="清空筛选"
            disabled={disabled} onClick={() => onChange({ search: "", group: "*", date: "" })}><X size={17} /></button>}
    </div>;
}

export function MaterialPagination({ page, pages, onChange, disabled = false }: {
    page: number; pages: number; onChange: (page: number) => void; disabled?: boolean;
}) {
    if (pages <= 1) return null;
    return <nav className="materials-pagination" aria-label="素材分页">
        <button type="button" title="上一页" aria-label="上一页素材" disabled={disabled || page <= 1}
            onClick={() => onChange(page - 1)}><ChevronLeft size={18} /></button>
        <span>{page} / {pages}</span>
        <button type="button" title="下一页" aria-label="下一页素材" disabled={disabled || page >= pages}
            onClick={() => onChange(page + 1)}><ChevronRight size={18} /></button>
    </nav>;
}

export interface MaterialPickerProps {
    selectedIds: string[];
    onChange: (ids: string[], images: ProductImage[]) => void;
    max: number;
    disabled?: boolean;
    label?: string;
}

function PickerContent({ selectedIds, onChange, max, disabled, onClose }: MaterialPickerProps & { onClose: () => void }) {
    const query = useProductImagesQuery();
    const groups = useMaterialGroupsQuery();
    const [draft, setDraft] = useState(() => [...new Set(selectedIds)]);
    const [filters, setFilters] = useState<MaterialFilters>({ search: "", group: "*", date: "" });
    const [page, setPage] = useState(1);
    const images = query.data ?? [];
    const limit = Math.min(40, Math.max(0, Math.floor(max) || 0));
    useEffect(() => {
        if (query.isSuccess) setDraft((current) => reconcileMaterialIds(current, query.data));
    }, [query.isSuccess, query.data]);
    useEffect(() => {
        if (groups.isSuccess && filters.group && filters.group !== "*" && !groups.data.includes(filters.group)) {
            setFilters((current) => ({ ...current, group: "*" }));
            setPage(1);
        }
    }, [groups.isSuccess, groups.data, filters.group]);
    const filtered = filterMaterials(images, filters);
    const pages = Math.max(1, Math.ceil(filtered.length / 12));
    const currentPage = Math.min(page, pages);
    const selected = query.isSuccess ? reconcileMaterialIds(draft, images) : draft;
    const changeFilters = (next: MaterialFilters) => { setFilters(next); setPage(1); };
    return <MaterialDialog title="从素材库选择" onClose={onClose}>
        <MaterialFilterBar filters={filters} groups={groups.data ?? []} includeDate={false} onChange={changeFilters} />
        {groups.isError && <p role="alert" className="materials-warning">分组加载失败 <button type="button" onClick={() => void groups.refetch()}><RefreshCw size={14} />重试</button></p>}
        <div className="materials-count"><span>已选 {selected.length} / {limit}</span>
            <button type="button" title="刷新素材" aria-label="刷新素材" disabled={query.isFetching}
                onClick={() => void query.refetch()}><RefreshCw size={16} /></button></div>
        {query.isPending ? <p role="status">正在加载素材...</p> : query.isError ?
            <div className="materials-empty" role="alert"><FolderOpen size={36} /><p>素材加载失败，选择未被清除</p>
                <button type="button" onClick={() => void query.refetch()}><RefreshCw size={16} />重新加载</button></div> :
            !filtered.length ? <p className="materials-empty">{images.length ? "没有符合条件的素材" : "素材库暂无图片"}</p> :
                <div className="materials-grid materials-picker-grid">{filtered.slice((currentPage - 1) * 12, currentPage * 12).map((image) =>
                    <article key={image.id} className="material-item" data-selected={draft.includes(image.id)}>
                        <MaterialThumbnail image={image} />
                        <label className="material-choice"><input type="checkbox" aria-label={`选择 ${materialName(image)}`} checked={draft.includes(image.id)}
                            disabled={disabled || (!draft.includes(image.id) && selected.length >= limit)}
                            onChange={() => setDraft((current) => toggleMaterialId(current, image.id, limit))} />
                            <span title={materialName(image)}>{materialName(image)}</span></label>
                    </article>)}</div>}
        <MaterialPagination page={currentPage} pages={pages} onChange={setPage} />
        {selected.length > limit && <p role="alert">所选素材超过上限，请取消部分选择</p>}
        <footer><button type="button" onClick={onClose}><X size={16} />取消</button>
            <button type="button" className="materials-primary" disabled={disabled || !query.isSuccess || query.isFetching || selected.length > limit}
                onClick={() => { onChange(selected, selected.map((id) => images.find((image) => image.id === id)!)); onClose(); }}>确认选择 ({selected.length})</button></footer>
    </MaterialDialog>;
}

export default function MaterialPicker(props: MaterialPickerProps) {
    const [open, setOpen] = useState(false);
    return <div className="material-picker">
        <button type="button" className="materials-picker-trigger" disabled={props.disabled} onClick={() => setOpen(true)}><FolderOpen size={16} />{props.label ?? "从素材库选择"}</button>
        {open && <PickerContent {...props} onClose={() => setOpen(false)} />}
    </div>;
}