# PM Compliance Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add machine-level historical PM completion compliance, open-overdue exposure, missed-cycle counts, and cycle drill-down to the existing direct PM Machine Roll-up.

**Architecture:** Derive compliance from immutable direct-PM `WorkOrderTaskExecution` history rather than storing duplicate reporting state. A focused PM compliance service collapses multiple execution attempts by stable PM cycle identity, an authenticated plant-scoped API exposes the result, and `PmMachineRollupPanel` renders a historical section beside the existing live planning view.

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma/PostgreSQL, React, Vitest, existing shadcn/ui components.

**Spec:** `docs/superpowers/designs/2026-10-29-pm-compliance-intelligence.md`

## Global Constraints

- Direct PM assignments are `PmScheduleTask` rows with `scheduleId = null`.
- Historical identity is `pmScheduleTaskId + pmDueCycleKey`; duplicate attempts must count once.
- No schema migration in this slice.
- Reporting window is 1–365 days, default 30.
- No matured cycles returns `completionCompliancePct: null`.
- Authorization must reuse authenticated strict plant scope before reading compliance data.
- Existing live PM roll-up and bundle behavior must remain unchanged.

## Review Focus

- Duplicate attempts after cancellation/replanning must not inflate the denominator or missed count; Task 1 tests a cancelled attempt followed by a completed retry.
- Malformed/legacy `pmPlanningSnapshot` must remain reportable using `createdAt`; Task 1 tests invalid JSON fallback.
- Future-due TBM executions must not enter the historical denominator; Task 1 tests future exclusion.
- An open matured cycle must reduce compliance and appear as `overdue_open`; Task 1 tests the count and delay.
- No-history machines must return zero counts and a null percentage rather than divide-by-zero or synthetic 100%; Task 1 tests the empty result.

---

### Task 1: Compliance aggregation service

**Files:**
- Create: `src/services/pm/pmCompliance.service.ts`
- Create: `src/services/pm/__tests__/pmCompliance.service.test.ts`

**Interfaces:**
- Produces: `normalizePmComplianceWindowDays(value?: number): number`
- Produces: `summarizePmComplianceExecutions(rows: PmComplianceExecutionRow[], now: Date, windowDays?: number): PmComplianceResult`
- Produces: `getPmCompliance(input: { client: PmComplianceClient; assetId: string; now?: Date; windowDays?: number }): Promise<PmComplianceResult>`
- `PmComplianceResult.summary` contains `maturedCycles`, `completed`, `openOverdue`, `missed`, `completionCompliancePct`.
- `PmComplianceResult.cycles` contains one row per stable cycle, newest due first.

- [ ] **Step 1: Write the failing tests**

Tests must independently assert these literal outcomes:

1. Three unique matured cycles — one completed, one active open, one skipped/failed — produce `maturedCycles: 3`, `completed: 1`, `openOverdue: 1`, `missed: 1`, `completionCompliancePct: 33.3`.
2. A cancelled attempt followed by a completed retry for the same `pmScheduleTaskId + pmDueCycleKey` produces one cycle and counts completed once.
3. TBM uses snapshot `nextDueDate`; a future due date is excluded even when the execution row already exists.
4. UBM/CBM/FBM and malformed snapshots fall back to row `createdAt` as the due instant.
5. Empty input produces zero counts and `completionCompliancePct: null`.
6. `getPmCompliance` queries only direct assignment executions for the requested asset and returns the aggregation result.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bunx vitest run src/services/pm/__tests__/pmCompliance.service.test.ts`

Expected: FAIL because the PM compliance service contract is not implemented yet.

- [ ] **Step 3: Implement the minimal aggregation and query service**

Implement the exact interfaces above. Parse planning snapshots defensively. Group by stable identity. Representative-attempt precedence is completed > active non-cancelled > latest terminal attempt. Treat task status `failed`/`skipped` and cancelled work orders as missed when no successful or active attempt exists. Derive delay minutes as `max(0, outcomeAt - dueAt)` using completion time for completed cycles and `now` for open overdue cycles.

- [ ] **Step 4: Run focused test and full unit suite**

Run: `bunx vitest run src/services/pm/__tests__/pmCompliance.service.test.ts`

Expected: PASS.

Run: `bun run test`

Expected: PASS with no new warnings/errors.

- [ ] **Step 5: Commit**

Commit: `feat(pm): add cycle-based compliance intelligence service`

### Task 2: Plant-scoped compliance API

**Files:**
- Create: `src/app/api/pm-assignments/compliance/route.ts`
- Create: `src/app/api/pm-assignments/compliance/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `getPmCompliance(...)` from Task 1.
- Produces: `GET /api/pm-assignments/compliance?assetId=<id>&windowDays=<n>` returning `{ success: true, data: PmComplianceResult }`.

- [ ] **Step 1: Write failing route tests**

Assert: unauthenticated 401; missing asset id 400; missing asset 404; inaccessible plant 403; authorized request calls the service with normalized inputs and returns its data.

- [ ] **Step 2: Run route test and verify RED**

Run: `bunx vitest run src/app/api/pm-assignments/compliance/__tests__/route.test.ts`

Expected: FAIL because the route does not exist yet.

- [ ] **Step 3: Implement route using existing roll-up authorization pattern**

Reuse `getSession`, `getPlantScope`, `canAccessPlantStrict`, and asset lookup before calling `getPmCompliance`.

- [ ] **Step 4: Run focused route test and full unit suite**

Expected: all PASS.

- [ ] **Step 5: Commit**

Commit: `feat(pm): expose plant-scoped compliance API`

### Task 3: Machine Roll-up compliance UI

**Files:**
- Modify: `src/components/modules/pm/PmMachineRollupPanel.tsx`
- Create: `src/components/modules/pm/__tests__/PmMachineRollupPanel.compliance.test.tsx` if the repository test environment supports this component cleanly; otherwise cover response mapping in a focused exported view-model helper under `src/lib/pm-compliance-view.ts` with its own test.

**Interfaces:**
- Consumes: compliance API from Task 2.
- Adds independent compliance window selector with values 30, 90, 180, 365.
- Renders: Completion Compliance, Matured Cycles, Completed, Open Overdue, Missed, and recent cycle rows.

- [ ] **Step 1: Write failing UI/view-model test**

The test must catch a regression where `completionCompliancePct: null` displays as `0%`, where open-overdue/missed counts are swapped, or where newest due cycle is not first.

- [ ] **Step 2: Run focused test and verify RED**

Expected: FAIL for missing compliance UI/view mapping.

- [ ] **Step 3: Implement minimal UI**

Fetch compliance only when a machine is selected. Keep live planning-window state separate from historical compliance-window state. Show a compact loading/error state that does not hide the live roll-up if compliance fetch fails.

- [ ] **Step 4: Run focused test, lint, full unit suite, and build**

Run: focused test; `bun run lint`; `bun run test`; `bun run build`.

Expected: all PASS.

- [ ] **Step 5: Commit**

Commit: `feat(pm): show machine compliance and overdue intelligence`

### Task 4: Branch-level release verification

**Files:**
- No production file required unless verification exposes a defect.

**Interfaces:**
- Consumes all Tasks 1–3.
- Produces a PR whose required CI, production build, container build, Repairs UAT, and platform E2E are green before merge.

- [ ] **Step 1: Open PR to `main`**

Describe KPI semantics explicitly so reviewers do not interpret completion compliance as an on-time SLA metric.

- [ ] **Step 2: Verify required CI**

All required jobs must complete successfully. Any failure receives a reproducing test before a fix.

- [ ] **Step 3: Review diff for scope**

Confirm no schema migration, no scheduler/recurrence behavior change, no authorization bypass, and no modifications to unrelated Repairs behavior.

- [ ] **Step 4: Merge only after green evidence**

Use expected-head SHA when merging. Then verify the exact `main` merge SHA passes post-merge CI and production deployment before calling the slice complete.
