import {
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@buildingai/ui/components/ui/chart";
import { useAuthStore } from "@buildingai/stores";
import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import type {
    AnalyticsGranularity,
    GenerationAnalyticsModuleItem,
} from "../../../api/shared/analytics";
import { ANALYTICS_MODULE_CATALOG } from "../../../api/shared/analytics";
import { useGenerationAnalyticsQuery } from "../../services/analytics";
import "../../styles/analytics.css";

type SortDirection = "asc" | "desc";
type ModuleSortKey = keyof GenerationAnalyticsModuleItem;

const numberFormatter = new Intl.NumberFormat("zh-CN");
const percentagePointFormatter = new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 1,
});

export function formatFailureRate(value: number) {
    return `${percentagePointFormatter.format(value)}%`;
}

const MODULE_COLUMNS: { key: ModuleSortKey; label: string }[] = [
    { key: "category", label: "分类" },
    { key: "name", label: "功能" },
    { key: "activeUsers", label: "活跃用户" },
    { key: "tasks", label: "任务" },
    { key: "generatedImages", label: "生成图片" },
    { key: "completedTasks", label: "成功" },
    { key: "failedTasks", label: "失败" },
    { key: "cancelledTasks", label: "取消" },
    { key: "failureRate", label: "失败率" },
    { key: "consumedCredits", label: "消耗积分" },
    { key: "refundedCredits", label: "退款积分" },
];

const TASK_CHART_CONFIG: ChartConfig = {
    tasks: { label: "任务数", color: "#6d5dfc" },
    generatedImages: { label: "生成图片", color: "#2ebd85" },
};

const RISK_CHART_CONFIG: ChartConfig = {
    consumedCredits: { label: "消耗积分", color: "#f59e42" },
    failedTasks: { label: "失败任务", color: "#ef5b6c" },
};

function shanghaiDateParts(date: Date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((item) => item.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
}

export function recentDateRange(days: number, now = new Date()) {
    const endDate = shanghaiDateParts(now);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() - (days - 1));
    return {
        startDate: end.toISOString().slice(0, 10),
        endDate,
    };
}

export function formatAnalyticsDate(value: string, granularity: AnalyticsGranularity) {
    if (granularity === "month") {
        const [year, month] = value.split("-");
        return `${year}年${Number(month)}月`;
    }
    const [, month, day] = value.split("-");
    return `${Number(month)}月${Number(day)}日`;
}

export function sortAnalyticsModules(
    rows: readonly GenerationAnalyticsModuleItem[],
    key: ModuleSortKey,
    direction: SortDirection,
) {
    return [...rows].sort((left, right) => {
        const a = left[key];
        const b = right[key];
        const result =
            typeof a === "string" && typeof b === "string"
                ? a.localeCompare(b, "zh-CN")
                : Number(a) - Number(b);
        return direction === "asc" ? result : -result;
    });
}

function MetricCard({
    title,
    value,
    detail,
    metric,
}: {
    title: string;
    value: string;
    detail?: string;
    metric: string;
}) {
    return (
        <article className="studio-analytics__metric-card" data-metric={metric}>
            <h3>{title}</h3>
            <strong>{value}</strong>
            {detail ? <span>{detail}</span> : <span aria-hidden="true">&nbsp;</span>}
        </article>
    );
}

function AnalyticsTrendChart({
    title,
    description,
    data,
    config,
    series,
    granularity,
    id,
}: {
    title: string;
    description: string;
    data: { period: string; [key: string]: string | number }[];
    config: ChartConfig;
    series: { key: string; color: string }[];
    granularity: AnalyticsGranularity;
    id: string;
}) {
    return (
        <section className="studio-analytics__chart-card" aria-label={title}>
            <div className="studio-analytics__panel-heading">
                <div>
                    <h2>{title}</h2>
                    <p>{description}</p>
                </div>
            </div>
            <div className="studio-analytics__chart-scroll">
                <ChartContainer config={config} className="studio-analytics__chart">
                    <AreaChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                        <defs>
                            {series.map((item) => (
                                <linearGradient
                                    id={`${id}-${item.key}`}
                                    key={item.key}
                                    x1="0"
                                    y1="0"
                                    x2="0"
                                    y2="1"
                                >
                                    <stop offset="5%" stopColor={item.color} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={item.color} stopOpacity={0.02} />
                                </linearGradient>
                            ))}
                        </defs>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                        <XAxis
                            dataKey="period"
                            tickLine={false}
                            axisLine={false}
                            minTickGap={28}
                            tickFormatter={(value: string) =>
                                formatAnalyticsDate(value, granularity)
                            }
                        />
                        <YAxis
                            tickLine={false}
                            axisLine={false}
                            width={52}
                            tickFormatter={(value: number) => numberFormatter.format(value)}
                        />
                        <ChartTooltip
                            content={
                                <ChartTooltipContent
                                    labelFormatter={(value) =>
                                        formatAnalyticsDate(String(value), granularity)
                                    }
                                    indicator="dot"
                                />
                            }
                        />
                        <ChartLegend content={<ChartLegendContent />} />
                        {series.map((item) => (
                            <Area
                                key={item.key}
                                dataKey={item.key}
                                type="monotone"
                                fill={`url(#${id}-${item.key})`}
                                stroke={item.color}
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 4 }}
                            />
                        ))}
                    </AreaChart>
                </ChartContainer>
            </div>
        </section>
    );
}

export default function AnalyticsPage() {
    const { token, userInfo } = useAuthStore((state) => state.auth);
    if (!token || userInfo?.isRoot !== 1) {
        return (
            <main className="studio-analytics">
                <section className="studio-analytics__alert">
                    <div>
                        <h2>无权限访问</h2>
                        <p role="alert">仅超级管理员可查看生图使用统计。</p>
                    </div>
                    <Link className="studio-analytics__refresh" to="/console/studio">
                        返回工作台
                    </Link>
                </section>
            </main>
        );
    }
    return <AnalyticsDashboard key={userInfo.id} />;
}

function AnalyticsDashboard() {
    const initialRange = recentDateRange(30);
    const [startDate, setStartDate] = useState(initialRange.startDate);
    const [endDate, setEndDate] = useState(initialRange.endDate);
    const [activePreset, setActivePreset] = useState<number | null>(30);
    const [granularity, setGranularity] = useState<AnalyticsGranularity>("day");
    const [toolKey, setToolKey] = useState("");
    const [sortKey, setSortKey] = useState<ModuleSortKey>("tasks");
    const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

    const filter = useMemo(
        () => ({
            startDate,
            endDate,
            granularity,
            toolKey: toolKey || undefined,
        }),
        [startDate, endDate, granularity, toolKey],
    );
    const query = useGenerationAnalyticsQuery(filter);
    const data = query.data;
    const sortedModules = useMemo(
        () => sortAnalyticsModules(data?.modules ?? [], sortKey, sortDirection),
        [data?.modules, sortDirection, sortKey],
    );

    const applyPreset = (days: number) => {
        const range = recentDateRange(days);
        setStartDate(range.startDate);
        setEndDate(range.endDate);
        setActivePreset(days);
    };

    const updateSort = (key: ModuleSortKey) => {
        if (key === sortKey) {
            setSortDirection(sortDirection === "asc" ? "desc" : "asc");
            return;
        }
        setSortKey(key);
        setSortDirection("asc");
    };

    const formatModuleValue = (key: ModuleSortKey, row: GenerationAnalyticsModuleItem) => {
        const value = row[key];
        if (key === "failureRate") return formatFailureRate(Number(value));
        if (typeof value === "number") return numberFormatter.format(value);
        return String(value);
    };

    return (
        <main className="studio-analytics">
            <header className="studio-analytics__header">
                <div>
                    <h1>使用统计</h1>
                    <p>查看各生图功能的任务、产出、积分与异常情况；统计时间固定为 Asia/Shanghai。</p>
                </div>
                <button
                    type="button"
                    className="studio-analytics__refresh"
                    onClick={() => void query.refetch()}
                    disabled={query.isLoading}
                >
                    <RefreshCw aria-hidden="true" />
                    刷新
                </button>
            </header>

            <section className="studio-analytics__filters" aria-label="统计筛选">
                <div className="studio-analytics__filter-group">
                    <span>时间范围</span>
                    <div className="studio-analytics__segments">
                        {[7, 30, 90].map((days) => (
                            <button
                                type="button"
                                key={days}
                                className={activePreset === days ? "is-active" : ""}
                                aria-pressed={activePreset === days}
                                onClick={() => applyPreset(days)}
                            >
                                最近 {days} 天
                            </button>
                        ))}
                    </div>
                </div>
                <label className="studio-analytics__date-field">
                    <span>开始日期</span>
                    <input
                        type="date"
                        value={startDate}
                        max={endDate}
                        onChange={(event) => {
                            setStartDate(event.target.value);
                            setActivePreset(null);
                        }}
                    />
                </label>
                <label className="studio-analytics__date-field">
                    <span>结束日期</span>
                    <input
                        type="date"
                        value={endDate}
                        min={startDate}
                        onChange={(event) => {
                            setEndDate(event.target.value);
                            setActivePreset(null);
                        }}
                    />
                </label>
                <div className="studio-analytics__filter-group">
                    <span>粒度</span>
                    <div className="studio-analytics__segments">
                        {(["day", "month"] as const).map((value) => (
                            <button
                                type="button"
                                key={value}
                                className={granularity === value ? "is-active" : ""}
                                aria-pressed={granularity === value}
                                onClick={() => setGranularity(value)}
                            >
                                {value === "day" ? "按日" : "按月"}
                            </button>
                        ))}
                    </div>
                </div>
                <label className="studio-analytics__module-field">
                    <span>功能模块</span>
                    <select
                        aria-label="功能模块"
                        value={toolKey}
                        onChange={(event) => setToolKey(event.target.value)}
                    >
                        <option value="">全部功能</option>
                        {ANALYTICS_MODULE_CATALOG.map((entry) => (
                            <option value={entry.key} key={entry.key}>
                                {entry.name}
                            </option>
                        ))}
                    </select>
                </label>
            </section>

            {query.isLoading ? (
                <section className="studio-analytics__loading" role="status" aria-label="加载统计">
                    <p>正在加载使用统计…</p>
                    <div className="studio-analytics__metrics">
                        {Array.from({ length: 6 }, (_, index) => (
                            <div className="studio-analytics__skeleton" key={index} />
                        ))}
                    </div>
                </section>
            ) : null}

            {query.isError ? (
                <section className="studio-analytics__alert" role="alert">
                    <div>
                        <h2>统计加载失败</h2>
                        <p>无法读取使用统计，请稍后重试。</p>
                    </div>
                    <button type="button" onClick={() => void query.refetch()}>
                        重试
                    </button>
                </section>
            ) : null}

            {!query.isLoading && !query.isError && data && data.summary.tasks === 0 ? (
                <section className="studio-analytics__empty">
                    <h2>当前筛选条件下暂无生成任务</h2>
                    <p>可调整日期范围或功能模块后重新查看。</p>
                </section>
            ) : null}

            {!query.isLoading && !query.isError && data && data.summary.tasks > 0 ? (
                <>
                    <section className="studio-analytics__metrics" aria-label="统计汇总">
                        <MetricCard
                            metric="tasks"
                            title="任务数"
                            value={numberFormatter.format(data.summary.tasks)}
                            detail={`成功 ${numberFormatter.format(data.summary.completedTasks)} · 取消 ${numberFormatter.format(data.summary.cancelledTasks)}`}
                        />
                        <MetricCard
                            metric="generatedImages"
                            title="生成图片"
                            value={numberFormatter.format(data.summary.generatedImages)}
                            detail={`请求图片 ${numberFormatter.format(data.summary.requestedImages)}`}
                        />
                        <MetricCard
                            metric="consumedCredits"
                            title="消耗积分"
                            value={numberFormatter.format(data.summary.consumedCredits)}
                            detail="净消耗积分"
                        />
                        <MetricCard
                            metric="failedTasks"
                            title="失败任务"
                            value={numberFormatter.format(data.summary.failedTasks)}
                            detail={`失败率 ${formatFailureRate(data.summary.failureRate)}`}
                        />
                        <MetricCard
                            metric="activeUsers"
                            title="活跃用户"
                            value={numberFormatter.format(data.summary.activeUsers)}
                            detail="产生过生成任务的用户"
                        />
                        <MetricCard
                            metric="refundedCredits"
                            title="退款积分"
                            value={numberFormatter.format(data.summary.refundedCredits)}
                            detail="未计入净消耗"
                        />
                    </section>

                    <section className="studio-analytics__charts" aria-label="使用趋势">
                        <AnalyticsTrendChart
                            id="analytics-production"
                            title="任务与图片趋势"
                            description="任务数与实际生成图片数"
                            data={data.trend}
                            config={TASK_CHART_CONFIG}
                            series={[
                                { key: "tasks", color: "#6d5dfc" },
                                { key: "generatedImages", color: "#2ebd85" },
                            ]}
                            granularity={granularity}
                        />
                        <AnalyticsTrendChart
                            id="analytics-risk"
                            title="积分与失败趋势"
                            description="净消耗积分与失败任务数"
                            data={data.trend}
                            config={RISK_CHART_CONFIG}
                            series={[
                                { key: "consumedCredits", color: "#f59e42" },
                                { key: "failedTasks", color: "#ef5b6c" },
                            ]}
                            granularity={granularity}
                        />
                    </section>

                    <section className="studio-analytics__table-card">
                        <div className="studio-analytics__panel-heading">
                            <div>
                                <h2>功能模块明细</h2>
                                <p>点击列名可按指标排序</p>
                            </div>
                            <span>{numberFormatter.format(sortedModules.length)} 个功能</span>
                        </div>
                        <div className="studio-analytics__table-scroll">
                            <table>
                                <thead>
                                    <tr>
                                        {MODULE_COLUMNS.map((column) => (
                                            <th
                                                key={column.key}
                                                scope="col"
                                                aria-sort={
                                                    sortKey === column.key
                                                        ? sortDirection === "asc"
                                                            ? "ascending"
                                                            : "descending"
                                                        : "none"
                                                }
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => updateSort(column.key)}
                                                >
                                                    {column.label}
                                                </button>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedModules.map((row) => (
                                        <tr key={row.toolKey}>
                                            {MODULE_COLUMNS.map((column) => (
                                                <td
                                                    key={column.key}
                                                    data-label={column.label}
                                                    title={formatModuleValue(column.key, row)}
                                                >
                                                    {formatModuleValue(column.key, row)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                    {sortedModules.length === 0 ? (
                                        <tr>
                                            <td colSpan={MODULE_COLUMNS.length}>
                                                当前筛选没有可展示的模块统计
                                            </td>
                                        </tr>
                                    ) : null}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </>
            ) : null}
        </main>
    );
}
