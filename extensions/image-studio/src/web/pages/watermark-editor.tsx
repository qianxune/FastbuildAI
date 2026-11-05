import { Circle, Eraser, Hand, ImagePlus, Lasso, LoaderCircle, Minus, MousePointer2, Paintbrush, Plus, Redo2, RefreshCw, Scan, Trash2, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { WATERMARK_MARK_LIMIT } from "../../api/shared/tool-workflow";
import { loadProductImage } from "../services/generation";
import type { ProductImage } from "../services/types";
import { ProtectedAsset } from "./specialized-components";
import { normalizeRegion, regionFromPoints, transformWatermarkMark, type WatermarkHistory, type WatermarkMark } from "./specialized-workflow";

export interface WatermarkEditorProps {
    image?: ProductImage;
    history: WatermarkHistory;
    selected: string;
    disabled: boolean;
    onSelect: (id: string) => void;
    onChange: (marks: WatermarkMark[]) => void;
    onHistory: (direction: "undo" | "redo") => void;
    onReady?: (ready: boolean) => void;
    variant?: "sku" | "redraw" | "cutout";
    readOnly?: boolean;
    instruction?: string;
    onInstructionChange?: (value: string) => void;
}

export function WatermarkMarkList({ image, history, selected, disabled, onSelect, onChange, variant }: WatermarkEditorProps) {
    const label = variant === "redraw" ? "重绘区域" : "水印标记";
    return <section className="watermark-mark-section" aria-label={label}>
        <div className="specialized-section-heading"><h3>{label}</h3><span>{history.marks.length} / {WATERMARK_MARK_LIMIT}</span></div>
        {!history.marks.length && <div className="watermark-mark-empty"><Scan size={22} /><span>暂无标记</span></div>}
        <div className="watermark-mark-list">{history.marks.map((mark, index) => <div key={mark.id} className="watermark-mark-row" data-selected={selected === mark.id}>
            <button type="button" className="watermark-mark-select" disabled={disabled} aria-pressed={selected === mark.id} onClick={() => onSelect(mark.id)}>
                <span className="watermark-mark-dot" /><span>标注 {index + 1}</span>
                {image && <span className="watermark-mark-crop"><span style={{ width: `${100 / mark.region.width}%`, height: `${100 / mark.region.height}%`,
                    left: `${-100 * mark.region.x / mark.region.width}%`, top: `${-100 * mark.region.y / mark.region.height}%` }}><ProtectedAsset image={image} original /></span></span>}
            </button>
            <button type="button" className="watermark-mark-delete" title={`删除标注 ${index + 1}`} aria-label={`删除标注 ${index + 1}`} disabled={disabled}
                onClick={() => onChange(history.marks.filter((item) => item.id !== mark.id))}><X size={12} /></button>
        </div>)}</div>
    </section>;
}

type Point = { x: number; y: number };
type Draft = { pointerId: number; imageId: string; start: Point; end: Point; points: Point[]; brushWidth: number; radiusY: number;
    mode: "rectangle" | "brush" | "ellipse" | "lasso"; mark?: WatermarkMark; handle?: string };

function draftMark(draft: Draft): WatermarkMark {
    if (draft.mark) return transformWatermarkMark(draft.mark, draft.end.x - draft.start.x, draft.end.y - draft.start.y, draft.handle);
    if (draft.mode === "rectangle" || draft.mode === "ellipse") return { id: "draft", region: regionFromPoints(draft.start, draft.end), ...(draft.mode === "ellipse" ? { shape: "ellipse" as const } : {}) };
    const left = Math.max(0, Math.min(...draft.points.map((point) => point.x)) - draft.brushWidth / 2);
    const top = Math.max(0, Math.min(...draft.points.map((point) => point.y)) - draft.radiusY);
    const right = Math.min(1, Math.max(...draft.points.map((point) => point.x)) + draft.brushWidth / 2);
    const bottom = Math.min(1, Math.max(...draft.points.map((point) => point.y)) + draft.radiusY);
    return { id: "draft", region: normalizeRegion({ x: left, y: top, width: right - left, height: bottom - top }), points: draft.points, brushWidth: draft.brushWidth,
        ...(draft.mode === "lasso" ? { shape: "lasso" as const } : {}) };
}

export function WatermarkCanvas({ image, history, selected, disabled, onSelect, onChange, onHistory, onReady, variant, readOnly = false, instruction, onInstructionChange }: WatermarkEditorProps) {
    const [mode, setMode] = useState<"hand" | "brush" | "rectangle" | "eraser" | "ellipse" | "lasso">(variant === "redraw" ? "brush" : "rectangle");
    const [brushSize, setBrushSize] = useState(variant === "sku" || variant === "redraw" ? 30 : 12);
    const [cursor, setCursor] = useState<Point>();
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
    const [draft, setDraft] = useState<Draft>();
    const [loaded, setLoaded] = useState<{ id: string; url: string; version: number }>();
    const [decoded, setDecoded] = useState("");
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const stage = useRef<HTMLDivElement>(null);
    const viewport = useRef<HTMLDivElement>(null);
    const panDrag = useRef<{ pointerId: number; start: Point; origin: Point } | undefined>(undefined);
    const sequence = useRef(0);
    const loadVersion = useRef(0);
    const current = useRef({ disabled, imageId: image?.id });
    current.current = { disabled, imageId: image?.id };
    useEffect(() => {
        let active = true;
        const version = ++loadVersion.current;
        setLoaded(undefined); setDecoded(""); setFailed(false); setDraft(undefined); setZoom(1); setPan({ x: 0, y: 0 }); panDrag.current = undefined;
        if (!image) return;
        const release = loadProductImage(image.id, (url) => { if (active) setLoaded({ id: image.id, url, version }); }, () => { if (active) setFailed(true); });
        return () => { active = false; ++loadVersion.current; release(); };
    }, [image?.id, attempt]);
    useEffect(() => { if (disabled) { setDraft(undefined); panDrag.current = undefined; } }, [disabled]);
    const ready = Boolean(image && loaded?.id === image.id && decoded === image.id && !failed);
    useEffect(() => { onReady?.(ready); return () => onReady?.(false); }, [ready, onReady]);
    const blocked = disabled || readOnly || !ready;
    const candidate = draft ? draftMark(draft) : undefined;
    const visibleMarks = candidate ? draft?.mark ? history.marks.map((mark) => mark.id === candidate.id ? candidate : mark) : [...history.marks, candidate] : history.marks;

    function point(event: PointerEvent): Point {
        const bounds = stage.current!.getBoundingClientRect();
        return { x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)), y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)) };
    }
    function begin(event: PointerEvent, mark?: WatermarkMark, handle = "move") {
        if (event.button !== 0 || blocked || current.current.disabled || current.current.imageId !== image?.id || mode === "hand" || draft || !image || !stage.current) return;
        const markId = mark?.id;
        if (mode === "eraser") { event.preventDefault(); event.stopPropagation(); if (markId) onChange(history.marks.filter((item) => item.id !== markId)); return; }
        if (variant === "redraw" && mode === "brush") mark = undefined;
        if (!mark && history.marks.length >= WATERMARK_MARK_LIMIT) return;
        event.preventDefault(); event.stopPropagation(); stage.current.focus(); stage.current.setPointerCapture(event.pointerId);
        const start = point(event), bounds = stage.current.getBoundingClientRect();
        if (mark) onSelect(mark.id);
        setDraft({ pointerId: event.pointerId, imageId: image.id, start, end: start, points: [start], brushWidth: mode === "lasso" ? 0 : brushSize / bounds.width, radiusY: mode === "lasso" ? 0 : brushSize / 2 / bounds.height,
            mode: mode === "brush" || mode === "ellipse" || mode === "lasso" ? mode : "rectangle", mark, handle });
    }
    function advance(event: PointerEvent): Draft | undefined {
        if (!draft || event.pointerId !== draft.pointerId || current.current.disabled || current.current.imageId !== draft.imageId || !stage.current) return;
        const end = point(event);
        return { ...draft, end, points: (draft.mode === "brush" || draft.mode === "lasso") && !draft.mark && draft.points.length < 2000 ? [...draft.points, end] : draft.points };
    }
    function finish(event: PointerEvent) {
        const next = advance(event);
        setDraft(undefined);
        if (!next || blocked) return;
        const bounds = stage.current!.getBoundingClientRect();
        if (!next.mark && (next.mode === "rectangle" || next.mode === "ellipse") && (Math.abs(next.end.x - next.start.x) * bounds.width < 6 || Math.abs(next.end.y - next.start.y) * bounds.height < 6)) return;
        if (!next.mark && next.mode === "lasso" && (next.points.length < 3 || draftMark(next).region.width * bounds.width < 6 || draftMark(next).region.height * bounds.height < 6)) return;
        const mark = draftMark(next);
        if (!next.mark) mark.id = `mark-${Date.now()}-${++sequence.current}`;
        onChange(next.mark ? history.marks.map((item) => item.id === mark.id ? mark : item) : [...history.marks, mark]);
        onSelect(mark.id);
    }
    function keyboard(event: KeyboardEvent<HTMLDivElement>) {
        if (blocked || (event.target as HTMLElement).closest("button,input,textarea,select")) return;
        const key = event.key.toLowerCase();
        if ((event.ctrlKey || event.metaKey) && (key === "z" || key === "y")) {
            event.preventDefault(); onHistory(key === "y" || event.shiftKey ? "redo" : "undo");
        } else if ((key === "delete" || key === "backspace") && selected) {
            event.preventDefault(); onChange(history.marks.filter((mark) => mark.id !== selected));
        } else if (["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key) && selected && image) {
            event.preventDefault();
            const amount = event.shiftKey ? 10 : 1;
            onChange(history.marks.map((mark) => mark.id === selected ? transformWatermarkMark(mark,
                key === "arrowleft" ? -amount / image.width : key === "arrowright" ? amount / image.width : 0,
                key === "arrowup" ? -amount / image.height : key === "arrowdown" ? amount / image.height : 0) : mark));
        } else if (variant === "sku" && !event.ctrlKey && !event.metaKey && !event.altKey && ["h", "e", "r", "o", "b", "l"].includes(key)) {
            event.preventDefault(); setDraft(undefined); setMode(({ h: "hand", e: "eraser", r: "rectangle", o: "ellipse", b: "brush", l: "lasso" } as const)[key as "h" | "e" | "r" | "o" | "b" | "l"]);
        } else if (key === "escape") { setDraft(undefined); onSelect(""); }
    }
    return <div className={`watermark-editor${variant === "redraw" ? " redraw-editor" : variant === "cutout" ? " cutout-editor" : ""}`} aria-label={variant === "sku" ? "SKU 区域画布" : variant === "redraw" ? "局部重绘画布" : variant === "cutout" ? "抠图原图预览" : "水印编辑画布"} onKeyDown={keyboard}>
        {!readOnly && <div className="watermark-tools" role="group" aria-label="标记工具">
            {([{ id: "hand", label: "抓手", icon: Hand, title: "拖动查看图片" }, { id: "brush", label: variant === "redraw" ? "涂抹" : "画笔", icon: Paintbrush, title: "画笔标记：按笔迹覆盖范围指导模型，不是像素蒙版" },
                { id: "rectangle", label: "框选", icon: Scan, title: variant === "sku" ? "框选变体区域" : variant === "redraw" ? "框选重绘区域" : "框选水印区域" },
                ...(variant === "redraw" ? [{ id: "eraser", label: "擦除", icon: Eraser, title: "删除笔迹所在区域" }] as const : []),
                ...(variant === "sku" ? [{ id: "eraser", label: "擦除", icon: Eraser, title: "删除选中的区域" }, { id: "ellipse", label: "圆选", icon: Circle, title: "圆形选区：按外接矩形指导模型" },
                    { id: "lasso", label: "套索", icon: Lasso, title: "套索选区：按覆盖范围指导模型" }] as const : [])] as const).map((item) => <button key={item.id} type="button" title={item.title} aria-label={item.label}
                    aria-pressed={mode === item.id} disabled={blocked} onClick={() => { setDraft(undefined); setMode(item.id); }}><item.icon size={15} /><span>{item.label}</span></button>)}
            {(variant === "sku" || variant === "redraw") && <label className="sku-brush-size">大小<input type="range" min={2} max={80} step={1} value={brushSize} aria-label="画笔大小" disabled={blocked}
                onChange={(event) => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 2 && value <= 80) setBrushSize(value); }} /><output>{brushSize}</output></label>}
        </div>}
        <div ref={viewport} className="watermark-viewport" data-mode={mode}
            onPointerDown={(event) => {
                if (blocked || mode !== "hand" || event.button !== 0 || panDrag.current) return;
                event.preventDefault(); viewport.current?.setPointerCapture(event.pointerId);
                panDrag.current = { pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: pan };
            }}
            onPointerMove={(event) => {
                const drag = panDrag.current, bounds = viewport.current?.getBoundingClientRect(), imageBounds = stage.current?.getBoundingClientRect();
                if (!drag || drag.pointerId !== event.pointerId || blocked || !bounds || !imageBounds) return;
                const limitX = (bounds.width + imageBounds.width) / 2 - 40, limitY = (bounds.height + imageBounds.height) / 2 - 40;
                setPan({ x: Math.max(-limitX, Math.min(limitX, drag.origin.x + event.clientX - drag.start.x)), y: Math.max(-limitY, Math.min(limitY, drag.origin.y + event.clientY - drag.start.y)) });
            }} onPointerUp={() => { panDrag.current = undefined; }} onPointerCancel={() => { panDrag.current = undefined; }}>
            {!image ? <div className={`watermark-canvas-empty${variant === "redraw" || variant === "cutout" ? " regional-edit-example" : ""}`}>
                {variant === "redraw" || variant === "cutout" ? <img src="/extension/image-studio/images/mug-scene.jpg" alt="商品素材示例" /> : <ImagePlus size={42} />}
                <h3>{variant === "redraw" ? "局部重绘" : variant === "cutout" ? "一键抠图" : "去除水印"}</h3></div> :
                failed ? <button type="button" className="watermark-load-error" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={18} />重新加载原图</button> :
                !loaded || loaded.id !== image.id ? <span role="status" className="watermark-canvas-empty"><LoaderCircle className="spin" size={26} />原图加载中</span> :
                <div ref={stage} className="watermark-image-stage" tabIndex={0} role="group" aria-label="原图标记区域" data-mode={mode}
                    style={{ aspectRatio: `${image.width} / ${image.height}`, width: `min(100%, ${480 * image.width / image.height}px, 640px, calc(100cqh * ${image.width / image.height}))`, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
                    onPointerDown={(event) => begin(event)} onPointerMove={(event) => { if (variant === "redraw" && mode === "brush" && !blocked) setCursor(point(event)); const next = advance(event); if (next) setDraft(next); }}
                    onPointerLeave={() => setCursor(undefined)}
                    onPointerUp={finish} onPointerCancel={() => setDraft(undefined)} onLostPointerCapture={() => setDraft(undefined)}>
                    <img src={loaded.url} alt={image.name || (variant === "sku" ? "SKU 模板图" : variant === "redraw" ? "待重绘原图" : variant === "cutout" ? "待抠图原图" : "待去水印原图")} draggable={false}
                        onLoad={() => { if (loaded.version === loadVersion.current) setDecoded(image.id); }} onError={() => { if (loaded.version === loadVersion.current) { setFailed(true); setDecoded(""); } }} />
                    <svg className="watermark-brush-layer" viewBox={`0 0 ${image.width} ${image.height}`} aria-hidden="true">{visibleMarks.filter((mark) => mark.points).map((mark) =>
                        <polyline key={mark.id} points={mark.points!.map((position) => `${position.x * image.width},${position.y * image.height}`).join(" ")}
                            fill="none" stroke="currentColor" strokeWidth={mark.shape === "lasso" ? 2 : (mark.brushWidth ?? .02) * image.width} strokeLinecap="round" strokeLinejoin="round"
                            style={variant === "redraw" ? { pointerEvents: mode === "eraser" && !blocked ? "stroke" : "none" } : undefined}
                            onPointerDown={variant === "redraw" ? (event) => { if (mode === "eraser") begin(event, mark); } : undefined} />)}</svg>
                    {visibleMarks.map((mark, index) => <div key={mark.id} className="watermark-region" data-selected={selected === mark.id || mark.id === "draft"}
                        data-brush={variant === "redraw" && Boolean(mark.points) && !mark.shape}
                        style={{ left: `${mark.region.x * 100}%`, top: `${mark.region.y * 100}%`, width: `${mark.region.width * 100}%`, height: `${mark.region.height * 100}%`, borderRadius: mark.shape === "ellipse" ? "50%" : undefined, pointerEvents: mode === "hand" || readOnly || (variant === "redraw" && mark.points && !mark.shape) ? "none" : undefined }}
                        onPointerDown={(event) => begin(event, mark)}>
                        <button type="button" className="watermark-region-number" title={`选择标注 ${index + 1}`} aria-label={`选择标注 ${index + 1}`} disabled={blocked}
                            style={variant === "redraw" && mark.points?.[0] && !mark.shape ? { left: `${(mark.points[0].x - mark.region.x) / mark.region.width * 100}%`, top: `${(mark.points[0].y - mark.region.y) / mark.region.height * 100}%`, transform: "translate(-50%, -50%)", pointerEvents: mode === "hand" || readOnly ? "none" : "auto" } : undefined}
                            onPointerDown={(event) => event.stopPropagation()} onClick={() => { onSelect(mark.id); stage.current?.focus(); }}>{index + 1}</button>
                        {selected === mark.id && !blocked && !(variant === "redraw" && mark.points && !mark.shape) && ["n", "ne", "e", "se", "s", "sw", "w", "nw"].map((handle) => <span key={handle} className="watermark-resize-handle" data-handle={handle}
                            onPointerDown={(event) => begin(event, mark, handle)} />)}
                    </div>)}
                    {variant === "redraw" && mode === "brush" && cursor && !blocked && <span className="redraw-brush-cursor" aria-hidden="true"
                        style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%`, width: brushSize / zoom, height: brushSize / zoom }} />}
                </div>}
        </div>
        {!readOnly && <div className="watermark-view-tools" role="group" aria-label="画布操作">
            <button type="button" title="撤销" aria-label="撤销" disabled={blocked || !history.past.length} onClick={() => onHistory("undo")}><Undo2 size={15} /></button>
            <button type="button" title="重做" aria-label="重做" disabled={blocked || !history.future.length} onClick={() => onHistory("redo")}><Redo2 size={15} /></button>
            <button type="button" title="清空全部标记" aria-label="清空全部标记" disabled={blocked || !history.marks.length} onClick={() => onChange([])}><Trash2 size={15} /></button>
            <span className="watermark-tools-divider" />
            <button type="button" title="缩小" aria-label="缩小" disabled={blocked || zoom <= .5} onClick={() => setZoom((value) => Math.max(.5, value - .25))}><Minus size={15} /></button>
            <button type="button" className="watermark-zoom-value" title="恢复适配视图" aria-label="恢复适配视图" disabled={blocked} onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>{Math.round(zoom * 100)}%</button>
            <button type="button" title="放大" aria-label="放大" disabled={blocked || zoom >= 3} onClick={() => setZoom((value) => Math.min(3, value + .25))}><Plus size={15} /></button>
            <button type="button" title="取消选择" aria-label="取消选择" disabled={blocked || !selected} onClick={() => onSelect("")}><MousePointer2 size={15} /></button>
        </div>}
    </div>;
}