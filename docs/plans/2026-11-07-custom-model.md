# Custom Model Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the screenshot's custom model form and a generation/preview/save workflow to My Models.

**Architecture:** Reuse billed text-to-image tasks, protected image reads, material uploads and versioned creative assets. Keep official/upload sources and existing asset workflows unchanged. No migrations or provider/account configuration changes.

**Tech Stack:** React, TanStack Query, TypeScript, existing NestJS APIs, Jest, Docker/pnpm.

---

### Task 1: Model source entry
**Files:** Modify `extensions/image-studio/src/web/pages/assets.tsx` and `extensions/image-studio/test/assets-frontend.spec.ts`.
1. Assert three sources, default custom for new models, upload for edits.
2. Run `docker-compose exec -T -w /buildingai/extensions/image-studio nodejs pnpm test --runInBand test/assets-frontend.spec.ts`; initially expect the missing source assertion to fail.
3. Add the custom component without replacing official/upload paths. Keep in-flight close and source-switch guards.
4. Rerun the focused suite; expect pass.

### Task 2: Custom generation and persistence
**Files:** Create `extensions/image-studio/src/web/pages/custom-model.tsx`; extend the existing asset frontend suite.
1. Build required name and five fixed-choice attributes, prompt with a single fully clothed fictional model, model selection and real single-image quote.
2. Submit one existing text-to-image task, poll it, expose failure/query retry and protected preview.
3. Fetch the completed output, validate upload size/type, upload once, save one model asset. Retain material after save failure; do not retry inference automatically.
4. Test payloads, invalid input, billing gates, duplicate events, active task guards, generation failures and upload/save retry separation using mocks only.
5. Run the same focused Jest suite; expect pass without provider calls or account writes.

### Task 3: Responsive UI and verification
**Files:** Modify `extensions/image-studio/src/web/styles/assets.css`.
1. Match the screenshot's wide modal, five-column attributes, grey controls and right-aligned action footer. Scope widening to custom source; wrap controls on mobile.
2. Run focused tests, source lint and web typecheck in Docker. Disclose unrelated existing diagnostics.
3. Build the web package with Docker/pnpm, preserve cached old hashed resources during local publication.
4. Verify desktop/mobile geometry and screenshots with a mock-only local fixture when available; distinguish mock UI checks from authenticated/paid acceptance.

### Task 4: Requirement record
**Files:** Update `D:/obsidian/aidianshang/需求/出图AI-近期修改需求汇总.md`.
1. Record confirmed screenshot scope, provisional option catalog, reuse of existing billing, implementation status and dated history.
2. Update final verification results, unverified paid generation/storage behavior and deployment status.
3. Provide `[CSS-000] feat: 新增定制模特生成与保存功能` as a suggested commit message; do not commit without explicit authorization.

## Completion Record

- Implemented all four tasks on 2026-11-07; requirement/status history synchronized to the existing Obsidian note.
- Four focused suites: 109 tests passed. Added two parent-boundary tests afterward; final asset frontend suite: 26 tests passed.
- Targeted source lint and Web build passed. Web typecheck retained only two pre-existing shared console-logo TS18048 diagnostics.
- Mock-only browser checks: centered 802x620 desktop modal, 358x620 at 390px and 288x620 at 320px; no horizontal overflow, source switching retains input, close cancellation retains draft. Cancel event closure passed with simulated confirmation. Integrated-browser native Escape timed out and remains unverified.
- Incrementally published the final frontend, preserving SHA-256 contents of 45 old assets; restarted only buildingai-api. New entry JS/CSS/browser and old entry JS returned HTTP 200 with correct MIME; JSON health returned code 20000 and status ok.
- Local entry: http://localhost:4090/studio, Assets > My Models > Create Model.
- Actual paid generation, authenticated upload/save/use, billing/refunds and existing COS storage recovery remain unverified. No provider/account changes, migrations, commits or pushes performed.

## Save Button and Progress Follow-up (2026-11-07)

- Confirmed request: fix the vertically compressed Save Model button and provide a polished progress bar during generation. No backend progress percentage is available.
- Root cause: the legacy footer rule for icon-only type=button controls imposed a 32px width. Scoped custom-model footer rules now override it; Save Model has a border, minimum width and single-line label. Other asset editors are unchanged.
- Added an indeterminate green animated track with real submission, queue and processing stages, completed-step icons and reduced-motion support. No invented percentage or time estimate; query-unknown and terminal states hide progress, and replacement submission hides the previous preview. Existing generation/save/billing paths are preserved.
- Focused asset frontend suite: 27 tests passed. Targeted custom-model source lint, editor diagnostics and Web build passed.
- Mock-only geometry: Save Model is 108x40 at 1440/390/320px, nowrap, no button or footer overflow. The 320px progress track is 248px with no page/footer overflow; reduced-motion disables track and spinner animations.
- Reviewed independent Edge screenshots at desktop 1440x960 and mobile 390x844 for processing, plus mobile completed preview/save controls. Native pointer interactions completed in the mock fixture; integrated-browser geometry used DOM-dispatched clicks. The preview photograph is an existing public fixture asset, not a generated model; no paid generation or upload/save was performed.
- Incrementally published index-vTjPGufR.js / index-DzY_BQpt.css / browser-DK1ML9ni.js, preserving SHA-256 contents of 48 old assets. Restarted only buildingai-api. The first HTTP probe fell within startup; after the readiness log, the real entry referenced current resources, new JS/CSS/browser and the previous entry returned HTTP 200 with correct MIME, and JSON health returned code 20000 / status ok.
- Synchronized this follow-up and dated history to the existing Obsidian requirement note. Real paid generation, authenticated persistence/use, COS recovery and the original native Escape acceptance remain unverified. No commit or push performed.

## Upper-Body Framing Follow-up (2026-11-07)

- Confirmed change: generated custom models only need an upper-body portrait. This supersedes the initial full-body/head-and-feet framing.
- Changed only the prompt to front-facing, waist-up framing with the entire head and shoulders visible, no legs or feet, and a natural pose. Attribute options, appropriate opaque clothing, background, 1024x1536 size, billing, progress and persistence are unchanged. Existing generated/saved images are not cropped or replaced automatically.
- The existing asset frontend suite passed all 27 tests, with upper-body/no-old-full-body assertions and exact generated/saved prompt consistency on save retry. Targeted component lint and Web build passed; the component has no editor errors. Host test-file diagnostics still include missing Jest globals; do not claim a clean workspace typecheck.
- Incrementally published index-CGuVQZ0Z.js / browser-B3KED87V.js with unchanged index-DzY_BQpt.css. Preserved SHA-256 contents of 51 old assets in both served and published directories; restarted only buildingai-api. After startup, the real entry referenced current JS/CSS; new JS/browser/CSS and the previous entry returned HTTP 200 with correct MIME. JSON health returned code 20000 / status ok.
- Updated the existing Obsidian note and dated history. No paid generation, authenticated save, new screenshot acceptance, commit or push. Actual model compliance remains unverified; only future generation requests use the new framing.

## Follow-up: Portrait Preview Overflow (2026-11-07)

- User screenshot showed the action footer crossing the portrait between face and torso. This is preview overflow, not multiple generated images; do not regenerate, crop stored images or change the upper-body prompt.
- Scoped CSS fix: use a fixed-height flex preview, constrain the image with max-height and object-fit contain, and keep the non-shrinking footer in normal flow. Existing generation, progress, pricing and save behavior remain unchanged.
- Immediate Web build passed (2116 modules, 16.25s); CSS diagnostics and the existing mock fixture syntax check passed. The earlier 27 Jest tests were not rerun for this CSS-only correction.
- A GET-only fixture uses the real components and current build CSS with a 1024x1536 PNG derived from an existing public photo. No real model, protected user image, upload, save or account operation was invoked.
- Old/new browser comparison reproduced an 1119px image in a 280px preview: 839px overflow and footer overlap under old grid rules. New rules measured 280px without overflow or overlap.
- Geometry passed at 1440x960, 808x684, 390x844 and 320x740: image remains inside its preview, footer gap is 22px desktop / 18px mobile, no page horizontal overflow, and Save Model remains 108px wide. Independent Edge desktop/mobile screenshots were inspected; owned Edge processes terminated automatically. An initial long integrated-browser script stalled; separate short geometry and old/new checks completed successfully.
- Evidence: storage/temp/custom-model-preview-portrait-desktop-20261107.png and storage/temp/custom-model-preview-portrait-mobile-20261107.png. Earlier landscape-only completion screenshots did not cover this portrait regression; retain them as prior-stage evidence, not portrait acceptance.
- Incrementally published index-jhhqKaAX.js / index-nSTQ2z-p.css / browser-BYgKXFUz.js; all 53 previous asset hashes remain unchanged in served and published directories. Only buildingai-api restarted; final entry/MIME/JSON health check pending.
- Requirement and verification status synchronized to the existing Obsidian note. No commit, push, paid regeneration or stored-image replacement; actual provider framing, authenticated save, COS 451 recovery and prior native Escape acceptance remain unverified.
- Final publication acceptance: real extension entry references the new JS/CSS, new JS/CSS/browser and previous index-CGuVQZ0Z.js return HTTP 200 with correct MIME, and /consoleapi/health returns application/json, code 20000, data.status ok. The pending check above is completed. Do not recommend refreshing an unsaved generated draft; this layout fix does not require paid regeneration.

## Commit Verification (2026-11-07)

- User explicitly requested a local code commit on the existing feat/yingxiao branch. Include assets.tsx, the new custom-model.tsx, assets.css, assets-frontend.spec.ts and this implementation record; exclude deployed HTML/assets and temporary fixtures. No push, branch switch or worktree creation.
- Four Docker/pnpm Jest suites against the exact staged source/test objects passed all 112 tests: assets frontend, asset record, generation billing and protected image client. Confirmed that all three staged executable/source-test overrides were consumed. An initial command failed before test startup because PowerShell stripped embedded quotes; the ASCII stdin runner completed successfully.
- Targeted assets/custom-model component lint and staged whitespace checks passed. Only this documentation record was added after the tested code snapshot; executable files are unchanged. Earlier build, portrait screenshot and real entry/health checks remain prior-stage evidence; no redundant rebuild or paid/account operation was performed for the commit.
- Local commit result and dated history are recorded in the external Obsidian requirement note after Git confirms the commit. Actual provider framing, authenticated save/use, COS recovery and native Escape acceptance remain unverified.