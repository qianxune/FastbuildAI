import { useUserInfoQuery } from "@buildingai/services/shared";
import { useRechargeCenterQuery } from "@buildingai/services/web";
import { useAuthStore, useConfigStore } from "@buildingai/stores";
import { Avatar, AvatarFallback, AvatarImage } from "@buildingai/ui/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@buildingai/ui/components/ui/dropdown-menu";
import { useAlertDialog } from "@buildingai/ui/hooks/use-alert-dialog";
import { CreditCard, FolderOpen, Images, LogOut, RefreshCw, User, UserPen, Wallet, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCreditBalanceQuery } from "../services/generation";
import type { WorkspaceView } from "./workspace-navigation";

export function maskAccount(phone?: string, username?: string) {
    if (phone) return phone.length > 6 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : "已绑定手机";
    return username || "已登录";
}

export function redirectToStudioLogin() {
    (window.top ?? window).location.assign("/login?redirect=%2Fstudio");
}

export function requestAccountAction(action: string) {
    if (!["profile", "wallet", "subscribe", "credits"].includes(action)) return;
    if (window.top === window) {
        window.location.assign(`/studio?account=${action}`);
        return;
    }
    window.parent.postMessage({ type: "image-studio:account", action }, window.location.origin);
}

export default function WorkspaceAccount({ onNavigate, locked }: { onNavigate: (view: WorkspaceView) => void; locked: boolean }) {
    const { userInfo } = useAuthStore((state) => state.auth);
    const { logout } = useAuthStore((state) => state.authActions);
    const { data: profile, refetch: refreshProfile } = useUserInfoQuery();
    const { data: recharge } = useRechargeCenterQuery();
    const membership = useConfigStore((state) => state.config.websiteConfig?.features?.membership ?? false);
    const balance = useCreditBalanceQuery();
    const { confirm } = useAlertDialog();
    const [loggingOut, setLoggingOut] = useState(false);
    const logoutStarted = useRef(false);
    useEffect(() => {
        const refresh = (event: MessageEvent) => {
            if (event.source === window.parent && event.origin === window.location.origin &&
                event.data?.type === "image-studio:account-updated") void refreshProfile();
        };
        window.addEventListener("message", refresh);
        return () => window.removeEventListener("message", refresh);
    }, [refreshProfile]);
    const info = profile ?? userInfo;
    const phone = (info as { phone?: string } | undefined)?.phone;
    const nickname = info?.nickname || info?.username || "我的账户";
    const credits = balance.isSuccess ? `${balance.data.balance.toLocaleString()} 积分` : balance.isError ? "余额查询失败" : "余额加载中...";
    const signOut = async () => {
        if (locked || logoutStarted.current) return;
        try {
            await confirm({ title: "退出登录", description: "确定退出出图AI？" });
        } catch { return; }
        logoutStarted.current = true;
        setLoggingOut(true);
        await logout();
        redirectToStudioLogin();
    };
    return <>
        <button type="button" className="credits workspace-credit-button" title="积分明细" onClick={() => requestAccountAction("credits")}><Zap size={15} /><span>{credits}</span></button>
        {balance.isError && <button type="button" className="icon-btn" title="刷新积分余额" aria-label="刷新积分余额" disabled={balance.isFetching} onClick={() => void balance.refetch()}><RefreshCw size={17} /></button>}
        <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" className="workspace-account-trigger" aria-label="我的账户" disabled={loggingOut}>
                <Avatar><AvatarImage src={info?.avatar} alt="" /><AvatarFallback>{nickname.slice(0, 1)}</AvatarFallback></Avatar>
                <span>{nickname}</span>
            </button></DropdownMenuTrigger>
            <DropdownMenuContent className="workspace-account-menu" align="end">
                <DropdownMenuLabel><strong>{nickname}</strong><span className="workspace-account-identity">{maskAccount(phone, info?.username)}</span></DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => requestAccountAction("profile")}><UserPen size={17} />编辑资料</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="workspace-account-balance"><Zap size={17} /><span role="status">{credits}</span></DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => onNavigate("works")}><FolderOpen size={17} />我的作品</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onNavigate("materials")}><Images size={17} />素材库</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => requestAccountAction("credits")}><CreditCard size={17} />积分明细</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => requestAccountAction("wallet")}><Wallet size={17} />积分钱包</DropdownMenuItem>
                {recharge?.rechargeStatus && <DropdownMenuItem onSelect={() => requestAccountAction("wallet")}><Zap size={17} />积分充值</DropdownMenuItem>}
                {membership && <DropdownMenuItem onSelect={() => requestAccountAction("subscribe")}><User size={17} />会员订阅</DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={locked || loggingOut} onSelect={() => void signOut()}><LogOut size={17} />{loggingOut ? "退出中..." : "退出登录"}</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    </>;
}