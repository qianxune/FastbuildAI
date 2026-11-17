import { Check, LoaderCircle, Maximize, Plus, RefreshCw, Scan, Upload, X } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { FUSION_PRESETS } from "../../api/shared/tool-workflow";
import { loadProductImage, loadProductThumbnail } from "../services/generation";
import type { ProductImage } from "../services/types";
import MaterialPicker, { MaterialDialog } from "./material-picker";
import { acceptsAssetTransfer, normalizeRegion, regionFromPoints, type Region } from "./specialized-workflow";

export const FUSION_PRESET_IMAGES: Record<typeof FUSION_PRESETS[number]["id"], string> = {
    print: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=480&q=80",
    embroidery: "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=480&q=80",
    texture: "https://images.unsplash.com/photo-1600166898405-da9535204843?auto=format&fit=crop&w=480&q=80",
    sticker: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=480&q=80",
    foil: "/extension/image-studio/images/perfume-after.jpg",
    engrave: "https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=480&q=80",
    paint: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=480&q=80",
    desk: "/extension/image-studio/images/mug-scene.jpg",
    outfit: "/extension/image-studio/images/sneaker-after.jpg",
    interior: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=480&q=80",
    hand: "https://images.unsplash.com/photo-1556229010-6c3f2c9ca5f8?auto=format&fit=crop&w=480&q=80",
    gift: "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=480&q=80",
    food: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=480&q=80",
    organizer: "https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&w=480&q=80",
    shelf: "https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=480&q=80",
};

export interface FusionPresetGalleryProps {
    selected?: string;
    disabled?: boolean;
    onSelect: (id: typeof FUSION_PRESETS[number]["id"]) => void;
}

export function FusionPresetGallery({ selected, disabled, onSelect }: FusionPresetGalleryProps) {
    return <div className="specialized-gallery" aria-label="融合预设">
        {(["表面附着", "空间摆放"] as const).map((category) => <section key={category} className="specialized-band">
            <h3>{category}</h3>
            <div className="specialized-preset-grid">{FUSION_PRESETS.filter((preset) => preset.category === category).map((preset) =>
                <button key={preset.id} type="button" className="specialized-preset" aria-pressed={selected === preset.id}
                    title={preset.description} disabled={disabled} onClick={() => onSelect(preset.id)}>
                    <img src={FUSION_PRESET_IMAGES[preset.id]} alt={`${preset.label}素材示意`} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                    <span className="specialized-preset-heading"><strong>{preset.label}</strong>{selected === preset.id && <Check size={14} aria-hidden="true" />}</span>
                    <small className="specialized-preset-description">{preset.description}</small>
                </button>)}</div>
        </section>)}
    </div>;
}

export function ProtectedAsset({ image, original = false, onReady, available = true }: {
    image: ProductImage; original?: boolean; onReady?: (ready: boolean) => void; available?: boolean;
}) {
    const [loaded, setLoaded] = useState<{ id: string; url: string }>();
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let active = true;
        setLoaded(undefined); setFailed(false); onReady?.(false);
        if (!available) return;
        const release = (original ? loadProductImage : loadProductThumbnail)(image.id, (url) => {
            if (active) setLoaded({ id: image.id, url });
        }, () => { if (active) { setFailed(true); onReady?.(false); } });
        return () => { active = false; release(); onReady?.(false); };
    }, [image.id, original, attempt, onReady, available]);
    return !available ? <span role="status">图片不可用</span> : loaded?.id === image.id ? <img src={loaded.url} alt={image.name || "已选素材"} draggable={false}
        onLoad={() => onReady?.(true)} onError={() => { setLoaded(undefined); setFailed(true); onReady?.(false); }} /> : failed ?
        <button type="button" title="重新加载图片" aria-label="重新加载图片" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={18} />加载失败，重试</button> :
        <span className="specialized-loading" role="status" aria-label="图片加载中"><LoaderCircle size={20} /></span>;
}

export interface AssetRolePickerProps {
    label: string;
    images: ProductImage[];
    max: number;
    disabled: boolean;
    onChange: (images: ProductImage[]) => void;
    onFiles: (files: File[]) => void;
    original?: boolean;
    previewRegion?: Region;
    dropzone?: boolean;
    allowReplacement?: boolean;
    appearance?: "default" | "links" | "compact";
    title?: ReactNode;
    description?: ReactNode;
    uploadLink?: boolean;
}

export function AssetRolePicker({ label, images, max, disabled, onChange, onFiles, original = false, previewRegion, allowReplacement = false,
    appearance = "default", title, description }: AssetRolePickerProps) {
    const input = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);
    const replacing = allowReplacement && max === 1 && images.length === 1;
    const unavailable = disabled || (images.length >= max && !replacing);
    const materialPicker = <MaterialPicker selectedIds={images.map((image) => image.id)} max={max} disabled={disabled}
        onChange={(_ids, selected) => { if (!disabled) onChange(selected); }} />;
    const fileInput = <input ref={input} type="file" hidden multiple={max > 1} accept="image/png,image/jpeg,image/webp" disabled={unavailable}
        aria-label={`上传${label}`} onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; onFiles(files); }} />;
    return <section className={`specialized-assets image-upload-picker${appearance === "links" ? " asset-links" : ""}`} aria-label={label} tabIndex={0} data-dragging={dragging}
        onDragOver={(event) => {
            if (!acceptsAssetTransfer(event.target as HTMLElement, unavailable) || !Array.from(event.dataTransfer.types).includes("Files")) return;
            event.preventDefault(); event.stopPropagation(); setDragging(true);
        }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) setDragging(false); }}
        onDrop={(event) => {
            setDragging(false);
            if (!acceptsAssetTransfer(event.target as HTMLElement, unavailable) || !event.dataTransfer.files.length) return;
            event.preventDefault(); event.stopPropagation(); onFiles(Array.from(event.dataTransfer.files));
        }}
        onPaste={(event) => {
            if (!acceptsAssetTransfer(event.target as HTMLElement, unavailable) || !event.clipboardData.files.length) return;
            event.preventDefault(); event.stopPropagation(); onFiles(Array.from(event.clipboardData.files));
        }}>
        <div className={`specialized-section-heading image-upload-heading${appearance === "links" ? " asset-links-heading" : ""}`}>
            <div className="image-upload-title"><h3>{title ?? label}</h3><span>{images.length} / {max}</span></div>
            <div className="image-upload-library">{materialPicker}</div>
        </div>
        {description}
        {images.length > 0 ? <div className="specialized-thumbnails image-upload-thumbnails">{images.map((image, index) => <div key={image.id} className="specialized-thumbnail" data-original={original}>
            <div className="image-upload-preview" style={original ? { aspectRatio: `${image.width} / ${image.height}`, width: `min(100%, ${100 * image.width / image.height}px)`, height: "auto" } : undefined}>
                <ProtectedAsset image={image} original={original} />
                {original && previewRegion && <span className="specialized-region-rect" style={{ left: `${previewRegion.x * 100}%`, top: `${previewRegion.y * 100}%`, width: `${previewRegion.width * 100}%`, height: `${previewRegion.height * 100}%` }} />}
            </div>
            <span className="specialized-asset-order">{index + 1}</span>
            <button type="button" className="specialized-remove" title={`移除${label} ${index + 1}`} aria-label={`移除${label} ${index + 1}`} disabled={disabled}
                onClick={() => onChange(images.filter((item) => item.id !== image.id))}><X size={15} /></button>
        </div>)}
            {(images.length < max || replacing) && <button type="button" className="image-upload-add" aria-label={replacing ? "重新上传" : `继续上传${label}`} title={replacing ? "重新上传" : "继续添加图片"} disabled={unavailable} onClick={() => input.current?.click()}><Plus size={20} /></button>}
        </div> : <div className="image-upload-area">
            <button type="button" className="image-upload-zone" disabled={unavailable} onClick={() => input.current?.click()}>
                <span className="image-upload-command"><Upload size={16} /><span>上传图片</span></span>
                <span className="image-upload-hint">最多 {max} 张 · PNG / JPEG / WebP · 每张不超过 10 MB</span>
            </button>
        </div>}
        {fileInput}
    </section>;
}

export interface SkuRegionEditorProps {
    image: ProductImage;
    region?: Region;
    disabled: boolean;
    onChange: (region: Region) => void;
    onClose: () => void;
    title?: string;
}

export function SkuRegionEditor({ image, region, disabled, onChange, onClose, title = "SKU 编辑参考区域" }: SkuRegionEditorProps) {
    const [draft, setDraft] = useState<Region>(region ?? { x: 0, y: 0, width: 1, height: 1 });
    const [selected, setSelected] = useState(Boolean(region));
    const [ready, setReady] = useState(false);
    const drag = useRef<{ pointerId: number; x: number; y: number; previous: Region; selected: boolean } | undefined>(undefined);
    const point = (event: PointerEvent<HTMLDivElement>) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        return { x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
            y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)) };
    };
    return <MaterialDialog title={title} onClose={onClose} busy={disabled}>
        <div className="specialized-region-editor">
            <p>区域仅作为编辑参考，不是像素蒙版。</p>
            <div className="specialized-region-stage" data-ready={ready} style={{ aspectRatio: `${image.width} / ${image.height}`, width: `min(100%, ${54 * image.width / image.height}dvh, 560px)` }}
                onPointerDown={(event) => {
                    if (disabled || !ready || event.button !== 0 || !event.isPrimary) return;
                    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
                    drag.current = { ...point(event), pointerId: event.pointerId, previous: draft, selected };
                }}
                onPointerMove={(event) => {
                    if (disabled || drag.current?.pointerId !== event.pointerId) return;
                    setDraft(regionFromPoints(drag.current, point(event))); setSelected(true);
                }}
                onPointerUp={(event) => {
                    if (drag.current?.pointerId !== event.pointerId) return;
                    if (!disabled) { setDraft(regionFromPoints(drag.current, point(event))); setSelected(true); }
                    drag.current = undefined; event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerCancel={() => {
                    if (drag.current) { setDraft(drag.current.previous); setSelected(drag.current.selected); }
                    drag.current = undefined;
                }}>
                <ProtectedAsset image={image} original onReady={setReady} />
                {ready && selected && <span className="specialized-region-rect" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.width * 100}%`, height: `${draft.height * 100}%` }} />}
            </div>
            <div className="specialized-grid">{(["x", "y", "width", "height"] as const).map((key) => <label key={key}>
                {{ x: "横向位置", y: "纵向位置", width: "宽度", height: "高度" }[key]} (%)
                <input type="number" aria-label={`${key} (%)`} min={key === "width" || key === "height" ? 1 : 0} max={100} step={1}
                    value={Math.round(draft[key] * 100)} disabled={disabled || !ready} onChange={(event) => {
                        setDraft(normalizeRegion({ ...draft, [key]: Number(event.target.value) / 100 })); setSelected(true);
                    }} />
            </label>)}</div>
            <button type="button" disabled={disabled || !ready} onClick={() => { setDraft({ x: 0, y: 0, width: 1, height: 1 }); setSelected(true); }}><Maximize size={16} />选择整图</button>
            <footer><button type="button" disabled={disabled} onClick={onClose}><X size={16} />取消</button>
                <button type="button" disabled={disabled || !ready || !selected} onClick={() => { onChange(draft); onClose(); }}><Scan size={16} />确认区域</button></footer>
        </div>
    </MaterialDialog>;
}