# PM Task Recurrence Basis Forward-Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Forward-port the verified per-task Fixed Schedule vs After Completion recurrence behavior from PR #556 onto current `main` without regressing the newer task-authority, component-targeting, direct-PM, or resource-readiness architecture.

**Architecture:** Reuse the original #556 schema, recurrence algorithm, tests, and compact TBM planner control. Integrate them on top of current `PmScheduleTask` persistence rather than replaying stale service code wholesale: recurrence fields are additive to the current `assetId`, `componentId`, `pmType`, `activityMode`, and `basis` fields. Closeout remains the only place recurrence advances.

**Tech Stack:** Next.js 16, React 19, TypeScript, Prisma/PostgreSQL, Vitest, existing PM/Repairs services.

**Spec:** `docs/superpowers/specs/2026-10-27-pm-recurrence-basis-design.md`

## Global Constraints
- Existing persisted rows and omitted API fields remain `after_completion`.
- New TBM planner drafts default to `fixed_schedule`.
- Fixed schedule advances to the first anchored cadence occurrence strictly after verified completion.
- UBM remains meter-baseline driven; CBM remains condition-rearm driven.
- Skipped, pending, or failed executions do not advance recurrence.
- Current task targeting fields (`assetId`, `componentId`, `pmType`, `activityMode`, `basis`) must remain persisted exactly as current `main` does today.
- Direct-PM auto-generation and due-cycle idempotency behavior must not change.

## Review Focus
1. Current task-authority targeting fields survive create/update alongside recurrence fields.
2. Existing/API-omitted recurrence basis stays `after_completion` after migration and service normalization.
3. Jan 31 monthly fixed cadence can clamp to February and return to March 31 without drift.
4. Several missed fixed cycles advance to the first future anchored occurrence, not an immediate backlog loop.
5. UBM/CBM and direct-PM generation remain behaviorally unchanged.

---

### Task 1: Restore persistence and normalization
**Files:** schema/migration, `pmScheduleTask.service.ts`, its tests.
- [ ] Cherry-pick the original RED contract commit and run focused tests to confirm missing recurrence fields fail on current main.
- [ ] Integrate the original persistence implementation, resolving `pmScheduleTask.service.ts` by combining recurrence fields with all current targeting/mode fields.
- [ ] Run service tests plus Prisma validate/generate and commit.

### Task 2: Restore fixed-calendar recurrence engine
**Files:** `pm-frequency.ts`, `advancePmScheduledTaskRecurrence.service.ts`, recurrence tests.
- [ ] Cherry-pick the original fixed-anchor RED tests and confirm RED.
- [ ] Apply the original anchored recurrence calculation and closeout branch without changing UBM/CBM paths.
- [ ] Run focused recurrence/frequency tests and commit.

### Task 3: Restore planner control and safe defaults
**Files:** `pm-schedule-task.ts`, `PmScheduleTaskCard.tsx`, UI contracts.
- [ ] Cherry-pick the original planner RED contracts and confirm RED.
- [ ] Apply TBM-only selector/default/payload behavior on top of the current eight-column task grid.
- [ ] Run focused UI/schedule contracts and commit.

### Task 4: Integration and release gate
- [ ] Run all recurrence/task focused tests, Prisma validate/generate, changed-file ESLint, and `git diff --check`.
- [ ] Compare the final diff against current main to confirm no current targeting fields were dropped.
- [ ] Push a new forward-port branch and open a fresh PR; do not revive stale #556 as the merge vehicle.
- [ ] Require exact-head full CI: lint, Repairs TypeScript gate, full Vitest, build/container, Repairs UAT, platform E2E, Required CI Gate.
- [ ] Merge only after the current production release (#570) is deployed and the new PR remains current-main mergeable.
