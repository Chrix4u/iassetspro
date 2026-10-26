# PM Scheduled Task Schema and Schedule Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production-safe task-level PM planning records and redesign the PM Schedule editor so every schedule is built from Task Library records with its own TBM/UBM/CBM planning configuration per task.

**Architecture:** Add an additive `PmScheduleTask` model linked to `PmSchedule` and `PmTask`, then centralize normalization/validation and transactional synchronization in a PM scheduled-task service. The schedule APIs expose these records while preserving legacy header recurrence for existing schedules; new task-level schedules fail closed with legacy `autoGenerateWO=false` until the task-level engines in roadmap slices 4–6 become authoritative. The UI moves task planning into focused schedule-task components and uses the existing Task Library plus the platform's existing meter/condition-source authorities.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma/PostgreSQL, Vitest, existing shadcn/Radix UI, existing PM Task Library and PM trigger/meter source APIs.

**Spec:** `docs/superpowers/specs/2026-10-22-pm-task-level-scheduling-design.md`

## Global Constraints

- This is roadmap slice 3 only: Scheduled Task schema + redesigned PM Schedule editor; do not implement due-task generation, recurrence advancement, or analytics migration yet.
- `PmSchedule` header recurrence columns remain intact for legacy compatibility; no destructive migration.
- New task-level schedules must never be consumed by the legacy schedule-level automation engine; persist them with `autoGenerateWO=false` until the matching task-level engine is shipped.
- Canonical Repairs/RWOP remains the only work-execution lifecycle.
- Task Master identity and Task Number are immutable; ordering changes `sortOrder` only.
- Task Library, schedule writes, meter sources, and condition sources remain plant scoped.
- New schedule UI does not require or author a Schedule Description.
- Active task-level plans require at least one valid Scheduled Task.
- TBM uses calendar-safe Time/Day units already supported by `pm-frequency`; UBM uses a real asset meter; CBM reuses component condition readings or active IoT devices.
- Schedule-task multi-row writes are transaction-safe and preserve existing row identity/state on edit.

## Review Focus

- A Task Master from another plant must be rejected even if its UUID is supplied directly; Task 3 integration tests pin plant ownership validation.
- A task-level schedule must not accidentally enter legacy auto-generation before task-level engines exist; Task 3 tests pin fail-closed `autoGenerateWO=false` behavior.
- Reordering/editing must not replace existing scheduled-task IDs or reset recurrence state fields; Task 2 service tests pin ID/state preservation.
- Changing the asset/target must invalidate UBM/CBM sources that no longer belong to the schedule target; Task 2 validation tests pin source/asset compatibility.
- Legacy schedules with no `PmScheduleTask` rows must remain readable/editable through the compatibility path; Task 3 API compatibility tests pin unchanged legacy behavior.

---

### Task 1: Add the additive Scheduled Task data model

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261025013000_add_pm_schedule_tasks/migration.sql`
- Create: `src/__tests__/pm/pm-scheduled-task-schema-contract.test.ts`

**Interfaces:**
- Produces: Prisma `PmScheduleTask`, `PmSchedule.tasks`, `PmTask.scheduleTasks`.

- [ ] **Step 1: Write the failing schema/migration contract** asserting required relations, task-level mode/state/recurrence/source fields, uniqueness/order indexes, and an additive migration with no mutation/deletion of existing `pm_schedules` rows.
- [ ] **Step 2: Run** `bunx vitest run src/__tests__/pm/pm-scheduled-task-schema-contract.test.ts` and verify RED because `PmScheduleTask` does not exist.
- [ ] **Step 3: Add `PmScheduleTask`** with `scheduleId`, `pmTaskId`, `sortOrder`, `maintenanceMode`, `equipmentState`, `estimatedMinutes`, `leadDays`, `frequencyInterval`, `frequencyUnit`, `meterName`, `nextDueReading`, `conditionSourceType`, `conditionSourceId`, `conditionMetric`, `conditionOperator`, `conditionThreshold`, `conditionThresholdMax`, `conditionUnit`, `evaluationCadenceMinutes`, `lastCompletedAt`, `nextDueDate`, `isActive`, timestamps; add schedule/task relations, uniqueness `[scheduleId, pmTaskId]`, and due/source indexes.
- [ ] **Step 4: Add the SQL migration** as create-table/index/FK operations only; do not backfill or rewrite legacy schedules in this slice.
- [ ] **Step 5: Run** the focused contract plus `bunx prisma validate && bunx prisma generate`; expect PASS.
- [ ] **Step 6: Commit** `feat(pm): add scheduled task planning model`.

### Task 2: Add canonical scheduled-task normalization and transactional synchronization

**Files:**
- Create: `src/services/pm/pmScheduleTask.service.ts`
- Create: `src/services/pm/__tests__/pmScheduleTask.service.test.ts`

**Interfaces:**
- Produces: `normalizePmScheduledTasks(input, context)`, `syncPmScheduledTasks(tx, input)`, `PmScheduledTaskInput`, `NormalizedPmScheduledTask`.
- Consumes: Task 1 Prisma model; existing `PmTask`, `MeterReading`, `ComponentConditionReading`, `IotDevice` records.

- [ ] **Step 1: Write RED unit/integration service contracts** for TBM, UBM, CBM, non-negative duration/lead days, RUNNING/STOPPED, duplicate Task Masters, cross-plant task rejection, UBM asset-meter validation, CBM target/source validation, and existing-row ID/state preservation.
- [ ] **Step 2: Run** `bunx vitest run src/services/pm/__tests__/pmScheduleTask.service.test.ts`; verify RED because the service does not exist.
- [ ] **Step 3: Implement normalization** with literal modes `tbm|ubm|cbm`, equipment states `running|stopped`, calendar-safe TBM units, existing asset meter identity for UBM, and existing component-condition/IoT source identity for CBM.
- [ ] **Step 4: Implement transactional sync** so supplied existing IDs update in place, new rows create, omitted rows become inactive, `sortOrder` changes never touch `PmTask.taskNumber`, and recurrence state fields are preserved unless explicitly changed by a future engine.
- [ ] **Step 5: Run** service tests and Prisma type generation; expect PASS.
- [ ] **Step 6: Commit** `feat(pm): validate and sync scheduled tasks`.

### Task 3: Integrate Scheduled Tasks into PM Schedule APIs without breaking legacy schedules

**Files:**
- Modify: `src/app/api/pm-schedules/route.ts`
- Modify: `src/app/api/pm-schedules/[id]/route.ts`
- Modify: `src/app/api/pm-schedules/meter-sources/route.ts` only if a response needs a stable source id
- Create: `src/app/api/pm-schedules/condition-sources/route.ts`
- Create: `src/__tests__/pm/pm-scheduled-task-api-contract.test.ts`
- Modify targeted existing PM schedule tests only where the new contract intentionally supersedes old inline-task authoring.

**Interfaces:**
- Consumes: Task 2 normalization/sync.
- Produces: `scheduledTasks` in schedule GET/POST/PUT payloads; condition-source discovery by selected asset/target before a schedule exists.

- [ ] **Step 1: Write RED API contracts** that create/update a schedule with multiple task modes, reject empty/cross-plant task lists, include Task Master snapshots in reads, preserve legacy no-task schedules, synchronize all task mutations inside the existing schedule transaction, and force legacy automation off for task-level plans.
- [ ] **Step 2: Run** the new API contract with current schedule atomicity/plant-scope tests; verify only the intended new assertions fail.
- [ ] **Step 3: Add condition-source discovery** keyed by `assetId` + optional `componentId`, reusing the same component-condition/IoT authority already used by PM triggers.
- [ ] **Step 4: Extend POST** to accept `scheduledTasks`, require at least one for the new path, validate all task/source ownership, save schedule + tasks + audit in one transaction, preserve compatibility header values, and persist `autoGenerateWO=false` for the new path.
- [ ] **Step 5: Extend GET/PUT** to return and transactionally synchronize `scheduledTasks`; leave legacy routes fully compatible when `scheduledTasks` is absent.
- [ ] **Step 6: Run** API contracts, existing PM schedule compatibility tests, and TypeScript; expect PASS.
- [ ] **Step 7: Commit** `feat(pm): expose task-level schedule planning APIs`.

### Task 4: Build reusable task-level schedule planning UI components

**Files:**
- Create: `src/components/modules/pm/PmScheduleTaskPickerDialog.tsx`
- Create: `src/components/modules/pm/PmScheduleTaskPlanner.tsx`
- Create: `src/components/modules/pm/PmScheduleTaskCard.tsx`
- Create: `src/lib/pm-schedule-task.ts`
- Create: `src/__tests__/pm/pm-scheduled-task-ui-contract.test.ts`

**Interfaces:**
- Produces: typed `PmScheduleTaskDraft` UI model and planner callbacks returning an ordered task list.
- Consumes: `/api/pm-tasks`, `/api/pm-schedules/meter-sources`, `/api/pm-schedules/condition-sources`, existing Task Library types/constants.

- [ ] **Step 1: Write RED UI behavior contracts** for Task Library selection, stable Task # display, TBM/UBM/CBM conditional fields, RUNNING/STOPPED, estimated minutes, lead days, recurrence/next-due summary, accessible reorder/remove, and mobile-safe cards.
- [ ] **Step 2: Run** the UI contract; verify RED because the planner components do not exist.
- [ ] **Step 3: Implement typed draft helpers** for API↔form conversion and concise planning summaries without duplicating server validation.
- [ ] **Step 4: Implement picker/planner/cards**; reuse active Task Library search/filter, asset meter sources, and asset/target condition sources; use up/down controls for accessible reorder and keep Task Number read-only.
- [ ] **Step 5: Run** UI contract and changed-file ESLint; expect PASS.
- [ ] **Step 6: Commit** `feat(pm): add task-level schedule planner`.

### Task 5: Redesign the PM Schedule form around task-level planning

**Files:**
- Modify: `src/components/modules/MaintenancePages.tsx`
- Modify: `src/__tests__/pm/pm-schedule-responsive-form-contract.test.ts`
- Modify: `src/__tests__/pm/pm-schedule-inline-tasks.test.ts`
- Modify: `src/__tests__/pm/pm-schedule-template-link.test.ts`
- Modify: other focused PM schedule UI contracts only for intentional superseded behavior.

**Interfaces:**
- Consumes: Task 4 planner and Task 3 API payload.
- Produces: new/edit flow ordered Title → Asset → Target → Tasks & Planning → administration.

- [ ] **Step 1: Write RED form contracts** proving Description is absent from new authoring, header cadence controls are removed from the new task-level path, one or more scheduled tasks are required, template selection seeds Task Masters instead of copied checklist text, and admin fields remain available.
- [ ] **Step 2: Run** the affected form/template tests; verify RED on the old inline-description/header-recurrence editor.
- [ ] **Step 3: Replace inline copied-task state** with `PmScheduleTaskPlanner`; template starter maps resolved `pmTask` records into task-level drafts and never creates schedule-owned copied task definitions.
- [ ] **Step 4: Update save/edit/view mapping** to use `scheduledTasks`; legacy schedules without task rows retain a clearly marked compatibility editor/read path until slice 4 migration.
- [ ] **Step 5: Keep automation fail-closed** in the new task-level UI with an explanatory state instead of allowing the legacy header engine to generate from the wrong cadence.
- [ ] **Step 6: Run** focused UI/API compatibility suites and Repairs TypeScript gate; expect PASS.
- [ ] **Step 7: Commit** `feat(pm): redesign schedules for task-level planning`.

### Task 6: Verify migration safety and repository release gates

**Files:**
- Modify only files from Tasks 1–5 if verification exposes a concrete defect.

**Interfaces:**
- Consumes: complete branch.
- Produces: release evidence for exact branch head.

- [ ] **Step 1: Run focused task-level suites**: schema, service, API, UI, schedule atomicity, plant scope, template link, frequency compatibility.
- [ ] **Step 2: Run** `bunx vitest run src/__tests__/pm src/services/pm/__tests__`; expect PASS.
- [ ] **Step 3: Run** `bunx prisma validate && bunx prisma generate && bunx eslint src/app/api/pm-schedules src/services/pm src/components/modules/pm src/components/modules/MaintenancePages.tsx src/lib/pm-schedule-task.ts src/__tests__/pm`.
- [ ] **Step 4: Run** `bunx tsx scripts/check-rwop-legacy-lifecycle-imports.ts && bunx tsc -p tsconfig.repairs.json --noEmit`.
- [ ] **Step 5: Apply migrations to an isolated PostgreSQL fixture** containing legacy schedules/templates and prove existing schedules are unchanged while the new table accepts TBM/UBM/CBM rows.
- [ ] **Step 6: Run** `bunx vitest run && bun run build && git diff --check`; expect PASS.
- [ ] **Step 7: Open the PR and require exact-head green Unit, Lint, TypeScript/Repairs gate, Build, Production Container, Repairs UAT, Platform E2E, and Required CI Gate before merge.
