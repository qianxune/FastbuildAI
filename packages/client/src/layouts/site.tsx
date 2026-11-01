import MainLayout from "@buildingai/ui/layouts/main/index";
import { useLocation, useSearchParams } from "react-router-dom";

export default function SiteLayout() {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const redirectPath = (searchParams.get("redirect") ?? "").split(/[?#]/)[0];
  const isStudioPath = (path: string) => path === "/studio" || path.startsWith("/studio/");
  const isProduct = pathname === "/" || isStudioPath(pathname) ||
    (pathname.startsWith("/login") && isStudioPath(redirectPath));

  return (
    <MainLayout head={isProduct ? {
      title: isStudioPath(pathname) ? "出图AI 工作台" : "出图AI",
      titleTemplate: "%s",
      description: "出图AI，面向电商卖家的 AI 商品图工作台。",
    } : undefined} />
  );
}