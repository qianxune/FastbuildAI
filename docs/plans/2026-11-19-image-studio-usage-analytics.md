# Image Studio Usage Analytics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a super-admin-only Image Studio console page that shows generation usage, generated images, credits, failures, and active users by day/month and tool module.

**Architecture:** Query the existing `ImageGeneration` records directly; do not add a second event-log table or duplicate billing state. A dedicated console analytics service returns one validated contract containing summary cards, a zero-filled time series, and a per-tool module table; the React page consumes that contract through an isolated query hook and Recharts.

**Tech Stack:** NestJS, TypeORM/PostgreSQL, class-validator, React, TanStack Query, Recharts, existing BuildingAI UI chart components, Jest, ESLint, Vite.

**Traceability:** CTAI-REQ-0058 / CTAI-CHG-0069.

---

## Scope and product decisions

### MVP

- Add a console menu named `使用统计`.
- Restrict both menu and API to super administrators.
- Default to the last 30 days, inclusive, using `Asia/Shanghai`.
- Support presets `最近 7 天`, `最近 30 天`, `最近 90 天`, plus custom dates.
- Support `按日` and `按月`.
- Support `全部功能` or one `toolKey`.
- Show summary cards:
  - submitted tasks;
  - generated images;
  - net consumed credits;
  - failed tasks and failure rate;
  - active users;
  - refunded credits.
- Show two trends:
  - generated images and submitted tasks;
  - net consumed credits and failed tasks.
- Show a sortable module table:
  - category, module, active users, submitted tasks, generated images, completed tasks, failed tasks, cancelled tasks, failure rate, net consumed credits, refunded credits.
- Fill missing days/months with zero so empty periods do not disappear.
- Preserve live queued/processing tasks in the submitted count, but exclude them from completed/failed/cancelled rates.

### Metric definitions

- `tasks`: all `ImageGeneration` rows created in the selected range.
- `activeUsers`: distinct `userId` values in those rows.
- `requestedImages`: sum of `count`.
- `generatedImages`: sum of `jsonb_array_length(images)`; this counts actual persisted output.
- `completedTasks`: `status = completed`.
- `failedTasks`: `status = failed`.
- `cancelledTasks`: `status = cancelled`.
- `failureRate`: `failedTasks / (completedTasks + failedTasks) * 100`; cancellations are reported separately and never called failures.
- `consumedCredits`: sum of `billingAmount` only where `billingStatus = charged`.
- `refundedCredits`: sum of `billingAmount` only where `billingStatus = refunded`.
- `freeTasks`: `billingStatus = free`; include only in table/API details, not as a headline.
- Use the record's current billing state: a refunded task contributes to `refundedCredits`, never to `consumedCredits`.

### Explicit non-goals for the MVP

- No task-level user list, prompt, generated image, account phone/email, or failure-message drill-down.
- No background analytics materialization, scheduled rollups, or duplicate fact table.
- No CSV/PDF export.
- No real-time refresh; the page uses normal query caching and a manual refresh button.
- No billing reconciliation or mutation.
- No product-suggestion calls because `suggest` does not create `ImageGeneration` rows.
- No admin login/permission behavior changes.

### Contract

`GET /image-studio/consoleapi/analytics`

```ts
type AnalyticsQuery = {
  startDate?: string; // YYYY-MM-DD; omitted only together with endDate
  endDate?: string;   // YYYY-MM-DD; omitted only together with startDate
  granularity?: "day" | "month";
  toolKey?: string;
};

type GenerationAnalytics = {
  range: {
    startDate: string;
    endDate: string;
    granularity: "day" | "month";
    timezone: "Asia/Shanghai";
    toolKey: string | null;
  };
  summary: {
    tasks: number;
    activeUsers: number;
    requestedImages: number;
    generatedImages: number;
    completedTasks: number;
    failedTasks: number;
    cancelledTasks: number;
    failureRate: number;
    consumedCredits: number;
    refundedCredits: number;
  };
  trend: Array<{
    period: string;
    tasks: number;
    generatedImages: number;
    failedTasks: number;
    consumedCredits: number;
  }>;
  modules: Array<{
    toolKey: string;
    name: string;
    category: "基础生图" | "电商生图" | "AI修图" | "服饰穿戴";
    activeUsers: number;
    tasks: number;
    generatedImages: number;
    completedTasks: number;
    failedTasks: number;
    cancelledTasks: number;
    failureRate: number;
    consumedCredits: number;
    refundedCredits: number;
  }>;
};
```

---

### Task 1: Add shared analytics types and metric-name contract

**Files:**
- Create: `extensions/image-studio/src/api/shared/analytics.ts`
- Test: `extensions/image-studio/test/generation-analytics.spec.ts`

**Step 1: Write the failing type/contract test**

Add a test that imports `GenerationAnalytics`, verifies the shared contract contains all headline/module fields at compile time, and proves an unknown billing state cannot be added accidentally by the metric mapping helper.

```ts
import type { GenerationAnalytics } from "../src/api/shared/analytics";

it("defines the full console analytics contract", () => {
    const result: GenerationAnalytics = {
        range: { startDate: "2026-11-01", endDate: "2026-11-30", granularity: "day", timezone: "Asia/Shanghai", toolKey: null },
        summary: { tasks: 0, activeUsers: 0, requestedImages: 0, generatedImages: 0, completedTasks: 0, failedTasks: 0, cancelledTasks: 0, failureRate: 0, consumedCredits: 0, refundedCredits: 0 },
        trend: [],
        modules: [],
    };
    expect(result.summary.failureRate).toBe(0);
});
```

**Step 2: Run the test and verify it fails**

Run from `extensions/image-studio`:

```powershell
pnpm exec jest --runInBand test/generation-analytics.spec.ts --silent
```

Expected: TypeScript/Jest failure because `src/api/shared/analytics.ts` does not exist.

**Step 3: Implement the shared contract**

Create only exported interfaces/types, with no runtime dependency. Reuse `PricingCategory` from `pricing.ts` for the module category and define `AnalyticsGranularity`.

**Step 4: Run the test**

Expected: PASS.

**Step 5: Commit**

Commit only the shared contract and its compile-time test:

```powershell
git add extensions/image-studio/src/api/shared/analytics.ts extensions/image-studio/test/generation-analytics.spec.ts
git commit -m "test(image-studio): [CTAI-REQ-0058][CTAI-CHG-0069] define analytics contract"
```

---

### Task 2: Add and test query validation

**Files:**
- Create: `extensions/image-studio/src/api/modules/generation/dto/query-analytics.dto.ts`
- Modify: `extensions/image-studio/test/generation-analytics.spec.ts`

**Step 1: Write failing DTO tests**

Use `plainToInstance` and `validate` to cover:

- omitted range;
- valid day/month;
- valid `toolKey`;
- invalid date;
- invalid granularity;
- invalid/unsupported tool.

The date fields must be strings matching `YYYY-MM-DD`; the tool key must be one of `PRICING_CATALOG`.

**Step 2: Run and verify failure**

Run:

```powershell
pnpm exec jest --runInBand test/generation-analytics.spec.ts --silent
```

Expected: FAIL because the DTO import is missing.

**Step 3: Implement the DTO**

```ts
export class QueryAnalyticsDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string;

  @IsOptional()
  @IsIn(["day", "month"])
  granularity: AnalyticsGranularity = "day";

  @IsOptional()
  @IsIn([...PRICING_KEYS])
  toolKey?: string;
}
```

Do not silently default a partial range; the service rejects one-sided date ranges.

**Step 4: Run the test**

Expected: PASS.

**Step 5: Commit**

Commit the DTO and test update separately.

---

### Task 3: Implement pure analytics aggregation helpers

**Files:**
- Create: `extensions/image-studio/src/api/modules/generation/services/generation-analytics.util.ts`
- Modify: `extensions/image-studio/test/generation-analytics.spec.ts`

**Step 1: Write failing pure-function tests**

Cover:

1. Refunded rows count as refunds, not consumed credits.
2. A cancelled task is separate from failure rate.
3. Zero completed + zero failed gives failure rate `0`.
4. A daily range from 2026-11-01 through 2026-11-03 fills 2026-11-02 with zeros.
5. Monthly range from 2026-10 to 2026-12 fills missing November.
6. Dates use `Asia/Shanghai` labels; no UTC-to-local off-by-one.
7. Unknown legacy `toolKey` rows are grouped as unknown and do not crash, or are explicitly excluded by a documented decision.

The recommended decision is to include unknown historical keys in the module table as `未知功能` after the known `PRICING_CATALOG` rows, preserving totals.

**Step 2: Run and verify failure**

Expected: missing util import.

**Step 3: Implement the helpers**

Export small pure functions:

```ts
normalizeAnalyticsNumber(value: unknown): number
failureRate(completedTasks: number, failedTasks: number): number
fillAnalyticsPeriods(...)
mergeModuleCatalog(rows)
```

Do not put SQL in this file.

**Step 4: Run the tests**

Expected: PASS.

**Step 5: Commit**

Commit helper functions and tests.

---

### Task 4: Implement and test the analytics query service

**Files:**
- Create: `extensions/image-studio/src/api/modules/generation/services/generation-analytics.service.ts`
- Modify: `extensions/image-studio/test/generation-analytics.spec.ts`

**Step 1: Write failing service tests**

Mock `Repository<ImageGeneration>` with a chainable query builder and assert:

- default range is exactly the previous 29 days plus today in `Asia/Shanghai`;
- `startDate <= endDate`;
- one-sided ranges are rejected;
- daily range over 366 days is rejected;
- monthly range over 24 months is rejected;
- the tool filter is applied only for a valid tool;
- the query uses `created_at >= startExclusiveBoundary` and `created_at < nextExclusiveBoundary`;
- the summary and trend never expose `prompt`, `error`, `userId`, IDs, or images.
- PostgreSQL `DATE_TRUNC` and `TO_CHAR` group into the requested granularity.

Also test generated images with:

```sql
COALESCE(SUM(jsonb_array_length(generation.images::jsonb)), 0)
```

**Step 2: Run and verify failure**

Expected: missing service.

**Step 3: Implement one read model with bounded queries**

The service executes four read-only queries:

1. summary;
2. grouped time trend;
3. known grouped module rows;
4. one separately grouped row for all unknown historical tool keys.

The fourth query is intentional: summing per-key `COUNT(DISTINCT user_id)` for
unknown modules would double-count users active in more than one legacy key.

Reuse one method to apply:

```ts
.andWhere("generation.created_at >= :startTime", { startTime })
.andWhere("generation.created_at < :endExclusive", { endExclusive })
```

Use half-open time boundaries, avoiding timestamp `23:59:59.999` issues.

For the Shanghai calendar:

```sql
DATE_TRUNC(:granularity, generation.created_at AT TIME ZONE 'Asia/Shanghai')
```

`granularity` is whitelisted before interpolation; never concatenate an unvalidated request value.

For a day period:

```sql
TO_CHAR(DATE_TRUNC('day', generation.created_at AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM-DD')
```

For month:

```sql
TO_CHAR(DATE_TRUNC('month', generation.created_at AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM')
```

Map raw string aggregates with `Number` and guard non-finite values before returning.

**Step 4: Add no mutation**

This service has only `getDashboard(query)` and private query helpers. It must not import `GenerationBillingService`.

**Step 5: Run API analytics tests**

Run:

```powershell
pnpm exec jest --runInBand test/generation-analytics.spec.ts --silent
```

Expected: PASS.

**Step 6: Commit**

Commit the service and tests.

---

### Task 5: Add the super-admin console endpoint and module wiring

**Files:**
- Create: `extensions/image-studio/src/api/modules/generation/controllers/console/analytics.controller.ts`
- Modify: `extensions/image-studio/src/api/modules/generation/generation.module.ts`
- Modify: `extensions/image-studio/test/generation-analytics.spec.ts`

**Step 1: Write failing controller test**

Transpile/inspect or unit-test that:

- controller has `@SuperAdminOnly()`;
- route prefix is `analytics`;
- `@Get()` passes the query DTO to the service;
- no write endpoint exists.

**Step 2: Run and verify failure**

Expected: missing controller.

**Step 3: Implement the controller**

```ts
const analyticsValidation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@SuperAdminOnly()
@ExtensionConsoleController("analytics", "生图使用统计")
export class AnalyticsController {
  constructor(private readonly analyticsService: GenerationAnalyticsService) {}

  @Get()
  getDashboard(@Query(analyticsValidation) query: QueryAnalyticsDto) {
    return this.analyticsService.getDashboard(query);
  }
}
```

Add the controller and service to `GenerationModule`.

**Step 4: Run tests and API type check**

Run:

```powershell
pnpm exec jest --runInBand test/generation-analytics.spec.ts --silent
pnpm exec tsc -p tsconfig.api.json --pretty false --noEmit
```

Expected: analytics tests pass and no new API diagnostics. Record any unrelated baseline failures separately.

**Step 5: Commit**

Commit controller/module wiring.

---

### Task 6: Add the console query hook and API contract use

**Files:**
- Create: `extensions/image-studio/src/web/services/analytics.ts`
- Modify: `extensions/image-studio/test/analytics-page.spec.ts` (create in this task if absent)

**Step 1: Write a failing service-hook test**

Mock `consoleHttpClient` and verify:

- request path is `/analytics`;
- date strings and tool filters are URL/query parameters;
- undefined filters are omitted;
- query key changes with every filter;
- manual `refetch` does not mutate server state.

**Step 2: Run and verify failure**

Expected: missing service.

**Step 3: Implement**

```ts
export function useGenerationAnalyticsQuery(filter: AnalyticsFilter) {
  return useQuery({
    queryKey: ["image-studio", "console", "analytics", filter],
    queryFn: () => consoleHttpClient.get<GenerationAnalytics>("/analytics", { params: filter }),
    staleTime: 30_000,
  });
}
```

Use the actual HTTP client's accepted request shape; inspect `pricing.ts` and `base.ts` rather than assuming Axios parameters if the wrapper differs.

**Step 4: Run tests**

Expected: PASS.

**Step 5: Commit**

Commit the query hook.

---

### Task 7: Build the analytics page in isolation

**Files:**
- Create: `extensions/image-studio/src/web/pages/console/analytics.tsx`
- Create: `extensions/image-studio/src/web/styles/analytics.css`
- Modify/Create: `extensions/image-studio/test/analytics-page.spec.ts`

**Step 1: Write failing rendering tests**

Use the extension's VM React harness pattern. Cover:

- all six summary cards render;
- daily/monthly controls;
- preset and custom dates update query filters;
- module filtering changes the request;
- error state has retry;
- pending state has skeletons;
- zero-data state does not invent zero growth percentages;
- module table sorting does not mutate the query response;
- numbers use locale separators and failure percentage uses at most one decimal.

**Step 2: Run and verify failure**

Expected: missing page.

**Step 3: Implement the page**

Page sections in order:

1. Header: title `使用统计`, subtitle, manual refresh.
2. Filter bar: date presets, custom dates, `按日/按月`, module select.
3. Six compact summary cards.
4. Trend chart card using `ChartContainer`, `AreaChart`, `ChartTooltip`, `ChartLegend`.
5. Module table/card.

Recommended colors:

- tasks/generated images: shared chart colors;
- credits: primary/lime;
- failures: destructive.

Accessibility:

- each chart has a visible heading;
- no metric depends on color alone;
- filter labels are real labels;
- table headings have `scope="col"`;
- sortable headings expose `aria-sort`;
- loading/error/empty states use `role="status"` or `role="alert"`.

Responsive behavior:

- 6 cards become 2 columns on tablet and 1 column on narrow mobile;
- filter controls wrap;
- chart has a minimum readable width with controlled horizontal overflow, not page overflow;
- module table scrolls inside its card.

**Step 4: Run the page test and lint**

Run:

```powershell
pnpm exec jest --runInBand test/analytics-page.spec.ts --silent
pnpm exec eslint src/web/pages/console/analytics.tsx test/analytics-page.spec.ts --quiet
```

Expected: PASS and no new errors.

**Step 5: Commit**

Commit page, CSS, and tests.

---

### Task 8: Wire the route and super-admin menu

**Files:**
- Modify: `extensions/image-studio/src/web/routes.tsx`
- Modify: `extensions/image-studio/test/workspace.spec.ts`

**Step 1: Write the failing route/menu test**

Extend the existing menu filtering test with:

```ts
{ title: "使用统计", path: "/analytics", superAdminOnly: true, icon: "chart-no-axes-combined" }
```

Assert normal users do not receive it and root users do.

Also assert `/analytics` maps to `AnalyticsPage`.

**Step 2: Run and verify failure**

Expected: route and menu are absent.

**Step 3: Implement**

Import `AnalyticsPage` and add:

```tsx
{ title: "使用统计", path: "/analytics", icon: "chart-no-axes-combined", superAdminOnly: true }
```

```tsx
{ path: "analytics", element: <AnalyticsPage /> }
```

Do not add a regular front-end route; this page belongs only to the extension console.

**Step 4: Run tests**

Run:

```powershell
pnpm exec jest --runInBand test/workspace.spec.ts test/analytics-page.spec.ts --silent
```

Expected: PASS.

**Step 5: Commit**

Commit routing/menu wiring.

---

### Task 9: Add the optional read indexes (completed 2026-11-20: skipped)

**Files:**
- Create only if production query-plan review shows a scan: `extensions/image-studio/src/api/db/migrations/<timestamp>-0.1.6-add-generation-analytics-indexes.ts`
- Modify if the plan still benefits: `extensions/image-studio/src/api/db/entities/image-generation.entity.ts`
- Test: `extensions/image-studio/test/generation-analytics.spec.ts`

**Step 1: Measure, do not guess**

In a read-only environment, run `EXPLAIN (ANALYZE, BUFFERS)` for:

- global time range summary;
- time series;
- single-tool module filter.

If the existing `[userId, createdAt]` index is not used for global analytics, add:

```ts
@Index(["createdAt"])
@Index(["toolKey", "createdAt"])
```

with a forward-only migration.

**Step 2: Write migration tests**

Test idempotent `hasIndex` checks and that rollback is not destructive to generation rows.

**Step 3: Build/verify migration output**

Run:

```powershell
pnpm run build:api
```

Do not execute database migrations during implementation without separate user authorization.

**Step 4: Commit only if needed**

If indexes are not justified by the query plan, skip this task entirely and record "not needed for observed volume" rather than adding speculative schema changes.

**Assessment record (2026-11-20)**

- Read-only local development access was available through the existing
  `buildingai-postgres` container. Every query used
  `default_transaction_read_only=on`, `statement_timeout=5000`, and
  `lock_timeout=1000`; no `ANALYZE`, migration, schema change, write, or restart
  was performed.
- The local `image_studio.image_generation` table contained **32 rows**
  (planner estimate: 20 rows). It has the primary-key index plus
  `@Index(["userId", "createdAt"])`, materialized as the btree index
  `IDX_3581bd1bc55aeb29d616ec462d` on
  `("user_id", "created_at")`; there is no existing analytics/global
  `created_at` or `tool_key`-leading index.
- Bounded, parameter-equivalent `EXPLAIN`-only plans were collected for the
  global 30-day summary, day trend, and single-tool query. All three used
  sequential scans at this volume (planned output was 27 rows for the global
  range and 1 row for the tested tool filter). The PostgreSQL planner
  preferred the cheap scan on a 32-row table, so these plans do not show an
  index benefit.
- Planner assessment: the existing composite index is useful for queries with
  a `user_id` leading predicate, but global analytics predicates only on
  `created_at` and therefore generally cannot use its `created_at` suffix.
  Single-tool analytics would potentially benefit from a leading `tool_key`
  with `created_at`, and highly selective production time ranges could
  benefit from `created_at`, but the relative benefit cannot be established
  from this small local development sample. Aggregation over broad ranges may
  still favor a sequential scan even when such indexes exist.
- **Decision:** no migration and no entity index change. The local evidence is
  safe and concrete, but it shows neither a bottleneck nor an index advantage
  and is not production-like enough to justify write/schema risk. Reassess on
  representative production volume using bounded read-only `EXPLAIN`
  (`EXPLAIN (ANALYZE, BUFFERS)` only if separately authorized and known safe),
  then add an index only if the observed cost, selectivity, and latency
  establish a measurable benefit.
- **Task 9 files changed:** only this plan and the synchronized CTAI-CHG-0069
  records; no source, migration, or test files changed.

---

### Task 10: Add deployment-safe validation and documentation

**Files:**
- Modify: `extensions/image-studio/README.md`
- Modify: `D:\obsidian\aidianshang\AI生图WEB\01-需求\CTAI-REQ-0058.md`
- Modify: `D:\obsidian\aidianshang\AI生图WEB\02-变更\出图AI-变更记录-2026-11.md`

**Step 1: Document exact behavior**

Add:

- console address `/extension/image-studio/console/analytics`;
- super-admin requirement;
- metric definitions and Shanghai timezone;
- no task prompt/user PII;
- no export/drill-down in MVP;
- API endpoint and range limits.

**Step 2: Run focused verification**

Run:

```powershell
pnpm exec jest --runInBand test/generation-analytics.spec.ts test/analytics-page.spec.ts test/workspace.spec.ts --silent
pnpm exec eslint src/api/modules/generation/controllers/console/analytics.controller.ts src/api/modules/generation/services/generation-analytics.service.ts src/web/pages/console/analytics.tsx test/generation-analytics.spec.ts test/analytics-page.spec.ts --quiet
pnpm exec tsc -p tsconfig.api.json --pretty false --noEmit
pnpm run build:web
pnpm run build:api
```

Expected: focused tests, lint, builds, and analytics API type check pass. Record any pre-existing failures separately with a matching baseline commit comparison.

**Step 3: Verify permissions and real data semantics without mutating data**

- Anonymous GET returns 401.
- normal logged-in account GET returns 403.
- super admin receives JSON.
- compare at least one day and one tool against manual SQL counts.
- confirm `generatedImages` equals persisted output array lengths.
- confirm `consumedCredits + refundedCredits` is not double counted.
- confirm queued/processing tasks are included in `tasks`, not in terminal failure rate.

**Step 4: Do not deploy or migrate automatically**

Publishing, API restart, database index migration, Git push, and real-account write operations require separate authorization.

**Step 5: Sync records and commit**

Update CTAI-REQ-0058 and CTAI-CHG-0069 with actual commands/results and commit hash, then use a commit containing:

```powershell
git commit -m "feat(image-studio): [CTAI-REQ-0058][CTAI-CHG-0069] add usage analytics dashboard"
```

Do not claim user acceptance from automated checks.

---

## Recommended phases

1. **Backend contract and read-only API**: Tasks 1-5.
2. **Console dashboard and route**: Tasks 6-8.
3. **Performance check**: Task 9 completed on 2026-11-20; local read-only plans
   did not justify a migration.
4. **Acceptance and deployment handoff**: Task 10.

This order allows API totals to be verified independently before chart/UI work begins.

## Main risks and controls

- **Metric ambiguity**: freeze definitions in the shared contract and tests; display a short in-page explanation.
- **Refund double counting**: only current `billingStatus = charged` counts as consumed.
- **Timezone drift**: use fixed `Asia/Shanghai` boundaries in the API and state it in the UI/records.
- **Heavy history scan**: cap ranges and add indexes only after `EXPLAIN`.
- **Permission leak**: use `@SuperAdminOnly()` and `superAdminOnly: true`; test anonymous, ordinary, and root accounts separately.
- **PII exposure**: response contains aggregates only, never user IDs, prompts, errors, URLs, or images.
- **Promptly changing tool catalog**: build module labels from `PRICING_CATALOG`; preserve unknown legacy keys as `未知功能`.
- **Misleading failure rate**: cancellation is excluded from technical failure denominator.

## Acceptance checklist

- [ ] Super administrator sees `使用统计`; ordinary users do not.
- [ ] Anonymous and ordinary accounts cannot call the endpoint.
- [ ] Presets, custom range, day/month, and module filter all work.
- [ ] Summary, trend, and module totals agree for the same filter.
- [ ] Missing periods show zeros.
- [ ] Refunded tasks are not double counted as consumed credits.
- [ ] Failed/cancelled tasks are distinguished.
- [ ] Active users are deduplicated.
- [ ] No prompt, failure detail, user ID, or image URL leaves the API.
- [ ] Desktop and narrow layouts have no page-level horizontal overflow.
- [ ] API/Web targeted tests, lint, types, and builds pass.
- [x] Performance is checked against actual row count/query plan before index migration; 32-row local evidence did not justify a migration.
- [ ] Deployment, real-account verification, Git commit, and user acceptance are recorded separately.
