import { useDocumentHead } from "@buildingai/hooks";
import { Badge } from "@buildingai/ui/components/ui/badge";
import { Button } from "@buildingai/ui/components/ui/button";
import { Label } from "@buildingai/ui/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@buildingai/ui/components/ui/select";
import { Spinner } from "@buildingai/ui/components/ui/spinner";
import { Textarea } from "@buildingai/ui/components/ui/textarea";
import {
    AlertCircle,
    Download,
    ImageIcon,
    RefreshCw,
    Sparkles,
    Trash2,
    WandSparkles,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
    useDeleteGenerationMutation,
    useGenerateImageMutation,
    useGenerationHistoryQuery,
    useImageModelsQuery,
    useRetryGenerationMutation,
} from "../services/generation";
import type { GenerateImageInput, ImageGeneration } from "../services/types";

const promptIdeas = [
    "雨后东京街角的透明唱片店，电影感摄影，霓虹倒影，细节丰富",
    "一只戴飞行员护目镜的柯基站在云端，复古旅行海报风格",
    "极简护肤品静物摄影，柔和侧光，浅灰背景，商业广告质感",
];

const sizeOptions = [
    { value: "1024x1024", label: "方形 1:1", ratio: "1 / 1" },
    { value: "1536x1024", label: "横向 3:2", ratio: "3 / 2" },
    { value: "1024x1536", label: "竖向 2:3", ratio: "2 / 3" },
    { value: "1792x1024", label: "宽屏 7:4", ratio: "7 / 4" },
    { value: "1024x1792", label: "海报 4:7", ratio: "4 / 7" },
];

function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    return "生成失败，请检查模型和密钥配置";
}

export default function ImageStudioPage() {
    useDocumentHead({ title: "Image Studio" });

    const modelsQuery = useImageModelsQuery();
    const historyQuery = useGenerationHistoryQuery();
    const generateMutation = useGenerateImageMutation();
    const retryMutation = useRetryGenerationMutation();
    const deleteMutation = useDeleteGenerationMutation();

    const [prompt, setPrompt] = useState("");
    const [modelId, setModelId] = useState("");
    const [size, setSize] = useState("1024x1024");
    const [quality, setQuality] = useState("standard");
    const [style, setStyle] = useState("vivid");
    const [count, setCount] = useState(1);
    const [selected, setSelected] = useState<ImageGeneration | null>(null);

    const models = modelsQuery.data ?? [];
    const history = historyQuery.data?.items ?? [];
    const busy = generateMutation.isPending || retryMutation.isPending;
    const activeResult = selected ?? generateMutation.data ?? history[0] ?? null;
    const activeSize = sizeOptions.find((option) => option.value === activeResult?.size) ??
        sizeOptions.find((option) => option.value === size)!;

    useEffect(() => {
        const firstModel = models[0];
        if (!modelId && firstModel) setModelId(firstModel.id);
    }, [modelId, models]);

    const submit = () => {
        if (!prompt.trim() || !modelId) return;
        const input: GenerateImageInput = {
            prompt: prompt.trim(),
            modelId,
            size,
            quality,
            style,
            count,
        };
        setSelected(null);
        generateMutation.mutate(input, { onSuccess: setSelected });
    };

    const retry = (generation: ImageGeneration) => {
        retryMutation.mutate(generation.id, { onSuccess: setSelected });
    };

    const remove = (generation: ImageGeneration) => {
        deleteMutation.mutate(generation.id, {
            onSuccess: () => {
                if (selected?.id === generation.id) setSelected(null);
            },
        });
    };

    return (
        <main className="image-studio-shell min-h-screen">
            <header className="studio-header">
                <div>
                    <div className="flex items-center gap-2">
                        <div className="studio-mark"><WandSparkles /></div>
                        <h1>Image Studio</h1>
                        <Badge variant="secondary">AI 绘图</Badge>
                    </div>
                    <p>把一句想法变成可下载的视觉作品。</p>
                </div>
                <div className="model-status">
                    <span className={models.length > 0 ? "status-dot ready" : "status-dot"} />
                    {modelsQuery.isLoading ? "正在检查模型" : `${models.length} 个图片模型可用`}
                </div>
            </header>

            <div className="studio-grid">
                <section className="composer-panel" aria-label="图片生成设置">
                    <div className="section-heading">
                        <span>创作描述</span>
                        <span>{prompt.length} / 2000</span>
                    </div>
                    <Textarea
                        value={prompt}
                        maxLength={2000}
                        onChange={(event) => setPrompt(event.target.value)}
                        placeholder="描述主体、环境、构图、光线和画面风格..."
                        className="prompt-area"
                    />

                    <div className="idea-list">
                        {promptIdeas.map((idea, index) => (
                            <button key={idea} type="button" onClick={() => setPrompt(idea)}>
                                <Sparkles /> 灵感 {index + 1}
                            </button>
                        ))}
                    </div>

                    <div className="control-grid">
                        <div className="control-field control-field-wide">
                            <Label>模型</Label>
                            <Select value={modelId} onValueChange={setModelId}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="选择图片模型" />
                                </SelectTrigger>
                                <SelectContent>
                                    {models.map((model) => (
                                        <SelectItem key={model.id} value={model.id}>
                                            {model.name} · {model.provider}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="control-field">
                            <Label>画面比例</Label>
                            <Select value={size} onValueChange={setSize}>
                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {sizeOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="control-field">
                            <Label>质量</Label>
                            <Select value={quality} onValueChange={setQuality}>
                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="standard">标准</SelectItem>
                                    <SelectItem value="hd">高清</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="control-field">
                            <Label>风格</Label>
                            <Select value={style} onValueChange={setStyle}>
                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="vivid">鲜明</SelectItem>
                                    <SelectItem value="natural">自然</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="control-field">
                            <Label>生成数量</Label>
                            <div className="count-control">
                                {[1, 2, 3, 4].map((value) => (
                                    <button
                                        key={value}
                                        type="button"
                                        className={count === value ? "active" : ""}
                                        onClick={() => setCount(value)}
                                    >
                                        {value}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {modelsQuery.isError && (
                        <div className="inline-alert"><AlertCircle /> 无法读取图片模型，请刷新后重试。</div>
                    )}
                    {!modelsQuery.isLoading && models.length === 0 && (
                        <div className="inline-alert">
                            <AlertCircle /> 请先在系统模型管理中启用一个“图像生成”模型并绑定密钥。
                        </div>
                    )}
                    {generateMutation.isError && (
                        <div className="inline-alert"><AlertCircle /> {getErrorMessage(generateMutation.error)}</div>
                    )}

                    <Button
                        size="lg"
                        className="generate-button w-full"
                        loading={busy}
                        disabled={!prompt.trim() || !modelId || models.length === 0}
                        onClick={submit}
                    >
                        <WandSparkles /> {busy ? "正在生成" : "开始生成"}
                    </Button>
                </section>

                <section className="result-panel" aria-label="生成结果">
                    <div className="section-heading">
                        <span>生成结果</span>
                        {activeResult && <span>{activeResult.modelName}</span>}
                    </div>

                    <div className="result-stage" style={{ aspectRatio: activeSize.ratio }}>
                        {busy ? (
                            <div className="stage-state">
                                <Spinner className="size-8" />
                                <strong>正在构建画面</strong>
                                <span>模型会根据细节复杂度花费一些时间</span>
                            </div>
                        ) : activeResult?.status === "failed" ? (
                            <div className="stage-state error-state">
                                <AlertCircle />
                                <strong>这次没有生成成功</strong>
                                <span>{activeResult.error}</span>
                                <Button variant="outline" onClick={() => retry(activeResult)}>
                                    <RefreshCw /> 重新生成
                                </Button>
                            </div>
                        ) : activeResult?.images.length ? (
                            <div className={`result-gallery count-${activeResult.images.length}`}>
                                {activeResult.images.map((image, index) => (
                                    <figure key={image.url}>
                                        <img src={image.url} alt={`${activeResult.prompt} ${index + 1}`} />
                                        <a href={image.url} download title="下载原图" aria-label="下载原图">
                                            <Download />
                                        </a>
                                    </figure>
                                ))}
                            </div>
                        ) : (
                            <div className="stage-state empty-state">
                                <ImageIcon />
                                <strong>画布等待你的想法</strong>
                                <span>写下描述并选择图片模型</span>
                            </div>
                        )}
                    </div>

                    {activeResult && activeResult.status === "completed" && (
                        <div className="result-caption">
                            <p>{activeResult.prompt}</p>
                            <span>{activeResult.size} · {activeResult.quality} · {activeResult.style}</span>
                        </div>
                    )}
                </section>
            </div>

            <section className="history-section" aria-label="创作历史">
                <div className="history-header">
                    <div>
                        <h2>最近创作</h2>
                        <p>选择记录可以回看结果，失败任务可以直接重试。</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => historyQuery.refetch()}>
                        <RefreshCw /> 刷新
                    </Button>
                </div>

                {historyQuery.isLoading ? (
                    <div className="history-loading"><Spinner /> 正在读取历史</div>
                ) : history.length === 0 ? (
                    <div className="history-empty">第一次作品会出现在这里。</div>
                ) : (
                    <div className="history-strip">
                        {history.map((generation) => (
                            <article
                                key={generation.id}
                                className={activeResult?.id === generation.id ? "history-item active" : "history-item"}
                                onClick={() => setSelected(generation)}
                            >
                                <div className="history-thumb">
                                    {generation.images[0] ? (
                                        <img src={generation.images[0].url} alt="" />
                                    ) : generation.status === "failed" ? (
                                        <AlertCircle />
                                    ) : (
                                        <Spinner />
                                    )}
                                </div>
                                <div className="history-copy">
                                    <p>{generation.prompt}</p>
                                    <span>{new Date(generation.createdAt).toLocaleString("zh-CN")}</span>
                                </div>
                                <div className="history-actions">
                                    <button
                                        type="button"
                                        title="重新生成"
                                        aria-label="重新生成"
                                        onClick={(event) => { event.stopPropagation(); retry(generation); }}
                                    >
                                        <RefreshCw />
                                    </button>
                                    <button
                                        type="button"
                                        title="删除记录"
                                        aria-label="删除记录"
                                        onClick={(event) => { event.stopPropagation(); remove(generation); }}
                                    >
                                        <Trash2 />
                                    </button>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </main>
    );
}