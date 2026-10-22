import { ImagePlus, LoaderCircle, Minus, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import {
    MAIN_IMAGE_TYPES,
    MAIN_LANGUAGES,
    MAIN_PLATFORMS,
    MAIN_RATIOS,
    MAIN_RESOLUTIONS,
    type MainImageInput,
} from "../../api/shared/main-image";
import type { CapabilityModel } from "../../api/shared/tools";
import {
    loadProductImage,
    useDeleteProductImageMutation,
    useProductImagesQuery,
    useUploadProductImageMutation,
} from "../services/generation";
import type { ProductImage } from "../services/types";

export default function MainImageForm({
    models,
    available,
    locked,
    onSubmit,
}: {
    models: CapabilityModel[];
    available: boolean;
    locked: boolean;
    onSubmit: (input: MainImageInput) => Promise<void>;
}) {
    const id = useId();
    const fileInput = useRef<HTMLInputElement>(null);
    const products = useProductImagesQuery();
    const upload = useUploadProductImageMutation();
    const remove = useDeleteProductImageMutation();
    const [assetIds, setAssetIds] = useState<string[]>([]);
    const [uploading, setUploading] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [productName, setProductName] = useState("");
    const [brand, setBrand] = useState("");
    const [modelId, setModelId] = useState("");
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
    const [instructions, setInstructions] = useState("");
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    const selectedModelId = models.some((model) => model.id === modelId)
        ? modelId
        : (models[0]?.id ?? "");
    const disabled = locked || uploading || remove.isPending;

    const uploadFiles = async (files: File[]) => {
        if (disabled || !files.length) return;
        setError(null);
        if (files.length + assetIds.length > 5) {
            setError("每次最多选择 5 张商品图");
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
        setUploading(true);
        try {
            for (const file of files) {
                const product = await upload.mutateAsync(file);
                setAssetIds((current) => [...current, product.id]);
            }
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "图片上传失败，请重试");
        } finally {
            setUploading(false);
        }
    };

    const deleteImage = async (image: ProductImage) => {
        if (disabled || !window.confirm("删除这张商品图？")) return;
        setError(null);
        try {
            await remove.mutateAsync(image.id);
            setAssetIds((current) => current.filter((value) => value !== image.id));
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "商品图删除失败");
        }
    };

    return (
        <form
            className="ftpl show"
            onSubmit={(event) => {
                event.preventDefault();
                if (
                    disabled ||
                    !available ||
                    !selectedModelId ||
                    !assetIds.length ||
                    !productName.trim() ||
                    total < 1 ||
                    total > 4
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
                    instructions: instructions.trim(),
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
                        商品图片 <span className="opt">已选 {assetIds.length}/5</span>
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
                    <button
                        type="button"
                        className={`dz main-upload${dragging ? "dragging" : ""}`}
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
                        {uploading ? (
                            <LoaderCircle size={22} className="main-upload-spinner" />
                        ) : (
                            <Upload size={22} />
                        )}
                        <span className="dz-t">{uploading ? "正在上传..." : "上传商品图"}</span>
                        <span className="dz-s">PNG / JPEG / WebP · 每张不超过 10 MB</span>
                    </button>
                    {products.isPending ? (
                        <p className="workflow-message" role="status">
                            商品图加载中...
                        </p>
                    ) : products.isError ? (
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => void products.refetch()}
                        >
                            <RefreshCw size={14} />
                            重新加载商品图
                        </button>
                    ) : (
                        <div className="product-images">
                            {(products.data ?? []).map((image, index) => (
                                <ProductThumbnail
                                    key={image.id}
                                    image={image}
                                    index={index}
                                    selected={assetIds.includes(image.id)}
                                    disabled={disabled}
                                    selectionFull={assetIds.length >= 5}
                                    onToggle={() => {
                                        setAssetIds((current) =>
                                            current.includes(image.id)
                                                ? current.filter((value) => value !== image.id)
                                                : current.length < 5
                                                  ? [...current, image.id]
                                                  : current,
                                        );
                                    }}
                                    onDelete={() => void deleteImage(image)}
                                />
                            ))}
                        </div>
                    )}
                </div>
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
                    <label className="f-label" htmlFor={`${id}-language`}>
                        输出语言
                    </label>
                    <select
                        id={`${id}-language`}
                        className="sel"
                        value={language}
                        onChange={(event) =>
                            setLanguage(event.target.value as MainImageInput["language"])
                        }
                    >
                        {MAIN_LANGUAGES.map((value) => (
                            <option key={value}>{value}</option>
                        ))}
                    </select>
                </div>
                <div className="field">
                    <div className="f-label">
                        配图类型 <span className="opt">共 {total}/4 张</span>
                    </div>
                    {(
                        Object.entries(MAIN_IMAGE_TYPES) as Array<
                            [keyof typeof MAIN_IMAGE_TYPES, string]
                        >
                    ).map(([type, label]) => (
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
                                        setCounts({ ...counts, [type]: counts[type] - 1 })
                                    }
                                >
                                    <Minus size={14} />
                                </button>
                                <input
                                    id={`${id}-${type}`}
                                    className="main-count"
                                    type="number"
                                    min={0}
                                    max={4 - total + counts[type]}
                                    value={counts[type]}
                                    onChange={(event) => {
                                        const value = Number(event.target.value);
                                        if (
                                            Number.isInteger(value) &&
                                            value >= 0 &&
                                            value <= 4 - total + counts[type]
                                        )
                                            setCounts({ ...counts, [type]: value });
                                    }}
                                />
                                <button
                                    type="button"
                                    aria-label={`增加${label}`}
                                    title={`增加${label}`}
                                    disabled={total >= 4}
                                    onClick={() =>
                                        setCounts({ ...counts, [type]: counts[type] + 1 })
                                    }
                                >
                                    <Plus size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="field">
                    <div className="f-label" id={`${id}-ratio`}>
                        图片比例
                    </div>
                    <div
                        className="main-segmented"
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
                        className="main-segmented"
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
                <div className="field">
                    <label className="f-label" htmlFor={`${id}-instructions`}>
                        补充要求 <span className="opt">选填</span>
                    </label>
                    <textarea
                        id={`${id}-instructions`}
                        className="ta"
                        maxLength={1500}
                        value={instructions}
                        onChange={(event) => setInstructions(event.target.value)}
                        placeholder="商品卖点、背景或拍摄风格"
                    />
                </div>
            </fieldset>
            <div className="form-foot">
                <span className="cost-line">费用暂不可用</span>
                <button
                    className="btn btn-lime"
                    type="submit"
                    disabled={
                        disabled ||
                        !available ||
                        !assetIds.length ||
                        !productName.trim() ||
                        total < 1 ||
                        total > 4
                    }
                >
                    <ImagePlus size={16} />
                    {locked ? "任务进行中..." : `生成 ${total} 张主图`}
                </button>
            </div>
        </form>
    );
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
        <div className={`product-thumb${selected ? "selected" : ""}`}>
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
                title={`删除商品图 ${index + 1}`}
                aria-label={`删除商品图 ${index + 1}`}
                disabled={disabled}
                onClick={onDelete}
            >
                <Trash2 size={12} />
            </button>
        </div>
    );
}
