import { useUserInfoQuery } from "@buildingai/services/shared";
import { useRechargeCenterQuery, useUserAccountLogQuery } from "@buildingai/services/web";
import { useAuthStore, useConfigStore } from "@buildingai/stores";
import { Avatar, AvatarFallback, AvatarImage } from "@buildingai/ui/components/ui/avatar";
import { ArrowRight, ArrowUpRight, CheckCircle2, Clock3, ImageIcon, RefreshCw, UserPen, Wallet, XCircle, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ToolKey } from "../../api/shared/tools";
import { loadGenerationThumbnail, loadWhenVisible, useCreditBalanceQuery, useGenerationHistoryQuery } from "../services/generation";
import type { ImageGeneration } from "../services/types";
import { requestAccountAction } from "./workspace-account";
import { TOOL_ICONS, TOOL_LABELS, type WorkspaceView } from "./workspace-navigation";

const asset = (name: string) => `/extension/image-studio/images/${name}.jpg`;
const ENTRIES: { tool: ToolKey; image: string; companion?: string; group: string }[] = [
    { tool: "main", image: "perfume-after", companion: "perfume-before", group: "电商生图" },
    { tool: "detail", image: "bottle-scene", group: "电商生图" },
    { tool: "replica", image: "sneaker-after", companion: "sneaker-before", group: "电商生图" },
    { tool: "creative", image: "mug-scene", group: "电商生图" },
    { tool: "fusion", image: "perfume-after", companion: "bottle-scene", group: "电商生图" },
    { tool: "expand", image: "bottle-scene", group: "AI 修图" },
    { tool: "cutout", image: "perfume-before", companion: "perfume-after", group: "AI 修图" },
    { tool: "watermark", image: "mug-scene", group: "AI 修图" },
    { tool: "translate", image: "bottle-scene", group: "AI 修图" },
    { tool: "retouch", image: "sneaker-after", group: "AI 修图" },
    { tool: "sku", image: "perfume-before", group: "电商生图" },
    { tool: "redraw", image: "sneaker-before", group: "AI 修图" },
];
const STATUSES = { queued: "排队中", processing: "生成中", completed: "已完成", failed: "失败", cancelled: "已取消" };

export function overviewTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "时间未知" : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function RecentTaskImage({ task }: { task: ImageGeneration }) {
    const account = useAuthStore((state) => state.auth.userInfo?.id ?? "");
    const target = useRef<HTMLSpanElement>(null);
    const [image, setImage] = useState<{ id: string; url: string; account: string } | null>(null);
    const [failure, setFailure] = useState<string | null>(null);
    useEffect(() => {
        if (!task.images.length || !account) return;
        return loadWhenVisible(target.current, () => loadGenerationThumbnail(task.id, 0, import.meta.env.VITE_APP_WEB_API_PREFIX || "api",
            ({ url }) => { setImage({ id: task.id, url, account }); setFailure(null); }, () => setFailure(task.id), account));
    }, [task.id, task.images.length, account]);
    return <span ref={target} className="overview-task-image">
        {task.images.length > 0 && image?.id === task.id && image.account === account && failure !== task.id
            ? <img src={image.url} alt="" onError={() => setFailure(task.id)} />
            : <ImageIcon size={21} aria-label={failure === task.id ? "图片加载失败" : task.images.length ? "图片加载中" : "暂无结果图片"} />}
    </span>;
}

export default function WorkspaceOverview({ onNavigate, onOpenTask }: {
    onNavigate: (view: WorkspaceView, tool?: ToolKey) => void;
    onOpenTask: (task: ImageGeneration) => void;
}) {
    const { userInfo } = useAuthStore((state) => state.auth);
    const profile = useUserInfoQuery();
    const balance = useCreditBalanceQuery();
    const ledger = useUserAccountLogQuery({ page: 1, pageSize: 5 });
    const recent = useGenerationHistoryQuery(1, 5);
    const recharge = useRechargeCenterQuery();
    const membership = useConfigStore((state) => state.config.websiteConfig?.features?.membership ?? false);
    const info = profile.data ?? userInfo;
    const nickname = info?.nickname || info?.username || "我的账户";
    const changes = ledger.data?.items ?? [];
    const expense = changes.filter((entry) => Number(entry.action) !== 1).reduce((total, entry) => total + Math.abs(Number(entry.changeAmount) || 0), 0);
    const tasks = recent.data?.items ?? [];
    return <div className="workspace-overview">
        <section className="overview-banner" aria-labelledby="overview-title">
            <div className="overview-banner-copy"><span>出图AI / 创作工作台</span><h1 id="overview-title">把电商运营，组织成一条工作流</h1><p>商品视觉 · 内容创作 · 任务进度</p></div>
            <div className="overview-banner-media" aria-hidden="true"><img src={asset("bottle-scene")} alt="" /><img src={asset("perfume-after")} alt="" /></div>
        </section>
        <section className="overview-tools" aria-label="创作工具">
            {ENTRIES.map(({ tool, image, companion, group }) => {
                const Icon = TOOL_ICONS[tool];
                return <button key={tool} type="button" className={`overview-tool overview-tool-${tool}`} aria-label={TOOL_LABELS[tool]} onClick={() => onNavigate("create", tool)}>
                    <span className={`overview-tool-media${companion ? " overview-tool-pair" : ""}`} aria-hidden="true">
                        {companion && <img src={asset(companion)} alt="" loading="lazy" />}<img src={asset(image)} alt="" loading="lazy" />
                    </span>
                    <span className="overview-tool-icon"><Icon size={19} /></span>
                    <span className="overview-tool-name">{TOOL_LABELS[tool]}<ArrowUpRight size={14} /></span><span className="overview-tool-group">{group}</span>
                </button>;
            })}
        </section>
        <div className="overview-data">
            <section className="overview-account" aria-labelledby="overview-account-title">
                <header className="overview-section-heading"><h2 id="overview-account-title">账号数据</h2><button type="button" className="overview-text-action" onClick={() => requestAccountAction("profile")}><UserPen size={14} />编辑资料</button></header>
                <div className="overview-profile"><Avatar><AvatarImage src={info?.avatar} alt="" /><AvatarFallback>{nickname.slice(0, 1)}</AvatarFallback></Avatar><strong title={nickname}>{nickname}</strong>{profile.isError && <button type="button" className="overview-icon-action" title="重新加载资料" aria-label="重新加载资料" onClick={() => void profile.refetch()}><RefreshCw size={14} /></button>}</div>
                <div className="overview-account-summary">
                    <div className="overview-metric"><span><Zap size={14} />可用积分</span><strong role="status">{balance.isSuccess ? balance.data.balance.toLocaleString() : balance.isError ? "查询失败" : "加载中"}</strong><button type="button" className="overview-text-action" onClick={() => balance.isError ? void balance.refetch() : requestAccountAction("credits")}>{balance.isError ? "重新查询" : "积分明细"}<ArrowRight size={13} /></button></div>
                    <div className="overview-metric"><span>近期记录支出</span><strong role="status">{ledger.isSuccess ? expense.toLocaleString() : ledger.isError ? "查询失败" : "加载中"}</strong><small>{ledger.isSuccess ? `最近 ${changes.length} 条积分变动` : "积分变动"}</small></div>
                    <div className="overview-wallet"><Wallet size={23} /><strong>{membership ? "会员与积分" : "积分钱包"}</strong><button type="button" onClick={() => requestAccountAction(membership ? "subscribe" : "wallet")}>{membership ? "查看会员" : recharge.data?.rechargeStatus ? "积分充值" : "查看钱包"}<ArrowRight size={14} /></button></div>
                </div>
                <header className="overview-ledger-heading"><h3>最近积分变动</h3><button type="button" className="overview-text-action" onClick={() => requestAccountAction("credits")}>全部明细<ArrowUpRight size={13} /></button></header>
                {ledger.isError ? <div className="overview-empty" role="alert">积分记录加载失败<button type="button" className="overview-text-action" disabled={ledger.isFetching} onClick={() => void ledger.refetch()}><RefreshCw size={14} />重新加载</button></div>
                    : !ledger.isSuccess ? <div className="overview-empty" role="status">正在加载积分记录</div>
                    : !changes.length ? <div className="overview-empty">暂无积分变动</div>
                    : <div className="overview-ledger-scroll"><table className="overview-ledger"><thead><tr><th scope="col">时间</th><th scope="col">类型</th><th scope="col">来源</th><th scope="col">积分变动</th></tr></thead><tbody>{changes.map((entry) => <tr key={entry.id}><td><time dateTime={entry.createdAt}>{overviewTime(entry.createdAt)}</time></td><td><span className={`overview-change-kind ${Number(entry.action) === 1 ? "income" : "expense"}`}>{Number(entry.action) === 1 ? "收入" : "支出"}</span></td><td>{entry.consumeSourceDesc || entry.accountTypeDesc || entry.remark || "积分变动"}</td><td className={Number(entry.action) === 1 ? "income" : "expense"}>{Number(entry.action) === 1 ? "+" : "-"}{Math.abs(Number(entry.changeAmount) || 0).toLocaleString()}</td></tr>)}</tbody></table></div>}
            </section>
            <section className="overview-recent" aria-labelledby="overview-recent-title">
                <header className="overview-section-heading"><h2 id="overview-recent-title">最近任务</h2><button type="button" className="overview-text-action" onClick={() => onNavigate("history")}>查看全部<ArrowUpRight size={13} /></button></header>
                {recent.isError ? <div className="overview-empty" role="alert">任务加载失败<button type="button" className="overview-text-action" disabled={recent.isFetching} onClick={() => void recent.refetch()}><RefreshCw size={14} />重新加载</button></div>
                    : !recent.isSuccess ? <div className="overview-empty" role="status">正在加载最近任务</div>
                    : !tasks.length ? <div className="overview-empty"><ImageIcon size={28} /><span>暂无创作任务</span><button type="button" className="overview-text-action" onClick={() => onNavigate("create", "main")}>商品主图<ArrowRight size={14} /></button></div>
                    : <div className="overview-task-list">{tasks.map((task) => {
                        const StatusIcon = task.status === "completed" ? CheckCircle2 : task.status === "failed" || task.status === "cancelled" ? XCircle : Clock3;
                        return <button type="button" className="overview-task" key={task.id} aria-label={`${TOOL_LABELS[task.toolKey ?? "creative"]}任务详情`} onClick={() => onOpenTask(task)}>
                            <RecentTaskImage task={task} /><span className="overview-task-copy"><strong>{TOOL_LABELS[task.toolKey ?? "creative"]}</strong><small><time dateTime={task.createdAt}>{overviewTime(task.createdAt)}</time> · {task.count} 张图片</small></span><span className={`overview-task-status ${task.status}`}><StatusIcon size={14} />{STATUSES[task.status]}</span>
                        </button>;
                    })}</div>}
            </section>
        </div>
    </div>;
}