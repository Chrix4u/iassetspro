# PM Assignment Row Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the PM Assignment form to yesterday's multi-task row planner while retaining direct part-level assignments and the meeting-approved PM vocabulary.

**Architecture:** Keep legacy PM schedule behavior isolated. Add a dedicated direct-assignment row model/planner that reuses existing Task Library and PM Template APIs, loads first-class AssetMeters from the selected asset, and submits all rows in one transactional collection POST.

**Tech Stack:** Next.js 16, React, TypeScript, Prisma/PostgreSQL, Vitest, Playwright.

**Spec:** `docs/superpowers/designs/2026-10-28-pm-assignment-row-authoring.md`

## Global Constraints
- No Prisma schema migration.
- PM Type is TBM/UBM/CBM/FBM.
- Activity Mode is Inspection/Lubrication/Servicing/Replacement.
- Inspection Type is Running/Standstill.
- Meter creation/reading controls must not appear in PM Assignment authoring.
- Duplicate Task Library tasks are valid as separate direct-assignment rows.
- Meter-based rows use active first-class AssetMeters for the selected machine.

## Review Focus
- Re-adding the same Task Library task must create a second row with an independent client key and independent settings.
- Changing the selected asset must clear an incompatible component target, template-loaded rows, and meter selections.
- Template load must populate all active Task Library-backed tasks in template order and replace current rows, matching prior behavior.
- A UBM row must never persist a meter from another asset; server validation remains authoritative.
- Batch creation must be all-or-nothing so partial PM assignment sets cannot be left behind.

---

### Task 1: Lock the corrected authoring contract with failing tests

**Files:**
- Modify: `src/__tests__/pm/pm-direct-authoring-ui-contract.test.ts`
- Create: `src/services/pm/__tests__/pmAssignmentBatch.service.test.ts` or equivalent route/service batch test

**Interfaces:**
- Consumes: current `PmAssignmentFormDialog`, `PmTargetTreePicker`, direct assignment POST route.
- Produces: executable expectations for the corrected UI and atomic multi-row save behavior.

- [ ] Add UI contract assertions for Task Template + Task Library paths, row planner, duplicate-task allowance, total estimated duration, vertical target layout, and absence of inline AssetMeter management.
- [ ] Add batch API/service test proving two rows with the same `pmTaskId` but different planning conditions can be created in one transaction.
- [ ] Run the focused tests and verify they fail for the missing behavior.
- [ ] Commit the red tests only if useful for review; otherwise keep them staged until green.

### Task 2: Add the direct-assignment row model and planner

**Files:**
- Create: `src/lib/pm-assignment-draft.ts`
- Create: `src/components/modules/pm/PmAssignmentTaskCard.tsx`
- Create: `src/components/modules/pm/PmAssignmentTaskPlanner.tsx`
- Reuse: `src/components/modules/pm/PmScheduleTaskPickerDialog.tsx`

**Interfaces:**
- Produces: `PmAssignmentTaskDraft`, draft-from-master helper, total-duration helper, direct payload mapper, and planner/card components.
- Consumes: Task Library masters, condition-source API, `/api/assets/:id/meters`.

- [ ] Implement a draft type covering PM Type, Activity Mode, Inspection Type, frequency type/unit/value, AssetMeter ID, due date, duration, lead days, and CBM fields.
- [ ] Give every added row a unique client ID independent of `pmTaskId`.
- [ ] Render the compact row layout matching the previous planner.
- [ ] Allow Task Library picker reuse without excluding already-added tasks.
- [ ] Load first-class AssetMeters for the selected asset; show name, unit, current reading; never render meter mutation controls.
- [ ] Show aggregate task count and estimated duration.
- [ ] Run focused component/contract tests to green.

### Task 3: Restore template-first and library-first authoring in the dialog

**Files:**
- Rewrite: `src/components/modules/pm/PmAssignmentFormDialog.tsx`

**Interfaces:**
- Consumes: `PmAssignmentTaskPlanner`, PM Template detail API, selected asset/target.
- Produces: one direct assignment authoring dialog containing zero or more configured task rows.

- [ ] Keep Asset selection first.
- [ ] Add optional Task Template selector using the existing template API; selecting it replaces rows with all active Task Library-backed template tasks in order.
- [ ] Keep `Add Task from Library` in the row planner for manual additions and duplicates.
- [ ] Remove the single Task Library selector and all inline AssetMeter management UI.
- [ ] Reset incompatible rows/target state when asset changes.
- [ ] Keep the total estimated duration visible while editing.
- [ ] Run focused UI contract tests to green.

### Task 4: Fix PM target information hierarchy

**Files:**
- Modify: `src/components/modules/pm/PmTargetTreePicker.tsx`

**Interfaces:**
- Keeps existing `asset`, `componentId`, `technicalPath`, `onChange` contract.

- [ ] Put `Choose PM Target` before path information.
- [ ] Render Location Path as its own full-width row.
- [ ] Render Technical Path as its own full-width row beneath Location Path.
- [ ] Preserve MachineVisualExplorer behavior and exact component selection.
- [ ] Run focused UI contract tests to green.

### Task 4A: Put meter administration on Asset Details

**Files:**
- Modify: `src/components/modules/AssetDetailPage.tsx`
- Modify: `src/__tests__/assets/asset-meter-ui-contract.test.ts`

**Interfaces:**
- Consumes: existing `AssetMetersPanel` and meter RBAC permissions.
- Produces: permission-gated Asset Details → Meters administration surface.

- [x] Add a Meters tab when the user can view meters.
- [x] Mount `AssetMetersPanel` there with create/update permissions passed explicitly.
- [x] Keep unauthorized deep links fail-closed.
- [x] Verify meter definitions and readings remain outside PM Assignment authoring.

### Task 5: Add atomic multi-row direct assignment creation

**Files:**
- Modify: `src/app/api/pm-assignments/route.ts`
- Optionally modify: `src/services/pm/pmAssignment.service.ts` for a small batch helper if that keeps the route testable.
- Modify/Create tests under `src/services/pm/__tests__` and/or `src/__tests__/pm`.

**Interfaces:**
- Existing single-row POST remains compatible.
- New request shape: `{ assetId, componentId, assignments: DirectAssignmentRow[] }`.
- New response shape: array of created assignment rows.

- [ ] Validate non-empty `assignments` array for batch mode.
- [ ] Force the top-level asset/component target onto every row rather than trusting per-row target IDs.
- [ ] Execute all creates and their audit records inside one Prisma transaction.
- [ ] Preserve existing plant-scope and permission checks.
- [ ] Verify duplicate `pmTaskId` rows are accepted in batch mode.
- [ ] Run service/API tests to green.

### Task 6: Verification and regression protection

**Files:**
- Modify E2E only if the PM authoring scenario needs the restored row workflow.

**Interfaces:**
- Proves the branch is safe to merge; no production deployment in this task.

- [ ] Run PM/direct-assignment focused Vitest files.
- [ ] Run `bunx tsc -p tsconfig.repairs.json --noEmit`.
- [ ] Run TypeScript debt ratchet against `origin/main`.
- [ ] Run targeted ESLint on changed files, then full lint.
- [ ] Run full `npm test`.
- [ ] Run production build with the established production-compatible environment injection if needed.
- [ ] Run `git diff --check` and inspect final diff against the spec.
