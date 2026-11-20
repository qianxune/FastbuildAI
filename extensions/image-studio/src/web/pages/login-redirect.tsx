import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import packageJson from "../../../package.json";

export default function LoginRedirect() {
    const { search } = useLocation();
    const redirect = new URLSearchParams(search).get("redirect") ?? "/console";
    const base = `/extension/${packageJson.name}`;
    const destination = new URL(`${base}${redirect}`, window.location.origin);
    const consoleBase = `${base}/console`;
    const valid = !redirect.includes("\\") && !/[\u0000-\u001f\u007f]/.test(redirect)
        && (destination.pathname === consoleBase || destination.pathname.startsWith(`${consoleBase}/`));
    const loginUrl = valid
        ? `/login?redirect=${encodeURIComponent(destination.pathname + destination.search + destination.hash)}`
        : null;

    useEffect(() => {
        if (loginUrl) (window.top ?? window).location.replace(loginUrl);
    }, [loginUrl]);

    return <p role={valid ? "status" : "alert"}>{valid
        ? "正在跳转至统一登录..."
        : "登录返回地址无效，请从控制台入口重新进入。"}</p>;
}
