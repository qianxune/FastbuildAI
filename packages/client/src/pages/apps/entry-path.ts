export function toAppPath(identifier: string, pathname: unknown, productEntry = false): string | null {
  if (
    typeof pathname !== "string" ||
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    /[\\?#\u0000-\u001f]/.test(pathname)
  ) {
    return null;
  }
  try {
    if (pathname.split("/").some((segment) => {
      const decoded = decodeURIComponent(segment);
      return decoded === "." || decoded === ".." || /[\\/]/.test(decoded);
    })) return null;
  } catch {
    return null;
  }
  if (
    productEntry && identifier === "image-studio" &&
    (pathname === "/" || pathname === "/studio" || pathname.startsWith("/studio/"))
  ) {
    return pathname;
  }
  return `/apps/${identifier}${pathname}`;
}