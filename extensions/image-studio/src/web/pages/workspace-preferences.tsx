import { useAuthStore } from "@buildingai/stores";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@buildingai/ui/components/ui/dialog";
import { CircleHelp, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

export interface WorkspacePreferences { count: number; quality: "standard" | "hd" }
export const DEFAULT_PREFERENCES: WorkspacePreferences = { count: 1, quality: "standard" };

export function normalizePreferences(value: unknown): WorkspacePreferences {
    const candidate = value && typeof value === "object" ? value as Partial<WorkspacePreferences> : {};
    return {
        count: Number.isInteger(candidate.count) && candidate.count! >= 1 && candidate.count! <= 4 ? candidate.count! : 1,
        quality: candidate.quality === "hd" ? "hd" : "standard",
    };
}

function readPreferences(key: string) {
    try {
        const stored = key ? localStorage.getItem(key) : null;
        return normalizePreferences(stored && stored.length < 256 ? JSON.parse(stored) : null);
    } catch { return DEFAULT_PREFERENCES; }
}

export function useWorkspacePreferences() {
    const userId = useAuthStore((state) => state.auth.userInfo?.id);
    const key = userId ? `image-studio:preferences:${userId}` : "";
    const [stored, setStored] = useState(() => ({ key, value: readPreferences(key) }));
    const [error, setError] = useState("");
    const value = stored.key === key ? stored.value : readPreferences(key);
    useEffect(() => { setStored({ key, value: readPreferences(key) }); setError(""); }, [key]);
    const update = (next: WorkspacePreferences) => {
        const normalized = normalizePreferences(next);
        setStored({ key, value: normalized });
        setError("");
        try { if (key) localStorage.setItem(key, JSON.stringify(normalized)); }
        catch { setError("偏好已在本次会话生效，浏览器未允许保存"); }
    };
    return { value, update, error };
}

export function WorkspacePreferencesDialog({ open, onOpenChange, value, onChange, error }: {
    open: boolean; onOpenChange: (open: boolean) => void; value: WorkspacePreferences;
    onChange: (next: WorkspacePreferences) => void; error: string;
}) {
    return <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="workspace-dialog">
            <DialogTitle>偏好设置</DialogTitle>
            <DialogDescription>创意生图默认值</DialogDescription>
            <label className="field">默认数量<select className="sel" value={value.count}
                onChange={(event) => onChange({ ...value, count: Number(event.target.value) })}>
                {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count} 张</option>)}
            </select></label>
            <label className="field">默认质量<select className="sel" value={value.quality}
                onChange={(event) => onChange({ ...value, quality: event.target.value as WorkspacePreferences["quality"] })}>
                <option value="standard">标准</option><option value="hd">高清</option>
            </select></label>
            {error && <p role="status">{error}</p>}
            <button type="button" className="btn btn-lime" onClick={() => onOpenChange(false)}>完成</button>
        </DialogContent>
    </Dialog>;
}

export function WorkspaceHelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    return <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="workspace-dialog workspace-help">
            <DialogTitle><CircleHelp size={20} />帮助与反馈</DialogTitle>
            <DialogDescription>生成异常与功能限制</DialogDescription>
            <section><h3>没有可用模型</h3><p>请联系管理员检查公共模型是否启用，并配置对应的参考图或视觉能力。刷新能力后重试。</p></section>
            <section><h3>生成失败或积分不足</h3><p>在生成历史查看错误和扣费状态。失败或取消的任务可在能力恢复后重新报价重试，积分明细位于账户菜单。</p></section>
            <section><h3>透明抠图</h3><p>当前未安装透明分割引擎。请联系管理员接入支持透明通道输出的引擎；白底生图不等于透明抠图。</p></section>
            <section><h3>图片编辑与产品建议</h3><p>扩图、翻译与去水印使用参考图指令编辑，不保证像素级还原。建议仅供参考，商品事实需自行核实。</p></section>
            <a className="btn btn-ghost" href="https://github.com/FastbuildAI/FastbuildAI/issues" target="_blank" rel="noreferrer"><ExternalLink size={16} />项目问题反馈</a>
        </DialogContent>
    </Dialog>;
}