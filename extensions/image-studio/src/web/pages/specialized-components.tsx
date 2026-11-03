import { ArrowRight, Check, ImagePlus, LoaderCircle, Maximize, RefreshCw, Scan, Upload, X } from "lucide-react";
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
                    <span><strong>{preset.label}</strong>{selected === preset.id ? <Check size={16} /> : <ArrowRight size={16} />}</span>
                </button>)}</div>
        </section>)}
    </div>;
}

export function ProtectedAsset({ image, original = false, onReady }: {
    image: ProductImage; original?: boolean; onReady?: (ready: boolean) => void;
}) {
    const [loaded, setLoaded] = useState<{ id: string; url: string }>();
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let active = true;
        setLoaded(undefined); setFailed(false); onReady?.(false);
        const release = (original ? loadProductImage : loadProductThumbnail)(image.id, (url) => {
            if (active) { setLoaded({ id: image.id, url }); onReady?.(true); }
        }, () => { if (active) { setFailed(true); onReady?.(false); } });
        return () => { active = false; release(); };
    }, [image.id, original, attempt, onReady]);
    return loaded?.id === image.id ? <img src={loaded.url} alt={image.name || "已选素材"} draggable={false} /> : failed ?
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
    appearance?: "default" | "links";
    title?: ReactNode;
    description?: ReactNode;
    uploadLink?: boolean;
}

export function AssetRolePicker({ label, images, max, disabled, onChange, onFiles, original = false, previewRegion, dropzone = false, allowReplacement = false,
    appearance = "default", title, description, uploadLink = false }: AssetRolePickerProps) {
    const input = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);
    const replacing = allowReplacement && max === 1 && images.length === 1;
    const unavailable = disabled || (images.length >= max && !replacing);
    const materialPicker = <MaterialPicker selectedIds={images.map((image) => image.id)} max={max} disabled={disabled} label={appearance === "links" ? "从素材库导入" : undefined}
        onChange={(_ids, selected) => { if (!disabled) onChange(selected); }} />;
    const fileInput = <input ref={input} type="file" hidden multiple={max > 1} accept="image/png,image/jpeg,image/webp" disabled={unavailable}
        aria-label={`上传${label}`} onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; onFiles(files); }} />;
    if (appearance === "links") return <section className="specialized-assets asset-links" aria-label={label} tabIndex={0} data-dragging={dragging}
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
        <div className="asset-links-heading"><h3>{title ?? label}</h3><div className="asset-links-actions">
            {uploadLink && <button type="button" className="asset-link" disabled={unavailable} onClick={() => input.current?.click()}>{replacing ? "重新上传" : "上传参考图"}</button>}
            {materialPicker}
            <button type="button" className="asset-link" disabled={unavailable} title="在手机上可拍照或从相册选择" onClick={() => input.current?.click()}>手机上传</button>
        </div></div>
        {description}
        {(images.length > 0 || dropzone) && <div className="asset-links-body">
            {dropzone && !images.length && <button type="button" className="asset-links-dropzone" disabled={unavailable} onClick={() => input.current?.click()}><ImagePlus size={24} /><span>上传图片</span></button>}
            {images.map((image) => <div key={image.id} className="specialized-thumbnail">
                <ProtectedAsset image={image} />
                <button type="button" className="specialized-remove" title={`移除${label}`} aria-label={`移除${label}`} disabled={disabled}
                    onClick={() => onChange(images.filter((item) => item.id !== image.id))}><X size={14} /></button>
            </div>)}
        </div>}
        {fileInput}
    </section>;
    return <section className="specialized-assets" aria-label={label} tabIndex={0} data-dragging={dragging}
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
        <div className="specialized-section-heading"><h3>{label}</h3>{dropzone ? materialPicker : <span>{images.length} / {max}</span>}</div>
        {dropzone && !images.length && <button type="button" className="retouch-upload-dropzone" disabled={unavailable} onClick={() => input.current?.click()}><ImagePlus size={22} /><strong>上传图片</strong><small>PNG / JPEG / WebP · 最多 1 张 · 10 MiB</small></button>}
        <div className="specialized-thumbnails">{images.map((image, index) => <div key={image.id} className="specialized-thumbnail" data-original={original}
            style={original ? { aspectRatio: `${image.width} / ${image.height}`, width: `min(100%, ${240 * image.width / image.height}px)`, height: "auto" } : undefined}>
            <ProtectedAsset image={image} original={original} />
            {original && previewRegion && <span className="specialized-region-rect" style={{ left: `${previewRegion.x * 100}%`, top: `${previewRegion.y * 100}%`, width: `${previewRegion.width * 100}%`, height: `${previewRegion.height * 100}%` }} />}
            <span className="specialized-asset-order">{index + 1}</span>
            <button type="button" className="specialized-remove" title={`移除${label} ${index + 1}`} aria-label={`移除${label} ${index + 1}`} disabled={disabled}
                onClick={() => onChange(images.filter((item) => item.id !== image.id))}><X size={15} /></button>
        </div>)}</div>
        <div className="specialized-asset-actions">
            {!dropzone && <><button type="button" disabled={unavailable} onClick={() => input.current?.click()}><Upload size={16} />{replacing ? "重新上传" : allowReplacement ? "上传参考图" : "上传图片"}</button>{materialPicker}</>}
            {fileInput}
        </div>
        {!dropzone && !images.length && <div className="specialized-drop-hint"><ImagePlus size={22} /><span>PNG / JPEG / WebP · 每张不超过 10 MiB</span></div>}
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