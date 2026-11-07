import { Check, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CreativeAsset } from "../../api/shared/assets";
import { useSaveAssetMutation } from "../services/assets";
import {
    fetchGenerationImage, isGenerationActive, loadGenerationImage, useGenerateImageMutation,
    useGenerationBilling, useGenerationQuery, useImageModelsQuery, useProductImagesQuery,
    useUploadProductImageMutation,
} from "../services/generation";
import { MATERIAL_LIMIT, materialError, validMaterialLabel } from "../services/materials";
import type { ImageGeneration, ProductImage } from "../services/types";

export const MODEL_ATTRIBUTES = [
    { key: "gender", label: "性别", options: ["女", "男"] },
    { key: "appearance", label: "外观特征", options: ["欧美白人", "东亚", "南亚", "非洲裔", "拉丁裔", "中东"] },
    { key: "age", label: "年龄段", options: ["青少年", "青年", "中年", "老年"] },
    { key: "persona", label: "人设", options: ["上班族", "学生", "运动达人", "时尚达人", "休闲日常"] },
    { key: "body", label: "体型", options: ["纤细", "匀称", "健壮", "丰满"] },
] as const;
type ModelAttributes = Record<typeof MODEL_ATTRIBUTES[number]["key"], string>;
const DEFAULT_ATTRIBUTES: ModelAttributes = { gender: "女", appearance: "欧美白人", age: "青少年", persona: "上班族", body: "纤细" };
const API_PREFIX = import.meta.env.VITE_APP_WEB_API_PREFIX || "api";

export function customModelPrompt(attributes: ModelAttributes) {
    if (!MODEL_ATTRIBUTES.every((field) => (field.options as readonly string[]).includes(attributes[field.key])))
        throw new Error("请选择有效的模特属性");
    return `生成一张写实电商虚拟模特摄影。${MODEL_ATTRIBUTES.map((field) => `${field.label}：${attributes[field.key]}`).join("；")}。` +
        "仅一位虚构人物，不模仿任何真实人物或名人。上半身正面肖像，取景范围为腰部以上，头部和双肩完整入镜，不展示腿部或双脚，姿态自然。" +
        "穿着完整、得体、不透明的日常服装，年龄适宜，无裸露、无性感姿势。纯浅灰背景，柔和均匀棚拍光线，真实自然的人体比例，无文字、水印、标识或其他人物。";
}

function ModelPreview({ task }: { task: ImageGeneration }) {
    const [url, setUrl] = useState("");
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        setUrl(""); setFailed(false);
        return loadGenerationImage(task.id, 0, API_PREFIX, (image) => setUrl(image.url), () => setFailed(true));
    }, [task.id, attempt]);
    return <div className="custom-model-preview">
        {url ? <img src={url} alt="定制模特生成结果" /> : failed ? <button type="button" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={16} />重试预览</button> : <span role="status"><LoaderCircle size={20} />正在加载预览...</span>}
    </div>;
}

export default function CustomModel({ active, locked, limitReached, onBusyChange, onDirtyChange, onClose, onSaved }: {
    active: boolean; locked: boolean; limitReached: boolean; onBusyChange: (busy: boolean) => void;
    onDirtyChange: (dirty: boolean) => void;
    onClose: () => void; onSaved: (asset: CreativeAsset) => void;
}) {
    const models = useImageModelsQuery();
    const products = useProductImagesQuery();
    const generate = useGenerateImageMutation();
    const upload = useUploadProductImageMutation();
    const save = useSaveAssetMutation();
    const [name, setName] = useState("");
    const [attributes, setAttributes] = useState<ModelAttributes>(DEFAULT_ATTRIBUTES);
    const [modelChoice, setModelChoice] = useState("");
    const model = models.data?.find((item) => item.id === modelChoice) ?? models.data?.[0];
    const [submitted, setSubmitted] = useState<ImageGeneration>();
    const [generatedPrompt, setGeneratedPrompt] = useState("");
    const [material, setMaterial] = useState<ProductImage>();
    const [pending, setPending] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const operation = useRef(false);
    const mounted = useRef(true);
    const taskQuery = useGenerationQuery(submitted?.id);
    const task = taskQuery.data?.id === submitted?.id ? taskQuery.data : submitted;
    const taskActive = isGenerationActive(task);
    const uncertain = Boolean(submitted && taskQuery.isError);
    const progressStage = submitting ? 0 : task?.status === "queued" ? 1 : 2;
    const progressLabels = ["正在提交任务", "模特生成排队中", "正在生成模特"];
    const busy = pending || taskActive;
    const billing = useGenerationBilling(model?.id ?? "", 1, active && !locked && !busy);
    const validName = validMaterialLabel(name.trim());
    const productsReady = products.isSuccess && !products.isFetching;
    const room = productsReady && (products.data?.length ?? 0) < MATERIAL_LIMIT;
    const canGenerate = active && !locked && !busy && !uncertain && !limitReached && room && validName && billing.ready && models.isSuccess && !models.isFetching;
    const canSave = active && !pending && !limitReached && validName && productsReady && task?.status === "completed" && task.images.length === 1 && (Boolean(material) || room);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    useEffect(() => { onBusyChange(busy && !uncertain); }, [busy, uncertain, onBusyChange]);
    const dirty = Boolean(name || submitted || MODEL_ATTRIBUTES.some((field) => attributes[field.key] !== DEFAULT_ATTRIBUTES[field.key]));
    useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);

    async function submit() {
        if (!canGenerate || operation.current || !model) return;
        if (task?.status === "completed" && !window.confirm("重新生成将替换当前未保存的预览，并按当前报价消耗积分，确定继续？")) return;
        operation.current = true; setPending(true); setSubmitting(true); onBusyChange(true); setError("");
        try {
            const prompt = customModelPrompt(attributes);
            const record = await generate.mutateAsync({ prompt, modelId: model.id, size: "1024x1536", quality: "standard", style: "natural", count: 1 });
            if (mounted.current) { setSubmitted(record); setGeneratedPrompt(prompt); setMaterial(undefined); }
        } catch (reason) { if (mounted.current) setError(`生成提交失败：${materialError(reason)}`); }
        finally { operation.current = false; if (mounted.current) { setPending(false); setSubmitting(false); } }
    }

    async function persist() {
        if (!canSave || operation.current || !task) return;
        operation.current = true; setPending(true); onBusyChange(true); setError("");
        try {
            let image = material;
            if (!image) {
                const blob = await fetchGenerationImage(task.id, 0, API_PREFIX);
                if (!mounted.current) return;
                if (!blob.size || blob.size > 10 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(blob.type))
                    throw new Error("生成图片超过素材上传限制，请下载后压缩至 10 MB 以内再上传");
                const extension = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png";
                image = await upload.mutateAsync(new File([blob], `${name.trim()}.${extension}`, { type: blob.type }));
                if (!mounted.current) return;
                setMaterial(image);
            }
            const record = await save.mutateAsync({ input: { kind: "model", name: name.trim(), prompt: generatedPrompt, imageIds: [image.id] } });
            if (mounted.current) { onSaved(record); onClose(); }
        } catch (reason) { if (mounted.current) setError(`保存失败：${materialError(reason)}。生成结果已保留，请重试保存。`); }
        finally { operation.current = false; if (mounted.current) setPending(false); }
    }

    return <form className="asset-editor custom-model-editor" hidden={!active} role="tabpanel" aria-label="定制模特" noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <label><span><span className="asset-required">* </span>模特名称</span><input aria-label="定制模特名称" placeholder="请输入..." maxLength={120} required value={name} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
        <div className="custom-model-attributes">{MODEL_ATTRIBUTES.map((field) => <label key={field.key}><span><span className="asset-required">* </span>{field.label}</span>
            <select aria-label={field.label} required disabled={busy} value={attributes[field.key]} onChange={(event) => setAttributes((previous) => ({ ...previous, [field.key]: event.target.value }))}>
                {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
            </select></label>)}</div>
        {models.isError ? <p role="alert">模型加载失败 <button type="button" disabled={models.isFetching} onClick={() => void models.refetch()}><RefreshCw size={16} />重试模型</button></p> : models.isPending ? <p role="status">正在加载模型...</p> : !models.data?.length ? <p role="status">暂无可用的图片生成模型</p> : models.data.length > 1 && <label className="custom-model-engine">生成模型<select aria-label="生成模型" disabled={busy} value={model?.id ?? ""} onChange={(event) => setModelChoice(event.target.value)}>{models.data.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
        {(submitting || (taskActive && !uncertain)) && <section className="custom-model-progress" aria-label="模特生成进度" aria-busy="true">
            <div className="custom-model-progress-symbol"><Sparkles size={24} aria-hidden="true" /></div>
            <div className="custom-model-progress-heading" role="status"><LoaderCircle size={16} aria-hidden="true" /><span>{progressLabels[progressStage]}</span></div>
            <div className="custom-model-progress-track" role="progressbar" aria-label="模特生成进度" aria-valuetext={progressLabels[progressStage]}><span /></div>
            <ol className="custom-model-progress-steps">{["提交", "排队", "生成"].map((label, index) => <li key={label} className={index < progressStage ? "is-complete" : index === progressStage ? "is-current" : ""} aria-current={index === progressStage ? "step" : undefined}>
                {index < progressStage ? <Check size={12} aria-hidden="true" /> : <span className="custom-model-progress-dot" aria-hidden="true" />}{label}
            </li>)}</ol>
        </section>}
        {uncertain && <p role="alert">任务状态查询失败，请先刷新状态 <button type="button" disabled={taskQuery.isFetching} onClick={() => void taskQuery.refetch()}><RefreshCw size={16} />刷新状态</button></p>}
        {task?.status === "failed" && <p role="alert">模特生成失败：{task.error || "请稍后重新生成"}</p>}
        {task?.status === "cancelled" && <p role="status">模特生成已取消</p>}
        {task?.status === "completed" && !submitting && (task.images.length === 1 ? <ModelPreview task={task} /> : <p role="alert">生成结果不可用，请重新生成</p>)}
        {error && <p className="materials-warning" role="alert">{error}</p>}
        {name && !validName && <p role="alert">请输入有效的模特名称，不能包含路径或特殊字符</p>}
        {limitReached && <p role="alert">资产已达 40 条上限，请先删除不用的资料</p>}
        {products.isError && <p role="alert">图片素材加载失败 <button type="button" onClick={() => void products.refetch()}><RefreshCw size={16} />重试素材</button></p>}
        {productsReady && !room && !material && <p role="alert">素材已达 40 张上限，请先释放素材空间</p>}
        <footer><span role="status" className="custom-model-cost">{busy ? "正在处理..." : billing.costText}</span>
            {task?.status === "completed" && <button type="button" className="custom-model-save" disabled={!canSave} onClick={() => void persist()}><Check size={16} />保存模特</button>}
            <button type="submit" disabled={!canGenerate}><Sparkles size={16} />{task ? "重新生成" : "生成"}</button>
        </footer>
    </form>;
}