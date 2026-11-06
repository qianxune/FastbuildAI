import {
    Download,
    History,
    Image as ImageIcon,
    Layers3,
    TriangleAlert,
    RefreshCw,
    Trash2,
    ChevronLeft,
    ChevronRight,
    Plus,
    Sparkles,
    X,
    Eye,
    ArrowUpRight,
} from "lucide-react";
import { useDocumentHead } from "@buildingai/hooks";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ToolKey } from "../../api/shared/tools";
import {
    MAIN_IMAGE_TYPES,
    MAIN_RATIOS,
    MAIN_RESOLUTIONS,
    mainImageVariants,
    mainImageSize,
    type MainImageInput,
} from "../../api/shared/main-image";
import MainImageForm from "./main-image-form";
import WorksView from "./works";
import AssetsView from "./assets";
import type { AssetApplication, CreativeAsset } from "../../api/shared/assets";
import ToolForm from "./tool-form";
import { RetouchPreview } from "./image-edit-form";
import { isSpecializedTool, SPECIALIZED_TOOLS, SPECIALIZED_WORKSPACE_LAYOUT } from "./specialized-workflow";
import WorkspaceNavigation, { TOOL_LABELS, type WorkspaceView } from "./workspace-navigation";
import WorkspaceAccount from "./workspace-account";
import WorkspaceOverview from "./workspace-overview";
import { WorkspaceHelpDialog, WorkspacePreferencesDialog, useWorkspacePreferences } from "./workspace-preferences";
import { useGenerateToolMutation } from "../services/tool-generation";
import { isToolEditKey, validateToolWorkflow, type ToolWorkflowInput } from "../../api/shared/tool-workflow";
import type { GenerationCapabilities } from "../../api/shared/tools";
import {
    loadGenerationImage,
    fetchGenerationImage,
    isGenerationActive,
    useGenerationCapabilitiesQuery,
    useGenerationQuery,
    useGenerationHistoryQuery,
    useGenerateMainImageMutation,
    useRetryGenerationMutation,
    useCancelGenerationMutation,
    useDeleteGenerationMutation,
    fetchGenerationQuote,
} from "../services/generation";
import type { ImageGeneration, ProductImage } from "../services/types";

export function supportsToolInput(input: ToolWorkflowInput, capabilities?: GenerationCapabilities) {
    if (validateToolWorkflow(input)) return false;
    const availability = capabilities?.tools.find((entry) => entry.key === input.tool);
    const model = capabilities?.models.find((entry) => entry.id === input.modelId);
    if (availability?.status !== "available" || !model) return false;
    const required = input.tool === "creative"
        ? [input.assetIds.length ? "reference-image" : "text-to-image"] as const
        : availability.requiredCapabilities;
    return required.every((capability) => {
        const approved = availability.modelIdsByCapability[capability]
            ?? (input.tool === "creative" ? availability.modelIdsByCapability["text-to-image"] : undefined);
        return model.capabilities.includes(capability) && approved?.includes(input.modelId);
    }) && input.assetIds.length <= (availability.limits.maxInputImages ?? 5) &&
        (!input.assetIds.length || input.assetIds.length <= (model.maxReferenceImages ?? 1));
}

export function supportsMainRetry(item: ImageGeneration, capabilities?: GenerationCapabilities) {
    const input = item.mainInput;
    const availability = capabilities?.tools.find((entry) => entry.key === "main");
    const model = capabilities?.models.find((entry) => entry.id === item.modelId);
    if (!input || !input.counts || !Array.isArray(input.assetIds) ||
        typeof input.productName !== "string" || !input.productName.trim() ||
        !MAIN_RATIOS.includes(input.ratio) || !MAIN_RESOLUTIONS.includes(input.resolution) ||
        input.modelId !== item.modelId || availability?.status !== "available" ||
        !model?.capabilities.includes("reference-image") ||
        !availability.modelIdsByCapability["reference-image"]?.includes(item.modelId)) return false;
    const counts = Object.keys(MAIN_IMAGE_TYPES).map((key) => input.counts[key as keyof typeof MAIN_IMAGE_TYPES]);
    return counts.every((count) => Number.isInteger(count) && count >= 0 && count <= 4) &&
        counts.reduce((total, count) => total + count, 0) === item.count && item.count >= 1 && item.count <= 4 &&
        input.assetIds.length > 0 && new Set(input.assetIds).size === input.assetIds.length &&
        input.assetIds.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) &&
        input.assetIds.length <= Math.min(model.maxReferenceImages ?? 1, availability.limits.maxInputImages ?? 5) &&
        mainImageSize(input) === item.size;
}

const IMAGE_SIZES = ["1024x1024", "1536x1024", "1024x1536", "1792x1024", "1024x1792"];

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : "请求失败，请稍后重试";
}

function generationStatus(item: ImageGeneration) {
    return {
        queued: "排队中",
        processing: "正在生成",
        completed: "已完成",
        failed: "失败",
        cancelled: "已取消",
    }[item.status];
}

function billingCaption(item: ImageGeneration) {
    if (item.billingStatus === "refunded") return `已退还 ${item.billingAmount} 积分`;
    if (item.billingStatus === "charged") return `已扣除 ${item.billingAmount} 积分`;
    if (item.billingStatus === "free") return "本次 0 积分";
    return "";
}

function imageCaption(item: ImageGeneration, index: number) {
    const type =
        item.toolKey === "main" && item.mainInput
            ? mainImageVariants(item.mainInput)[index]
            : undefined;
    return type ? `${MAIN_IMAGE_TYPES[type]} ${index + 1}` : `${index + 1}`;
}

export default function ImageStudioPage() {
    const [detailRequest, setDetailRequest] = useState(() => typeof window === "undefined" ? null : new URLSearchParams(window.location?.search ?? "").get("task"));
    const detailTaskId = detailRequest && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(detailRequest) ? detailRequest : undefined;
    const [view, setView] = useState<WorkspaceView>(detailRequest ? "create" : "overview");
    const showWorks = view === "works";
    const showHistory = view === "history";
    const setShowHistory = (open: boolean) => setView(open ? "history" : "create");
    const preferences = useWorkspacePreferences();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [preferencesOpen, setPreferencesOpen] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
    const [requestedMaterial, setRequestedMaterial] = useState<{ image: ProductImage; requestId: number } | null>(null);
    const [annotationTarget, setAnnotationTarget] = useState<HTMLDivElement | null>(null);
    const [watermarkEditing, setWatermarkEditing] = useState(false);
    const [expansionEditing, setExpansionEditing] = useState(false);
    const [skuEditing, setSkuEditing] = useState(false);
    const [regionalEditing, setRegionalEditing] = useState<"redraw" | "cutout" | null>(null);
    const materialSequence = useRef(0);
    const [requestedAsset, setRequestedAsset] = useState<AssetApplication | null>(null);
    const [assetNotice, setAssetNotice] = useState("");
    const assetSequence = useRef(0);
    const assetRequest = useRef<{ requestId: number; resolve: (applied: boolean) => void; reject: (error: Error) => void } | null>(null);
    useEffect(() => () => { assetRequest.current?.resolve(false); assetRequest.current = null; }, []);
    useDocumentHead({ title: showWorks ? "我的作品 — 出图AI" : "创作工作台 — 出图AI" });

    const [tool, setTool] = useState<ToolKey>("main");
    const capabilities = useGenerationCapabilitiesQuery();
    const [page, setPage] = useState(1);
    const history = useGenerationHistoryQuery(page, 8);
    const generateMain = useGenerateMainImageMutation();
    const generateTool = useGenerateToolMutation();
    const retry = useRetryGenerationMutation();
    const cancel = useCancelGenerationMutation();
    const remove = useDeleteGenerationMutation();
    const [result, setResult] = useState<ImageGeneration | null>(null);
    const [historyResult, setHistoryResult] = useState<ImageGeneration | null>(null);
    const [workflowFailure, setWorkflowFailure] = useState<{ tool: ToolKey; message: string } | null>(null);
    const workflowError = workflowFailure?.tool === tool ? workflowFailure.message : null;
    const setWorkflowError = (message: string | null, sourceTool: ToolKey = tool) =>
        setWorkflowFailure(message ? { tool: sourceTool, message } : null);
    const [downloading, setDownloading] = useState(false);
    const [retryPreparing, setRetryPreparing] = useState<ToolKey | null>(null);
    const task = useGenerationQuery(result?.id ?? detailTaskId);
    useEffect(() => {
        if (detailTaskId && task.data?.id === detailTaskId) setTool(task.data.toolKey ?? "creative");
    }, [detailTaskId, task.data?.id]);
    const currentTask =
        task.data ?? history.data?.items.find((item) => item.id === result?.id) ?? result;
    const previewTask = historyResult ?? currentTask;
    const currentResult = previewTask && (previewTask.toolKey ?? "creative") === tool ? previewTask : null;
    const submitting =
        generateMain.isPending || generateTool.isPending || retry.isPending || Boolean(retryPreparing);
    const busy = submitting || isGenerationActive(currentTask);
    const pendingTool = generateMain.isPending
        ? "main"
        : generateTool.isPending
          ? generateTool.variables?.tool ?? tool
          : retryPreparing ?? currentTask?.toolKey ?? "creative";
    const previewBusy = submitting ? pendingTool === tool : isGenerationActive(currentResult);
    const showWatermarkEditor = tool === "watermark" && view === "create" && !previewBusy && (!currentResult || watermarkEditing);
    const showExpansionEditor = tool === "expand" && view === "create" && !previewBusy && (!currentResult || expansionEditing);
    const showSkuEditor = tool === "sku" && view === "create" && !previewBusy && (!currentResult || skuEditing);
    const showRegionalEditor = (tool === "redraw" || tool === "cutout") && view === "create" && !previewBusy && (!currentResult || regionalEditing === tool);
    const locked = busy || remove.isPending || cancel.isPending;
    const pendingCount =
        generateMain.isPending && generateMain.variables
            ? mainImageVariants(generateMain.variables).length
                        : generateTool.isPending
                            ? (generateTool.variables?.count ?? 1)
                            : (previewTask?.count ?? 1);
    const pendingMainInput = generateMain.isPending
        ? generateMain.variables
                : generateTool.isPending
          ? null
          : currentResult?.mainInput;
        const pendingStatus = submitting
                ? "提交中"
                : currentTask?.status === "queued"
                    ? "等待生成"
                    : "生成中";
    const creative = capabilities.data?.tools.find((item) => item.key === "creative");
    const models =
        capabilities.data?.models.filter(
            (model) =>
                model.capabilities.includes("text-to-image") &&
                creative?.modelIdsByCapability["text-to-image"]?.includes(model.id),
        ) ?? [];
    const sizes = IMAGE_SIZES.filter(
        (value) => creative?.limits.sizes == null || creative.limits.sizes.includes(value),
    );
    const creativeAvailable =
        capabilities.isSuccess &&
        !capabilities.isFetching &&
        creative?.status === "available" &&
        models.length > 0 &&
        sizes.length > 0;
    const main = capabilities.data?.tools.find((item) => item.key === "main");
    const mainModels =
        capabilities.data?.models.filter(
            (model) =>
                model.capabilities.includes("reference-image") &&
                main?.modelIdsByCapability["reference-image"]?.includes(model.id),
        ) ?? [];
    const mainAvailable =
        capabilities.isSuccess &&
        !capabilities.isFetching &&
        main?.status === "available" &&
        mainModels.length > 0;
    const pageCount = Math.max(1, Math.ceil((history.data?.total ?? 0) / 8));

    useEffect(() => {
        if (history.isSuccess && page > pageCount) setPage(pageCount);
    }, [history.isSuccess, page, pageCount]);

    const unavailableReason = (key: ToolKey) => {
        if (capabilities.isError) return "能力加载失败，暂不可生成";
        if (!capabilities.isSuccess || capabilities.isFetching) return "正在检查可用能力";
        if (key === "main")
            return mainAvailable ? "" : "暂无支持商品参考图的生图模型，请检查公共模型配置";
        return "";
    };

    const [toast, setToast] = useState<{ msg: string; warn?: boolean } | null>(null);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 2800);
        return () => clearTimeout(t);
    }, [toast]);

    const toolName = TOOL_LABELS[tool];

    const navigate = (next: WorkspaceView, nextTool?: ToolKey) => {
        if (assetRequest.current && (next !== "create" || (nextTool && nextTool !== "creative"))) {
            assetRequest.current.resolve(false); assetRequest.current = null; setRequestedAsset(null);
            setAssetNotice("已取消使用资产；原草稿已保留");
        }
        setView(next);
        if (nextTool) setTool(nextTool);
        if (next !== "history") setHistoryResult(null);
        setWorkflowError(null);
    };
    const consumeAsset = (requestId: number, applied: boolean, message?: string) => {
        const request = assetRequest.current;
        if (!request || request.requestId !== requestId) return;
        assetRequest.current = null;
        setRequestedAsset((current) => current?.requestId === requestId ? null : current);
        setAssetNotice(message || (applied ? "资产已填入创作草稿，尚未生成" : "已取消替换；原草稿已保留"));
        if (message) request.reject(new Error(message)); else request.resolve(applied);
    };
    const useAsset = (asset: CreativeAsset): Promise<boolean> => {
        if (locked || !capabilities.isSuccess || capabilities.isFetching || assetRequest.current) {
            const message = "当前工作区已锁定或能力尚未就绪，请稍后重新使用资产";
            setAssetNotice(message); return Promise.reject(new Error(message));
        }
        navigate("create", "creative");
        const requestId = ++assetSequence.current;
        setAssetNotice("正在检查资产并准备创作草稿");
        return new Promise((resolve, reject) => {
            assetRequest.current = { requestId, resolve, reject };
            setRequestedAsset({ asset: { ...asset, imageIds: [...asset.imageIds] }, requestId });
        });
    };

    useEffect(() => {
        const root = document.documentElement;
        const dark = root.classList.contains("dark");
        const light = root.classList.contains("light");
        const forceLight = () => { root.classList.remove("dark"); root.classList.add("light", "studio-workspace-theme"); };
        forceLight();
        const observer = new MutationObserver(() => {
            if (root.classList.contains("dark") || !root.classList.contains("light")) forceLight();
        });
        observer.observe(root, { attributes: true, attributeFilter: ["class"] });
        return () => { observer.disconnect(); root.classList.remove("studio-workspace-theme"); root.classList.toggle("dark", dark); root.classList.toggle("light", light); };
    }, []);

    const startMain = async (input: MainImageInput) => {
        if (locked || !mainAvailable) return;
        setWorkflowError(null);
        setHistoryResult(null);
        setShowHistory(false);
        try {
            setResult(await generateMain.mutateAsync(input));
            setPage(1);
        } catch (error) {
            setWorkflowError(errorMessage(error), "main");
        }
    };

    const startTool = async (input: ToolWorkflowInput) => {
        try {
            if (locked || view !== "create") throw new Error("当前工作区已锁定，请稍后重试");
            const invalid = validateToolWorkflow(input);
            if (invalid) throw new Error(invalid);
            if (input.tool !== tool || !capabilities.isSuccess || capabilities.isFetching || !supportsToolInput(input, capabilities.data)) {
                throw new Error("模型能力或工具状态已变化，请检查输入后重试");
            }
            setWorkflowError(null);
            setHistoryResult(null);
            setShowHistory(false);
            if (input.tool === "watermark") setWatermarkEditing(false);
            if (input.tool === "expand") setExpansionEditing(false);
            if (input.tool === "sku") setSkuEditing(false);
            if (input.tool === "redraw" || input.tool === "cutout") setRegionalEditing(null);
            setResult(await generateTool.mutateAsync(input));
            setPage(1);
        } catch (error) {
            if (input.tool === "watermark") setWatermarkEditing(true);
            if (input.tool === "expand") setExpansionEditing(true);
            if (input.tool === "sku") setSkuEditing(true);
            if (input.tool === "redraw" || input.tool === "cutout") setRegionalEditing(input.tool);
            setWorkflowError(errorMessage(error));
            throw error;
        }
    };

    const canRetry = (item: ImageGeneration) => {
        const sku = item.toolKey === "sku" && item.toolInput?.tool === "sku" && item.toolInput.design?.skuRegions !== undefined && validateToolWorkflow(item.toolInput) === null;
        if ((item.status !== "failed" && item.status !== "cancelled") ||
            !capabilities.isSuccess || capabilities.isFetching ||
            !Number.isInteger(item.count) || item.count < 1 || item.count > (sku ? 10 : 4)) return false;
        if (item.toolKey === "main") return supportsMainRetry(item, capabilities.data);
        if (item.toolInput !== undefined && item.toolInput !== null) {
            return isToolEditKey(item.toolKey ?? "") && Boolean(item.toolInput.tool === item.toolKey &&
                item.toolInput.modelId === item.modelId && item.toolInput.count === item.count &&
                supportsToolInput(item.toolInput, capabilities.data));
        }
        return (item.toolKey == null || item.toolKey === "creative") && creativeAvailable &&
            typeof item.prompt === "string" && item.prompt.trim().length >= 3 && item.prompt.trim().length <= 2000 &&
            models.some((model) => model.id === item.modelId) && sizes.includes(item.size);
    };

    const retryGeneration = async (item: ImageGeneration) => {
        if (locked || !canRetry(item)) return;
        setWorkflowError(null);
        setRetryPreparing(item.toolKey ?? "creative");
        try {
            const quote = item.toolKey === "sku" && item.toolInput?.design?.skuRegions !== undefined
                ? await fetchGenerationQuote(item.modelId, item.count, "sku") : await fetchGenerationQuote(item.modelId, item.count);
            if (!window.confirm(`本次重试费用为 ${quote.total} 积分，是否继续？`)) return;
            setTool(item.toolKey ?? "creative");
            if (item.toolKey === "watermark") setWatermarkEditing(false);
            if (item.toolKey === "expand") setExpansionEditing(false);
            if (item.toolKey === "sku") setSkuEditing(false);
            if (item.toolKey === "redraw" || item.toolKey === "cutout") setRegionalEditing(null);
            setShowHistory(false);
            setHistoryResult(null);
            setResult(await retry.mutateAsync(item.id));
            setPage(1);
        } catch (error) {
            setWorkflowError(errorMessage(error), item.toolKey ?? "creative");
        } finally {
            setRetryPreparing(null);
        }
    };

    const deleteGeneration = async (item: ImageGeneration) => {
        if (locked || isGenerationActive(item) || !window.confirm("删除这条生成记录？")) return;
        setWorkflowError(null);
        try {
            await remove.mutateAsync(item.id);
            if (result?.id === item.id) setResult(null);
            if (historyResult?.id === item.id) setHistoryResult(null);
            if (detailTaskId === item.id) { setDetailRequest(null); window.history.replaceState(null, "", window.location.pathname); }
        } catch (error) {
            setWorkflowError(errorMessage(error), item.toolKey ?? "creative");
        }
    };

    const cancelGeneration = async (item: ImageGeneration) => {
        if (cancel.isPending || !isGenerationActive(item)) return;
        setWorkflowError(null);
        try {
            const cancelled = await cancel.mutateAsync(item.id);
            if (result?.id === item.id) setResult(cancelled);
            if (historyResult?.id === item.id) setHistoryResult(cancelled);
        } catch (error) {
            setWorkflowError(errorMessage(error), item.toolKey ?? "creative");
        }
    };

    const downloadAllImages = async (item: ImageGeneration) => {
        if (downloading || !item.images.length) return;
        setDownloading(true);
        try {
            const { zipSync } = await import("fflate");
            const files: Record<string, Uint8Array> = {};
            for (let index = 0; index < item.images.length; index++) {
                const blob = await fetchGenerationImage(
                    item.id,
                    index,
                    import.meta.env.VITE_APP_WEB_API_PREFIX || "api",
                );
                const extension =
                    blob.type === "image/jpeg"
                        ? "jpg"
                        : blob.type === "image/webp"
                          ? "webp"
                          : "png";
                files[`image-${index + 1}.${extension}`] = new Uint8Array(await blob.arrayBuffer());
            }
            const archive = new Blob([new Uint8Array(zipSync(files, { level: 0 }))], {
                type: "application/zip",
            });
            const objectUrl = URL.createObjectURL(archive);
            const anchor = document.createElement("a");
            anchor.href = objectUrl;
            anchor.download = `image-studio-${item.id}.zip`;
            document.body.appendChild(anchor);
            try {
                anchor.click();
            } finally {
                anchor.remove();
                window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
            }
        } catch {
            setToast({ msg: "整组下载失败，请重试或逐张下载", warn: true });
        } finally {
            setDownloading(false);
        }
    };

    const downloadImage = (blob: Blob, objectUrl: string, id: string, index: number) => {
        try {
            const link = document.createElement("a");
            link.href = objectUrl;
            const extension =
                blob.type === "image/jpeg"
                    ? "jpg"
                    : blob.type === "image/webp"
                      ? "webp"
                      : blob.type === "image/png"
                        ? "png"
                        : "img";
            link.download = `image-studio-${id}-${index + 1}.${extension}`;
            document.body.append(link);
            link.click();
            link.remove();
        } catch {
            setToast({ msg: "图片下载失败，请稍后重试", warn: true });
        }
    };

    return (
        <div className="studio-app">
            {/* TOPBAR */}
            <header className="topbar">
                <button className="icon-btn workspace-menu-trigger" aria-label="打开工作区菜单" title="工作区菜单" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><Layers3 size={20} /></button>
                <a className="tb-logo" href="/" target="_top">
                    <span className="mark">出</span>
                    出图AI
                </a>
                <span className="tb-sep" />
                <nav className="tb-crumb" aria-label="面包屑">
                    <span>工作台</span>
                    <i>/</i>
                    <span>{{ overview: "创作工作台", create: "创作", works: "我的作品", materials: "资产库", history: "生成历史" }[view]}</span>
                    {view !== "overview" && <><i>/</i><b>{showWorks ? "图片作品" : toolName}</b></>}
                </nav>
                <div className="tb-right">
                    <WorkspaceAccount onNavigate={navigate} locked={locked} />
                </div>
            </header>

            {/* APP GRID */}
            <main className="workspace-layout">
                <WorkspaceNavigation view={view} tool={tool} mobileOpen={mobileOpen} onMobileOpenChange={setMobileOpen} onNavigate={navigate} onPreferences={() => setPreferencesOpen(true)} onHelp={() => setHelpOpen(true)} />
                <div className="workspace-content">
                {assetNotice && <p className="workflow-message" role="status">{assetNotice}</p>}
                {busy && (view !== "create" || pendingTool !== tool) && <button className="workspace-active-task" onClick={() => navigate("create", pendingTool)}><span className="spin" />当前任务 {pendingStatus} · {pendingCount} 张<span>查看任务</span></button>}
                {view === "overview" && <WorkspaceOverview onNavigate={navigate} onOpenTask={(generation) => window.open(`/extension/image-studio/studio?task=${encodeURIComponent(generation.id)}`, "_blank", "noopener,noreferrer")} />}
                <AssetsView active={view === "materials"} locked={locked || !capabilities.isSuccess || capabilities.isFetching}
                    onUse={useAsset} onUseImage={(image) => { setRequestedMaterial({ image, requestId: ++materialSequence.current }); navigate("create", "main"); }} />

                {showWorks && <WorksView renderImage={({ generation, index }) => (
                    <ResultTile generationId={generation.id} imageIndex={index}
                        caption={imageCaption(generation, index)}
                        onDetails={() => window.open(`/extension/image-studio/studio?task=${encodeURIComponent(generation.id)}`, "_blank", "noopener,noreferrer")}
                        onDownload={(blob, url) => downloadImage(blob, url, generation.id, index)} />
                )} />}

                {/* FORM COLUMN */}
                <div className={`workspace-create${tool === "watermark" ? " watermark-workspace" : ""}${tool === "redraw" || tool === "cutout" ? " regional-workspace" : ""}${isSpecializedTool(tool) ? ` ${SPECIALIZED_WORKSPACE_LAYOUT[tool].className}` : ""}`}
                    data-tool={tool}
                    style={isSpecializedTool(tool) ? { "--workspace-form-width": `${SPECIALIZED_WORKSPACE_LAYOUT[tool].preferredFormWidth}px` } as CSSProperties : undefined}
                    hidden={view !== "create" && view !== "history"}>
                <section className="form" hidden={view !== "create"}>
                    {unavailableReason(tool) && (
                        <div className="workflow-message" role="status">
                            {unavailableReason(tool)}
                        </div>
                    )}
                    {capabilities.isError && (
                        <button
                            className="btn btn-ghost btn-sm"
                            disabled={capabilities.isFetching}
                            onClick={() => void capabilities.refetch()}
                        >
                            <RefreshCw size={14} />
                            重新检查
                        </button>
                    )}
                    <div hidden={tool !== "main"}>
                        <MainImageForm
                            models={mainModels}
                            visionModels={(capabilities.data?.models ?? []).filter((model) =>
                                model.capabilities.includes("vision"),
                            )}
                            available={mainAvailable}
                            locked={locked || view !== "create"}
                            onSubmit={startMain}
                            requestedMaterial={requestedMaterial}
                            onMaterialConsumed={(requestId) => setRequestedMaterial((current) => current?.requestId === requestId ? null : current)}
                        />
                    </div>
                    {SPECIALIZED_TOOLS.map((specializedTool) => {
                        const inactive = tool !== specializedTool || view !== "create";
                        return <div key={specializedTool} className="workspace-tool-form" data-tool-form={specializedTool} hidden={inactive} inert={inactive}>
                            <ToolForm tool={specializedTool} capabilities={capabilities.data ?? { models: [], tools: [] }}
                                locked={inactive || locked || !capabilities.isSuccess || capabilities.isFetching}
                                annotationTarget={specializedTool === "sku" ? (inactive ? null : annotationTarget) : undefined}
                                onEditSource={specializedTool === "sku" ? () => { if (!inactive && !locked) setSkuEditing(true); } : undefined}
                                requestedAsset={specializedTool === "creative" ? requestedAsset : null} onAssetConsumed={consumeAsset}
                                defaultCount={preferences.value.count} onSubmit={startTool} />
                        </div>;
                    })}
                    {tool !== "main" && !isSpecializedTool(tool) && <ToolForm tool={tool} capabilities={capabilities.data ?? { models: [], tools: [] }} locked={locked || view !== "create" || !capabilities.isSuccess || capabilities.isFetching}
                        taskSnapshot={currentResult}
                        annotationTarget={tool === "watermark" || tool === "expand" || tool === "redraw" || tool === "cutout" ? annotationTarget : undefined} onEditSource={() => { if (tool === "redraw" || tool === "cutout") setRegionalEditing(tool); else if (tool === "expand") setExpansionEditing(true); else setWatermarkEditing(true); }}
                        onSubmit={startTool} />}
                </section>

                {/* CANVAS */}
                <section className="canvas" data-empty={!currentResult && !previewBusy && !workflowError}>
                    {workflowError && (
                        <div className="workflow-message error" role="alert">
                            {workflowError}
                        </div>
                    )}
                    {detailRequest && !detailTaskId && <div className="workflow-message error" role="alert">任务链接无效</div>}
                    {detailTaskId && task.isPending && <div className="workflow-message" role="status">正在加载任务详情</div>}
                    {detailTaskId && task.isSuccess && !task.data && <div className="workflow-message error" role="alert">任务不存在或已删除</div>}
                    {task.isError && (result || detailTaskId) && (
                        <div className="workflow-message error" role="alert">
                            任务状态加载失败
                            <button
                                className="btn btn-ghost btn-sm"
                                disabled={task.isFetching}
                                onClick={() => void task.refetch()}
                            >
                                <RefreshCw size={14} />
                                刷新状态
                            </button>
                        </div>
                    )}
                    {showHistory ? (
                        <div className="history-view">
                            <div className="res-bar">
                                <h3>生成历史</h3>
                                <div className="res-actions">
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        disabled={history.isFetching}
                                        onClick={() => void history.refetch()}
                                    >
                                        <RefreshCw size={14} />
                                        刷新
                                    </button>
                                    <button
                                        className="icon-btn"
                                        title="返回画布"
                                        aria-label="返回画布"
                                        onClick={() => setShowHistory(false)}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>
                            {submitting && (
                                <p className="workflow-message" role="status">
                                    正在提交任务...
                                </p>
                            )}
                            {history.isPending ? (
                                <p role="status">正在加载历史...</p>
                            ) : history.isError ? (
                                <p role="alert">历史加载失败：{errorMessage(history.error)}</p>
                            ) : (
                                <>
                                    {!history.data.items.length && (
                                        <p className="workflow-message">暂无生成记录</p>
                                    )}
                                    {history.data.items.map((item) => (
                                        <article className="history-entry" key={item.id}>
                                            <div className="history-summary">
                                                <button
                                                    className="history-open"
                                                    disabled={busy}
                                                    title={busy ? "当前任务结束后可打开历史详情" : "查看结果"}
                                                    onClick={() => {
                                                        setTool(item.toolKey ?? "creative");
                                                        if (item.toolKey === "watermark") setWatermarkEditing(false);
                                                        if (item.toolKey === "expand") setExpansionEditing(false);
                                                        if (item.toolKey === "sku") setSkuEditing(false);
                                                        if (item.toolKey === "redraw" || item.toolKey === "cutout") setRegionalEditing(null);
                                                        if (isGenerationActive(item)) {
                                                            setResult(item);
                                                            setHistoryResult(null);
                                                        } else {
                                                            setHistoryResult(item);
                                                        }
                                                        setShowHistory(false);
                                                    }}
                                                >
                                                    <strong>{TOOL_LABELS[item.toolKey ?? "creative"]} · {item.prompt}</strong>
                                                    <span>
                                                        {item.modelName} · {item.size} ·{" "}
                                                        {item.count} 张 ·{" "}
                                                        {new Date(item.createdAt).toLocaleString()}
                                                    </span>
                                                </button>
                                                <span>{generationStatus(item)}</span>
                                            </div>
                                            {billingCaption(item) && (
                                                <p className="workflow-message">
                                                    {billingCaption(item)}
                                                </p>
                                            )}
                                            {item.error && (
                                                <p className="workflow-message error">
                                                    {item.error}
                                                </p>
                                            )}
                                            <div className="res-grid">
                                                {item.images.map((_image, index) => (
                                                    <ResultTile
                                                        key={`${item.id}-${index}`}
                                                        generationId={item.id}
                                                        imageIndex={index}
                                                        caption={imageCaption(item, index)}
                                                        onDownload={(blob, url) =>
                                                            downloadImage(blob, url, item.id, index)
                                                        }
                                                    />
                                                ))}
                                            </div>
                                            <div className="history-actions">
                                                {isGenerationActive(item) && (
                                                    <button
                                                        className="btn btn-ghost btn-sm"
                                                        disabled={cancel.isPending}
                                                        onClick={() => void cancelGeneration(item)}
                                                    >
                                                        <X size={14} />
                                                        取消
                                                    </button>
                                                )}
                                                {(item.status === "failed" ||
                                                    item.status === "cancelled") && (
                                                    <button
                                                        className="btn btn-ghost btn-sm"
                                                        disabled={locked || !canRetry(item)}
                                                        title={
                                                            canRetry(item)
                                                                ? "重试生成"
                                                                : "当前能力不支持此记录重试"
                                                        }
                                                        onClick={() => void retryGeneration(item)}
                                                    >
                                                        <RefreshCw size={14} />
                                                        重试
                                                    </button>
                                                )}
                                                <button
                                                    className="icon-btn"
                                                    title="删除记录"
                                                    aria-label="删除记录"
                                                    disabled={locked || isGenerationActive(item)}
                                                    onClick={() => void deleteGeneration(item)}
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </article>
                                    ))}
                                    <nav className="history-pagination" aria-label="历史分页">
                                        <button
                                            className="icon-btn"
                                            title="上一页"
                                            aria-label="上一页"
                                            disabled={page <= 1 || history.isFetching}
                                            onClick={() => setPage(page - 1)}
                                        >
                                            <ChevronLeft size={18} />
                                        </button>
                                        <span>
                                            {page} / {pageCount} · {history.data.total} 条
                                        </span>
                                        <button
                                            className="icon-btn"
                                            title="下一页"
                                            aria-label="下一页"
                                            disabled={page >= pageCount || history.isFetching}
                                            onClick={() => setPage(page + 1)}
                                        >
                                            <ChevronRight size={18} />
                                        </button>
                                    </nav>
                                </>
                            )}
                        </div>
                    ) : previewBusy ? (
                        <div className="cstate show">
                            <div className="canvas-inner">
                                <div className="generation-summary">
                                    <div className="gen-head">
                                        <span className="spin" />
                                        <span role="status">
                                            {submitting
                                                ? "正在提交任务"
                                                : currentResult
                                                  ? generationStatus(currentResult)
                                                  : "正在生成"}{" "}
                                            · {pendingCount} 张
                                        </span>
                                    </div>
                                    <div className="res-actions">
                                        {!submitting &&
                                            currentResult &&
                                            isGenerationActive(currentResult) && (
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    disabled={cancel.isPending}
                                                    onClick={() =>
                                                        void cancelGeneration(currentResult)
                                                    }
                                                >
                                                    <X size={14} />
                                                    {cancel.isPending ? "正在取消..." : "取消生成"}
                                                </button>
                                            )}
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => setShowHistory(true)}
                                        >
                                            <History size={14} />
                                            查看历史
                                        </button>
                                    </div>
                                </div>
                                <progress
                                    className="generation-progress"
                                    aria-label={
                                        submitting
                                            ? "任务提交中"
                                            : currentResult?.status === "queued"
                                              ? "等待生成"
                                              : "图片生成中"
                                    }
                                />
                                <div className="res-grid" aria-label="待生成图片">
                                    {Array.from({ length: pendingCount }, (_, index) => (
                                        <div
                                            className="rtile generation-placeholder shim"
                                            key={index}
                                        >
                                            <span className="spin" aria-hidden="true" />
                                            <span>
                                                {pendingMainInput
                                                    ? mainImageVariants(pendingMainInput).map(
                                                          (variant) => MAIN_IMAGE_TYPES[variant],
                                                      )[index] ?? `图片 ${index + 1}`
                                                    : `图片 ${index + 1}`}
                                            </span>
                                            <span>{pendingStatus}</span>
                                            <progress
                                                className="generation-progress generation-image-progress"
                                                aria-label={`图片 ${index + 1}生成进度`}
                                                aria-valuetext={pendingStatus}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : currentResult && !showWatermarkEditor && !showExpansionEditor && !showSkuEditor && !showRegionalEditor ? (
                        <div className="cstate show result-preview-state">
                            <div className="canvas-inner">
                                <div className="res-bar">
                                    <h3>{generationStatus(currentResult)}</h3>
                                    <div className="res-actions">
                                        {currentResult.images.length > 0 && (
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                disabled={downloading}
                                                onClick={() =>
                                                    void downloadAllImages(currentResult)
                                                }
                                            >
                                                <Download size={14} />
                                                {downloading ? "打包中..." : "一键下载"}
                                            </button>
                                        )}
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => { setHistoryResult(null); setResult(null); if (detailRequest) { setDetailRequest(null); window.history.replaceState(null, "", window.location.pathname); } }}
                                        >
                                            返回创作
                                        </button>
                                        <button
                                            className="icon-btn"
                                            title="删除记录"
                                            aria-label="删除记录"
                                            disabled={
                                                locked ||
                                                downloading ||
                                                isGenerationActive(currentResult)
                                            }
                                            onClick={() => void deleteGeneration(currentResult)}
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                </div>
                                {currentResult.status === "completed" && (
                                    <progress
                                        className="generation-progress"
                                        value={currentResult.images.length}
                                        max={currentResult.count}
                                        aria-label="图片生成完成"
                                    />
                                )}
                                <p className="workflow-message">
                                    {TOOL_LABELS[currentResult.toolKey ?? "creative"]} · {currentResult.modelName} · {currentResult.size} ·{" "}
                                    {currentResult.images.length} 张
                                </p>
                                {billingCaption(currentResult) && (
                                    <p className="workflow-message">
                                        {billingCaption(currentResult)}
                                    </p>
                                )}
                                <p className="result-prompt">{currentResult.prompt}</p>
                                {currentResult.status === "failed" && (
                                    <div className="workflow-message error" role="alert">
                                        <TriangleAlert size={18} />
                                        <span>{currentResult.error || "生成失败"}</span>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            disabled={locked || !canRetry(currentResult)}
                                            onClick={() => void retryGeneration(currentResult)}
                                        >
                                            <RefreshCw size={14} />
                                            重试
                                        </button>
                                    </div>
                                )}
                                {currentResult.status === "cancelled" && (
                                    <div className="workflow-message" role="status">
                                        已取消
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            disabled={locked || !canRetry(currentResult)}
                                            onClick={() => void retryGeneration(currentResult)}
                                        >
                                            <RefreshCw size={14} />
                                            重新生成
                                        </button>
                                    </div>
                                )}
                                {currentResult.status === "completed" &&
                                    !currentResult.images.length && (
                                        <p className="workflow-message">该记录没有可下载的图片。</p>
                                    )}
                                <div className={`res-grid${currentResult.images.length === 1 ? " result-image-stage" : ""}`}>
                                    {currentResult.images.map((_image, index) => (
                                        <ResultTile
                                            key={`${currentResult.id}-${index}`}
                                            generationId={currentResult.id}
                                            imageIndex={index}
                                            previewSize={currentResult.images.length === 1 ? currentResult.size : undefined}
                                            caption={imageCaption(currentResult, index)}
                                            onDownload={(blob, url) =>
                                                downloadImage(blob, url, currentResult.id, index)
                                            }
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : showWatermarkEditor ? <div ref={setAnnotationTarget} className="watermark-canvas-host" /> : showExpansionEditor ? <div ref={setAnnotationTarget} className="expansion-canvas-host" /> : showSkuEditor ? <div ref={setAnnotationTarget} className="sku-canvas-host" /> : showRegionalEditor ? <div ref={setAnnotationTarget} className="regional-canvas-host" /> : tool === "retouch" ? <RetouchPreview /> : (
                        <div className="cstate show preview-empty-state">
                            <div className="preview-empty-content">
                                <div className="preview-empty-art" aria-hidden="true">
                                    <ImageIcon className="preview-empty-picture" size={64} strokeWidth={1.5} />
                                    <span className="preview-empty-plus"><Plus size={20} strokeWidth={3} /></span>
                                    <Sparkles className="preview-empty-sparkles" size={20} strokeWidth={1.5} />
                                </div>
                                <h3>效果图预览</h3>
                                <p>提交任务后，生成结果将在此处展示</p>
                            </div>
                        </div>
                    )}
                </section>
                </div>
                </div>
            </main>
            <WorkspacePreferencesDialog open={preferencesOpen} onOpenChange={setPreferencesOpen} value={preferences.value} error={preferences.error} onChange={preferences.update} />
            <WorkspaceHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />

            {/* TOAST */}
            {toast && (
                <div className={`toast${toast.warn ? "warn" : ""} show`}>
                    <span className="t-dot" />
                    <span>{toast.msg}</span>
                </div>
            )}
        </div>
    );
}

function ResultTile({
    generationId,
    imageIndex,
    beforeSrc,
    caption,
    onDownload,
    onDetails,
    previewSize,
}: {
    generationId: string;
    imageIndex: number;
    beforeSrc?: string;
    caption: string;
    onDownload: (blob: Blob, url: string) => void;
    onDetails?: () => void;
    previewSize?: string;
}) {
    const [hover, setHover] = useState(false);
    const [holding, setHolding] = useState(false);
    const [image, setImage] = useState<{
        id: string;
        index: number;
        blob: Blob;
        url: string;
    } | null>(null);
    const [failure, setFailure] = useState<{ id: string; index: number } | null>(null);
    const [attempt, setAttempt] = useState(0);
    const previewDialog = useRef<HTMLDialogElement>(null);
    const loaded = image?.id === generationId && image.index === imageIndex ? image : null;
    const failed = failure?.id === generationId && failure.index === imageIndex;
    const dimensions = previewSize?.match(/^(\d+)x(\d+)$/);
    const previewRatio = dimensions && Number(dimensions[1]) > 0 && Number(dimensions[2]) > 0 ? Number(dimensions[1]) / Number(dimensions[2]) : 1;
    useEffect(
        () =>
            loadGenerationImage(
                generationId,
                imageIndex,
                import.meta.env.VITE_APP_WEB_API_PREFIX || "api",
                (result) => setImage({ ...result, id: generationId, index: imageIndex }),
                () => setFailure({ id: generationId, index: imageIndex }),
            ),
        [generationId, imageIndex, attempt],
    );
    return (
        <>
            <div
                className={`rtile${hover ? " peek" : ""}${holding ? " holding" : ""}${previewSize ? " result-preview-tile" : ""}`}
                style={previewSize ? { aspectRatio: previewRatio, width: `min(100%, 900px, ${68 * previewRatio}vh)` } : undefined}
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => setHover(false)}
                onPointerDown={() => beforeSrc && setHolding(true)}
                onPointerUp={() => setHolding(false)}
                onPointerLeave={() => setHolding(false)}
            >
                {loaded ? (
                    <button
                        type="button"
                        className="result-preview"
                        aria-label={`预览图片 ${caption}`}
                        title="放大预览"
                        onClick={() => previewDialog.current?.showModal()}
                    >
                        <img src={loaded.url} alt={caption} draggable={false} />
                    </button>
                ) : (
                    <div className="generation-placeholder" role={failed ? "alert" : "status"}>
                        <span>{failed ? "图片加载失败" : "图片加载中..."}</span>
                        {failed && (
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => {
                                    setFailure(null);
                                    setAttempt((value) => value + 1);
                                }}
                            >
                                <RefreshCw size={14} />
                                重新加载
                            </button>
                        )}
                    </div>
                )}
                {onDetails && <div className="work-tile-actions">
                    <button type="button" disabled={!loaded} onClick={() => previewDialog.current?.showModal()}>
                        <Eye size={15} />预览大图
                    </button>
                    <button type="button" onClick={onDetails}>任务详情<ArrowUpRight size={15} /></button>
                </div>}
                {beforeSrc && (
                    <img className="before" src={beforeSrc} alt="原图" draggable={false} />
                )}
                {beforeSrc && <span className="hold-tag">按住看原图</span>}
                <div className="ovl">
                    <button
                        className="o-btn"
                        title="下载"
                        aria-label={`下载图片 ${caption}`}
                        disabled={!loaded}
                        onClick={() => loaded && onDownload(loaded.blob, loaded.url)}
                    >
                        <Download width={14} height={14} />
                    </button>
                    <button
                        type="button"
                        className="o-btn"
                        title="放大预览"
                        aria-label={`放大预览 ${caption}`}
                        disabled={!loaded}
                        onClick={() => previewDialog.current?.showModal()}
                    >
                        <ImageIcon size={14} />
                    </button>
                    <span className="o-cap">{caption}</span>
                </div>
            </div>
            <dialog
                ref={previewDialog}
                className="result-image-dialog"
                aria-label={`图片预览 ${caption}`}
                onClick={(event) => {
                    if (event.target === event.currentTarget) event.currentTarget.close();
                }}
            >
                <div className="res-actions">
                    <span>{caption}</span>
                    <button
                        type="button"
                        className="icon-btn"
                        title="下载原图"
                        aria-label="下载原图"
                        disabled={!loaded}
                        onClick={() => loaded && onDownload(loaded.blob, loaded.url)}
                    >
                        <Download size={18} />
                    </button>
                    <button
                        type="button"
                        className="icon-btn"
                        title="关闭预览"
                        aria-label="关闭预览"
                        onClick={() => previewDialog.current?.close()}
                    >
                        <X size={18} />
                    </button>
                </div>
                {loaded && <img src={loaded.url} alt={caption} />}
            </dialog>
        </>
    );
}
