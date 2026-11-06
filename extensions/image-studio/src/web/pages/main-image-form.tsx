import { Popover, PopoverContent, PopoverTrigger } from "@buildingai/ui/components/ui/popover";
import { Check, ChevronDown, ChevronRight, ImagePlus, LayoutTemplate, LoaderCircle, Minus, Plus, RefreshCw, Settings, Sparkles, Trash2, Upload, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import {
    MAIN_IMAGE_LIMIT,
    MAIN_IMAGE_TYPES,
    MAIN_LANGUAGES,
    MAIN_PLATFORMS,
    MAIN_RATIOS,
    MAIN_RESOLUTIONS,
    MAX_SELLING_LAYOUTS,
    SELLING_IMAGE_LAYOUTS,
    type MainImageInput,
    type SellingImageLayoutId,
} from "../../api/shared/main-image";
import type { CapabilityModel } from "../../api/shared/tools";
import {
    loadProductImage,
    useAnalyzeProductMutation,
    useUploadProductImageMutation,
    useProductImagesQuery,
    useGenerationBilling,
} from "../services/generation";
import type { ProductImage } from "../services/types";
import MaterialPicker from "./material-picker";

export default function MainImageForm({
    models,
    visionModels = [],
    available,
    locked,
    onSubmit,
    requestedMaterial,
    onMaterialConsumed,
}: {
    models: CapabilityModel[];
    visionModels?: CapabilityModel[];
    available: boolean;
    locked: boolean;
    onSubmit: (input: MainImageInput) => Promise<void>;
    requestedMaterial?: { image: ProductImage; requestId: number } | null;
    onMaterialConsumed?: (requestId: number) => void;
}) {
    const id = useId();
    const fileInput = useRef<HTMLInputElement>(null);
    const settingsTrigger = useRef<HTMLButtonElement>(null);
    const layoutDialog = useRef<HTMLDialogElement>(null);
    const [sellingLayouts, setSellingLayouts] = useState<SellingImageLayoutId[]>([]);
    const [layoutDraft, setLayoutDraft] = useState<SellingImageLayoutId[]>([]);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const consumedMaterial = useRef<number | null>(null);
    const uploadInFlight = useRef(false);
    const [products, setProducts] = useState<ProductImage[]>([]);
    const upload = useUploadProductImageMutation();
    const materials = useProductImagesQuery();
    const analysis = useAnalyzeProductMutation();
    const [assetIds, setAssetIds] = useState<string[]>([]);
    const [uploading, setUploading] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [productName, setProductName] = useState("");
    const [brand, setBrand] = useState("");
    const [modelId, setModelId] = useState("");
    const [visionModelId, setVisionModelId] = useState("");
    const [platform, setPlatform] = useState<MainImageInput["platform"]>(MAIN_PLATFORMS[0]);
    const [language, setLanguage] = useState<MainImageInput["language"]>(MAIN_LANGUAGES[0]);
    const [ratio, setRatio] = useState<MainImageInput["ratio"]>("1:1");
    const [resolution, setResolution] = useState<MainImageInput["resolution"]>("2K");
    const [counts, setCounts] = useState<MainImageInput["counts"]>({
        white: 1,
        scene: 1,
        selling: 1,
        other: 0,
    });
    const [description, setDescription] = useState("");
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    const sellingCapacity = MAX_SELLING_LAYOUTS;
    const appliedSellingCount = Math.max(counts.selling, layoutDraft.length);
    const appliedTotal = total - counts.selling + appliedSellingCount;
    const selectedModelId = models.some((model) => model.id === modelId)
        ? modelId
        : (models[0]?.id ?? "");
    const selectedVisionModelId = visionModels.some((model) => model.id === visionModelId)
        ? visionModelId : (visionModels[0]?.id ?? "");
    const disabled = locked || uploading || analysis.isPending;
    const billing = useGenerationBilling(selectedModelId, total, available, "main");

    useEffect(() => { if (disabled) layoutDialog.current?.close(); }, [disabled]);

    const updateCount = (type: keyof typeof MAIN_IMAGE_TYPES, value: number) => {
        if (disabled || !Number.isSafeInteger(value) || value < 0 || total - counts[type] + value > MAIN_IMAGE_LIMIT) return;
        setCounts({ ...counts, [type]: value });
        if (type === "selling") {
            setSellingLayouts((current) => current.slice(0, value));
            setLayoutDraft((current) => current.slice(0, value));
        }
    };
    const openLayouts = () => {
        if (disabled || !sellingCapacity) return;
        setLayoutDraft([...sellingLayouts]);
        layoutDialog.current?.showModal();
    };

    useEffect(() => {
        if (!materials.isSuccess || materials.isFetching || uploading) return;
        const availableIds = new Set(materials.data.map((image) => image.id));
        setProducts((current) => current.every((image) => availableIds.has(image.id))
            ? current : current.filter((image) => availableIds.has(image.id)));
        setAssetIds((current) => current.every((assetId) => availableIds.has(assetId))
            ? current : current.filter((assetId) => availableIds.has(assetId)));
    }, [materials.data, materials.isSuccess, materials.isFetching, uploading]);

    useEffect(() => {
        if (!requestedMaterial || disabled || consumedMaterial.current === requestedMaterial.requestId) return;
        const { image, requestId } = requestedMaterial;
        consumedMaterial.current = requestId;
        if (!assetIds.includes(image.id) && assetIds.length >= 5) {
            setError("最多选择 5 张商品图，请先取消部分选择");
        } else {
            setProducts((current) => current.some((item) => item.id === image.id) ? current : [...current, image]);
            setAssetIds((current) => current.includes(image.id) ? current : [...current, image.id]);
        }
        onMaterialConsumed?.(requestId);
    }, [requestedMaterial, disabled, assetIds, onMaterialConsumed]);

    const uploadFiles = async (files: File[]) => {
        if (disabled || uploadInFlight.current || !files.length) return;
        setError(null);
        if (files.length + assetIds.length > 5) {
            setError("每次最多上传 5 张商品图");
            return;
        }
        if (
            files.some(
                (file) =>
                    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
                    file.size > 10 * 1024 * 1024 ||
                    file.size === 0,
            )
        ) {
            setError("请选择不超过 10 MB 的 PNG、JPEG 或 WebP 图片");
            return;
        }
        uploadInFlight.current = true;
        setUploading(true);
        try {
            for (const file of files) {
                const product = await upload.mutateAsync(file);
                setProducts((current) => [...current, product]);
                setAssetIds((current) => [...current, product.id]);
            }
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "图片上传失败，请重试");
        } finally {
            uploadInFlight.current = false;
            setUploading(false);
        }
    };

    const removeImage = (image: ProductImage) => {
        if (disabled) return;
        setError(null);
        setProducts((current) => current.filter((value) => value.id !== image.id));
        setAssetIds((current) => current.filter((value) => value !== image.id));
    };

    const analyzeProduct = async () => {
        if (disabled || !assetIds.length || !selectedVisionModelId) return;
        if (description.trim() && !window.confirm("分析结果将替换现有商品描述，是否继续？")) return;
        setError(null);
        try {
            const result = await analysis.mutateAsync({ modelId: selectedVisionModelId, assetIds, productName: productName.trim(), language });
            setDescription(result.description);
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "图片分析失败，请重试");
        }
    };

    return (
        <form
            className="ftpl show main-product-form"
            onSubmit={(event) => {
                event.preventDefault();
                if (
                    disabled ||
                    !billing.ready ||
                    !available ||
                    !selectedModelId ||
                    !assetIds.length ||
                    !productName.trim() ||
                    total < 1 ||
                    total > MAIN_IMAGE_LIMIT ||
                    !Number.isSafeInteger(total)
                )
                    return;
                setError(null);
                void onSubmit({
                    modelId: selectedModelId,
                    assetIds,
                    productName: productName.trim(),
                    brand: brand.trim(),
                    platform,
                    language,
                    ratio,
                    resolution,
                    counts,
                    sellingLayouts,
                    description: description.trim(),
                    instructions: "",
                });
            }}
        >
            <div className="form-head">
                <h2>商品主图</h2>
                <p>白底图、场景图、卖点图</p>
            </div>
            {error && (
                <p className="workflow-message error" role="alert">
                    {error}
                </p>
            )}
            <fieldset className="main-fields" disabled={disabled}>
                <div className="field">
                    <div className="f-label">
                        上传商品图 <span className="opt">已选 {assetIds.length}/5</span>
                    </div>
                    <input
                        ref={fileInput}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        hidden
                        onChange={(event) => {
                            void uploadFiles(Array.from(event.target.files ?? []));
                            event.target.value = "";
                        }}
                    />
                    <div className="product-upload-row">
                        {products.map((image, index) => (
                            <ProductThumbnail key={image.id} image={image} index={index}
                                selected={assetIds.includes(image.id)} disabled={disabled}
                                selectionFull={assetIds.length >= 5}
                                onToggle={() => setAssetIds((current) => current.includes(image.id)
                                    ? current.filter((value) => value !== image.id)
                                    : current.length < 5 ? [...current, image.id] : current)}
                                onDelete={() => removeImage(image)} />
                        ))}
                    </div>
                    <button
                        type="button"
                        className={`dz main-upload main-upload-zone${dragging ? " dragging" : ""}`}
                        disabled={disabled || assetIds.length >= 5}
                        onClick={() => fileInput.current?.click()}
                        onDragOver={(event) => {
                            event.preventDefault();
                            if (!disabled) setDragging(true);
                        }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={(event) => {
                            event.preventDefault();
                            setDragging(false);
                            void uploadFiles(Array.from(event.dataTransfer.files));
                        }}
                    >
                        <span className="main-upload-command">
                            {uploading ? <LoaderCircle size={16} className="main-upload-spinner" /> : <Upload size={16} />}
                            <span>{uploading ? "上传中..." : products.length ? "继续添加图片" : "上传图片"}</span>
                        </span>
                        <span className="main-upload-hint">同一商品，最多 5 张</span>
                    </button>
                    <p className="upload-formats">PNG / JPEG / WebP · 每张不超过 10 MB</p>
                    <MaterialPicker selectedIds={assetIds} max={5} disabled={disabled}
                        onChange={(ids, images) => {
                            if (disabled) return;
                            setAssetIds([...new Set(ids)].slice(0, 5));
                            setProducts((current) => [...new Map([...images, ...current].map((image) => [image.id, image])).values()]);
                        }} />
                </div>
                <div className="main-settings-grid">
                <div className="field">
                    <label className="f-label" htmlFor={`${id}-name`}>
                        商品名称
                    </label>
                    <input
                        id={`${id}-name`}
                        className="text-in"
                        required
                        maxLength={100}
                        value={productName}
                        onChange={(event) => setProductName(event.target.value)}
                        placeholder="例如：轻量透气跑步鞋"
                    />
                </div>
                <div className="field">
                    <label className="f-label" htmlFor={`${id}-brand`}>
                        品牌 <span className="opt">选填</span>
                    </label>
                    <input
                        id={`${id}-brand`}
                        className="text-in"
                        maxLength={100}
                        value={brand}
                        onChange={(event) => setBrand(event.target.value)}
                    />
                </div>
                <div className="field">
                    <label className="f-label" htmlFor={`${id}-model`}>
                        生图模型
                    </label>
                    <select
                        id={`${id}-model`}
                        className="sel"
                        value={selectedModelId}
                        disabled={!available}
                        onChange={(event) => setModelId(event.target.value)}
                    >
                        {!models.length && <option value="">暂无支持参考图的模型</option>}
                        {models.map((model) => (
                            <option key={model.id} value={model.id}>
                                {model.name} · {model.provider}
                            </option>
                        ))}
                    </select>
                </div>
                </div>
                <div className="main-settings-grid">
                <div className="field">
                    <label className="f-label" htmlFor={`${id}-platform`}>
                        目标平台
                    </label>
                    <select
                        id={`${id}-platform`}
                        className="sel"
                        value={platform}
                        onChange={(event) =>
                            setPlatform(event.target.value as MainImageInput["platform"])
                        }
                    >
                        {MAIN_PLATFORMS.map((value) => (
                            <option key={value}>{value}</option>
                        ))}
                    </select>
                </div>
                <div className="field">
                    <label className="f-label" htmlFor={`${id}-language`}>输出语言</label>
                    <select id={`${id}-language`} className="sel" value={language}
                        onChange={(event) => setLanguage(event.target.value as MainImageInput["language"])}>
                        {MAIN_LANGUAGES.map((value) => <option key={value}>{value}</option>)}
                    </select>
                </div>
                </div>
                <div className="field product-description-field">
                    <div className="f-label">
                        <label htmlFor={`${id}-description`}>商品卖点与生成要求</label>
                        <button type="button" className="analysis-button" disabled={disabled || !assetIds.length || !selectedVisionModelId}
                            title={!selectedVisionModelId ? "请在公共模型配置中启用支持视觉的语言模型" : "分析已选商品图片"}
                            onClick={() => void analyzeProduct()}>
                            {analysis.isPending ? <LoaderCircle size={14} className="main-upload-spinner" /> : <Sparkles size={14} />}
                            {analysis.isPending ? "分析中..." : "AI 帮写"}
                        </button>
                    </div>
                    {visionModels.length > 1 && <select className="sel analysis-model-select" aria-label="图片分析模型" value={selectedVisionModelId} onChange={(event) => setVisionModelId(event.target.value)}>
                        {visionModels.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.provider}</option>)}
                    </select>}
                    <textarea id={`${id}-description`} className="ta product-description" maxLength={3000}
                        value={description} onChange={(event) => setDescription(event.target.value)}
                        placeholder={"商品名称：\n核心卖点：\n适用人群：\n生成要求与使用场景："} />
                    <span className="description-count">{description.length}/3000</span>
                </div>
                <div className="field">
                    <div className="f-label">
                        套图结构配置 <span className="opt">共 {total}/{MAIN_IMAGE_LIMIT} 张</span>
                    </div>
                    <div className="main-type-grid">
                    {(
                        (["white", "selling", "scene", "other"] as const).map((type) => [type, MAIN_IMAGE_TYPES[type]] as const)
                    ).map(([type, label]) => (
                        <div className="main-type-block" key={type}>
                        <div className="step-row" key={type}>
                            <label className="sr-name" htmlFor={`${id}-${type}`}>
                                {label}
                            </label>
                            <div className="stepper">
                                <button
                                    type="button"
                                    aria-label={`减少${label}`}
                                    title={`减少${label}`}
                                    disabled={counts[type] === 0}
                                    onClick={() =>
                                        updateCount(type, counts[type] - 1)
                                    }
                                >
                                    <Minus size={14} />
                                </button>
                                <input
                                    id={`${id}-${type}`}
                                    className="main-count"
                                    type="number"
                                    min={0}
                                    max={MAIN_IMAGE_LIMIT - total + counts[type]}
                                    value={counts[type]}
                                    onChange={(event) => {
                                        const value = Number(event.target.value);
                                        if (
                                            Number.isSafeInteger(value) &&
                                            value >= 0
                                        )
                                            updateCount(type, value);
                                    }}
                                />
                                <button
                                    type="button"
                                    aria-label={`增加${label}`}
                                    title={`增加${label}`}
                                    disabled={disabled || total >= MAIN_IMAGE_LIMIT}
                                    onClick={() =>
                                        updateCount(type, counts[type] + 1)
                                    }
                                >
                                    <Plus size={14} />
                                </button>
                            </div>
                        </div>
                        {type === "selling" && <button type="button" className="selling-layout-trigger" onClick={openLayouts} disabled={disabled || !sellingCapacity}>
                            <LayoutTemplate size={22} />
                            <span>{sellingLayouts.length ? `已选 ${sellingLayouts.length} 个卖点图版式` : "选择卖点图版式"}</span>
                            <ChevronRight size={16} />
                        </button>}
                        </div>
                    ))}
                    </div>
                </div>
            </fieldset>
            <dialog ref={layoutDialog} className="selling-layout-dialog" aria-labelledby={`${id}-layout-title`}
                onClick={(event) => { if (event.target === event.currentTarget) layoutDialog.current?.close(); }}>
                <header className="selling-layout-heading"><h3 id={`${id}-layout-title`}>选择卖点图版式</h3><button type="button" className="icon-btn" aria-label="关闭版式选择" title="关闭版式选择" onClick={() => layoutDialog.current?.close()}><X size={18} /></button></header>
                <div className="selling-layout-body">
                    <div className="selling-layout-gallery" aria-label="卖点图版式目录">
                        {SELLING_IMAGE_LAYOUTS.map((layout) => {
                            const selected = layoutDraft.includes(layout.id);
                            return <button key={layout.id} type="button" className={`selling-layout-choice${selected ? " selected" : ""}`}
                                aria-label={layout.name} aria-pressed={selected} disabled={disabled || (!selected && layoutDraft.length >= sellingCapacity)}
                                onClick={() => setLayoutDraft((current) => current.includes(layout.id) ? current.filter((value) => value !== layout.id) : current.length < sellingCapacity ? [...current, layout.id] : current)}>
                                <SellingLayoutPreview layout={layout} />
                                <span className="selling-layout-choice-label">{layout.name}<span className="selling-layout-check">{selected && <Check size={14} />}</span></span>
                            </button>;
                        })}
                    </div>
                    <aside className="selling-layout-selection">
                        <div className="selling-layout-selection-heading"><strong>已选版式</strong><span>{layoutDraft.length}/{MAX_SELLING_LAYOUTS}</span></div>
                        <p className="selling-layout-summary">最多选择 {MAX_SELLING_LAYOUTS} 个版式</p>
                        <p className="selling-layout-summary">每个版式生成 1 张，其余 {appliedSellingCount - layoutDraft.length} 张自动排版</p>
                        {appliedSellingCount > counts.selling && <p className="selling-layout-summary">应用后卖点图 {appliedSellingCount} 张，套图共 {total - counts.selling + appliedSellingCount} 张，按新张数计费</p>}
                        {appliedTotal > MAIN_IMAGE_LIMIT && <p className="selling-layout-summary" role="alert">套图最多 {MAIN_IMAGE_LIMIT} 张，请先调整图片数量</p>}
                        {layoutDraft.length ? <ol className="selling-layout-selected-list">{layoutDraft.map((layoutId, index) => {
                            const layout = SELLING_IMAGE_LAYOUTS.find((item) => item.id === layoutId)!;
                            return <li key={layoutId}><span className="selling-layout-mini"><SellingLayoutPreview layout={layout} /></span><span><small>{String(index + 1).padStart(2, "0")}</small><strong>{layout.name}</strong></span><button type="button" className="icon-btn" title={`移除${layout.name}`} aria-label={`移除${layout.name}`} disabled={disabled} onClick={() => setLayoutDraft((current) => current.filter((value) => value !== layoutId))}><X size={15} /></button></li>;
                        })}</ol> : <div className="selling-layout-empty"><LayoutTemplate size={28} /><strong>暂未选择版式</strong><span>卖点图将自动排版</span></div>}
                    </aside>
                </div>
                <footer className="selling-layout-footer"><button type="button" className="btn btn-ghost" onClick={() => layoutDialog.current?.close()}>取消</button><button type="button" className="btn btn-lime" disabled={disabled || layoutDraft.length > sellingCapacity || appliedTotal > MAIN_IMAGE_LIMIT} onClick={() => { if (disabled || layoutDraft.length > sellingCapacity || appliedTotal > MAIN_IMAGE_LIMIT) return; setSellingLayouts([...layoutDraft]); setCounts((current) => ({ ...current, selling: Math.max(current.selling, layoutDraft.length) })); layoutDialog.current?.close(); }}>应用 {layoutDraft.length} 个版式</button></footer>
            </dialog>
            <div className="form-foot main-form-foot">
                <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
                <PopoverTrigger asChild>
                <button ref={settingsTrigger} type="button" className="advanced-settings-trigger" disabled={disabled}>
                    <Settings size={15} /><span>高级设置</span><span className="advanced-setting-value">比例 {ratio}</span><span className="advanced-setting-value">清晰度 {resolution}</span><ChevronDown size={14} />
                </button>
                </PopoverTrigger>
                <PopoverContent className="main-settings-popover" side="top" align="start" sideOffset={8} collisionPadding={12}
                    container={settingsTrigger.current?.closest<HTMLElement>(".studio-app") ?? undefined} aria-labelledby={`${id}-settings-title`}>
                    <div className="settings-popover-head"><h3 id={`${id}-settings-title`}>高级设置</h3><button type="button" className="icon-btn" title="关闭高级设置" aria-label="关闭高级设置" onClick={() => setSettingsOpen(false)}><X size={18} /></button></div>
                    <fieldset className="main-fields" disabled={disabled}>
                <div className="field">
                    <div className="f-label" id={`${id}-ratio`}>
                        图片比例
                    </div>
                    <div
                        className="main-segmented settings-ratios"
                        role="radiogroup"
                        aria-labelledby={`${id}-ratio`}
                    >
                        {MAIN_RATIOS.map((value) => (
                            <label key={value}>
                                <input
                                    type="radio"
                                    name={`${id}-ratio`}
                                    checked={ratio === value}
                                    onChange={() => setRatio(value)}
                                />
                                <span>{value}</span>
                            </label>
                        ))}
                    </div>
                </div>
                <div className="field">
                    <div className="f-label" id={`${id}-resolution`}>
                        清晰度
                    </div>
                    <div
                        className="main-segmented settings-resolutions"
                        role="radiogroup"
                        aria-labelledby={`${id}-resolution`}
                    >
                        {MAIN_RESOLUTIONS.map((value) => (
                            <label key={value}>
                                <input
                                    type="radio"
                                    name={`${id}-resolution`}
                                    checked={resolution === value}
                                    onChange={() => setResolution(value)}
                                />
                                <span>{value}</span>
                            </label>
                        ))}
                    </div>
                </div>
                    </fieldset>
                </PopoverContent>
                </Popover>
                <span className="cost-line" role="status">{billing.costText}</span>
                {(billing.quote.isError || billing.balance.isError) && <button type="button" className="icon-btn" title="重新查询积分" aria-label="重新查询积分" onClick={() => { void billing.quote.refetch(); void billing.balance.refetch(); }}><RefreshCw size={14} /></button>}
                <button
                    className="btn btn-lime"
                    type="submit"
                    disabled={
                        disabled ||
                        !billing.ready ||
                        !available ||
                        !assetIds.length ||
                        !productName.trim() ||
                        total < 1 ||
                        total > MAIN_IMAGE_LIMIT ||
                        !Number.isSafeInteger(total)
                    }
                >
                    <ImagePlus size={16} />
                    {locked ? "任务进行中..." : `生成 ${total} 张主图`}
                </button>
            </div>
        </form>
    );
}

export function SellingLayoutPreview({ layout }: { layout: (typeof SELLING_IMAGE_LAYOUTS)[number] }) {
    const source = `/extension/image-studio/images/${layout.image}.jpg`;
    return <span className="selling-layout-preview" data-layout={layout.id} aria-hidden="true">
        <strong className="selling-layout-headline">{layout.headline}</strong>
        <img className="selling-layout-product" src={source} alt="" loading="lazy" />
        <span className="selling-layout-detail"><img src={source} alt="" loading="lazy" /><span>{layout.detail}</span></span>
        <span className="selling-layout-features">{layout.features.map((feature, index) => <span key={feature} data-feature={index}><img src={source} alt="" loading="lazy" /><Check size={12} /><span>{feature}</span></span>)}</span>
        <span className="selling-layout-caption">{layout.detail}</span>
    </span>;
}

function ProductThumbnail({
    image,
    index,
    selected,
    disabled,
    selectionFull,
    onToggle,
    onDelete,
}: {
    image: ProductImage;
    index: number;
    selected: boolean;
    disabled: boolean;
    selectionFull: boolean;
    onToggle: () => void;
    onDelete: () => void;
}) {
    const [url, setUrl] = useState<string>();
    const [failed, setFailed] = useState(false);
    useEffect(() => loadProductImage(image.id, setUrl, () => setFailed(true)), [image.id]);
    return (
        <div className={`product-thumb${selected ? " selected" : ""}`}>
            <label>
                {url ? (
                    <img src={url} alt={`商品图 ${index + 1}`} />
                ) : (
                    <span role={failed ? "alert" : "status"}>
                        {failed ? "加载失败" : "加载中..."}
                    </span>
                )}
                <input
                    type="checkbox"
                    aria-label={`选择商品图 ${index + 1}`}
                    checked={selected}
                    disabled={disabled || (!selected && selectionFull)}
                    onChange={onToggle}
                />
            </label>
            <button
                type="button"
                className="product-delete"
                title={`移除商品图 ${index + 1}`}
                aria-label={`移除商品图 ${index + 1}`}
                disabled={disabled}
                onClick={onDelete}
            >
                <Trash2 size={12} />
            </button>
        </div>
    );
}
