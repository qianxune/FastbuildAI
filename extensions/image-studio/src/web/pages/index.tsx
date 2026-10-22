import {
  ArrowLeft,
  CircleHelp,
  Crown,
  Download,
  FolderOpen,
  History,
  Image as ImageIcon,
  Layers3,
  Lightbulb,
  Minus,
  Plus,
  Settings,
  Scan,
  Sparkles,
  Wand2,
  WandSparkles,
  Upload,
  TriangleAlert,
  RefreshCw,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  Zap,
} from "lucide-react";
import { useDocumentHead } from "@buildingai/hooks";
import { useEffect, useState } from "react";
import type { ToolKey } from "../../api/shared/tools";
import { MAIN_IMAGE_TYPES, mainImageVariants, type MainImageInput } from "../../api/shared/main-image";
import MainImageForm from "./main-image-form";
import {
  loadGenerationImage,
  isGenerationActive,
  useGenerationCapabilitiesQuery,
  useGenerationQuery,
  useGenerationHistoryQuery,
  useGenerateImageMutation,
  useGenerateMainImageMutation,
  useRetryGenerationMutation,
  useCancelGenerationMutation,
  useDeleteGenerationMutation,
} from "../services/generation";
import type { ImageGeneration } from "../services/types";

const IMAGE_SIZES = ["1024x1024", "1536x1024", "1024x1536", "1792x1024", "1024x1792"];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "请求失败，请稍后重试";
}

function generationStatus(item: ImageGeneration) {
  return { queued: "排队中", processing: "正在生成", completed: "已完成", failed: "失败", cancelled: "已取消" }[item.status];
}

function imageCaption(item: ImageGeneration, index: number) {
  const type = item.toolKey === "main" && item.mainInput ? mainImageVariants(item.mainInput)[index] : undefined;
  return type ? `${MAIN_IMAGE_TYPES[type]} ${index + 1}` : `${index + 1}`;
}

interface ToolDef {
  name: string;
  group: string;
  cost: number;
  desc: string;
  tpl: "main" | "retouch" | "expand" | "generic";
}

const TOOLS: Record<ToolKey, ToolDef> = {
  main: {
    name: "商品主图",
    group: "电商生图",
    cost: 30,
    desc: "白底图、场景图、卖点图一次生成，直接用于主图位",
    tpl: "main",
  },
  detail: { name: "商品详情", group: "电商生图", cost: 20, desc: "生成分模块排版的详情长图，卖点一目了然", tpl: "generic" },
  replica: { name: "爆款复刻", group: "电商生图", cost: 30, desc: "上传对标爆款图，复刻同款布景与光影", tpl: "generic" },
  creative: { name: "创意生图", group: "电商生图", cost: 30, desc: "输入一句话，让 AI 放飞创意场景", tpl: "generic" },
  fusion: { name: "多图融合", group: "电商生图", cost: 30, desc: "多张商品图融合进同一条镜头语言", tpl: "generic" },
  sku: { name: "商品SKU图", group: "电商生图", cost: 20, desc: "同一商品多色多码，批量产出规格图", tpl: "generic" },
  retouch: { name: "产品精修", group: "AI 修图", cost: 20, desc: "AI 修图师级质感处理，保留商品原始细节", tpl: "retouch" },
  cutout: { name: "一键抠图", group: "AI 修图", cost: 10, desc: "发丝级边缘识别，透明底直出", tpl: "generic" },
  watermark: { name: "去除水印", group: "AI 修图", cost: 10, desc: "智能擦除画面中的水印与杂物", tpl: "generic" },
  expand: { name: "智能扩图", group: "AI 修图", cost: 15, desc: "改变画幅比例，AI 向外补全场景", tpl: "expand" },
  translate: { name: "图片翻译", group: "AI 修图", cost: 10, desc: "保留排版，图片内文字一键翻译", tpl: "generic" },
  suggest: { name: "产品建议", group: "其他", cost: 5, desc: "基于商品图给出拍摄与运营建议", tpl: "generic" },
};

const TOOL_ICONS: Record<ToolKey, React.ReactNode> = {
  main: <ImageIcon width={14} height={14} />,
  detail: <Scan width={14} height={14} />,
  replica: <Layers3 width={14} height={14} />,
  creative: <Sparkles width={14} height={14} />,
  fusion: <Zap width={14} height={14} />,
  sku: <FolderOpen width={14} height={14} />,
  retouch: <Wand2 width={14} height={14} />,
  cutout: <Scan width={14} height={14} />,
  watermark: <X width={14} height={14} />,
  expand: <ArrowLeft width={14} height={14} />,
  translate: <Wand2 width={14} height={14} />,
  suggest: <Lightbulb width={14} height={14} />,
};

const GROUPS = {
  "电商生图": ["main", "detail", "replica", "creative", "fusion", "sku"],
  "AI 修图": ["retouch", "cutout", "watermark", "expand", "translate"],
  其他: ["suggest"],
} as const;

export default function ImageStudioPage() {
  useDocumentHead({ title: "创作工作台 — 出图AI" });

  const [tool, setTool] = useState<ToolKey>("main");
  const capabilities = useGenerationCapabilitiesQuery();
  const [page, setPage] = useState(1);
  const history = useGenerationHistoryQuery(page, 8);
  const generate = useGenerateImageMutation();
  const generateMain = useGenerateMainImageMutation();
  const retry = useRetryGenerationMutation();
  const cancel = useCancelGenerationMutation();
  const remove = useDeleteGenerationMutation();
  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState("");
  const [size, setSize] = useState("1024x1024");
  const [count, setCount] = useState(1);
  const [imageQuality, setImageQuality] = useState("standard");
  const [style, setStyle] = useState("vivid");
  const [result, setResult] = useState<ImageGeneration | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const task = useGenerationQuery(result?.id);
  const currentResult = task.data ?? history.data?.items.find((item) => item.id === result?.id) ?? result;
  const submitting = generate.isPending || generateMain.isPending || retry.isPending;
  const busy = submitting || isGenerationActive(currentResult);
  const locked = busy || remove.isPending || cancel.isPending;
  const creative = capabilities.data?.tools.find((item) => item.key === "creative");
  const models = capabilities.data?.models.filter((model) =>
    model.capabilities.includes("text-to-image") &&
    creative?.modelIdsByCapability["text-to-image"]?.includes(model.id),
  ) ?? [];
  const sizes = IMAGE_SIZES.filter((value) =>
    creative?.limits.sizes == null || creative.limits.sizes.includes(value),
  );
  const selectedModelId = models.some((model) => model.id === modelId) ? modelId : (models[0]?.id ?? "");
  const selectedSize = sizes.includes(size) ? size : (sizes[0] ?? "");
  const creativeAvailable = capabilities.isSuccess && !capabilities.isFetching &&
    creative?.status === "available" && models.length > 0 && sizes.length > 0;
  const main = capabilities.data?.tools.find((item) => item.key === "main");
  const mainModels = capabilities.data?.models.filter((model) =>
    model.capabilities.includes("reference-image") && main?.modelIdsByCapability["reference-image"]?.includes(model.id),
  ) ?? [];
  const mainAvailable = capabilities.isSuccess && !capabilities.isFetching && main?.status === "available" && mainModels.length > 0;
  const pageCount = Math.max(1, Math.ceil((history.data?.total ?? 0) / 8));

  useEffect(() => {
    if (history.isSuccess && page > pageCount) setPage(pageCount);
  }, [history.isSuccess, page, pageCount]);

  const unavailableReason = (key: ToolKey) => {
    if (key === "watermark") return "暂未开放";
    if (key === "suggest") return "建议接口尚未开放";
    if (capabilities.isError) return "能力加载失败，暂不可生成";
    if (!capabilities.isSuccess || capabilities.isFetching) return "正在检查可用能力";
    if (key === "main") return mainAvailable ? "" : "暂无支持商品参考图的生图模型，请检查公共模型配置";
    if (key !== "creative") return "图片上传与编辑尚未开放";
    return creativeAvailable ? "" : "暂无支持创意生图的模型或尺寸";
  };

  // stepper values
  const [steppers, setSteppers] = useState({ white: 1, scene: 1, selling: 1, other: 0 });

  // chip single-select values
  const [ratio, setRatio] = useState("1:1");
  const [quality, setQuality] = useState("2K");
  const [origRatio, setOrigRatio] = useState("60%");
  const [targetRatio, setTargetRatio] = useState("3:4");
  const [posIndex, setPosIndex] = useState(4); // center

  // chips multi-select
  const [retouchModes, setRetouchModes] = useState<string[]>(["综合精修"]);

  const [toast, setToast] = useState<{ msg: string; warn?: boolean } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const t = TOOLS[tool];

  const startGen = async () => {
    if (locked || tool !== "creative" || !creativeAvailable) return;
    if (prompt.trim().length < 3 || prompt.trim().length > 2000) {
      setWorkflowError("请输入 3–2000 字的提示词");
      return;
    }
    setWorkflowError(null);
    setShowHistory(false);
    try {
      const generated = await generate.mutateAsync({
        prompt: prompt.trim(), modelId: selectedModelId, size: selectedSize,
        count, quality: imageQuality, style,
      });
      setResult(generated);
      setPage(1);
    } catch (error) {
      setWorkflowError(errorMessage(error));
    }
  };

  const startMain = async (input: MainImageInput) => {
    if (locked || !mainAvailable) return;
    setWorkflowError(null);
    setShowHistory(false);
    try {
      setResult(await generateMain.mutateAsync(input));
      setPage(1);
    } catch (error) { setWorkflowError(errorMessage(error)); }
  };

  const canRetry = (item: ImageGeneration) => (item.status === "failed" || item.status === "cancelled") &&
    (item.toolKey === "main" ? mainAvailable && mainModels.some((model) => model.id === item.modelId) :
      creativeAvailable && models.some((model) => model.id === item.modelId) && sizes.includes(item.size));

  const retryGeneration = async (item: ImageGeneration) => {
    if (locked || !canRetry(item)) return;
    setWorkflowError(null);
    setShowHistory(false);
    try {
      setResult(await retry.mutateAsync(item.id));
      setPage(1);
    } catch (error) {
      setWorkflowError(errorMessage(error));
    }
  };

  const deleteGeneration = async (item: ImageGeneration) => {
    if (locked || isGenerationActive(item) || !window.confirm("删除这条生成记录？")) return;
    setWorkflowError(null);
    try {
      await remove.mutateAsync(item.id);
      if (result?.id === item.id) setResult(null);
    } catch (error) {
      setWorkflowError(errorMessage(error));
    }
  };

  const cancelGeneration = async (item: ImageGeneration) => {
    if (cancel.isPending || !isGenerationActive(item)) return;
    setWorkflowError(null);
    try {
      const cancelled = await cancel.mutateAsync(item.id);
      if (result?.id === item.id) setResult(cancelled);
    } catch (error) {
      setWorkflowError(errorMessage(error));
    }
  };

  const downloadImage = (blob: Blob, objectUrl: string, id: string, index: number) => {
    try {
      const link = document.createElement("a");
      link.href = objectUrl;
      const extension = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "img";
      link.download = `image-studio-${id}-${index + 1}.${extension}`;
      document.body.append(link);
      link.click();
      link.remove();
    } catch {
      setToast({ msg: "图片下载失败，请稍后重试", warn: true });
    }
  };

  const toggleRetouch = (mode: string) => {
    setRetouchModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode],
    );
  };

  return (
    <div className="studio-app">
      {/* TOPBAR */}
      <header className="topbar">
        <a className="tb-logo" href="/extension/image-studio">
          <span className="mark">出</span>
          出图AI
        </a>
        <span className="tb-sep" />
        <nav className="tb-crumb" aria-label="面包屑">
          <span>工作台</span>
          <i>/</i>
          <span>{t.group}</span>
          <i>/</i>
          <b>{t.name}</b>
        </nav>
        <div className="tb-right">
          <div className="credits" title="计费余额暂不可用">
            <Zap width={13} height={13} />
            <span>余额暂不可用</span>
          </div>
          <button className="tb-charge" disabled title="计费尚未接入">
            充值
          </button>
          <button className="icon-btn" title="生成历史" aria-label="生成历史" onClick={() => setShowHistory(true)}>
            <History width={16} height={16} />
          </button>
          <div className="avatar" title="账号">
            <Crown width={12} height={12} />
          </div>
        </div>
      </header>

      {/* APP GRID */}
      <main className="app">
        {/* icon bar */}
        <aside className="iconbar">
          <button className={`ibtn${!showHistory ? " on" : ""}`} title="创作工作台" aria-label="创作工作台" onClick={() => setShowHistory(false)}>
            <WandSparkles width={18} height={18} />
          </button>
          <button className="ibtn" title="素材库暂未开放" disabled>
            <FolderOpen width={18} height={18} />
          </button>
          <button className={`ibtn${showHistory ? " on" : ""}`} title="生成历史" aria-label="生成历史" onClick={() => setShowHistory(true)}>
            <History width={18} height={18} />
          </button>
          <button className="ibtn" title="偏好设置暂未开放" disabled>
            <Settings width={18} height={18} />
          </button>
          <span className="ibtn-space" />
          <button className="ibtn" title="帮助暂未开放" disabled>
            <CircleHelp width={18} height={18} />
          </button>
        </aside>

        {/* feature tree */}
        <aside className="tree">
          {(Object.keys(GROUPS) as (keyof typeof GROUPS)[]).map((group) => (
            <div key={group}>
              <div className="tgroup">{group}</div>
              {GROUPS[group].map((k) => {
                const key = k as ToolKey;
                const active = tool === key;
                return (
                  <button
                    key={key}
                    className={`titem${active ? " on" : ""}`}
                    disabled={Boolean(unavailableReason(key))}
                    title={unavailableReason(key) || TOOLS[key].name}
                    onClick={() => setTool(key)}
                  >
                    <span className="t-ico">{TOOL_ICONS[key]}</span>
                    {TOOLS[key].name}
                    {unavailableReason(key) && <span className="t-def">未开放</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </aside>

        {/* FORM COLUMN */}
        <section className="form">
          {unavailableReason(tool) && <div className="workflow-message" role="status">{unavailableReason(tool)}</div>}
          {capabilities.isError && <button className="btn btn-ghost btn-sm" disabled={capabilities.isFetching} onClick={() => void capabilities.refetch()}><RefreshCw size={14} />重新检查</button>}
          {tool === "main" ? <MainImageForm models={mainModels} available={mainAvailable} locked={locked} onSubmit={startMain} /> : tool === "creative" ? (
            <form className="ftpl show" onSubmit={(event) => { event.preventDefault(); void startGen(); }}>
              <div className="form-head"><h2>{t.name}</h2><p>{t.desc}</p></div>
              <fieldset className="creative-fields" disabled={locked}>
                <div className="field"><label className="f-label" htmlFor="creative-prompt">提示词</label>
                  <textarea id="creative-prompt" className="ta" required minLength={3} maxLength={2000} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="描述希望生成的画面" />
                </div>
                <div className="field"><label className="f-label" htmlFor="creative-model">模型</label>
                  <select id="creative-model" className="sel" value={selectedModelId} onChange={(event) => setModelId(event.target.value)} disabled={!creativeAvailable}>
                    {!models.length && <option value="">暂无可用模型</option>}
                    {models.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.provider}</option>)}
                  </select>
                </div>
                <div className="field"><label className="f-label" htmlFor="creative-size">尺寸</label>
                  <select id="creative-size" className="sel" value={selectedSize} onChange={(event) => setSize(event.target.value)} disabled={!creativeAvailable}>
                    {!sizes.length && <option value="">暂无可用尺寸</option>}
                    {sizes.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </div>
                <div className="field"><label className="f-label" htmlFor="creative-count">数量</label>
                  <input id="creative-count" className="text-in" type="number" min={1} max={4} required value={count} onChange={(event) => setCount(Number(event.target.value))} />
                </div>
                <div className="field"><label className="f-label" htmlFor="creative-quality">质量</label>
                  <select id="creative-quality" className="sel" value={imageQuality} onChange={(event) => setImageQuality(event.target.value)}><option value="standard">标准</option><option value="hd">高清</option></select>
                </div>
                <div className="field"><label className="f-label" htmlFor="creative-style">风格</label>
                  <select id="creative-style" className="sel" value={style} onChange={(event) => setStyle(event.target.value)}><option value="vivid">鲜明</option><option value="natural">自然</option></select>
                </div>
              </fieldset>
              <div className="form-foot"><span className="cost-line">费用暂不可用</span>
                <button className="btn btn-lime" type="submit" disabled={locked || !creativeAvailable || prompt.trim().length < 3 || !Number.isInteger(count) || count < 1 || count > 4}>{busy ? "生成中..." : "立即生成"}</button>
              </div>
            </form>
          ) : <fieldset className="future-form" disabled>{renderForm({
            tool,
            t,
            uploads: {},
            showErr: {},
            steppers,
            setSteppers,
            ratio,
            setRatio,
            quality,
            setQuality,
            origRatio,
            setOrigRatio,
            targetRatio,
            setTargetRatio,
            posIndex,
            setPosIndex,
            retouchModes,
            toggleRetouch,
            addUpload: () => {},
            removeUpload: () => {},
            startGen: () => {},
            busy: true,
          })}</fieldset>}
        </section>

        {/* CANVAS */}
        <section className="canvas">
          {workflowError && <div className="workflow-message error" role="alert">{workflowError}</div>}
          {task.isError && result && <div className="workflow-message error" role="alert">任务状态加载失败<button className="btn btn-ghost btn-sm" disabled={task.isFetching} onClick={() => void task.refetch()}><RefreshCw size={14} />刷新状态</button></div>}
          {showHistory ? (
            <div className="history-view">
              <div className="res-bar"><h3>生成历史</h3><div className="res-actions"><button className="btn btn-ghost btn-sm" disabled={history.isFetching} onClick={() => void history.refetch()}><RefreshCw size={14} />刷新</button><button className="icon-btn" title="返回画布" aria-label="返回画布" onClick={() => setShowHistory(false)}><X size={16} /></button></div></div>
              {submitting && <p className="workflow-message" role="status">正在提交任务...</p>}
              {history.isPending ? <p role="status">正在加载历史...</p> : history.isError ? <p role="alert">历史加载失败：{errorMessage(history.error)}</p> : (
                <>
                  {!history.data.items.length && <p className="workflow-message">暂无生成记录</p>}
                  {history.data.items.map((item) => (
                    <article className="history-entry" key={item.id}>
                      <div className="history-summary"><button className="history-open" onClick={() => { setResult(item); setShowHistory(false); }}><strong>{item.prompt}</strong><span>{item.modelName} · {item.size} · {item.count} 张 · {new Date(item.createdAt).toLocaleString()}</span></button><span>{generationStatus(item)}</span></div>
                      {item.error && <p className="workflow-message error">{item.error}</p>}
                      <div className="res-grid">{item.images.map((_image, index) => <ResultTile key={`${item.id}-${index}`} generationId={item.id} imageIndex={index} caption={imageCaption(item, index)} onDownload={(blob, url) => downloadImage(blob, url, item.id, index)} />)}</div>
                      <div className="history-actions">{isGenerationActive(item) && <button className="btn btn-ghost btn-sm" disabled={cancel.isPending} onClick={() => void cancelGeneration(item)}><X size={14} />取消</button>}{(item.status === "failed" || item.status === "cancelled") && <button className="btn btn-ghost btn-sm" disabled={locked || !canRetry(item)} title={canRetry(item) ? "重试生成" : "当前能力不支持此记录重试"} onClick={() => void retryGeneration(item)}><RefreshCw size={14} />重试</button>}<button className="icon-btn" title="删除记录" aria-label="删除记录" disabled={locked || isGenerationActive(item)} onClick={() => void deleteGeneration(item)}><Trash2 size={15} /></button></div>
                    </article>
                  ))}
                  <nav className="history-pagination" aria-label="历史分页"><button className="icon-btn" title="上一页" aria-label="上一页" disabled={page <= 1 || history.isFetching} onClick={() => setPage(page - 1)}><ChevronLeft size={18} /></button><span>{page} / {pageCount} · {history.data.total} 条</span><button className="icon-btn" title="下一页" aria-label="下一页" disabled={page >= pageCount || history.isFetching} onClick={() => setPage(page + 1)}><ChevronRight size={18} /></button></nav>
                </>
              )}
            </div>
          ) : busy ? (
            <div className="cstate show"><div className="canvas-inner"><div className="gen-head"><span className="spin" /><span role="status">{submitting ? "正在提交任务" : currentResult ? generationStatus(currentResult) : "正在生成"} · {submitting ? t.name : currentResult?.toolKey === "main" ? "商品主图" : "创意生图"}</span></div><div className="res-actions">{currentResult && isGenerationActive(currentResult) && <button className="btn btn-ghost btn-sm" disabled={cancel.isPending} onClick={() => void cancelGeneration(currentResult)}><X size={14} />{cancel.isPending ? "正在取消..." : "取消生成"}</button>}<button className="btn btn-ghost btn-sm" onClick={() => setShowHistory(true)}><History size={14} />查看历史</button></div></div></div>
          ) : currentResult ? (
            <div className="cstate show"><div className="canvas-inner">
              <div className="res-bar"><h3>{generationStatus(currentResult)}</h3><div className="res-actions"><button className="btn btn-ghost btn-sm" onClick={() => setResult(null)}>返回创作</button><button className="icon-btn" title="删除记录" aria-label="删除记录" disabled={locked || isGenerationActive(currentResult)} onClick={() => void deleteGeneration(currentResult)}><Trash2 size={15} /></button></div></div>
              <p className="workflow-message">{currentResult.modelName} · {currentResult.size} · {currentResult.images.length} 张</p>
              <p className="result-prompt">{currentResult.prompt}</p>
              {currentResult.status === "failed" && <div className="workflow-message error" role="alert"><TriangleAlert size={18} /><span>{currentResult.error || "生成失败"}</span><button className="btn btn-ghost btn-sm" disabled={locked || !canRetry(currentResult)} onClick={() => void retryGeneration(currentResult)}><RefreshCw size={14} />重试</button></div>}
              {currentResult.status === "cancelled" && <div className="workflow-message" role="status">已取消<button className="btn btn-ghost btn-sm" disabled={locked || !canRetry(currentResult)} onClick={() => void retryGeneration(currentResult)}><RefreshCw size={14} />重新生成</button></div>}
              {currentResult.status === "completed" && !currentResult.images.length && <p className="workflow-message">该记录没有可下载的图片。</p>}
              <div className="res-grid">{currentResult.images.map((_image, index) => <ResultTile key={`${currentResult.id}-${index}`} generationId={currentResult.id} imageIndex={index} caption={imageCaption(currentResult, index)} onDownload={(blob, url) => downloadImage(blob, url, currentResult.id, index)} />)}</div>
            </div></div>
          ) : (
            <div className="cstate show">
              <div className="canvas-inner">
                <div className="empty-frame">
                  <svg width={120} height={96} viewBox="0 0 120 96" fill="none">
                    <rect x={18} y={8} width={84} height={72} rx={8} stroke="rgba(255,255,255,.18)" strokeDasharray="5 5" />
                    <circle cx={42} cy={30} r={7} stroke="#6E6E7A" strokeWidth={2} />
                    <path d="M26 66l18-16 12 10 14-12 24 18" stroke="#6E6E7A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M100 12l3 6 6 3-6 3-3 6-3-6-6-3 6-3z" fill="#CDFF57" />
                  </svg>
                  <h3>生成结果将在此展示</h3>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text3)", marginTop: 10 }}>
                    {unavailableReason(tool) || "创意生图"}
                  </p>
                </div>
              </div>
            </div>
          )}

        </section>
      </main>

      {/* TOAST */}
      {toast && (
        <div className={`toast${toast.warn ? " warn" : ""} show`}>
          <span className="t-dot" />
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

/* ---------------- Form Renderer ---------------- */

interface FormProps {
  tool: ToolKey;
  t: ToolDef;
  uploads: Record<string, { id: number; url: string }[]>;
  showErr: Record<string, boolean>;
  steppers: { white: number; scene: number; selling: number; other: number };
  setSteppers: (s: { white: number; scene: number; selling: number; other: number }) => void;
  ratio: string;
  setRatio: (v: string) => void;
  quality: string;
  setQuality: (v: string) => void;
  origRatio: string;
  setOrigRatio: (v: string) => void;
  targetRatio: string;
  setTargetRatio: (v: string) => void;
  posIndex: number;
  setPosIndex: (v: number) => void;
  retouchModes: string[];
  toggleRetouch: (mode: string) => void;
  addUpload: (k: string) => void;
  removeUpload: (k: string, id: number) => void;
  startGen: () => void;
  busy: boolean;
}

function renderForm(p: FormProps) {
  const key = p.tool;
  const uploads = p.uploads[key] ?? [];
  const cnt = `${uploads.length}/5`;

  const dropzone = (
    <div className="field">
      <div className="f-label">
        上传商品图 <span className="opt">{cnt}</span>
      </div>
      <div className="f-up">
        <div
          className={`dz${p.showErr[key] ? " dz-err" : ""}`}
          aria-disabled="true"
        >
          <Upload width={22} height={22} />
          <div className="dz-t">
            图片上传暂未开放
          </div>
          <div className="dz-s">暂不支持提交源图片</div>
        </div>
        <div className="thumbs">
          {uploads.map((u) => (
            <div key={u.id} className="thumb">
              <img src={u.url} alt="已上传" />
              <button className="thumb-x" onClick={() => p.removeUpload(key, u.id)} aria-label="移除">
                <X width={10} height={10} />
              </button>
            </div>
          ))}
        </div>
        {p.showErr[key] && (
          <div className="dz-error" style={{ display: "flex" }}>
            <svg width={13} height={13} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <circle cx={8} cy={8} r={6.2} />
              <path d="M8 5v3.6" />
            </svg>
            请先上传商品图
          </div>
        )}
      </div>
    </div>
  );

  // ---------- Template: 商品主图 ----------
  if (p.t.tpl === "main") {
    return (
      <div className="ftpl show">
        <div className="form-head">
          <h2>{p.t.name}</h2>
          <p>{p.t.desc}</p>
        </div>

        {dropzone}

        <div className="field">
          <div className="f-label">生成设置</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input className="text-in" placeholder="商品名称，如：轻量透气跑步鞋" />
            <input className="text-in" placeholder="品牌（选填）" />
            <select className="sel">
              <option>淘宝 / 天猫</option>
              <option>拼多多</option>
              <option>抖音商城</option>
              <option>京东</option>
              <option>小红书</option>
              <option>亚马逊</option>
              <option>1688</option>
            </select>
            <select className="sel">
              <option>输出语言：简体中文</option>
              <option>输出语言：English</option>
              <option>输出语言：中英双语</option>
            </select>
          </div>
        </div>

        <div className="field">
          <div className="f-label">
            配图类型 <span className="opt">暂未开放</span>
          </div>
          <StepperRow
            label="白底图"
            hint="纯白背景，满足平台规范"
            value={p.steppers.white}
            onChange={(v) => p.setSteppers({ ...p.steppers, white: v })}
          />
          <StepperRow
            label="场景图"
            hint="生活化布景与打光"
            value={p.steppers.scene}
            onChange={(v) => p.setSteppers({ ...p.steppers, scene: v })}
          />
          <StepperRow
            label="卖点图"
            hint="自动排版核心卖点"
            value={p.steppers.selling}
            onChange={(v) => p.setSteppers({ ...p.steppers, selling: v })}
          />
          <StepperRow
            label="其他"
            hint="自由发挥"
            value={p.steppers.other}
            onChange={(v) => p.setSteppers({ ...p.steppers, other: v })}
          />
        </div>

        <div className="field">
          <details className="adv">
            <summary>高级设置</summary>
            <div className="adv-in">
              <div className="adv-row">
                <span className="ar-cap">比例</span>
                <SingleChipRow
                  options={["1:1", "3:4", "9:16"]}
                  value={p.ratio}
                  onChange={p.setRatio}
                />
              </div>
              <div className="adv-row">
                <span className="ar-cap">清晰度</span>
                <SingleChipRow options={["1K", "2K"]} value={p.quality} onChange={p.setQuality} />
              </div>
            </div>
          </details>
        </div>

        <div className="form-foot">
          <span className="cost-line">
            费用暂不可用
          </span>
          <button className="btn btn-lime" disabled={p.busy} onClick={p.startGen}>
            暂未开放
          </button>
        </div>
      </div>
    );
  }

  // ---------- Template: 产品精修 ----------
  if (p.t.tpl === "retouch") {
    return (
      <div className="ftpl show">
        <div className="form-head">
          <h2>{p.t.name}</h2>
          <p>{p.t.desc}</p>
        </div>

        {dropzone}

        <div className="field">
          <div className="f-label">
            精修模式 <span className="opt">可多选</span>
          </div>
          <div className="chipset">
            {["综合精修", "质感增强", "瑕疵修复", "色彩校正", "提升清晰度", "材质强化"].map((m) => (
              <span
                key={m}
                className={`chip${p.retouchModes.includes(m) ? " on" : ""}`}
                onClick={() => p.toggleRetouch(m)}
              >
                {m}
              </span>
            ))}
          </div>
        </div>

        <div className="field">
          <div className="f-label">
            补充要求 <span className="opt">选填</span>
          </div>
          <textarea
            className="ta"
            placeholder="例如：瓶身保留磨砂质感，背景压暗突出主体……"
          />
        </div>

        <div className="form-foot">
          <span className="cost-line">
            费用暂不可用
          </span>
          <button className="btn btn-lime" disabled={p.busy} onClick={p.startGen}>
            暂未开放
          </button>
        </div>
      </div>
    );
  }

  // ---------- Template: 智能扩图 ----------
  if (p.t.tpl === "expand") {
    return (
      <div className="ftpl show">
        <div className="form-head">
          <h2>{p.t.name}</h2>
          <p>{p.t.desc}</p>
        </div>

        {dropzone}

        <div className="field">
          <div className="f-label">原图占比</div>
          <SingleChipRow options={["100%", "80%", "60%", "50%"]} value={p.origRatio} onChange={p.setOrigRatio} />
        </div>

        <div className="field">
          <div className="f-label">
            原图位置 <span className="opt">点击选择</span>
          </div>
          <div className="posgrid">
            {Array.from({ length: 9 }).map((_, i) => (
              <span
                key={i}
                className={`poscell${p.posIndex === i ? " on" : ""}`}
                onClick={() => p.setPosIndex(i)}
              />
            ))}
          </div>
        </div>

        <div className="field">
          <div className="f-label">目标比例</div>
          <select className="sel" value={p.targetRatio} onChange={(e) => p.setTargetRatio(e.target.value)}>
            <option value="1:1">1:1</option>
            <option value="3:4">3:4</option>
            <option value="9:16">9:16</option>
            <option value="16:9">16:9</option>
          </select>
        </div>

        <div className="form-foot">
          <span className="cost-line">
            费用暂不可用
          </span>
          <button className="btn btn-lime" disabled={p.busy} onClick={p.startGen}>
            暂未开放
          </button>
        </div>
      </div>
    );
  }

  // ---------- Template: 通用 ----------
  return (
    <div className="ftpl show">
      <div className="form-head">
        <h2>{p.t.name}</h2>
        <p>{p.t.desc}</p>
      </div>

      {dropzone}

      <div className="field">
        <div className="f-label">
          补充说明 <span className="opt">选填</span>
        </div>
        <textarea
          className="ta"
          placeholder="描述你的需求，例如：突出便携属性，主色调与品牌 VI 保持一致……"
        />
      </div>

      <div className="form-foot">
        <span className="cost-line">
          费用暂不可用
        </span>
        <button className="btn btn-lime" disabled={p.busy} onClick={p.startGen}>
          暂未开放
        </button>
      </div>
    </div>
  );
}

/* ---------------- Sub-components ---------------- */

function StepperRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="step-row">
      <span className="sr-name">
        {label}
        <small>{hint}</small>
      </span>
      <div className="stepper">
        <button onClick={() => onChange(Math.max(0, value - 1))}>
          <Minus width={14} height={14} />
        </button>
        <span className="stp-val">{value}</span>
        <button onClick={() => onChange(Math.min(4, value + 1))}>
          <Plus width={14} height={14} />
        </button>
      </div>
    </div>
  );
}

function SingleChipRow({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="chipset">
      {options.map((opt) => (
        <span key={opt} className={`chip${value === opt ? " on" : ""}`} onClick={() => onChange(opt)}>
          {opt}
        </span>
      ))}
    </div>
  );
}

function ResultTile({
  generationId,
  imageIndex,
  beforeSrc,
  caption,
  onDownload,
}: {
  generationId: string;
  imageIndex: number;
  beforeSrc?: string;
  caption: string;
  onDownload: (blob: Blob, url: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const [holding, setHolding] = useState(false);
  const [image, setImage] = useState<{ id: string; index: number; blob: Blob; url: string } | null>(null);
  const [failure, setFailure] = useState<{ id: string; index: number } | null>(null);
  const loaded = image?.id === generationId && image.index === imageIndex ? image : null;
  const failed = failure?.id === generationId && failure.index === imageIndex;
  useEffect(() => loadGenerationImage(
    generationId,
    imageIndex,
    import.meta.env.VITE_APP_WEB_API_PREFIX || "api",
    (result) => setImage({ ...result, id: generationId, index: imageIndex }),
    () => setFailure({ id: generationId, index: imageIndex }),
  ), [generationId, imageIndex]);
  return (
    <div
      className={`rtile${hover ? " peek" : ""}${holding ? " holding" : ""}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onPointerDown={() => beforeSrc && setHolding(true)}
      onPointerUp={() => setHolding(false)}
      onPointerLeave={() => setHolding(false)}
    >
      {loaded ? <img src={loaded.url} alt={caption} draggable={false} /> : <span role={failed ? "alert" : "status"}>{failed ? "图片加载失败，请稍后重试" : "图片加载中..."}</span>}
      {beforeSrc && <img className="before" src={beforeSrc} alt="原图" draggable={false} />}
      {beforeSrc && <span className="hold-tag">按住看原图</span>}
      <div className="ovl">
        <button className="o-btn" title="下载" aria-label={`下载图片 ${caption}`} disabled={!loaded} onClick={() => loaded && onDownload(loaded.blob, loaded.url)}>
          <Download width={14} height={14} />
        </button>
        <a className="o-btn" title="打开原图" aria-label={`打开原图 ${caption}`} href={loaded?.url} aria-disabled={!loaded} target="_blank" rel="noopener noreferrer"><ImageIcon size={14} /></a>
        <span className="o-cap">{caption}</span>
      </div>
    </div>
  );
}

