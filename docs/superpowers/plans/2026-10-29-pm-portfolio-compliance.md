# PM Portfolio Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add plant/department/machine PM compliance ranking and overdue exposure using the same cycle semantics as the machine-level compliance feature.

**Architecture:** Extend the existing PM compliance classifier so a single scoped execution-history query can be summarized across assets. Expose that through one authenticated plant-scoped portfolio endpoint, then render a focused portfolio panel above Machine PM Roll-up without changing PM recurrence, scheduler, or schema state.

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma/PostgreSQL, React, Vitest, existing shadcn/ui components.

**Spec:** `docs/superpowers/designs/2026-10-29-pm-portfolio-compliance.md`

## Global Constraints

- Portfolio KPI semantics must exactly match `pmCompliance.service.ts` cycle classification.
- Query direct PM assignments only (`scheduleId = null`).
- One portfolio history query; do not call per-machine compliance APIs/services in a loop.
- Required `plantId`; optional `departmentId`; window 1–365 days, default 30.
- Strict plant-scope authorization before history retrieval.
- Assets without departments are grouped as `Unassigned`.
- No schema migration, scheduler change, recurrence change, or Repairs behavior change.

## Review Focus

- Duplicate execution attempts for one cycle must count once in portfolio totals and rankings.
- A department filter must never include assets from another department or plant.
- Assets with no department must remain visible as `Unassigned`.
- Zero matured cycles must return null compliance instead of 0%/100%.
- Ranking ties must be deterministic so dashboard rows do not jump between refreshes.

---

### Task 1: Portfolio aggregation service

**Files:**
- Create: `src/services/pm/pmPortfolioCompliance.service.ts`
- Create: `src/services/pm/__tests__/pmPortfolioCompliance.service.test.ts`
- Modify only if necessary: `src/services/pm/pmCompliance.service.ts`

**Interfaces:**
- Produces `getPmPortfolioCompliance(input)` and `summarizePmPortfolioCompliance(rows, now, windowDays)`.
- Produces `PmPortfolioComplianceResult` containing `window`, `summary`, `departments`, `machines`, `oldestOpenOverdue`.
- Reuses existing machine-cycle classification behavior instead of reimplementing conflicting semantics.

- [ ] **Step 1: Write failing service tests**

Cover:
1. Mixed completed/open/missed cycles across two departments produce correct portfolio totals and department/machine rows.
2. Duplicate attempts for one stable cycle count once.
3. `departmentId` query filter is applied inside the requested plant.
4. Null department groups as `Unassigned`.
5. Department and machine risk ordering is deterministic: open overdue desc, missed desc, compliance asc/null-last, name asc.
6. `oldestOpenOverdue` returns at most 10 rows ordered by delay descending.
7. Empty history returns zero totals and null compliance.

- [ ] **Step 2: Run focused test and verify RED**

Run: `bunx vitest run src/services/pm/__tests__/pmPortfolioCompliance.service.test.ts`

Expected: FAIL because the portfolio service does not exist.

- [ ] **Step 3: Implement minimal service**

Use one `workOrderTaskExecution.findMany` query filtered through `pmScheduleTask.is.asset.plantId` and optional asset department. Select asset/department metadata alongside fields required by the existing classifier. Collapse and classify cycles once, then aggregate by asset and department.

- [ ] **Step 4: Run focused test and full unit suite**

Run focused test, then `bun run test`.

Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat(pm): add portfolio compliance aggregation`

### Task 2: Plant-scoped portfolio API

**Files:**
- Create: `src/app/api/pm-assignments/compliance/portfolio/route.ts`
- Create: `src/app/api/pm-assignments/compliance/portfolio/__tests__/route.test.ts`

**Interfaces:**
- Consumes `getPmPortfolioCompliance(...)` from Task 1.
- Produces `GET /api/pm-assignments/compliance/portfolio?plantId=<id>&departmentId=<optional>&windowDays=<n>`.

- [ ] **Step 1: Write failing route tests**

Assert 401 unauthenticated, 400 missing plant, 404 unknown plant, 403 inaccessible plant, authorized request forwards plant/department/window and returns data.

- [ ] **Step 2: Run focused route test and verify RED**

Expected: FAIL because route is absent.

- [ ] **Step 3: Implement route using existing strict plant-scope pattern**

Resolve session, scope, plant existence, access, then call service. Do not authorize via department or execution history.

- [ ] **Step 4: Run focused route test and full unit suite**

Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat(pm): expose portfolio compliance API`

### Task 3: Portfolio compliance UI

**Files:**
- Create: `src/components/modules/pm/PmPortfolioCompliancePanel.tsx`
- Create: `src/lib/pm-portfolio-compliance-view.ts`
- Create: `src/lib/__tests__/pm-portfolio-compliance-view.test.ts`
- Modify: `src/components/modules/MaintenancePages.tsx` only at the existing PM schedules/planning composition point.

**Interfaces:**
- Consumes portfolio API from Task 2.
- Renders plant selector, optional department filter, reporting window selector, KPI cards, department ranking, top 15 machine risk rows, and oldest open overdue list.

- [ ] **Step 1: Write failing view-model test**

Assert null compliance renders `—`; risk table maps overdue/missed fields correctly; portfolio rows preserve deterministic service order; oldest-overdue delay formatting handles minutes/hours/days.

- [ ] **Step 2: Run focused test and verify RED**

Expected: FAIL because view helper is absent.

- [ ] **Step 3: Implement view helper and focused panel**

Keep all portfolio fetch/loading/error state inside the new panel. Do not enlarge Machine Roll-up or couple their filters.

- [ ] **Step 4: Insert panel above Machine PM Roll-up at the PM planning surface**

Use existing plant/department endpoints/selectors and preserve the current schedules UI.

- [ ] **Step 5: Verify**

Run focused test, `bun run lint`, `bun run test`, `bun run build`.

Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `feat(pm): add portfolio compliance dashboard`

### Task 4: Release verification

**Files:** none unless a defect is found.

- [ ] **Step 1: Open draft PR to `main`**

Document that this is completion compliance, not on-time SLA compliance.

- [ ] **Step 2: Review diff for scope**

Confirm no migration, scheduler/recurrence changes, N+1 compliance calls, or unrelated Repairs edits.

- [ ] **Step 3: Verify all CI/release gates**

Lint, unit tests, TypeScript/debt gate, production app build, production container build, Repairs UAT, platform Playwright E2E, Required CI Gate.

- [ ] **Step 4: Merge exact verified head SHA**

Then verify the exact merge SHA through post-merge CI and production deployment before calling the slice complete.
