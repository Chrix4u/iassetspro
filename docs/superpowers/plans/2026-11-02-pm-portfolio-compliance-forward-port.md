# PM Portfolio Compliance Forward-Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Forward-port the verified PM portfolio compliance intelligence from stale PR #561 onto current `main` without regressing newer PM target-list, demand consolidation, planned-resource coverage, or recurrence-basis behavior.

**Architecture:** Preserve the existing portfolio service/API/view-model contracts and replay their RED/GREEN commit pairs onto current `main`. Integrate the new portfolio panel directly in `PmPlanningPage` above `PmMachineRollupPanel`, leaving the newer machine roll-up component unchanged.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma/PostgreSQL, Vitest, existing UI primitives.

**Spec:** `docs/superpowers/designs/2026-10-29-pm-portfolio-compliance.md`

## Global Constraints

- Portfolio KPI semantics must exactly match `pmCompliance.service.ts` cycle classification.
- Query direct PM assignments only (`scheduleId = null`) and use one scoped history query; never call machine compliance in a loop.
- Required `plantId`; optional `departmentId`; reporting window 1–365 days, default 30.
- Strict authenticated plant-scope authorization must occur before execution history retrieval.
- Assets without departments remain visible as `Unassigned`.
- No schema, scheduler, PM recurrence, PM target-list, demand-consolidation, Repairs, or resource-request lifecycle changes.
- Compose the portfolio panel in `src/components/modules/pm/PmPlanningPage.tsx`; do not restructure `PmMachineRollupPanel.tsx`.

## Review Focus

- Duplicate attempts for one `pmScheduleTaskId + pmDueCycleKey` cycle count exactly once.
- Department filtering cannot widen the already-authorized plant scope.
- Malformed legacy TBM snapshots retain the existing `createdAt` fallback semantics.
- Zero matured cycles return null compliance, not 0% or 100%.
- Department/machine ranking ties remain deterministic across refreshes.

---

### Task 1: Portfolio aggregation service

**Files:**
- Create: `src/services/pm/__tests__/pmPortfolioCompliance.service.test.ts`
- Create: `src/services/pm/pmPortfolioCompliance.service.ts`

**Interfaces:**
- Produces `summarizePmPortfolioCompliance(rows, now, windowDays)`.
- Produces `getPmPortfolioCompliance(input)` returning window, summary, department rows, machine rows, and oldest open-overdue cycles.
- Consumes `summarizePmComplianceExecutions`/existing compliance semantics rather than creating a competing classifier.

- [ ] Replay stale RED service contract commit `522bd7b1`; run the focused test and confirm failure is only the missing portfolio service.
- [ ] Replay implementation commit `8465fc1c`; resolve only current-main type/query drift, then run the focused test to GREEN.
- [ ] Run existing `pmCompliance.service` tests together with the new portfolio service tests.
- [ ] Commit any forward-port-only compatibility adjustment separately.

### Task 2: Plant-scoped portfolio API

**Files:**
- Create: `src/app/api/pm-assignments/compliance/portfolio/__tests__/route.test.ts`
- Create: `src/app/api/pm-assignments/compliance/portfolio/route.ts`

**Interfaces:**
- Consumes `getPmPortfolioCompliance` from Task 1.
- Produces `GET /api/pm-assignments/compliance/portfolio?plantId=<id>&departmentId=<optional>&windowDays=<n>`.

- [ ] Replay RED route contract commit `d5d9c656`; run it and confirm the route absence/contract is the failure.
- [ ] Replay implementation commit `68a51ef4`; preserve current strict plant-scope helpers and run route tests to GREEN.
- [ ] Run the existing machine compliance route tests beside the new portfolio route tests.

### Task 3: Portfolio view model and panel

**Files:**
- Create: `src/lib/__tests__/pm-portfolio-compliance-view.test.ts`
- Create: `src/lib/pm-portfolio-compliance-view.ts`
- Create: `src/components/modules/pm/PmPortfolioCompliancePanel.tsx`
- Modify: `src/components/modules/pm/PmPlanningPage.tsx`

**Interfaces:**
- Consumes Task 2 API.
- Renders plant/department/window controls, KPI cards, department risk ranking, top 15 machines, and 10 oldest open-overdue cycles.

- [ ] Replay RED view-model commit `ee5a109f`; run it and confirm missing helper behavior.
- [ ] Replay helper commit `766754b2`; run focused view tests to GREEN.
- [ ] Replay panel commit `17bd39ae` without coupling it to machine-rollup state.
- [ ] Integrate `<PmPortfolioCompliancePanel />` immediately above `<PmMachineRollupPanel />` in `PmPlanningPage.tsx`; do not replay stale composition commit `3c194cbb` wholesale.
- [ ] Add/adjust a composition contract test if needed to pin the new integration point and protect the target-list UI.

### Task 4: Verification and guarded release

**Files:** none unless verification exposes a defect.

- [ ] Run focused portfolio + existing machine compliance suites, PM target-list/demand/recurrence regressions, changed-file ESLint, `git diff --check`, Prisma validate/generate, and production build.
- [ ] Push the forward-port branch and open a fresh draft PR to current `main`; mark old #561 superseded rather than merging its stale base.
- [ ] Require all GitHub release gates on the exact head SHA: lint, full Vitest, Repairs TypeScript/debt gate, production app/container build, Repairs UAT, platform E2E, Required CI Gate.
- [ ] Promote and merge only the exact green head SHA, then verify post-merge CI/deployment before considering the slice complete.
