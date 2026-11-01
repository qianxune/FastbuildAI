import { ChevronLeft, ChevronRight, Download, FolderOpen, Image as ImageIcon, RefreshCw, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { fetchGenerationImage, useWorksQuery } from "../services/generation";
import { filterWorks, type WorkImage } from "../services/works";
import { TOOL_LABELS } from "./workspace-navigation";
import { TOOL_KEYS } from "../../api/shared/tools";

const PAGE_SIZE = 24;

export default function WorksView({ renderImage }: { renderImage: (work: WorkImage) => ReactNode }) {
    const works = useWorksQuery();
    const [tool, setTool] = useState("all");
    const [date, setDate] = useState("");
    const [task, setTask] = useState("all");
    const [status, setStatus] = useState("all");
    const [page, setPage] = useState(1);
    const [selectionMode, setSelectionMode] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [downloading, setDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState("");
    const records = works.data ?? [];
    const images = filterWorks(records, { tool, date, task }).filter(
        (work) => status === "all" || work.generation.status === status,
    );
    const pageCount = Math.max(1, Math.ceil(images.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount);
    const visible = images.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    const selectedImages = images.filter((work) => selected.has(work.key));
    const reset = () => { setPage(1); setSelected(new Set()); };

    const downloadSelected = async () => {
        if (downloading || !selectedImages.length) return;
        setDownloading(true);
        setDownloadError("");
        try {
            const { zipSync } = await import("fflate");
            const files: Record<string, Uint8Array> = {};
            for (const work of selectedImages) {
                const blob = await fetchGenerationImage(work.generation.id, work.index,
                    import.meta.env.VITE_APP_WEB_API_PREFIX || "api");
                const extension = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png";
                files[`${work.generation.id}-${work.index + 1}.${extension}`] = new Uint8Array(await blob.arrayBuffer());
            }
            const url = URL.createObjectURL(new Blob([new Uint8Array(zipSync(files, { level: 0 }))], { type: "application/zip" }));
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = "image-studio-works.zip";
            document.body.append(anchor);
            try { anchor.click(); } finally {
                anchor.remove();
                window.setTimeout(() => URL.revokeObjectURL(url), 60000);
            }
        } catch {
            setDownloadError("下载失败，请重试或逐张下载");
        } finally {
            setDownloading(false);
        }
    };

    return (
        <section className="works-view" aria-label="我的作品">
            <header className="works-heading">
                <h1>我的作品</h1>
                <button className="icon-btn" title="刷新作品" aria-label="刷新作品"
                    disabled={works.isFetching} onClick={() => void works.refetch()}><RefreshCw size={17} /></button>
            </header>
            <div className="works-tabs"><span><ImageIcon size={16} />图片作品</span></div>
            <div className="works-toolbar">
                <label>业务类型<select value={tool} disabled={downloading} onChange={(event) => { setTool(event.target.value); reset(); }}>
                    <option value="all">全部类型</option>{TOOL_KEYS.filter((key) => key !== "suggest" && key !== "cutout").map((key) => <option key={key} value={key}>{TOOL_LABELS[key]}</option>)}
                </select></label>
                <label>日期<input type="date" value={date} disabled={downloading} onChange={(event) => { setDate(event.target.value); reset(); }} /></label>
                <label>状态<select value={status} disabled={downloading} onChange={(event) => { setStatus(event.target.value); reset(); }}>
                    <option value="all">全部状态</option><option value="completed">已完成</option><option value="failed">失败</option>
                    <option value="cancelled">已取消</option><option value="processing">生成中</option><option value="queued">排队中</option>
                </select></label>
                <label className="works-task-filter">所属任务<select value={task} disabled={downloading} onChange={(event) => { setTask(event.target.value); reset(); }}>
                    <option value="all">全部任务</option>
                    {records.filter((item) => item.images.length > 0).map((item) => (
                        <option key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleString()} · {item.prompt.slice(0, 40)} · {item.id.slice(0, 8)}</option>
                    ))}
                </select></label>
                {(tool !== "all" || date || task !== "all" || status !== "all") && <button className="icon-btn" title="清空筛选" aria-label="清空筛选"
                    disabled={downloading} onClick={() => { setTool("all"); setDate(""); setTask("all"); setStatus("all"); reset(); }}><X size={16} /></button>}
                <div className="works-download-actions">
                    {selectionMode && <button className="btn btn-lime btn-sm" disabled={downloading || !selectedImages.length}
                        onClick={() => void downloadSelected()}><Download size={14} />{downloading ? "打包中..." : `下载 ${selectedImages.length} 张`}</button>}
                    <button className="btn btn-ghost btn-sm" aria-pressed={selectionMode} disabled={downloading || !images.length}
                        onClick={() => { setSelectionMode(!selectionMode); setSelected(new Set()); }}>
                        {selectionMode ? <X size={14} /> : <Download size={14} />}{selectionMode ? "取消选择" : "选择下载"}
                    </button>
                </div>
            </div>
            {downloadError && <p className="workflow-message error" role="alert">{downloadError}</p>}
            {works.isPending ? <p className="workflow-message" role="status">正在加载作品...</p> : works.isError ? (
                <div className="works-empty" role="alert"><FolderOpen size={42} /><h2>作品加载失败</h2>
                    <button className="btn btn-ghost btn-sm" disabled={works.isFetching} onClick={() => void works.refetch()}><RefreshCw size={14} />重新加载</button></div>
            ) : <>
                <div className="works-meta"><span>{images.length} 张作品</span><span>按创作日期倒序</span></div>
                {!images.length ? <div className="works-empty"><ImageIcon size={56} strokeWidth={1.2} />
                    <h2>{tool !== "all" || date || task !== "all" || status !== "all" ? "没有符合条件的作品" : "还没有作品"}</h2></div> : (
                    <div className="works-grid">{visible.map((work) => (
                        <article className="work-item" key={work.key}>
                            <div className="work-image">{renderImage(work)}
                                {selectionMode && <label className="work-select"><input type="checkbox" disabled={downloading}
                                    aria-label={`选择作品 ${work.generation.id} 第 ${work.index + 1} 张`} checked={selected.has(work.key)}
                                    onChange={(event) => { const next = new Set(selected); if (event.target.checked) next.add(work.key); else next.delete(work.key); setSelected(next); }} /></label>}
                            </div>
                            <div className="work-caption"><strong title={work.generation.prompt}>{work.generation.prompt}</strong>
                                <span>{TOOL_LABELS[work.generation.toolKey ?? "creative"]} · {work.index + 1}/{work.generation.images.length}</span>
                                <time dateTime={work.generation.createdAt}>{new Date(work.generation.createdAt).toLocaleString()}</time></div>
                        </article>
                    ))}</div>
                )}
                {pageCount > 1 && <nav className="history-pagination" aria-label="作品分页">
                    <button className="icon-btn" title="上一页作品" aria-label="上一页作品" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} /></button>
                    <span>{currentPage} / {pageCount}</span>
                    <button className="icon-btn" title="下一页作品" aria-label="下一页作品" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} /></button>
                </nav>}
            </>}
        </section>
    );
}