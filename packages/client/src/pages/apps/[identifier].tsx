import { useSettingsDialog } from "@buildingai/hooks";
import { fetchWebExtensionDetail } from "@buildingai/services/web";
import { useConfigStore } from "@buildingai/stores";
import NotFoundPage from "@buildingai/ui/components/exception/not-found-page";
import { useTheme } from "@buildingai/ui/components/theme-provider";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { SettingsDialogProvider } from "../../components/settings-dialog";
import { PowerDetailDialog } from "../../components/settings-dialog/settings-items/power-detail-dialog";
import { toAppPath } from "./entry-path";

type AccountAction = "profile" | "wallet" | "subscribe" | "credits";

export function isAccountAction(value: unknown): value is AccountAction {
  return typeof value === "string" && ["profile", "wallet", "subscribe", "credits"].includes(value);
}

export function useProductAccountTheme(active: boolean) {
  const { theme } = useTheme();
  const currentTheme = useRef(theme);
  currentTheme.current = theme;
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    const initialTheme = currentTheme.current;
    const colorScheme = root.style.colorScheme;
    const apply = () => {
      root.classList.remove("dark");
      root.classList.add("light");
      root.style.colorScheme = "light";
    };
    apply();
    const observer = new MutationObserver(() => {
      if (root.classList.contains("dark") || !root.classList.contains("light")) apply();
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => {
      observer.disconnect();
      const restored = currentTheme.current === "system"
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : currentTheme.current;
      root.classList.toggle("dark", restored === "dark");
      root.classList.toggle("light", restored === "light");
      root.style.colorScheme = currentTheme.current === initialTheme && initialTheme !== "system"
        ? colorScheme : restored;
    };
  }, [active]);
}

export function ProductAccountControls({ request, onClosed }: { request: { action: AccountAction } | null; onClosed?: () => void }) {
  const { open, close, isOpen } = useSettingsDialog();
  const membership = useConfigStore((state) => state.config.websiteConfig?.features?.membership ?? false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const consumed = useRef<typeof request>(null);
  const wasOpen = useRef(false);
  useProductAccountTheme(isOpen || creditsOpen);
  useEffect(() => {
    if (!request || consumed.current === request) return;
    consumed.current = request;
    if (request.action === "credits") {
      close();
      setCreditsOpen(true);
    } else {
      setCreditsOpen(false);
      open(request.action === "subscribe" && !membership ? "wallet" : request.action);
    }
  }, [request, membership, open, close]);
  useEffect(() => {
    if (isOpen || creditsOpen) {
      wasOpen.current = true;
    } else if (wasOpen.current) {
      wasOpen.current = false;
      onClosed?.();
    }
  }, [isOpen, creditsOpen, onClosed]);
  return <PowerDetailDialog open={creditsOpen} onOpenChange={setCreditsOpen} />;
}

/**
 * Resolve the base URL for extension iframe.
 * - Dev: uses VITE_DEVELOP_APP_BASE_URL or falls back to localhost:4090
 * - Prod: uses current origin (same domain)
 */
function getExtensionBaseUrl() {
  if (import.meta.env.DEV) {
    return import.meta.env.VITE_DEVELOP_APP_BASE_URL || "http://localhost:4090";
  }
  return window.location.origin;
}

function isNotFoundError(error: unknown) {
  return Boolean(error && typeof error === "object" && "status" in error && error.status === 404);
}

export default function AppIframePage({ productEntry = false }: { productEntry?: boolean }) {
  const { identifier: routeIdentifier, "*": routeWildcard } = useParams();
  const location = useLocation();
  const identifier = productEntry ? "image-studio" : routeIdentifier;
  const wildcard = productEntry ? location.pathname.slice(1) : routeWildcard;
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isIframeNavigatingRef = useRef(false);
  const accountEnabled = productEntry && (wildcard === "studio" || wildcard?.startsWith("studio/"));
  const [accountRequest, setAccountRequest] = useState<{ action: AccountAction } | null>(null);
  const consumedAccountQuery = useRef<string | null>(null);
  const [extensionRouteNotFoundUrl, setExtensionRouteNotFoundUrl] = useState<string | null>(null);
  const {
    error: extensionLoadError,
    isError: isExtensionLoadError,
    isLoading: isExtensionLoading,
  } = useQuery({
    queryKey: ["web", "extension", "detail", identifier],
    queryFn: () => fetchWebExtensionDetail(identifier || "", { silent: true }),
    enabled: !!identifier,
    retry: false,
  });
  const currentUrl = `${location.pathname}${location.search}${location.hash}`;
  const searchParams = new URLSearchParams(location.search);
  const queryAction = accountEnabled ? searchParams.get("account") : null;
  if (accountEnabled) searchParams.delete("account");
  const iframeSearch = accountEnabled
    ? (searchParams.size ? `?${searchParams}` : "")
    : location.search;
  const iframeSrc = useMemo(() => {
    if (!identifier) return "";
    const subPath = wildcard ? `/${wildcard}` : "";
    return `${getExtensionBaseUrl()}/extension/${identifier}${subPath}${iframeSearch}${location.hash}`;
  }, [identifier, wildcard, iframeSearch, location.hash]);
  const initialProductSrc = useRef(iframeSrc);

  useEffect(() => {
    if (!accountEnabled || queryAction === null) {
      consumedAccountQuery.current = null;
      return;
    }
    if (isExtensionLoading || isExtensionLoadError || consumedAccountQuery.current === currentUrl) return;
    consumedAccountQuery.current = currentUrl;
    if (isAccountAction(queryAction)) setAccountRequest({ action: queryAction });
    navigate(`${location.pathname}${iframeSearch}${location.hash}`, { replace: true });
  }, [accountEnabled, queryAction, currentUrl, iframeSearch, isExtensionLoading, isExtensionLoadError, location.pathname, location.hash, navigate]);

  // Listen for navigation messages from iframe (iframe → parent sync)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (!iframeSrc || event.origin !== new URL(iframeSrc).origin) return;

      if (event.data?.type === "image-studio:account") {
        if (accountEnabled && event.origin === window.location.origin && isAccountAction(event.data.action)) {
          setAccountRequest({ action: event.data.action });
        }
        return;
      }

      if (event.data?.type === "extension-not-found") {
        if (!identifier) return;

        const path = toAppPath(identifier, event.data.path ?? "/", productEntry);
        if (!path) return;
        const search = event.data.search ?? "";
        const hash = event.data.hash ?? "";
        const newUrl = `${path}${search}${hash}`;

        setExtensionRouteNotFoundUrl(newUrl);

        if (newUrl !== currentUrl) {
          navigate(newUrl, { replace: true });
        }

        return;
      }

      if (event.data?.type !== "extension-navigate" || !identifier) return;

      const path = toAppPath(identifier, event.data.path ?? "/", productEntry);
      if (!path) return;
      isIframeNavigatingRef.current = true;
      const search = event.data.search ?? "";
      const hash = event.data.hash ?? "";
      const newUrl = `${path}${search}${hash}`;

      if (newUrl !== currentUrl) {
        navigate(newUrl, { replace: true });
      }

      requestAnimationFrame(() => {
        isIframeNavigatingRef.current = false;
      });
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [currentUrl, identifier, navigate, productEntry, iframeSrc, accountEnabled]);

  // Handle browser back/forward (parent → iframe sync)
  useEffect(() => {
    if (isIframeNavigatingRef.current || !identifier) return;

    const subPath = wildcard ? `/${wildcard}` : "/";
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: "parent-navigate",
        path: subPath,
        search: iframeSearch,
        hash: location.hash,
      },
      new URL(iframeSrc).origin,
    );
  }, [identifier, wildcard, iframeSearch, location.hash, iframeSrc]);

  if (isExtensionLoadError) {
    if (isNotFoundError(extensionLoadError)) {
      return <NotFoundPage />;
    }

    throw extensionLoadError;
  }

  if (isExtensionLoading || extensionRouteNotFoundUrl === currentUrl) {
    return extensionRouteNotFoundUrl === currentUrl ? <NotFoundPage /> : null;
  }

  const iframe = (
    <iframe
      key={identifier}
      ref={iframeRef}
      src={productEntry ? initialProductSrc.current : iframeSrc}
      className="h-dvh w-full border-0"
      title={identifier}
      allow="clipboard-read; clipboard-write"
    />
  );
  return productEntry ? (
    <>
      {iframe}
      {accountEnabled && (
        <SettingsDialogProvider>
          <ProductAccountControls request={accountRequest} onClosed={() => {
            iframeRef.current?.contentWindow?.postMessage({ type: "image-studio:account-updated" }, window.location.origin);
          }} />
        </SettingsDialogProvider>
      )}
    </>
  ) : iframe;
}
