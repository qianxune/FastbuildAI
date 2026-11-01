# Image Studio Workspace Completion Implementation Plan

**Goal:** Deliver a light, organized image workspace with working account actions, reusable private assets, and capability-checked image workflows.

**Architecture:** Keep the existing queue, billing, ownership checks and COS result storage. Extract workspace navigation, account UI, asset management and image-tool forms into focused components. Image tasks retain their tool and input metadata so works, retries and asset-reference protection remain accurate.

**Tech Stack:** React, TanStack Query, lucide-react, NestJS, TypeORM, BullMQ, AI SDK, sharp, Docker/pnpm, Jest and browser automation.

## Approved Scope

- White workspace only; preserve the landing page and previous product-entry behavior.
- Single grouped sidebar, workbench, works, assets, history, preferences and help.
- Account popover with actual user information, balance, profile, recharge, credit history and logout using shared platform components where possible. Do not invent subscription or invitation availability.
- Asset upload, protected thumbnail/preview/download, search/date/group filtering, rename/group management where safely persistent, delete with confirmation and historical-reference protection, and selection in image tools.
- Complete existing image-tool workflows using actual reference-image/vision support. Never advertise alpha segmentation, masks, or exact outpainting unless implemented. Expose unsupported capabilities clearly instead of fake working controls.
- Preserve task billing, cancellation/refunds, retry metadata, storage and user isolation.
- User-authorized real image generation cap: 20 provider calls across this task. Prefer single-image requests and no automatic retries; track actual attempts. Do not store credentials.

## Task 1: Light Shell and Account

Files: `src/web/styles/index.css`, `src/web/pages/index.tsx`, focused workspace navigation/account components under `extensions/image-studio/src/web/pages/`.

1. Apply scoped light tokens and check that landing tokens are unchanged (completed).
2. Reuse shared account/profile/recharge components after inspecting their API.
3. Replace duplicate icon/tree navigation with a labeled, collapsible grouped sidebar; preserve mounted creative form and active generation when switching sections.
4. Implement preferences/help as usable dialogs, not disabled buttons. Persist preferences without storing credentials or user asset metadata globally.
5. Test navigation, popover dismissal/focus, logout, preferences and mobile drawer.

## Task 2: Assets

Files: `src/web/pages/materials.tsx`, asset-selector component, `src/web/services/generation.ts`, `src/web/services/types.ts`; existing product service/controller only for missing persistent metadata.

1. Reuse product image service; verify validation, user-isolated listing and historical reference checks.
2. Add durable asset metadata only if required; preserve existing PNG files and legacy records.
3. Implement upload, filter, preview, download, delete and reference selection with loading/error/empty states.
4. Test ownership, invalid files, missing files, filtering and referenced-delete rejection. Do not delete preexisting user assets in live validation.

## Task 3: Tool Workflows

Files: `src/api/shared/tools.ts`, shared tool-input definitions, generation entity/migration/DTO/service/model/controller, `src/web/pages/tool-form.tsx`, generation hooks, works labels.

1. Define validated per-tool input and deterministic prompt builders. Use uploaded asset IDs, never arbitrary client URLs.
2. Add queue submission path, persist tool input, keep counts bounded 1-4, preserve quote/billing/refund semantics and cancellation checks.
3. Preserve tool input on retry and protect referenced assets from deletion under the same advisory lock.
4. Connect detail, replica, fusion, SKU, retouch, expansion and translation only to genuine reference-image editing. Product suggestions use vision with explicit submission. Treat watermark removal as authorized-owned-content editing, not hidden automatic behavior.
5. Keep cutout unavailable until a genuine transparent-background pipeline exists; document any remaining capability blocker explicitly.
6. Add focused offline DTO/prompt/service tests, capability tests and retry/reference protection checks before live inference.

## Task 4: Verification and Publication

1. Run focused Jest suites after each implementation; repair same-slice failures before expanding scope.
2. Docker API typecheck, frontend lint and frontend build; API build `--no-clean` if backend changed.
3. Apply extension migration using the existing extension migration mechanism; do not enable schema synchronization or modify unrelated data.
4. Restart `buildingai-api`, verify health and published assets.
5. Login with supplied test account without printing/storing credentials. Use the supplied local image only after verifying its path. Browser-check desktop and mobile, account actions, asset reuse and completed results in works.
6. Run minimal real single-image tasks with no retries, record exact provider-call count and results. Do not exceed 20.
7. Review spec compliance, then code quality; fix discovered regressions and rerun focused checks.

## Task 5: Requirement Record

Update `D:/obsidian/aidianshang/需求/出图AI-近期修改需求汇总.md` with the approved request, implementation status, actual verification, known limits and real-call count. Preserve prior history and never write passwords, tokens or secrets.

## Execution Constraints

- All builds/tests run through `docker-compose exec -T nodejs`; pnpm only; no shell `cd`.
- Manual code edits use apply_patch. Preserve unrelated work and deployed frontend artifacts.
- Do not create branches, stage files, commit, or alter ignore rules.
- Existing ignore rules hide new image-studio files; disclose this during handoff.
- No assertion that mocked tests prove real provider correctness. Report incomplete acceptance explicitly.

## Verification Log

- Initial scoped light-theme check passed; landing palette preserved.
- Real image generation calls so far: 0.