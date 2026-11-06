import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@buildingai/ui/components/ui/dialog";
import { ChevronDown, CircleHelp, Eraser, Expand, FolderOpen, History, Image, Images, Languages, Layers3, LayoutDashboard, Lightbulb, Package, Paintbrush, Scan, Scissors, Settings, Sparkles, Wand2, type LucideIcon } from "lucide-react";
import type { ToolKey } from "../../api/shared/tools";

export type WorkspaceView = "overview" | "create" | "works" | "materials" | "history";
export const TOOL_LABELS: Record<ToolKey, string> = {
    main: "商品主图", detail: "商品详情", replica: "爆款复刻", creative: "创意生图",
    fusion: "多图融合", sku: "商品SKU图", retouch: "产品精修", cutout: "一键抠图",
    watermark: "去除水印", expand: "智能扩图", translate: "图片翻译", suggest: "产品建议", redraw: "局部重绘",
};
export const TOOL_ICONS: Record<ToolKey, LucideIcon> = {
    main: Image, detail: Scan, replica: Layers3, creative: Sparkles, fusion: Images, sku: Package,
    retouch: Wand2, cutout: Scissors, watermark: Eraser, expand: Expand, translate: Languages, suggest: Lightbulb, redraw: Paintbrush,
};
const GROUPS: { name: string; tools: ToolKey[] }[] = [
    { name: "电商生图", tools: ["main", "detail", "replica", "creative", "fusion", "sku"] },
    { name: "AI 修图", tools: ["retouch", "redraw", "cutout", "watermark", "expand", "translate"] },
];

interface NavigationProps {
    view: WorkspaceView;
    tool: ToolKey;
    mobileOpen: boolean;
    onMobileOpenChange: (open: boolean) => void;
    onNavigate: (view: WorkspaceView, tool?: ToolKey) => void;
    onPreferences: () => void;
    onHelp: () => void;
}

function NavigationContent({ view, tool, onNavigate, onPreferences, onHelp, onMobileOpenChange }: NavigationProps) {
    const navigate = (next: WorkspaceView, key?: ToolKey) => { onNavigate(next, key); onMobileOpenChange(false); };
    return <nav className="workspace-nav" aria-label="工作区导航">
        <div className="workspace-nav-primary">
            {([
                ["overview", "创作工作台", LayoutDashboard], ["works", "我的作品", FolderOpen],
                ["materials", "资产库", Images], ["history", "生成历史", History],
            ] as const).map(([key, label, Icon]) => <button key={key} type="button"
                className="workspace-nav-item" aria-current={view === key ? "page" : undefined}
                onClick={() => navigate(key)}><Icon size={18} /><span>{label}</span></button>)}
        </div>
        {GROUPS.map((group) => <details className="workspace-nav-group" key={group.name} open>
            <summary>{group.name}<ChevronDown size={15} /></summary>
            {group.tools.map((key) => {
                const Icon = TOOL_ICONS[key];
                return <button key={key} type="button" className="workspace-nav-item"
                    aria-current={view === "create" && tool === key ? "true" : undefined}
                    onClick={() => navigate("create", key)}><Icon size={17} /><span>{TOOL_LABELS[key]}</span></button>;
            })}
        </details>)}
        <button type="button" className="workspace-nav-item" aria-current={view === "create" && tool === "suggest" ? "true" : undefined}
            onClick={() => navigate("create", "suggest")}><Lightbulb size={18} /><span>产品建议</span></button>
        <div className="workspace-nav-bottom">
            <button type="button" className="workspace-nav-item" onClick={() => { onMobileOpenChange(false); onPreferences(); }}><Settings size={18} /><span>偏好设置</span></button>
            <button type="button" className="workspace-nav-item" onClick={() => { onMobileOpenChange(false); onHelp(); }}><CircleHelp size={18} /><span>帮助与反馈</span></button>
        </div>
    </nav>;
}

export default function WorkspaceNavigation(props: NavigationProps) {
    return <>
        <aside className="workspace-sidebar"><NavigationContent {...props} /></aside>
        <Dialog open={props.mobileOpen} onOpenChange={props.onMobileOpenChange}>
            <DialogContent className="workspace-drawer" style={{ translate: "0 0" }}>
                <DialogTitle>出图AI</DialogTitle>
                <DialogDescription className="sr-only">工作区菜单</DialogDescription>
                <NavigationContent {...props} />
            </DialogContent>
        </Dialog>
    </>;
}