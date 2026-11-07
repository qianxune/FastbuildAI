# Product Recolor Implementation Plan

**Goal:** Build a usable product recolor tool based on the supplied screenshot, preserving the existing light workspace and real generation/billing pipeline.

**Architecture:** Register `recolor` as reference-image editing. Extend the existing single-image `ImageEditForm`, shared workflow validation and prompt with `design.productColor`; reuse protected image loading, material selection, history, task ownership, billing and refund. The right stage shows the original image until real results exist, never a CSS-generated fake recolor.

**Tech Stack:** React/TypeScript, lucide-react, TanStack Query, NestJS, TypeORM, AI SDK, Docker/pnpm/Jest.

## Task 1: Validated Workflow

- Modify `extensions/image-studio/src/api/shared/tools.ts` and `src/api/shared/tool-workflow.ts`: add a reference-image `recolor` workflow with one input/output and a required six-digit hex `productColor`; reject wrong-tool fields and missing/invalid colors. Color is applied to the product surface only, preserving background, markings, structure, material and lighting; not a pixel-lock guarantee.
- Test `extensions/image-studio/test/tool-workflow.spec.ts`: valid single-source color is accepted, invalid/missing/foreign fields or multiple inputs/results are rejected, real prompt includes the color.
- Run the new recolor test red, implement the smallest shared contract, then rerun green and API noEmit to find registration boundaries.

## Task 2: Workspace and Form

- Modify existing `ImageEditForm`, `ToolForm`, workspace navigation/overview/index and relevant styles. Add the tool in the image-edit group with an existing lucide icon. Use the existing source upload/material selection/replacement and original-image preview. Provide white/light-blue/blue/red/deep-red swatches plus an actual native custom color picker with keyboard-accessible checked state.
- Keep one output, real model selection/aspect ratio and computed credits in advanced settings and the action footer. Preserve loading/error/retry/locked states, failed replacement, stale upload protections and result/history isolation. Restore saved recolor source/color/model settings when opening its history; deleted sources disable regeneration but do not hide existing results.
- Retain the existing native mobile file picker; do not add QR/cross-device upload, fixed six-credit pricing, fake 1K, new providers or unrelated restyling.
- Add focused regressions to existing tool form, workspace and generation suites for submit parameters, preset/custom colors, replacement/reset/history and real mock generation/reference routing.

## Task 3: Verify and Publish

- Run relevant workflow/form/workspace/generation/capabilities/billing/client suites; API and Web noEmit and targeted lint. Keep existing shared Logo Web errors separate from new diagnostics.
- Build API with `--no-clean`, build Web, restore old output assets without overwriting the new entry and publish incrementally with no deletion. Restart only API and verify live entry/asset MIME and `/consoleapi/health` JSON.
- Verify desktop/mobile source/controls framing where browser tools are available. Do not call paid inference or debit real accounts. Record unverified visual/model behavior honestly.
- Synchronize requirement/status/acceptance changes to the existing Obsidian aggregate. No automatic commit, push, branch or worktree changes.

## Completion: 2026-11-07

- Tasks 1-3 implemented. Four form/generation/workspace suites: 472 passed, one existing optional skip; workflow: 166 passed; focused registry/capabilities: 17 passed. Billing and protected-image client suites also passed. Nine unrelated runtime/async failures were reproduced against HEAD shared code without worktree edits.
- API types, focused source lint and API/Web builds passed. Web types retain two existing shared console-logo TS18048 diagnostics.
- Final CSS/browser checks at 1440/390/320 showed no horizontal overflow, decoded contained originals and six inline color controls. Advanced settings showed 2304 x 1728 for 4:3; Escape closed it and restored trigger focus. Browser dependencies were read-only mocks, not authenticated acceptance.
- Published incrementally with old assets preserved; restarted only buildingai-api. Live entry references index-Cin_w0aQ.js / index-CVNYjiHc.css; new assets and old index-rzwPxGXk.js returned correct MIME and HTTP 200. JSON health returned code 20000/status ok.
- Requirement and acceptance records synchronized to the existing Obsidian note. Paid inference, real account/mobile upload, output fidelity and COS recovery remain unverified. No commit, push, branch, worktree or account configuration changes.