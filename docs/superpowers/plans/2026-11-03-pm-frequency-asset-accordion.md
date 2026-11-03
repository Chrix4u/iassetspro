# PM Frequency Independence + Asset Accordion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple PM Frequency Type from PM Type and present PM schedules as machine accordions with scheduled parts nested underneath.

**Architecture:** Reuse `PmScheduleTask.basis` as the direct-assignment scheduling authority, leaving `pmType` as an independent classification. Direct runtime evaluation/recurrence becomes basis-first only for `scheduleId = null`; legacy schedule-backed tasks retain current maintenance-mode behavior. Filtered target groups are rolled up by asset for accordion rendering.

**Tech Stack:** Next.js, React, TypeScript, Prisma, Vitest, Playwright, Radix Accordion.

**Spec:** `docs/superpowers/specs/2026-11-03-pm-frequency-asset-accordion-design.md`

## Global Constraints
- No Prisma schema migration.
- Direct PM Tasks -> Triggers workflow remains authoritative.
- PM Type labels must display only `TBM`, `UBM`, `CBM`, `FBM`.
- Legacy schedule-backed PM behavior must not change.
- Full CI, Repairs UAT, and platform E2E are merge gates.

## Review Focus
- Existing CBM/FBM direct assignments with null basis must reload as event/condition, not silently become calendar schedules.
- A CBM/FBM task using calendar or meter frequency must save and reload that chosen basis without PM Type mutation.
- Direct calendar/meter recurrence must advance by basis after WO completion even when PM Type is not TBM/UBM.
- Filtering a part/task must retain its parent machine accordion and hide unrelated targets under that machine.
- Whole-machine assignments must appear as a child target within the correct asset accordion.

---

### Task 1: Make direct PM frequency basis independent of PM Type

**Files:**
- Modify: `src/lib/pm-assignment-draft.ts`
- Modify: `src/services/pm/pmAssignment.service.ts`
- Modify: `src/services/pm/pmScheduledTaskDueEngine.ts`
- Modify: `src/services/pm/advancePmScheduledTaskRecurrence.service.ts`
- Test: `src/lib/__tests__/pm-assignment-draft.test.ts`
- Test: `src/services/pm/__tests__/pmAssignment.service.test.ts`
- Test: relevant direct due/recurrence tests under `src/__tests__/pm/` or `src/services/pm/__tests__/`

**Interfaces:**
- Consumes: existing `PmScheduleTask.basis`, `pmType`, `maintenanceMode`, meter/date fields.
- Produces: `frequencyType` <-> `basis` mapping independent of PM Type; basis-first direct due/recurrence.

- [ ] **Step 1: Write failing tests** proving TBM/UBM/CBM/FBM can each retain calendar or meter frequency independently, null basis reloads as event, and payload fields follow frequency rather than PM Type.
- [ ] **Step 2: Verify RED** with the targeted Vitest files.
- [ ] **Step 3: Implement draft/payload normalization** with `time_day`, `meter`, `event`; derive from `basis`; validate cadence by frequency type.
- [ ] **Step 4: Implement service persistence** so `frequencyType` sets `basis`, meter/date requirements follow basis, and PM Type no longer rewrites cadence.
- [ ] **Step 5: Implement direct runtime basis-first evaluation/recurrence** while retaining legacy schedule-backed maintenance-mode behavior.
- [ ] **Step 6: Verify GREEN** with targeted tests, then the full unit suite.
- [ ] **Step 7: Commit** `feat: decouple PM frequency basis from PM type`.

### Task 2: Update PM trigger editor and detail copy

**Files:**
- Modify: `src/components/modules/pm/PmAssignmentTaskCard.tsx`
- Modify: `src/components/modules/pm/PmAssignmentTaskPlanner.tsx`
- Modify: `src/components/modules/pm/PmAssignmentTargetDetailDialog.tsx`
- Test: `src/__tests__/pm/pm-direct-authoring-ui-contract.test.ts`
- Test: new or existing PM frequency UI contract test.

**Interfaces:**
- Consumes: independent `PmAssignmentTaskDraft.frequencyType` from Task 1.
- Produces: UI that never changes PM Type when Frequency Type changes, and vice versa.

- [ ] **Step 1: Write failing UI contract tests** for acronym-only PM labels, independent setters, event option, and frequency-driven date/meter controls.
- [ ] **Step 2: Verify RED**.
- [ ] **Step 3: Implement minimal UI changes**: PM Type acronym labels; frequency controls drive date/meter/event fields; PM Type selector changes only PM Type.
- [ ] **Step 4: Update detail rendering** to calculate Frequency Type, Interval, Next Due, and Meter from basis/frequency rather than PM Type.
- [ ] **Step 5: Verify GREEN** and commit `feat: make PM trigger editor frequency-driven`.

### Task 3: Replace mixed target table with machine accordions

**Files:**
- Modify: `src/lib/pm-assignment-target-list.ts`
- Modify: `src/components/modules/pm/PmAssignmentTargetList.tsx`
- Modify: `src/components/modules/pm/PmPlanningPage.tsx`
- Test: `src/__tests__/pm/pm-target-list-ui-contract.test.ts`
- Test: target-list helper tests under `src/lib/__tests__/` or `src/__tests__/pm/`.

**Interfaces:**
- Consumes: filtered `PmAssignmentTargetGroup[]`.
- Produces: asset rollup helper and accordion UI with target rows nested under each asset.

- [ ] **Step 1: Write failing tests** for grouping targets by asset, filtered-child retention, whole-machine child rows, and accordion source contract.
- [ ] **Step 2: Verify RED**.
- [ ] **Step 3: Add `groupPmAssignmentAssets()`** summarizing asset, scheduled targets, tasks, estimated minutes, and PM coverage.
- [ ] **Step 4: Render Radix/Shadcn Accordion** with one machine header and nested target table; remove repeated Asset column; preserve row actions.
- [ ] **Step 5: Update PM Planning heading/stats** to describe machine-first grouping and count unique scheduled machines.
- [ ] **Step 6: Verify GREEN** with targeted tests and full unit suite.
- [ ] **Step 7: Commit** `feat: group PM schedules by machine accordion`.

### Task 4: Release verification

**Files:** no product changes unless a proven regression requires a TDD fix.

- [ ] Run lint and TypeScript release gate.
- [ ] Run full unit suite.
- [ ] Open PR against `main`.
- [ ] Require Production Build, Production Container Build, Repairs UAT, Platform E2E, and Required CI Gate green.
- [ ] Merge only the exact verified head SHA.
- [ ] Verify `main` moved to the merge commit and production deployment workflow starts from successful main CI.
