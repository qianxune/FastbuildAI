# Specialized Product Workflows Implementation Plan

**Goal:** Implement the supplied detail, replica, creative, fusion and SKU designs as distinct usable workflows, not cosmetic versions of a generic edit form.

**Architecture:** Extend the existing shared tool contract with bounded, optional structured configuration. Persist it in existing toolInput JSONB and consume it in per-image prompts and retries. Reuse protected materials, billing, queue, cancellation and result panels; no new storage or account system.

**Tech Stack:** React, TypeScript, lucide-react, NestJS, TypeORM, Jest, Docker/pnpm and Playwright.

## Constraints

- Preserve unrelated dirty work, existing routes and source modules. Implementation did not create a branch, stage or commit; subsequent commits require explicit user authorization.
- All builds and tests use Docker Compose and pnpm. API build uses --no-clean.
- No paid inference is needed for implementation; previously authorized task ceiling remains 20 actual calls, currently 0.
- Use reference-image instruction editing honestly. SKU regions guide prompts; do not promise masks or exact unchanged pixels. No fabricated mobile-upload service or fake AI buttons.
- Keep each generation batch at 1-4 outputs. Detail plans may contain up to 10 modules; users select at most 4 planned outputs for one batch.

## Task 1: Shared Contract and Regression Tests

Files: extensions/image-studio/src/api/shared/tool-workflow.ts, src/api/modules/generation/dto/tool-workflow.dto.ts, test/tool-workflow.spec.ts, test/tool-generation.spec.ts.

Add detail module definitions, fusion presets, replica mode, optional brand/platform/language, creative workflow and normalized SKU region/variant configuration. Validate bounded values, role ordering and output counts. Use each output's requested module/SKU variant in prompts, preserve legacy inputs. Run focused contract/service tests immediately.

## Task 2: Specialized Forms

Files: extensions/image-studio/src/web/pages/tool-form.tsx and focused sibling components, existing material-picker.tsx and styles.

Reuse MaterialPicker for role-specific uploads and selections. Support drag/drop and image paste without silently triggering inference. Detail: product settings, description, up to 10 modules, editable local plan and up to 4 outputs per batch. Replica: product/reference slots and style/high-fidelity modes. Creative: optional reference images, required prompt and existing generation compatibility. Fusion: categorized visual presets, primary/accessory roles and count. SKU: one template, normalized region editor, up to 3 variants and one image per variant. Advanced settings expose actual model, ratio and cost. Preserve unsupported tools.

## Task 3: Owning Page Integration

Files: extensions/image-studio/src/web/pages/index.tsx, shared/tools.ts, existing generation services and tests.

Route creative to the specialized path without breaking legacy text generation records/retries. Preserve task locking, active/history/works state, parameter retries and capability filtering. Keep model limits enforced before submit and on the server.

## Task 4: Verification and Publication

Run focused contract/form/workspace/generation tests, touched ESLint, API typecheck and web semantic check (record the two existing shared console-logo diagnostics separately). Build extension web and API --no-clean if backend changed; restart API and verify final health/assets. Browser-check desktop and mobile using screenshots, actual controls and overflow checks; mock only provider responses in isolated acceptance where needed, never report mocked inference as live success.

## Task 5: Requirement Synchronization

Append the five approved designs, implemented behaviors, explicit limits, exact test results and remaining acceptance to the existing Obsidian aggregate. Preserve previous records, never copy credentials. Verify the note content after writing.

## Verification Log

- Initial evidence: ToolForm uses a generic product/model/reference/instructions form; shared contract lacks module, reference-role, fusion-preset and SKU-region/variant metadata.
- Discriminating check: focused tool-workflow and tool-form suites must prove the new selections affect persisted payloads and per-output prompts, not only labels.
- Implemented all five distinct forms, strict persisted design metadata, per-output prompts and retry compatibility. Existing JSONB and version 0.1.3 reused; no additional migration or host-client source changes.
- Backend, frontend and owning-page spec/quality reviews completed after local repairs: explicit detail output subset, strict new SKU variants, deleted-material reconciliation, shared instruction budget and legacy creative retries.
- Affected regression command: `docker-compose exec -T -w /buildingai/extensions/image-studio nodejs pnpm exec jest --runInBand test/workspace.spec.ts test/generation-progress.spec.ts test/materials.spec.ts test/materials-storage.spec.ts test/tool-form.spec.ts test/specialized-form.spec.ts test/tool-workflow.spec.ts test/tool-generation.spec.ts test/product-thumbnail.spec.ts test/product-thumbnail-client.spec.ts test/product-thumbnail-route.spec.ts test/tools.spec.ts test/works.spec.ts`.
- Affected regression result: 13 suites passed, 415 tests passed, 1 skipped (416 total). This run preceded the final inline drawer positioning repair; after that repair, the focused `test/workspace.spec.ts` rerun passed all 54 tests. Do not represent the full group as rerun after the final repair.
- Touched ESLint and final navigation/test editor diagnostics passed. API typecheck and API `--no-clean` build passed. Full web semantic check retains two existing shared console-logo TS18048 diagnostics; broader capability suite retains five baseline lifecycle failures and the older image-client suite retains its import.meta/CJS blocker.
- Real mobile verification exposed Tailwind DialogContent independent translate moving the drawer offscreen. A stylesheet reset was folded into transform by production CSS optimization; the final fix sets inline `translate: "0 0"` on the drawer, covered by a rendered-component regression and normal mobile clicks after the final build.
- Final extension web build passed (2104 modules). API restarted at 2026-11-01 21:35:55+08:00. Final health returned HTTP 200; entry references `index-CMvTK47q.js` / `index-DIZQZgTT.css`, both HTTP 200 with correct JavaScript/CSS types, no HTML fallback. Host web was not needlessly rebuilt.
- Real authenticated Edge/Playwright acceptance passed using normal shared login and agreement confirmation. The supplied JPG uploaded with HTTP 201 and protected thumbnails displayed; subsequent probes reused the existing private material without more uploads or deleting user data.
- Browser behavior passed: six default detail modules, editable six-page local plan with four outputs selected; creative text-only valid submit state without submitting; replica roles/faithful mode; 15/15 fusion photos loaded and preset navigation; actual SKU template, pointer and numeric region editing, confirmation and three-variant limit.
- All five forms passed screenshot and document-overflow checks at 1440x1000, 390x844 and 320x780. Mobile navigation used normal clicks and waited for drawer closure; creative input and detail planning survived switches. Final page errors: 0. Account area masked in screenshots under storage/temp.
- Browser probe stabilization: closing-animation screenshots were replaced after an explicit hidden-state wait; the filled creative textarea assertion uses its stable input ID rather than an exact wrapped-label string. These were acceptance-probe corrections, not additional production changes.
- Scope limits: detail planning is local, not AI; fusion photos are illustrative, not generated effect promises; SKU region guides prompts and is not a pixel mask. Transparent cutout remains unavailable.
- Actual model calls: 0/20 authorized; final browser inference attempts: 0. Live analysis, generated image quality, credits/cancellation/refunds, history-to-works updates, complete material management and native download remain unverified. No balance/model configuration changes.
- Latest requirements, implementation, test stages, real browser/runtime evidence and outstanding acceptance synchronized to the existing Obsidian aggregate, section 4.17. Preserve earlier 179/23-test stage records. During implementation, new extension files remained subject to the existing extensions/* ignore rule; no ignore changes, staging, branch or commit were made in that phase.

## Authorized Module Commits

- Subsequent user request (2026-11-01): commit code separately by module and exclude compiled outputs. Keep the existing branch; do not push or change ignore rules.
- Final pre-commit regression reran the affected command above with `test/generation-image-storage.spec.ts` added: 14 suites passed, 427 tests passed and 1 skipped (428 total), after the final drawer repair. Host `node --test packages/client/test/product-entry.test.mjs` passed all 23 tests in Docker. No live inference was triggered.
- Product entry and secure account bridge: `5110d299`, 8 source/test files.
- Private materials, reference contracts, migration sources and backend regression: `e53bd3a0`, 21 source/config/test files.
- Specialized studio, material reuse, works and frontend regression: `8eaac0c0`, 28 source/test files.
- React/Vite TypeScript configuration: `a147e40a`, 1 source configuration file.
- Plans are submitted separately from runtime modules. Each staged manifest is explicitly checked and passes `git diff --cached --check`; ignored extension source files are added by exact path rather than adding an entire ignored directory.
- Excluded: public/web compiled assets, extension .output/build/dist, dependency trees, uploaded/private data, screenshots, logs and temporary files. Existing .gitignore edits and a newline-only image-client test difference are left untouched and uncommitted. Previously tracked generated files are not removed from the index by this task.