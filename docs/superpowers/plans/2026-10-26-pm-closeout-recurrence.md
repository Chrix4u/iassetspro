# PM Task-Level Closeout Recurrence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make canonical verified Repairs planner closeout advance only the Scheduled Tasks actually completed on a generated PM Work Order, safely re-arm TBM/UBM/CBM recurrence, and enable production task-level automatic WO generation.

**Architecture:** Add one transaction-safe task recurrence service called only by canonical `workOrderClosure.service.ts`. It detects task-level provenance from immutable WO task cycle records, advances completed live Scheduled Tasks per mode, and suppresses legacy parent-schedule advancement for task-level WOs. Centralize duplicate-cycle blocking so closed skipped executions can regenerate, add post-completion freshness to CBM evaluation, then remove the temporary task-level `autoGenerateWO=false` authoring guard and expose the common automation switch in the UI.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma/PostgreSQL, Vitest, Playwright, canonical Repairs/RWOP lifecycle, MeterReading, ComponentConditionReading/IoT sources.

**Spec:** `docs/superpowers/specs/2026-10-26-pm-closeout-recurrence-design.md` (extends `docs/superpowers/specs/2026-10-22-pm-task-level-scheduling-design.md`)

## Global Constraints

- Planner closeout after supervisor verification remains the only recurrence-advancement boundary.
- Generation, technician completion, supervisor verification, rework, and cancellation must not independently advance Scheduled Task recurrence.
- Advance only `WorkOrderTaskExecution.status === 'completed'`; skipped tasks stay due.
- Task-level provenance suppresses legacy `PmSchedule` header advancement even if a live task relation later disappears.
- Completed orphan/mismatched provenance fails closeout transactionally rather than silently losing recurrence ownership.
- TBM uses the individual task completion timestamp and calendar-safe whole-number day/week/month/year recurrence.
- UBM uses the configured asset meter and latest reading at/before task completion as its new baseline.
- CBM requires a post-completion source observation before it can become due again.
- Existing legacy schedules with no Scheduled Tasks keep current schedule-header closeout behavior.
- No schema migration or destructive data rewrite in this slice.
- Automatic generation becomes user-configurable for task-level schedules only after recurrence safety is implemented.

## Review Focus

- A closed skipped task must be able to regenerate its unchanged due cycle, while the same skipped task in an open WO still blocks duplicates.
- A closed completed task must not duplicate its old cycle even if recurrence state is unexpectedly stale.
- UBM must not baseline from meter usage accumulated during supervisor/planner review delay.
- Stale CBM source data at or before `lastCompletedAt` must not trigger a new cycle.
- Per-task closeout must never advance sibling Scheduled Tasks not completed in that WO.
- Task-level provenance must never fall through into legacy parent schedule advancement.
- Same-state close retries must not advance recurrence or write duplicate audits twice.
- Enabling `autoGenerateWO` must never make the legacy due engine consume a task-level schedule.

---

### Task 1: Implement canonical Scheduled Task recurrence advancement

**Files:**
- Create: `src/services/pm/advancePmScheduledTaskRecurrence.service.ts`
- Create: `src/services/pm/__tests__/advancePmScheduledTaskRecurrence.service.test.ts`
- Modify: `src/services/pm/pmScheduleTask.service.ts`
- Modify: `src/services/pm/__tests__/pmScheduleTask.service.test.ts`

**Interfaces:**
- Produces: `advanceClosedPmScheduledTaskRecurrence(input)` returning whether task-level provenance exists plus advanced/skipped task IDs.
- Consumes: canonical WO task execution provenance, live `PmScheduleTask`, asset meter readings, closeout actor/audit context.

- [ ] **Step 1: Write RED recurrence tests** for completed TBM, UBM, and CBM; per-execution completion timestamp; skipped execution; inactive-but-live Scheduled Task; no-provenance legacy detection; orphan completed provenance; schedule mismatch; missing UBM baseline.
- [ ] **Step 2: Pin TBM validation RED** so fractional day/week/month/year intervals are rejected instead of silently becoming one unit during recurrence calculation.
- [ ] **Step 3: Run** `bunx vitest run src/services/pm/__tests__/advancePmScheduledTaskRecurrence.service.test.ts src/services/pm/__tests__/pmScheduleTask.service.test.ts`.
  - **Expected:** RED from missing recurrence service / fractional TBM guard.
- [ ] **Step 4: Implement the minimal recurrence service** using one transaction client, immutable provenance detection, `completed`-only filtering, per-task completion timestamps, calendar-safe TBM advancement, UBM meter baseline at/before completion, CBM `lastCompletedAt` re-arm, and per-task audit rows.
- [ ] **Step 5: Harden TBM authoring validation** to require positive whole-number intervals for day/week/month/year task cadence.
- [ ] **Step 6: Re-run focused tests and `bunx tsc -p tsconfig.repairs.json --noEmit`.**
  - **Expected:** PASS.
- [ ] **Step 7: Commit** `feat(pm): advance scheduled task recurrence on closeout`.

---

### Task 2: Make Repairs planner closeout the task-level recurrence owner

**Files:**
- Modify: `src/services/workOrderClosure.service.ts`
- Modify: `src/services/__tests__/workOrderClosure.service.test.ts`
- Modify: `src/__tests__/pm/pm-cadence-close-authority.test.ts` if contract wording needs task-level coverage.

**Interfaces:**
- Consumes: Task 1 `advanceClosedPmScheduledTaskRecurrence`.
- Produces: canonical verified -> closed transaction where task-level recurrence advances atomically and legacy header cadence is used only when no task-level provenance exists.

- [ ] **Step 1: Write RED closeout tests** proving task-level WOs call the recurrence service, completed task advancement suppresses parent `PmSchedule.update`, task-level provenance with zero advanced rows still suppresses parent advancement, and legacy WOs retain existing header recurrence.
- [ ] **Step 2: Add audit assertions** for advanced task count/IDs while retaining legacy `pmScheduleAdvanced` compatibility.
- [ ] **Step 3: Run** `bunx vitest run src/services/__tests__/workOrderClosure.service.test.ts src/__tests__/pm/pm-cadence-close-authority.test.ts`.
  - **Expected:** RED before integration.
- [ ] **Step 4: Integrate Task 1 inside the existing close transaction** after verified close transition ownership is established; fall back to the unchanged legacy block only when the service reports no task-level provenance.
- [ ] **Step 5: Re-run focused tests plus completion/verification/rework service suites.**
  - **Expected:** PASS; completion/verification still do not advance recurrence.
- [ ] **Step 6: Commit** `feat(repairs): own task recurrence at planner close`.

---

### Task 3: Re-arm CBM safely and make skipped cycles regeneratable

**Files:**
- Modify: `src/services/pm/pmScheduledTaskDueEngine.ts`
- Modify: `src/services/pm/__tests__/pmScheduledTaskDueEngine.test.ts`
- Create: `src/services/pm/pmScheduledTaskCycleGuard.service.ts`
- Create: `src/services/pm/__tests__/pmScheduledTaskCycleGuard.service.test.ts`
- Modify: `src/services/pm/pmScheduledTaskGeneration.service.ts`
- Modify: `src/services/pm/__tests__/pmScheduledTaskGeneration.service.test.ts`
- Modify: `src/services/pm/materializePmScheduledTasks.service.ts`
- Modify: `src/services/pm/__tests__/materializePmScheduledTasks.service.test.ts`

**Interfaces:**
- Produces: shared blocking-cycle lookup and CBM post-completion freshness semantics.
- Consumes: Task 1 `lastCompletedAt` advancement and existing WO/task statuses.

- [ ] **Step 1: Write RED CBM tests** where a violating observation at/before `lastCompletedAt` is stale/not due and a newer violating observation creates the new CBM cycle.
- [ ] **Step 2: Write RED cycle-guard tests**: cancelled is non-blocking; closed+skipped is non-blocking; open+skipped blocks; closed+completed blocks; open completed/pending blocks.
- [ ] **Step 3: Update generation/materialization tests RED** to require both paths to consume the same shared cycle guard and allow a closed skipped due cycle to materialize again.
- [ ] **Step 4: Run** `bunx vitest run src/services/pm/__tests__/pmScheduledTaskDueEngine.test.ts src/services/pm/__tests__/pmScheduledTaskCycleGuard.service.test.ts src/services/pm/__tests__/pmScheduledTaskGeneration.service.test.ts src/services/pm/__tests__/materializePmScheduledTasks.service.test.ts`.
  - **Expected:** RED.
- [ ] **Step 5: Implement source freshness and centralized duplicate-cycle blocking** without changing cycle-key formats.
- [ ] **Step 6: Re-run focused tests and Repairs TypeScript gate.**
  - **Expected:** PASS.
- [ ] **Step 7: Commit** `fix(pm): rearm completed and skipped task cycles safely`.

---

### Task 4: Enable task-level automatic generation in API and UI

**Files:**
- Modify: `src/app/api/pm-schedules/route.ts`
- Modify: `src/app/api/pm-schedules/[id]/route.ts`
- Modify: `src/components/modules/MaintenancePages.tsx`
- Modify: `src/__tests__/pm/pm-scheduled-task-api-contract.test.ts`
- Modify: `src/__tests__/pm/pm-lead-days-validation-contract.test.ts`
- Create or modify a focused PM schedule UI contract test under `src/__tests__/pm/`.

**Interfaces:**
- Produces: task-level schedules that persist and edit `autoGenerateWO`, with one common UI switch.
- Consumes: already-shipped task-level generation service; legacy `check-due` remains isolated by `tasks: { none: {} }`.

- [ ] **Step 1: Rewrite API tests RED**: task-level POST defaults automation on, explicit false is preserved, explicit true is preserved, existing task-level PUT can toggle true/false, unrelated task edits preserve the stored value, and legacy recurrence fields remain forbidden.
- [ ] **Step 2: Write UI contract RED** requiring task-level payloads to include `autoGenerateWO` and replacing legacy-only switch wording with a common Auto-generate Work Orders control.
- [ ] **Step 3: Run** focused API/UI contracts.
  - **Expected:** RED because current code forces task-level automation false and hides the switch outside legacy mode.
- [ ] **Step 4: Remove the temporary fail-closed overrides** while retaining task-level/legacy recurrence separation and target/source revalidation.
- [ ] **Step 5: Make the common UI switch submit for both schedule models** with model-specific helper copy if useful.
- [ ] **Step 6: Run focused API/UI/check-due/generation tests and ESLint on changed UI/API files.**
  - **Expected:** PASS.
- [ ] **Step 7: Commit** `feat(pm): enable task-level automatic generation`.

---

### Task 5: Prove end-to-end closeout recurrence and release safety

**Files:**
- Modify: `e2e/repairs/scenario-u-pm-task-level-generation.spec.ts`
- Modify only product/test files above if UAT exposes a concrete defect.

**Interfaces:**
- Consumes: Tasks 1–4 complete lifecycle.
- Produces: exact-head release evidence that task-level automation is enabled through public APIs and recurrence advances only after canonical Repairs closeout.

- [ ] **Step 1: Remove the UAT-only DB automation toggle** and create the task-level PM schedule with `autoGenerateWO=true` through the public schedule API; assert it persists true.
- [ ] **Step 2: Extend UAT with a closeable task-level WO** and drive it through canonical assignment/start/checklist completion/technician completion/supervisor verification/planner close using existing Repairs helpers.
- [ ] **Step 3: Assert after close** that only completed Scheduled Tasks advanced; TBM/UBM/CBM state follows the design; skipped task recurrence did not advance; parent legacy recurrence did not advance.
- [ ] **Step 4: Re-run automation** and prove the closed skipped cycle may generate again while completed cycles do not duplicate; prove stale CBM evidence cannot immediately retrigger.
- [ ] **Step 5: Run focused PM/Repairs suites**, then Prisma validate/generate, ESLint changed files, RWOP canonical-import guard, Repairs TypeScript hard gate, full Vitest, `git diff --check`, and a clean production build.
  - **Expected:** all green.
- [ ] **Step 6: Run the Repairs UAT project against isolated PostgreSQL/Redis** or rely on the exact-head PR Repairs UAT if local container/runtime parity is unavailable; do not claim UAT green without its actual output.
- [ ] **Step 7: Open a PR from the fork branch and require exact-head green Lint, TypeScript/debt ratchet, Vitest, Build, Production Container, Repairs UAT, Platform E2E, and Required CI Gate before merge.**
- [ ] **Step 8: Commit any UAT-only change** as `test(pm): prove task-level closeout recurrence` before publication.
