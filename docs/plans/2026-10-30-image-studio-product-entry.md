# Image Studio Product Entry Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Present Image Studio as the product at `/` and `/studio`, while retaining shared authentication, administration and business services.

**Architecture:** Reuse the existing extension iframe integration with an explicit product-entry mode. Keep `/extension/image-studio`, `/apps/:identifier/*`, `/chat`, `/c/:id` and `/console` compatible. Do not move business code, change billing, migrate data, or change global administrator defaults.

**Tech Stack:** React, React Router, TypeScript, Vite, NestJS static hosting, Docker Compose, Node test runner and Playwright.

---

### Task 1: Product Route Mapping

**Files:**
- Create: `packages/client/src/pages/apps/entry-path.ts`
- Create: `packages/client/test/product-entry.test.mjs`
- Modify: `packages/client/src/pages/apps/[identifier].tsx`

1. Add offline Node tests for mapping extension paths to public product paths and retaining generic application paths.
2. Run `docker-compose exec -T nodejs node --test packages/client/test/product-entry.test.mjs`; expect a missing-module failure before implementation.
3. Implement a small pure path-mapping function. Product `/` and `/studio/*` remain canonical; other extension paths retain `/apps/:identifier/*`.
4. Add an optional product-entry mode to the iframe component, preserving existing callers. Validate message source and origin and retain query/hash in both directions.
5. Rerun the same tests; expect all mapping cases to pass.

### Task 2: Product Front Door

**Files:**
- Modify: `packages/client/src/router/index.tsx`
- Create: `packages/client/src/layouts/site.tsx`
- Modify: `packages/@buildingai/web/ui/src/layouts/main/index.tsx`
- Modify: `packages/client/src/pages/login/index.tsx`
- Modify: `extensions/image-studio/src/web/pages/landing.tsx`
- Modify: `extensions/image-studio/src/web/pages/index.tsx` only if existing navigation needs a product-home link.

1. Mount the public product page at `/` outside the generic main-site layout.
2. Mount `/studio/*` outside the generic main-site layout, behind the existing AuthGuard.
3. Preserve chat, extension and administrator routes. Keep explicit login redirects and administrator role-based defaults unchanged.
4. Update landing-page start/login links to `/studio`; when embedded, navigate the top-level same-origin page instead of creating nested application iframes.
5. Apply product-specific page titles without changing shared platform settings or administrator branding.
6. Keep the product iframe mounted across query/hash changes, and restore landing-page anchors after refresh. Preserve legacy iframe behavior.
7. Run focused route tests and lint touched frontend files inside Docker.

### Task 3: Build, Publish and Browser Checks

**Files:**
- Existing build/deployment scripts only; no dependency or lockfile changes expected.

1. Build the client with `docker-compose exec -T nodejs pnpm --filter buildingai-client build:web`.
2. Build the extension frontend with `docker-compose exec -T nodejs pnpm --filter image-studio build:web`.
3. Publish extension assets with the existing copy script if required. Restart only the API process to refresh cached extension HTML.
4. Verify `/`, `/studio`, `/login?redirect=%2Fstudio`, `/chat`, old extension URLs and `/console` using browser checks and screenshots at desktop/mobile sizes.
5. Confirm anonymous users can see the homepage, studio access redirects to login, no nested iframe or route loop occurs, assets render, and API health is normal.
6. Do not call paid inference, debit credits, change real user accounts, or commit changes automatically. Report any authenticated checks blocked by the lack of a login session.

## Implementation Notes

- Product page metadata is supplied by the client-specific SiteLayout through an optional shared MainLayout prop. Other applications and console branding retain their configured defaults.
- Product login links enter the shared login with an explicit `/studio` return URL. Direct administrator login retains its existing default destination.
- The first-stage product entry still embeds the extension frontend. It does not provide server-rendered landing content for SEO; that is a separate future change.
- Offline regression command: `docker-compose exec -T nodejs node --test packages/client/test/product-entry.test.mjs` (15 tests).
- Both frontend production builds and focused ESLint error checks passed. Anonymous desktop/mobile checks confirmed the public homepage, loaded artwork, product login redirects, and compatibility with legacy app, chat and console paths.
- Real authenticated workspace and login-provider completion require a valid user session and were not exercised. No paid inference or account writes are part of this verification.