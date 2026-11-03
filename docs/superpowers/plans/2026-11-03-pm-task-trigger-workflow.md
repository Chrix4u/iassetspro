# PM Task Trigger Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn direct PM assignment authoring into a clear Tasks → Triggers workflow where every task assigned to a machine/part owns its own TBM/UBM/CBM/FBM trigger and can be reopened directly from the PM Schedule list.

**Architecture:** Keep the existing direct-assignment persistence and due engine unchanged. Add trigger-readiness validation to the existing draft model, split the existing planner/card presentation into task and trigger modes, make the assignment dialog two-step, and expose a Triggers row action that opens an existing target directly on step two.

**Tech Stack:** Next.js, React, TypeScript, Tailwind/shadcn UI, Vitest, existing `/api/pm-assignments` services and PM due engine.

**Spec:** `docs/superpowers/specs/2026-11-03-pm-task-trigger-workflow-design.md`

## Global Constraints

- Direct assignments remain `pmScheduleTask` rows with `scheduleId: null`.
- Do not create a second trigger table, schema migration, or competing TBM clock.
- Do not repurpose the schedule-centric `PmTriggersPage` for direct assignments.
- Existing plant/asset/component/meter validation and batch/replace endpoints remain authoritative.
- Existing TBM/UBM/CBM due engine and FBM failure/event semantics remain unchanged.
- Final UI must remain usable on phone, tablet, and desktop.

## Review Focus

- Multiple tasks on one part must retain independent trigger types and intervals.
- Editing tasks must open on Tasks; the Triggers row action must open the same target directly on Triggers.
- Switching PM type must not leave stale fields that accidentally make an invalid trigger appear ready.
- FBM must clearly remain event/failure driven and must not require a recurring interval.
- New/edit save must still use the existing API payload and final validation so no server-side authorization is bypassed.

---

### Task 1: Trigger readiness validation

**Files:**
- Modify: `src/lib/pm-assignment-draft.ts`
- Test: `src/__tests__/pm/pm-assignment-trigger-readiness.test.ts`

**Interfaces:**
- Produces: `validatePmAssignmentTriggerDraft(task: PmAssignmentTaskDraft): string | null`
- Consumed by: trigger cards and dialog readiness summary.

- [ ] **Step 1: Write the failing readiness tests**
  Cover valid/invalid TBM, UBM, CBM threshold/range, and FBM readiness.
- [ ] **Step 2: Run the focused test and verify RED**
  Run: `bunx vitest run src/__tests__/pm/pm-assignment-trigger-readiness.test.ts`
  Expected: fail because the helper does not exist.
- [ ] **Step 3: Implement `validatePmAssignmentTriggerDraft`**
  Reuse the same trigger rules as full task validation without validating execution-only fields.
- [ ] **Step 4: Run the focused test and verify GREEN**
- [ ] **Step 5: Commit**
  `test/feat: add PM assignment trigger readiness`

### Task 2: Split task cards into Tasks and Triggers modes

**Files:**
- Modify: `src/components/modules/pm/PmAssignmentTaskCard.tsx`
- Modify: `src/components/modules/pm/PmAssignmentTaskPlanner.tsx`
- Test: `src/__tests__/pm/pm-assignment-task-trigger-ui-contract.test.ts`

**Interfaces:**
- `PmAssignmentTaskCard` consumes `mode: 'tasks' | 'triggers'`.
- `PmAssignmentTaskPlanner` consumes `mode: 'tasks' | 'triggers'` and renders task-library controls only in Tasks mode.
- Trigger mode consumes `validatePmAssignmentTriggerDraft` for per-task readiness badges.

- [ ] **Step 1: Write failing UI contract tests**
  Assert mode props, Tasks-only picker/reorder controls, Triggers-only PM/frequency/condition fields, readiness badges, and explicit FBM event-driven copy.
- [ ] **Step 2: Run the focused contract and verify RED**
- [ ] **Step 3: Implement the mode split with minimal markup movement**
  Keep existing field components and update callbacks; only change which field groups render in each mode.
- [ ] **Step 4: Run focused tests and existing PM assignment UI contracts**
- [ ] **Step 5: Commit**
  `feat: split PM assignment tasks and triggers`

### Task 3: Make the assignment dialog a two-step workflow

**Files:**
- Modify: `src/components/modules/pm/PmAssignmentFormDialog.tsx`
- Test: `src/__tests__/pm/pm-assignment-workflow-contract.test.ts`

**Interfaces:**
- Add prop: `initialStep?: 'tasks' | 'triggers'` with default `'tasks'`.
- Dialog controls local step state and passes it as planner `mode`.
- Existing save payload/API calls remain unchanged.

- [ ] **Step 1: Write failing dialog workflow tests**
  Assert visible Tasks/Triggers step indicator, Continue to Triggers, Back to Tasks, Save PM Schedule, no forward navigation with zero tasks, initialStep support, and trigger readiness summary.
- [ ] **Step 2: Run contract and verify RED**
- [ ] **Step 3: Implement two-step navigation**
  Reset step from `initialStep` whenever the dialog opens for a new target/edit session; preserve task drafts while moving between steps.
- [ ] **Step 4: Run focused and existing assignment form tests**
- [ ] **Step 5: Commit**
  `feat: add Tasks to Triggers PM workflow`

### Task 4: Add direct Triggers action on PM Schedule targets

**Files:**
- Modify: `src/components/modules/pm/PmAssignmentTargetList.tsx`
- Modify: `src/components/modules/pm/PmPlanningPage.tsx`
- Test: `src/__tests__/pm/pm-assignment-trigger-entry-contract.test.ts`

**Interfaces:**
- `PmAssignmentTargetList` adds `onTriggers(group)` callback.
- `PmPlanningPage` opens the existing target in `PmAssignmentFormDialog` with `initialStep="triggers"`.
- Existing Edit continues to open `initialStep="tasks"`.

- [ ] **Step 1: Write failing row-entry contract**
  Assert a Triggers action exists and is wired separately from Edit.
- [ ] **Step 2: Run contract and verify RED**
- [ ] **Step 3: Implement the Triggers action and page state**
  Preserve current responsive filter/alignment classes from the merged PM filter work.
- [ ] **Step 4: Run focused PM list/planning tests**
- [ ] **Step 5: Commit**
  `feat: reopen PM task triggers from schedule list`

### Task 5: Runtime regression and release verification

**Files:**
- Test existing: `src/services/pm/__tests__/pmScheduledTaskDueEngine.test.ts`
- Test existing: `src/__tests__/pm/pm-check-due-direct-generation-contract.test.ts`
- Test existing: `src/__tests__/pm/pm-direct-cron-observability-contract.test.ts`
- Test all new trigger workflow contracts.

**Interfaces:**
- No runtime API/schema interface changes expected.

- [ ] **Step 1: Run the focused direct-assignment runtime regression set**
  Confirm TBM/UBM/CBM generation and FBM waiting semantics remain unchanged.
- [ ] **Step 2: Run all new workflow tests together**
- [ ] **Step 3: Run `git diff --check`, changed-file lint/type gates, then full GitHub CI**
- [ ] **Step 4: Review the PR diff for scope creep**
  Expected production changes are limited to direct PM assignment draft/UI/list/planning files; no Prisma migration or standalone `PmTriggersPage` rewrite.
- [ ] **Step 5: Merge only the exact fully-green head SHA**
