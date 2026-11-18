import { Popover, PopoverContent, PopoverTrigger } from "@buildingai/ui/components/ui/popover";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Download, FolderOpen, Image as ImageIcon, RefreshCw, Search, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { fetchGenerationImage, useWorksQuery } from "../services/generation";
import { filterWorks, type WorkImage } from "../services/works";
import { TOOL_GROUPS, TOOL_LABELS } from "./workspace-navigation";
import type { ToolKey } from "../../api/shared/tools";

const PAGE_SIZE = 24;

export default function WorksView({ renderImage }: { renderImage: (work: WorkImage) => ReactNode }) {
    const works = useWorksQuery();
    const [tools, setTools] = useState<ToolKey[]>([]);
    const [date, setDate] = useState("");
    const [task, setTask] = useState("all");
    const [status, setStatus] = useState("all");
    const [page, setPage] = useState(1);
    const [selectionMode, setSelectionMode] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [downloading, setDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState("");
    const [filterOpen, setFilterOpen] = useState<"tool" | "task" | null>(null);
    const [taskSearch, setTaskSearch] = useState("");
    const toolbar = useRef<HTMLDivElement>(null);
    const records = works.data ?? [];
    const images = filterWorks(records, { tools, date, task }).filter(
        (work) => status === "all" || work.generation.status === status,
    );
    const pageCount = Math.max(1, Math.ceil(images.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount);
    const visible = images.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    const selectedImages = images.filter((work) => selected.has(work.key));
    const hasFilters = tools.length > 0 || Boolean(date) || task !== "all" || status !== "all";
    const search = taskSearch.trim().toLowerCase();
    const taskOptions = records.filter((item) => item.images.length > 0)
        .filter((item) => `${item.id} ${item.prompt} ${TOOL_LABELS[item.toolKey ?? "creative"]}`.toLowerCase().includes(search))
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    const reset = () => { setPage(1); setSelected(new Set()); };

    const downloadSelected = async () => {
        if (downloading || !selectedImages.length) return;
        setFilterOpen(null);
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
            <div className="works-toolbar" ref={toolbar}>
                <Popover open={filterOpen === "tool"} onOpenChange={(open) => setFilterOpen(open ? "tool" : null)} modal={false}>
                    <PopoverTrigger asChild><button type="button" className="works-filter-trigger" aria-label="业务类型"
                        data-active={tools.length > 0 || undefined} title={tools.length ? tools.map((key) => TOOL_LABELS[key]).join("、") : "全部业务类型"}
                        disabled={downloading}>业务类型{tools.length > 0 && <span className="works-filter-count">{tools.length}</span>}<ChevronDown size={14} /></button></PopoverTrigger>
                    <PopoverContent className="works-filter-popover" align="start" sideOffset={10} collisionPadding={12}
                        container={toolbar.current?.closest<HTMLElement>(".studio-app") ?? undefined} aria-label="筛选业务类型">
                        <header className="works-filter-header"><h2>业务类型</h2><span>可多选 · 选择后立即生效</span></header>
                        <button type="button" className="works-filter-all" role="checkbox" aria-label="全部业务类型" aria-checked={!tools.length}
                            disabled={downloading} onClick={() => { setTools([]); reset(); }}>
                            <span className="works-filter-check">{!tools.length && <Check size={12} />}</span>全部
                        </button>
                        <div className="works-filter-groups">{TOOL_GROUPS.map((group) => <fieldset className="works-filter-group" key={group.name}>
                            <legend>{group.name}</legend><div>{group.tools.map((key) => <button key={key} type="button" role="checkbox"
                                className="works-type-option" aria-label={TOOL_LABELS[key]} aria-checked={tools.includes(key)} disabled={downloading}
                                onClick={() => { setTools((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key]); reset(); }}>
                                {tools.includes(key) && <Check size={12} />}{TOOL_LABELS[key]}
                            </button>)}</div>
                        </fieldset>)}</div>
                    </PopoverContent>
                </Popover>
                <label className="works-native-filter"><span className="sr-only">日期</span><input type="date" value={date} disabled={downloading} onChange={(event) => { setDate(event.target.value); reset(); }} /></label>
                <label className="works-native-filter"><span className="sr-only">状态</span><select value={status} disabled={downloading} onChange={(event) => { setStatus(event.target.value); reset(); }}>
                    <option value="all">全部状态</option><option value="completed">已完成</option><option value="failed">失败</option>
                    <option value="cancelled">已取消</option><option value="processing">生成中</option><option value="queued">排队中</option>
                </select></label>
                <Popover open={filterOpen === "task"} onOpenChange={(open) => { setFilterOpen(open ? "task" : null); if (open) setTaskSearch(""); }} modal={false}>
                    <PopoverTrigger asChild><button type="button" className="works-filter-trigger" aria-label="所属任务"
                        data-active={task !== "all" || undefined} title={task === "all" ? "全部任务" : records.find((item) => item.id === task)?.prompt || task}
                        disabled={downloading || works.isPending || works.isError}>所属任务{task !== "all" && <span className="works-filter-count">1</span>}<ChevronDown size={14} /></button></PopoverTrigger>
                    <PopoverContent className="works-filter-popover works-task-popover" align="start" sideOffset={10} collisionPadding={12}
                        container={toolbar.current?.closest<HTMLElement>(".studio-app") ?? undefined} aria-label="筛选所属任务">
                        <header className="works-filter-header"><h2>所属任务</h2><span>支持任务 ID 或名称搜索</span></header>
                        <div className="works-task-search"><Search size={15} /><input type="search" aria-label="搜索任务 ID 或任务名称"
                            placeholder="搜索任务 ID / 任务名称" value={taskSearch} disabled={downloading} onChange={(event) => setTaskSearch(event.target.value)} /></div>
                        <div className="works-task-list" role="group" aria-label="任务列表">
                            <button type="button" className="works-task-option works-task-all" aria-pressed={task === "all"} disabled={downloading}
                                onClick={() => { setTask("all"); setFilterOpen(null); reset(); }}><span>全部任务</span>{task === "all" && <Check size={14} />}</button>
                            {taskOptions.map((item) => <button key={item.id} type="button" className="works-task-option" aria-pressed={task === item.id}
                                disabled={downloading} onClick={() => { setTask(item.id); setFilterOpen(null); reset(); }}>
                                <span className="works-task-title"><strong title={item.prompt}>{item.prompt.trim() || TOOL_LABELS[item.toolKey ?? "creative"]}</strong>
                                    <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}</time></span>
                                <span className="works-task-details"><span title={item.id}>{item.id}</span>
                                    <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString("zh-CN")}</time></span>
                            </button>)}
                            {!taskOptions.length && <p className="works-task-empty" role="status">{search ? "未找到匹配任务" : "暂无有作品的任务"}</p>}
                        </div>
                    </PopoverContent>
                </Popover>
                {hasFilters && <button className="icon-btn" title="清空筛选" aria-label="清空筛选"
                    disabled={downloading} onClick={() => { setTools([]); setDate(""); setTask("all"); setStatus("all"); setTaskSearch(""); reset(); }}><X size={16} /></button>}
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
                    <h2>{hasFilters ? "没有符合条件的作品" : "还没有作品"}</h2></div> : (
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