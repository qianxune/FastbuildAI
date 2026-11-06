import { ArrowLeft, ArrowRight, Check, ListChecks, LoaderCircle, Plus, Scan, Settings2, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { DETAIL_MODULES, FUSION_PRESETS, TOOL_LANGUAGES, TOOL_PLATFORMS, TOOL_RATIOS, TOOL_WORKFLOWS, type ToolWorkflowInput } from "../../api/shared/tool-workflow";
import { useGenerationBilling, useProductImagesQuery, useUploadProductImageMutation } from "../services/generation";
import type { ProductImage } from "../services/types";
import { useToolSuggestionsMutation } from "../services/tool-generation";
import type { ToolFormProps } from "./tool-form";
import { AssetRolePicker, FusionPresetGallery, SkuRegionEditor } from "./specialized-components";
import {
    buildSpecializedInput, createDetailPlan, draftPlanSource, planSourceKey, referenceLimit,
    SPECIALIZED_WORKSPACE_LAYOUT, specializedInstructionBudget, specializedModels, validImageFile, validateRoleSelection,
    type DetailPlan, type Region, type SpecializedDraft, type SpecializedTool,
} from "./specialized-workflow";
import "../styles/specialized-forms.css";
import { assetDraftSnapshot, confirmAssetReplacement } from "./asset-draft";

export { FusionPresetGallery } from "./specialized-components";
export { SPECIALIZED_WORKSPACE_LAYOUT } from "./specialized-workflow";
export type SpecializedToolFormProps = Omit<ToolFormProps, "tool"> & { tool: SpecializedTool };

export default function SpecializedToolForm({ tool, capabilities, locked, defaultCount = 1, requestedAsset, onAssetConsumed, onSubmit }: SpecializedToolFormProps) {
    const id = useId();
    const [primary, setPrimary] = useState<ProductImage[]>([]);
    const [references, setReferences] = useState<ProductImage[]>([]);
    const [modelChoice, setModelChoice] = useState("");
    const [productName, setProductName] = useState("");
    const [brand, setBrand] = useState("");
    const [description, setDescription] = useState("");
    const [instructions, setInstructions] = useState("");
    const [platform, setPlatform] = useState<typeof TOOL_PLATFORMS[number]>("淘宝");
    const [language, setLanguage] = useState<typeof TOOL_LANGUAGES[number]>("简体中文");
    const [countOverride, setCount] = useState<number | null>(null);
    const count = countOverride ?? defaultCount;
    const [ratio, setRatio] = useState<ToolWorkflowInput["ratio"]>(tool === "detail" ? "3:4" : "1:1");
    const [modules, setModules] = useState<string[]>(DETAIL_MODULES.slice(0, 6).map((item) => item.id));
    const [plan, setPlan] = useState<DetailPlan>();
    const [review, setReview] = useState(false);
    const [outputModules, setOutputModules] = useState<string[]>([]);
    const [replicaMode, setReplicaMode] = useState<"style" | "faithful">("style");
    const [preset, setPreset] = useState("");
    const [gallery, setGallery] = useState(tool === "fusion");
    const [variants, setVariants] = useState([{ id: "sku-1", name: "", instruction: "" }]);
    const nextVariant = useRef(2);
    const [region, setRegion] = useState<Region>();
    const [regionOpen, setRegionOpen] = useState(false);
    const [advanced, setAdvanced] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    const [visionChoice, setVisionChoice] = useState("");
    const [suggestions, setSuggestions] = useState<{ key: string; text: string }>();
    const operation = useRef(false);
    const mounted = useRef(true);
    const current = useRef({ primary, references, locked, modelChoice });
    current.current = { primary, references, locked, modelChoice };
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const products = useProductImagesQuery();
    const upload = useUploadProductImageMutation();
    const analysis = useToolSuggestionsMutation();
    useEffect(() => {
        if (!mounted.current || !products.isSuccess || products.isPending || products.isFetching || products.isError
            || !products.data || pending || upload.isPending || operation.current) return;
        const ids = new Set(products.data.map((image) => image.id));
        const live = current.current;
        const nextPrimary = live.primary.filter((image) => ids.has(image.id));
        const nextReferences = live.references.filter((image) => ids.has(image.id));
        if (nextPrimary.length === live.primary.length && nextReferences.length === live.references.length) return;
        current.current = { ...live, primary: nextPrimary, references: nextReferences };
        setPrimary(nextPrimary); setReferences(nextReferences);
        if (tool === "detail" && nextPrimary.length !== live.primary.length) { setPlan(undefined); setReview(false); setOutputModules([]); }
        if (tool === "sku" && nextPrimary[0]?.id !== live.primary[0]?.id) { setRegion(undefined); setRegionOpen(false); }
    }, [products.data, products.isSuccess, products.isPending, products.isFetching, products.isError, pending, upload.isPending, tool]);
    const assetCount = primary.length + references.length;
    const models = specializedModels(capabilities, tool, assetCount);
    const model = modelChoice ? capabilities.models.find((item) => item.id === modelChoice) : models[0];
    const capable = Boolean(model && models.some((item) => item.id === model.id));
    const limit = referenceLimit(model);
    const liveModel = useRef({ id: model?.id, limit, capable });
    liveModel.current = { id: model?.id, limit, capable };
    const busy = locked || pending || upload.isPending || analysis.isPending;
    const consumedAsset = useRef<number | null>(null);
    useEffect(() => {
        if (tool !== "creative" || !requestedAsset || consumedAsset.current === requestedAsset.requestId) return;
        const finish = (applied: boolean, message?: string) => {
            consumedAsset.current = requestedAsset.requestId;
            onAssetConsumed?.(requestedAsset.requestId, applied, message);
        };
        if (busy || operation.current) { finish(false, "当前创作草稿已锁定，请稍后重新使用资产"); return; }
        if (products.isError) { finish(false, "图片素材加载失败，请重试后再使用资产"); return; }
        if (!products.isSuccess || products.isPending || products.isFetching) return;
        try {
            const snapshot = assetDraftSnapshot(requestedAsset.asset, products.data ?? [], capabilities, modelChoice);
            const dirty = Boolean(primary.length || references.length || instructions || modelChoice || countOverride !== null || ratio !== "1:1"
                || productName || brand || description || platform !== "淘宝" || language !== "简体中文");
            if (!confirmAssetReplacement(dirty, () => window.confirm("当前创作草稿已有内容，确定替换参考图片和创作要求？"))) {
                finish(false); return;
            }
            current.current = { ...current.current, primary: [], references: snapshot.references, modelChoice: snapshot.modelId };
            setPrimary([]); setReferences(snapshot.references); setInstructions(snapshot.instructions); setModelChoice(snapshot.modelId); setError("");
            finish(true);
        } catch (failure) {
            const message = failure instanceof Error ? failure.message : "资产无法用于当前草稿";
            setError(message); finish(false, message);
        }
    }, [requestedAsset, tool, busy, products.data, products.isSuccess, products.isPending, products.isFetching, products.isError,
        capabilities, modelChoice, primary, references, instructions, countOverride, ratio, productName, brand, description, platform, language, onAssetConsumed]);
    const draft: SpecializedDraft = { tool, modelId: model?.id ?? "", primary: primary.map((image) => image.id), references: references.map((image) => image.id),
        productName, brand, description, platform, language, instructions, count, ratio, modules, outputModules, plan, replicaMode,
        fusionPreset: preset, skuVariants: variants.map(({ name, instruction }) => ({ name, instruction })), skuRegion: region };
    const instructionBudget = specializedInstructionBudget(draft);
    const source = draftPlanSource(draft);
    const freshPlan = Boolean(plan && plan.sourceKey === planSourceKey(source));
    const reviewing = review && freshPlan;
    const outputCount = tool === "detail" ? outputModules.length : tool === "sku" ? variants.length : count;
    const billing = useGenerationBilling(model?.id ?? "", outputCount, !locked && capable && !(tool === "fusion" && gallery));
    let input: ToolWorkflowInput | undefined;
    let validation = "";
    try { input = buildSpecializedInput(draft, limit); } catch (failure) { validation = failure instanceof Error ? failure.message : "请检查输入"; }
    const canSubmit = !busy && capable && billing.ready && Boolean(input) && (tool !== "detail" || reviewing) && !(tool === "fusion" && gallery);
    const visionAvailability = capabilities.tools.find((item) => item.key === "suggest");
    const visionModels = capabilities.models.filter((item) => visionAvailability?.status === "available" && item.capabilities.includes("vision")
        && visionAvailability.modelIdsByCapability.vision?.includes(item.id));
    const visionModel = visionChoice ? visionModels.find((item) => item.id === visionChoice) : visionModels[0];
    const visionIds = [...draft.primary, ...draft.references];
    const visionKey = JSON.stringify([visionIds, productName, language, visionModel?.id]);
    const visibleSuggestions = suggestions?.key === visionKey ? suggestions.text : "";
    const roleMax = (role: "primary" | "references") => Math.max(0, Math.min(role === "primary" ? (tool === "replica" ? 4 : tool === "detail" ? 5 : 1) : tool === "replica" ? 1 : 4,
        limit - (role === "primary" ? references.length : primary.length)));

    function replaceImages(role: "primary" | "references", images: ProductImage[], internal = false) {
        if (!internal && (busy || operation.current || current.current.locked)) return false;
        const nextPrimary = role === "primary" ? images : current.current.primary;
        const nextReferences = role === "references" ? images : current.current.references;
        const previousIds = [...current.current.primary, ...current.current.references].map((image) => image.id);
        const removingOnly = nextPrimary.length + nextReferences.length < previousIds.length
            && [...nextPrimary, ...nextReferences].every((image) => previousIds.includes(image.id));
        const roleError = validateRoleSelection(tool, nextPrimary.map((image) => image.id), nextReferences.map((image) => image.id),
            removingOnly ? Math.max(liveModel.current.limit, previousIds.length) : liveModel.current.limit);
        if (roleError) { setError(roleError); return false; }
        if (model) setModelChoice(model.id);
        if (tool === "sku" && nextPrimary[0]?.id !== current.current.primary[0]?.id) { setRegion(undefined); setRegionOpen(false); }
        current.current = { ...current.current, primary: nextPrimary, references: nextReferences };
        setPrimary(nextPrimary); setReferences(nextReferences); setError("");
        if (tool === "detail") { setPlan(undefined); setReview(false); setOutputModules([]); }
        return true;
    }

    async function uploadFiles(role: "primary" | "references", files: File[]) {
        if (!files.length || busy || operation.current || current.current.locked) return;
        const existing = role === "primary" ? current.current.primary : current.current.references;
        if (files.some((file) => !validImageFile(file))) { setError("请选择不超过 10 MiB 的 PNG、JPEG 或 WebP 图片"); return; }
        if (existing.length + files.length > roleMax(role)) { setError(`当前角色最多可选 ${roleMax(role)} 张，总参考图上限为 ${limit} 张`); return; }
        operation.current = true; setPending(true); setError("");
        const uploadModelId = model?.id;
        try {
            for (const file of files) {
                if (!mounted.current || current.current.locked) break;
                const image = await upload.mutateAsync(file);
                if (!mounted.current) break;
                if (current.current.locked || liveModel.current.id !== uploadModelId || !liveModel.current.capable) {
                    setError("图片已上传至素材库；当前状态已变化，请稍后重新选择素材"); break;
                }
                const live = role === "primary" ? current.current.primary : current.current.references;
                if (!replaceImages(role, [...live, image], true)) break;
            }
        } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "上传失败，请稍后重试"); }
        finally { operation.current = false; if (mounted.current) setPending(false); }
    }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy || operation.current || current.current.locked) return;
        if (!canSubmit || !input) { setError(validation || (!capable ? "请选择具备当前输入能力的可用模型" : billing.costText)); return; }
        operation.current = true; setPending(true); setError("");
        try { await onSubmit(input); }
        catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "提交失败，请稍后重试"); }
        finally { operation.current = false; if (mounted.current) setPending(false); }
    }

    async function analyze() {
        if (busy || operation.current || current.current.locked || !visionModel || !visionIds.length || visionIds.length > 5) return;
        operation.current = true; setPending(true); setError(""); setSuggestions(undefined);
        try {
            const result = await analysis.mutateAsync({ modelId: visionModel.id, assetIds: visionIds, productName: productName.trim() || "参考图片", language });
            if (mounted.current) setSuggestions({ key: visionKey, text: result.suggestions });
        } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "分析失败，请稍后重试"); }
        finally { operation.current = false; if (mounted.current) setPending(false); }
    }

    function makePlan() {
        if (busy || operation.current) return;
        try { const next = createDetailPlan(source); setPlan(next); setOutputModules(next.pages.slice(0, 4).map((page) => page.id)); setReview(true); setError(""); }
        catch (failure) { setError(failure instanceof Error ? failure.message : "规划失败"); }
    }

    const field = (label: string, suffix: string, value: string, change: (value: string) => void, maxLength: number, required = false) =>
        <label className="specialized-field" htmlFor={`${id}-${suffix}`}>{label}{required && <span className="specialized-required"> *</span>}
            <input id={`${id}-${suffix}`} value={value} maxLength={maxLength} required={required} onChange={(event) => change(event.target.value)} /></label>;
    const picker = (role: "primary" | "references", label: string) => <AssetRolePicker label={label} images={role === "primary" ? primary : references}
        max={roleMax(role)} disabled={busy} onChange={(images) => replaceImages(role, images)} onFiles={(files) => uploadFiles(role, files)} />;
    const metadata = <div className="specialized-grid">
        <label className="specialized-field">发布平台<select aria-label="发布平台" value={platform} onChange={(event) => setPlatform(event.target.value as typeof platform)}>
            {TOOL_PLATFORMS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="specialized-field">文案语言<select aria-label="文案语言" value={language} onChange={(event) => setLanguage(event.target.value as typeof language)}>
            {TOOL_LANGUAGES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
    </div>;

    return <form className={`ftpl show specialized-form specialized-${tool}${gallery ? " specialized-gallery-form" : ""}`} aria-label={TOOL_WORKFLOWS[tool].name}
        data-workflow={tool} data-stage={gallery ? "gallery" : reviewing ? "review" : SPECIALIZED_WORKSPACE_LAYOUT[tool].stage} onSubmit={submit} noValidate>
        <header className="specialized-heading"><div><span className="specialized-eyebrow">{tool === "detail" ? reviewing ? "02 / 规划确认" : "01 / 商品信息" : "图像工作室"}</span><h2>{TOOL_WORKFLOWS[tool].name}</h2></div>
            {tool === "fusion" && !gallery && <button type="button" disabled={busy} onClick={() => setGallery(true)}><ArrowLeft size={16} />预设</button>}
            {tool === "detail" && reviewing && <button type="button" disabled={busy} onClick={() => setReview(false)}><ArrowLeft size={16} />商品信息</button>}
        </header>
        {!capable && <p className="specialized-message" role="status">{modelChoice && model ? "所选模型不支持当前输入，请手动更换模型；已选素材已保留。" : "当前没有可用模型，请联系管理员配置工具能力。"}</p>}
        <fieldset className="specialized-fields" disabled={busy}>
            {gallery ? <FusionPresetGallery selected={preset} disabled={busy} onSelect={(value) => { setPreset(value); setGallery(false); }} /> : <>
                {tool === "fusion" && <section className="specialized-band specialized-selected-preset"><span>当前预设</span><strong>{FUSION_PRESETS.find((item) => item.id === preset)?.label}</strong></section>}
                {!reviewing && <>
                    <section className="specialized-band">
                        {tool === "creative" ? picker("references", "参考图片（可选）") : tool === "replica" || tool === "fusion" ?
                            <div className="specialized-role-grid">{picker("primary", tool === "replica" ? "商品图" : "主体图")}{picker("references", tool === "replica" ? "风格参考图" : "配件图")}</div> : picker("primary", tool === "sku" ? "SKU 模板图" : "商品图片")}
                        <p className="specialized-note">{tool === "creative" && !assetCount ? "当前为文生图" : `当前模型参考图总上限：${limit} 张`}</p>
                    </section>
                    {tool !== "creative" && <section className="specialized-band">
                        <div className="specialized-grid">{field(`商品名称${tool === "detail" ? "" : "（可选）"}`, "product", productName, setProductName, 100, tool === "detail")}
                            {field("品牌（可选）", "brand", brand, setBrand, 100)}</div>{metadata}
                        {tool === "detail" && <label className="specialized-field">已确认的商品描述 *<textarea aria-label="已确认的商品描述" rows={5} value={description} maxLength={1500} required
                            onChange={(event) => setDescription(event.target.value)} /></label>}
                    </section>}
                    {tool === "detail" && <section className="specialized-band"><div className="specialized-section-heading"><h3>详情模块</h3><span>{modules.length} / 10</span></div>
                        {plan && !freshPlan && <p role="status" className="specialized-note">信息已更新，请重新生成本地规划。</p>}
                        <div className="specialized-module-grid">{DETAIL_MODULES.map((module) => <label key={module.id} className="specialized-choice" title={module.description}>
                            <input type="checkbox" aria-label={module.label} checked={modules.includes(module.id)} disabled={busy || (!modules.includes(module.id) && modules.length >= 10)}
                                onChange={() => setModules((currentModules) => currentModules.includes(module.id) ? currentModules.filter((value) => value !== module.id) : currentModules.length < 10 ? [...currentModules, module.id] : currentModules)} />
                            <span>{module.label}</span></label>)}</div></section>}
                    {tool === "replica" && <section className="specialized-band"><h3>复刻模式</h3><div className="specialized-grid">
                        {(["style", "faithful"] as const).map((mode) => <label key={mode} className="specialized-mode">
                            <input type="radio" name={`${id}-mode`} value={mode} checked={replicaMode === mode} onChange={() => setReplicaMode(mode)} />
                            <span><strong>{mode === "style" ? "风格借鉴" : "贴近构图"}</strong><small>{mode === "style" ? "借鉴配色与光影，重新编排" : "参考版式、间距与视觉层次"}</small></span></label>)}
                    </div><p className="specialized-note">不保证模型、文字或像素完全一致。</p></section>}
                    {tool === "sku" && <section className="specialized-band"><div className="specialized-section-heading"><h3>编辑参考区域</h3>
                        <button type="button" disabled={busy || !primary.length} onClick={() => setRegionOpen(true)}><Scan size={16} />{region ? "调整区域" : "选择区域"}</button></div>
                        <p className="specialized-note">{region ? `位置 ${Math.round(region.x * 100)}%, ${Math.round(region.y * 100)}% · 大小 ${Math.round(region.width * 100)}% × ${Math.round(region.height * 100)}%` : "尚未选择区域"}。区域仅作为编辑参考，不是像素蒙版。</p>
                    </section>}
                    {tool === "sku" && <section className="specialized-band"><div className="specialized-section-heading"><h3>SKU 变体</h3><span>{variants.length} / 3</span></div>
                        {variants.map((variant, index) => <div key={variant.id} className="specialized-variant" data-variant-id={variant.id}>
                            <div className="specialized-section-heading"><h4>变体 {index + 1}</h4><button type="button" title={`移除变体 ${index + 1}`} aria-label={`移除变体 ${index + 1}`} disabled={busy || variants.length === 1}
                                onClick={() => setVariants((currentVariants) => currentVariants.filter((item) => item.id !== variant.id))}><Trash2 size={16} /></button></div>
                            <label className="specialized-field">名称<input aria-label={`变体 ${index + 1} 名称`} value={variant.name} maxLength={60} required
                                onChange={(event) => setVariants((currentVariants) => currentVariants.map((item) => item.id === variant.id ? { ...item, name: event.target.value } : item))} /></label>
                            <label className="specialized-field">变化要求<textarea aria-label={`变体 ${index + 1} 变化要求`} value={variant.instruction} rows={2} maxLength={300} required
                                onChange={(event) => setVariants((currentVariants) => currentVariants.map((item) => item.id === variant.id ? { ...item, instruction: event.target.value } : item))} /></label>
                        </div>)}
                        <button type="button" disabled={busy || variants.length >= 3} onClick={() => setVariants((currentVariants) => currentVariants.length < 3 ? [...currentVariants, { id: `sku-${nextVariant.current++}`, name: "", instruction: "" }] : currentVariants)}><Plus size={16} />添加变体</button>
                    </section>}
                </>}
                {reviewing && plan && <section className="specialized-band"><div className="specialized-section-heading"><h3>本地规划 · {plan.pages.length} 页</h3><span>本批 {outputModules.length} / 4 页</span></div>
                    {plan.pages.map((page, index) => <div key={page.id} className="specialized-plan-page">
                        <label className="specialized-choice"><input type="checkbox" aria-label={`输出 ${page.id}`} checked={outputModules.includes(page.id)}
                            disabled={busy || (!outputModules.includes(page.id) && outputModules.length >= 4)} onChange={() => setOutputModules((currentModules) => currentModules.includes(page.id) ? currentModules.filter((value) => value !== page.id) : currentModules.length < 4 ? [...currentModules, page.id] : currentModules)} />
                            <strong>{String(index + 1).padStart(2, "0")} · {DETAIL_MODULES.find((item) => item.id === page.id)?.label}</strong></label>
                        <textarea aria-label={`${page.id} 页面要求`} rows={3} value={page.requirement} maxLength={300} onChange={(event) => setPlan({ ...plan, pages: plan.pages.map((item) => item.id === page.id ? { ...item, requirement: event.target.value } : item) })} />
                    </div>)}<p className="specialized-note">规划依据已确认的描述与模块定义本地整理，非 AI 分析。</p>
                </section>}
                <section className="specialized-band"><label className="specialized-field" htmlFor={`${id}-instructions`}>{tool === "creative" ? "创意提示词 *" : "补充要求"}
                    <textarea id={`${id}-instructions`} rows={tool === "creative" ? 7 : 3} value={instructions} required={tool === "creative"} maxLength={instructionBudget.remaining}
                        onChange={(event) => setInstructions(event.target.value)} /></label><p className="specialized-note">{tool === "detail" ? `总要求 ${instructionBudget.instructions.length}` : instructions.length} / 1500</p>
                    {(tool === "creative" || tool === "fusion") && visionModels.length > 0 && <div className="specialized-analysis">
                        <label className="specialized-field">视觉分析模型<select aria-label="视觉分析模型" value={visionModel?.id ?? ""} onChange={(event) => setVisionChoice(event.target.value)}>
                            {!visionModel && <option value="">请选择模型</option>}{visionModels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                        <button type="button" disabled={busy || !visionModel || !visionIds.length || visionIds.length > 5} onClick={analyze}><Sparkles size={16} />分析参考图</button>
                        {visibleSuggestions && <><output aria-label="未确认的视觉建议">{visibleSuggestions}</output><button type="button" disabled={busy || `${instructions}\n${visibleSuggestions}`.trim().length > 1500}
                            onClick={() => setInstructions(`${instructions}\n${visibleSuggestions}`.trim())}><Check size={16} />加入编辑要求</button></>}
                    </div>}
                </section>
            </>}
        </fieldset>
        {regionOpen && primary[0] && <SkuRegionEditor key={primary[0].id} image={primary[0]} region={region} disabled={busy} onChange={setRegion} onClose={() => setRegionOpen(false)} />}
        {!(tool === "fusion" && gallery) && <footer className="specialized-footer">
            <button type="button" className="specialized-advanced-trigger" aria-expanded={advanced} aria-controls={`${id}-advanced`} disabled={busy} onClick={() => setAdvanced(!advanced)}><Settings2 size={16} />高级设置</button>
            <fieldset id={`${id}-advanced`} className="specialized-fields specialized-advanced" hidden={!advanced} disabled={busy}>
                <label className="specialized-field">生成模型<select id={`${id}-model`} aria-label="生成模型" value={model?.id ?? ""} onChange={(event) => setModelChoice(event.target.value)}>
                    {!model && <option value="">没有可用模型</option>}{model && !capable && <option value={model.id}>{model.name}（不支持当前输入）</option>}
                    {models.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <div className="specialized-grid"><label className="specialized-field">图片比例<select aria-label="图片比例" value={ratio} onChange={(event) => setRatio(event.target.value as typeof ratio)}>{TOOL_RATIOS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                    {tool !== "sku" && tool !== "detail" && <label className="specialized-field">生成数量<select aria-label="生成数量" value={count} onChange={(event) => setCount(Number(event.target.value))}>{[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value} 张</option>)}</select></label>}
                </div>{tool === "creative" && metadata}
            </fieldset>
            {validation && <p className="specialized-validation" role="status">{validation}</p>}
            <div className="specialized-submit-row"><span className="specialized-cost" role="status">{tool === "detail" && !reviewing ? "本地规划不计费" : billing.costText}</span>
                {tool === "detail" && !reviewing ? <button type="button" className="specialized-primary" disabled={busy || !primary.length || !productName.trim() || !description.trim() || !modules.length} onClick={makePlan}><ListChecks size={17} />生成本地规划<ArrowRight size={16} /></button> :
                    <button type="submit" className="specialized-primary" disabled={!canSubmit}>{pending ? <LoaderCircle size={17} /> : <Sparkles size={17} />}生成 {outputCount || ""} 张</button>}
            </div>
        </footer>}
        {error && <p className="specialized-message specialized-error" role="alert">{error}</p>}
    </form>;
}