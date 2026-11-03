# Image Edit Tools Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete dedicated authorized watermark-removal and image-translation workflows using existing image models; keep transparent cutout unavailable until a real alpha-output engine is approved.

**Architecture:** Add tool-scoped design metadata to the existing shared workflow contract and JSONB persistence. Reuse the protected asset picker, region editor, Popover, billing, task queue, result and history paths. Preserve legacy inputs and retries; do not add providers, migrations or paid test calls.

**Tech Stack:** React, Radix UI, TypeScript, NestJS, Jest, Vite, Docker Compose, pnpm.

---

### Task 1: Editing Contract

Files: shared `tool-workflow.ts`, existing `tool-workflow.spec.ts`.

1. Add `design.watermarkRegion` and `design.protectSubject` with tool-scoped validation.
2. Require one input and one output for the new design contracts, preserving legacy inputs.
3. Include region and protection semantics in actual prompts without promising pixel locking.
4. Run `docker-compose exec -T -w /buildingai/extensions/image-studio nodejs pnpm test --runInBand tool-workflow.spec.ts`.

### Task 2: Dedicated Forms

Files: existing `tool-form.tsx`, `specialized-components.tsx`, a dedicated `image-edit-form.tsx`, scoped styles, existing frontend tests.

1. Generalize region editor labels while preserving SKU defaults and behavior.
2. Reuse single-image upload, paste, drop, material selection and protected preview.
3. Add watermark region selection, clear/reselect and explicit ownership authorization.
4. Add target language and subject protection, with model and ratio in anchored advanced settings.
5. Preserve capability and billing gates, busy locks, errors and stale-upload protection.
6. Add regression tests to existing form/component suites; run the touched suites.

### Task 3: Verification and Publication

1. Run focused API type checking, changed-file lint and frontend build in Docker.
2. Publish using the existing extension copy script and restart only the API to refresh cached entry HTML.
3. Verify health, entry hashes and JS/CSS MIME types.
4. Verify desktop/mobile interactions read-only when browser connectivity permits; do not call generation.
5. Sync approved scope, implementation evidence and pending engine/effect checks to Obsidian.

No automatic staging, commits, branches, provider credentials, balance writes or model calls.

## Execution Result (2026-11-03)

### Follow-up: Intelligent Expansion

Goal: Apply the supplied expansion reference using one source, scale presets 100/80/60/50 plus an integer 1-99 custom value, nine-position placement, real source layout preview, existing model/ratio Popover and actual quote. Default to 80 percent and center. Preserve legacy requests and generic form behavior; no fixed screenshot price, unsupported 1K, phone-upload service or pixel-lock promise.

1. Add failing scale/position tests in `test/tool-workflow.spec.ts`; run `docker-compose exec -T -w /buildingai/extensions/image-studio nodejs pnpm test --runInBand tool-workflow.spec.ts --silent` (expect rejection of the new design before implementation).
2. Extend shared `src/api/shared/tool-workflow.ts` with `design.expandScale` integer 1-100 and `design.expandPosition` nine allowed positions, scoped single-image/output validation and actual prompt instructions. Keep required legacy expansion direction and old no-design rules. Rerun the same test (expect pass).
3. Reuse `src/web/pages/image-edit-form.tsx`, route expand in `tool-form.tsx`, and add source-fit geometry to `specialized-workflow.ts`. Render protected original preview into a workspace portal, preserving actual result/history/progress ownership and editing/error recovery. Extend existing form/workspace tests and validate immediately.
4. Add restrained responsive expansion styles to `src/web/styles/image-edit-form.css`; test scale/position geometry, custom bounds, one-image upload/material/replacement, duplicate/locked/stale operations, capability/billing gates, and popup values. Preserve old generic expand regression coverage rather than removing it.
5. Add new design to `test/tool-generation.spec.ts` for DTO, stored/public task, retry and prompt coverage. Run scoped contract/form/workspace/task suites, changed-source lint and API/Web noEmit in Docker; keep known unrelated baselines separate.
6. Build API with `--no-clean` and web, copy with `/buildingai/scripts/copy-extension-build.mjs`, restart only `buildingai-api`, and verify health/entry/assets. Attempt read-only browser acceptance without inference and sync requirement/status/evidence to Obsidian. Do not automatically stage, commit, create branches, change model/storage configuration or call paid generation.

Expansion follow-up result (2026-11-03): Implemented one source/output, protected original preview, scale presets 100/80/60/50, custom integer 1-99, nine-position placement, optional instructions, existing model/ratio Popover and actual quote. Default 80/center. Scale is a uniform linear fraction of the largest uncropped source fit inside the output canvas, not an area fraction. Successful source replacement resets placement; failed replacement retains source/layout. Actual image decoding, protected loading/release, retry and stale callbacks guard readiness; layout/source editing, result/history/retry and failure recovery retain ownership. New metadata passes strict shared validation, DTO, existing JSONB, public task, retries and actual prompt; old no-design direction/count/reference behavior remains. Six scoped suites recorded 520 passed / 1 existing optional network skip. Production lint, API noEmit and both builds passed; Web noEmit retains only two pre-existing shared console-logo errors, and IDE retains the existing fflate dependency diagnostic. Final assets `index-D1WKuaMK.js` / `index-CIIW8ywH.css` were copied and API restarted. Health, final entry/hash references, JS/CSS MIME and example JPG returned HTTP 200; built contract, nine positions and prompt verified. Browser screenshot showed login, but read, fresh-page attachment and direct authorized password-input attempts failed CDP connection after 30 seconds; login did not complete. Authenticated desktop/mobile preview, controls and Popover acceptance remain pending. No credentials were recorded. Reference-guided recomposition does not guarantee exact pixels or placement; real model effects/fees and COS 451 recovery remain pending. No inference, business writes, dependencies, migrations, configuration changes, staging, commits or pushes. Obsidian section 4.27 records this result.

### Follow-up: Watermark Annotation Workspace

Goal: Match the supplied watermark reference with a compact source/mark list at left and a large unframed annotation canvas at right. Preserve existing model, billing, task, ownership and result paths. No automatic commits or paid calls.

1. Extend `src/api/shared/tool-workflow.ts` with 1-3 normalized `watermarkRegions`, preserving legacy `watermarkRegion` and old requests. The user reduced the initial 10-mark limit to 3 on 2026-11-03. Use the shared `WATERMARK_MARK_LIMIT` for the canvas, list count, history and backend validation. First run `pnpm test --runInBand tool-workflow.spec.ts` in Docker; validate every region, reject conflicting fields, and include every region in prompt guidance. Add DTO/task/retry cases to `test/tool-generation.spec.ts`.
2. Add the owning canvas editor under `src/web/pages/watermark-editor.tsx`, with rectangle/brush/hand modes, numbered marks, selection, moving/resizing, delete/clear, undo/redo and bounded zoom/pan. Brush marks send bounding-region guidance, not pixel masks. Test geometry and history using the existing specialized form suite.
3. Integrate the canvas into the existing workspace via a scoped Portal and optional form props. Keep local draft state in the existing image form; replace/remove/deleted source resets marks and authorization. A source or mark change returns from a prior result to the editor without disturbing background tasks. Preserve translation/retouch paths and all billing/lock gates.
4. Use existing protected source image loading for the canvas and cropped mark thumbnails. Preserve actual quote/model/ratio controls; do not add phone-upload service or fixed screenshot pricing. Use lucide buttons, accessible labels, pointer/keyboard editing, and responsive restrained workbench styles.
5. Run focused contract/form/workspace/task tests, source lint and API/Web type checks in Docker. Build/copy extension assets and restart API with existing commands. Attempt read-only browser acceptance without inference; sync evidence and any pending checks to Obsidian.

Focused command: `docker-compose exec -T -w /buildingai/extensions/image-studio nodejs pnpm test --runInBand tool-workflow.spec.ts specialized-form.spec.ts tool-generation.spec.ts workspace.spec.ts tool-form.spec.ts generation-progress.spec.ts --silent`.

Watermark follow-up result (2026-11-03): Implemented protected source loading, cropped numbered marks, rectangle/brush/hand controls, moving/resizing, deletion/clear, undo/redo, zoom/pan and a responsive sidebar/canvas layout. Preserved actual model/ratio/quote controls, ownership confirmation, single-image/output validation, legacy inputs, task/history paths and stale-upload/busy guards. Failed replacement uploads retain the source and annotations; successful replacements reset annotations and authorization. Selecting/changing marks returns to the editor, opening history/retrying shows the owning result, and submission failure restores editing. Before the limit change, the recorded six-suite run passed 465 tests with one existing network test skipped; a subsequent focused form/workspace run passed 166 with one skip. The next combined command was interrupted without a recorded outcome, so the earlier 466 claim is withdrawn. After the user's maximum-three change, three contract/form/task suites passed 351 tests with one skip, including three regions through DTO/persistence/retry/prompts, rejection of a fourth, both drawing modes blocked at capacity, deletion then adding the third, list count and history cap. Production-source lint, IDE checks and both final builds passed. Web noEmit retains only the two existing shared console-logo nullability errors. Final assets `index-lwM3a9Lx.js` / `index-U2XyyANo.css` were copied and API restarted; health, final entry and JS/CSS returned HTTP 200 with correct entry hashes/MIME, and the built backend constant was verified as 3. Browser CDP timed out at 30 seconds, so real desktop/mobile screenshots and pointer/focus acceptance remain unverified. Brush marks provide bounding-region guidance, not pixel masks; COS 451 recovery and real effect/fee acceptance remain pending. No paid calls, account writes, migrations, dependencies, automatic staging, commits or pushes. Obsidian section 4.26 records the current maximum-three requirement and implementation evidence.

### Follow-up: Product Retouch Reference

Goal: Adapt product retouch to the supplied reference with single-image selection, six modes, optional instructions and bottom anchored advanced settings. Reuse current models, actual pricing and supported ratios/sizes; retain legacy task contracts and other tools. No phone-upload service or fixed 50-credit/1K behavior is approved by this layout request.

1. Extend `src/api/shared/tool-workflow.ts` with six typed retouch modes and scoped validation/prompt guidance. Verify `test/tool-workflow.spec.ts` immediately.
2. Extend existing `src/web/pages/image-edit-form.tsx`, `specialized-components.tsx`, `tool-form.tsx` and scoped styles. Add accessible radio modes and a clickable single-image drop area using existing upload/material/paste handlers. Preserve watermark and translation behavior.
3. Update existing `test/specialized-form.spec.ts`, `tool-form.spec.ts` and `tool-generation.spec.ts` for mode propagation, DTO persistence, retries, single-image and lock gates.
4. Run focused Docker Jest suites, production-file ESLint, API/Web type checks and both builds. Publish with existing copy script and API restart; verify final entry/asset hashes and MIME types.
5. Attempt read-only desktop/mobile browser acceptance without model calls. Sync results and limitations to Obsidian.

Commands: `docker-compose exec -T -w /buildingai/extensions/image-studio nodejs pnpm test --runInBand tool-workflow.spec.ts tool-generation.spec.ts specialized-form.spec.ts tool-form.spec.ts --silent`; `docker-compose exec -T nodejs pnpm --filter image-studio build:web`; `docker-compose exec -T nodejs pnpm --filter image-studio build:api`.

### Previous Watermark/Translation Result

Product retouch follow-up result (2026-11-03): Implemented the six typed modes in the reused single-image editor, a real clickable drop zone/material picker, optional instructions, bottom Popover/actual billing CTA, and explicitly labeled draggable preview using existing local images. Legacy retouch requests and other tools remain compatible. Focused Jest: 413 passed / 1 existing optional preset-network test skipped across five suites (156 contract, 93 forms, 164 generation/workspace). Production-file ESLint and API noEmit passed; Web noEmit has only the two pre-existing shared console-logo nullability errors. Both builds passed. Final published assets are `index-3OVBTg02.js` and `index-DhQlx55P.css`; after API restart, health, final entry markers, JS/CSS MIME and both example JPGs returned HTTP 200. The first HTTP checks hit the restart startup window and were repeated successfully. Integrated browser still failed CDP attachment after 30 seconds: desktop/mobile screenshots, popup focus and real model effects remain unverified. No actual inference, account writes, dependencies, migrations, staging or commits. Obsidian section 4.24 records this scope and pending acceptance.

- Dedicated watermark and translation forms implemented; cutout remains disabled pending an approved segmentation engine.
- Tool-scoped metadata passes DTO validation, stored task input, retries and the existing model prompt.
- Focused checks: 375 tests passed across five suites; one existing optional network-image test skipped. Production-file lint and API type checking passed.
- Web type checking: new errors fixed; only two pre-existing shared console-logo nullability diagnostics remain.
- API and final web builds passed. Published with the existing copy script and API restart; health and entry/assets returned HTTP 200 with correct final hashes and MIME types.
- Final frontend assets: `index-60j8fCqs.js`, `index-CFNP1hzw.css`.
- Real desktop/mobile visual checks remain unverified because integrated browser CDP was unavailable earlier in this session. No real model calls or billing writes were made; effect/fee acceptance remains pending.