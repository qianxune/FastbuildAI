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