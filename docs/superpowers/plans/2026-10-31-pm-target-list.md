# PM Target List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the PM Planning legacy/task-row presentation with a filtered, target-centered PM schedule list and full View/Edit/Delete target actions.

**Architecture:** Group canonical direct PM assignments by asset/component in a pure helper, render those groups through focused list/detail components, and extend the existing assignment dialog for edit mode. Add one transactional target mutation API for atomic replace/deactivate while leaving legacy schedule storage untouched.

**Tech Stack:** Next.js 16, React, TypeScript, Prisma/PostgreSQL, Tailwind/shadcn UI, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-31-pm-target-list-design.md`

## Global Constraints
- Legacy PM schedule data stays in backend/history but is not rendered on PM Planning.
- Direct PM assignments (`scheduleId = null`) remain canonical.
- Same PM Task may appear multiple times on one target with different conditions.
- Delete is deactivate, never hard delete.
- Existing plant scope, permissions, recurrence and WO generation behavior must remain intact.

## Review Focus
- Whole-machine targets (`componentId = null`) group separately and remain editable/deletable.
- Multiple assignments using the same Task Library task are preserved independently.
- Task-level filters do not truncate tasks shown in the target View modal.
- Target replacement rejects assignment IDs belonging to another target.
- CBM/UBM fields survive edit round trips without losing source/meter bindings.

---

### Task 1: Target grouping and filter projection
**Files:**
- Create: `src/lib/pm-assignment-target-list.ts`
- Test: `src/lib/__tests__/pm-assignment-target-list.test.ts`

**Interfaces:**
- Produces: `groupPmAssignmentTargets(assignments)`, `filterPmAssignmentTargets(groups, filters, now?)`, `PmAssignmentTargetGroup`.

- [ ] Write failing tests for grouping, duplicate task preservation, task-level matching with full-group retention, frequency/due-state derivation.
- [ ] Run the focused test and verify RED.
- [ ] Implement the pure projection/filter helper.
- [ ] Run focused test and verify GREEN.
- [ ] Commit.

### Task 2: Atomic target edit/deactivate backend
**Files:**
- Modify: `src/services/pm/pmAssignment.service.ts`
- Create: `src/app/api/pm-assignments/target/route.ts`
- Test: `src/services/pm/__tests__/pmAssignmentTarget.service.test.ts`
- Test: `src/__tests__/pm/pm-assignment-target-api-contract.test.ts`

**Interfaces:**
- Produces: `replacePmAssignmentTarget(...)`, `deactivatePmAssignmentTarget(...)` and PATCH/DELETE `/api/pm-assignments/target`.

- [ ] Write failing service/API contract tests for atomic replacement, foreign-ID rejection, omitted-row deactivation and target deactivation.
- [ ] Run focused tests and verify RED.
- [ ] Implement transactional service operations and permission/plant-scoped route.
- [ ] Run focused tests and verify GREEN.
- [ ] Commit.

### Task 3: Edit-capable assignment dialog and target details
**Files:**
- Modify: `src/lib/pm-assignment-draft.ts`
- Modify: `src/components/modules/pm/PmAssignmentFormDialog.tsx`
- Create: `src/components/modules/pm/PmAssignmentTargetDetailDialog.tsx`
- Test: `src/__tests__/pm/pm-target-list-ui-contract.test.ts`

**Interfaces:**
- Produces edit mode accepting `editTarget`, preloaded drafts preserving assignment IDs, and a detail dialog showing every task condition.

- [ ] Write failing UI-contract tests for edit prefill/fixed target/full task detail fields.
- [ ] Run test and verify RED.
- [ ] Implement API-to-draft conversion, edit save path, fixed-target UI and detail dialog.
- [ ] Run test and verify GREEN.
- [ ] Commit.

### Task 4: Replace PM page list and remove legacy section
**Files:**
- Create: `src/components/modules/pm/PmAssignmentTargetList.tsx`
- Modify: `src/components/modules/MaintenancePages.tsx`
- Test: `src/__tests__/pm/pm-target-list-ui-contract.test.ts`
- Modify: `src/__tests__/pm/pm-direct-authoring-ui-contract.test.ts`

**Interfaces:**
- Consumes Task 1 grouping/filter helper, Task 2 target mutations and Task 3 dialogs.

- [ ] Extend failing UI-contract tests for one-row-per-target list, filters, explicit View/Edit/Delete, and absence of Legacy PM Schedules.
- [ ] Run tests and verify RED.
- [ ] Implement target list/filter component and wire page state/actions; delete legacy section and legacy editor from visible PM Planning flow.
- [ ] Run focused tests and verify GREEN.
- [ ] Run full PM test suite, focused lint, `git diff --check`, and production build.
- [ ] Commit.
