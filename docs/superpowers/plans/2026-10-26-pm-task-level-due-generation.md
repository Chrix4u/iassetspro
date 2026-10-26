# PM Task-Level Due Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-safe task-level PM due engine that independently evaluates scheduled TBM, UBM, and CBM tasks, deterministically bundles compatible due tasks into canonical Repairs/RWOP work orders, and snapshots each generated Scheduled Task without advancing recurrence on generation.

**Architecture:** Keep the legacy schedule-level engines intact for schedules with no `PmScheduleTask` rows. Add generation provenance to `PmScheduleTask` and `WorkOrderTaskExecution`, centralize due evaluation in a pure/service boundary, and build a task-level generator that re-reads and locks due work transactionally before creating WOs. Task-level schedules remain fail-closed for automatic production generation in this slice because verified Repairs closeout has not yet become the recurrence-advancement authority; the next slice will advance/re-arm only successfully closed task executions and then enable task-level auto-generation.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma/PostgreSQL, Vitest, existing PM automation services, canonical Repairs/RWOP Work Orders, MeterReading, ComponentConditionReading, IoT sources.

**Spec:** `docs/superpowers/specs/2026-10-22-pm-task-level-scheduling-design.md`

## Global Constraints

- Canonical Repairs/RWOP remains the only work-execution lifecycle; no PM-only execution path.
- Evaluate every active Scheduled Task independently; a PM Schedule is a planning container, not the cadence owner.
- TBM uses calendar due dates and lead windows; UBM uses the selected authoritative meter; CBM uses the selected condition/IoT source and threshold operator.
- RUNNING and STOPPED tasks are not bundled into the same generated WO.
- Generation snapshots task identity and planning context; later Task Library or schedule edits must not rewrite generated history.
- Generation must never mutate `lastCompletedAt`, `nextDueDate`, or `nextDueReading`; recurrence advances only after verified Repairs closeout in the next slice.
- Legacy schedules with no Scheduled Tasks continue through the existing legacy time/meter/condition engines unchanged.
- Task-level production auto-generation remains fail-closed in this slice; existing API behavior that persists new task-level schedules with `autoGenerateWO=false` stays intact.
- All discovery and generation remain plant scoped for manual callers and system-wide only for the trusted cron-secret path.

## Review Focus

- Repeated evaluator runs for the same TBM date, UBM threshold, or latched CBM condition must not create duplicate task executions or WOs.
- A UBM task must read only its configured asset meter name/unit and never silently fall back to component operating hours.
- A CBM task whose source disappears, moves outside the target, or returns an incompatible unit must fail closed rather than generate maintenance.
- Concurrent workers evaluating the same schedule must serialize and produce one deterministic generation result.
- Mixed due tasks must bundle only when schedule/asset/target/equipment-state context is compatible; far-future tasks must never be pulled into the WO.

---

### Task 1: Add task-generation provenance to the data model

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261026014500_add_pm_task_generation_provenance/migration.sql`
- Create: `src/__tests__/pm/pm-task-level-generation-schema-contract.test.ts`

**Interfaces:**
- Produces: `PmScheduleTask.lastEvaluatedAt`, `lastGeneratedAt`, `lastGeneratedCycleKey`; `WorkOrderTaskExecution.pmScheduleTaskId`, `pmDueCycleKey`, `pmPlanningSnapshot`; relations/indexes needed by generation and future closeout advancement.

- [ ] **Step 1: Write the failing schema contract** asserting additive nullable provenance fields, the nullable Scheduled Task relation on WO task executions, a cycle-key lookup index, and a migration that does not rewrite existing schedules or WO tasks.
- [ ] **Step 2: Run** `bunx vitest run src/__tests__/pm/pm-task-level-generation-schema-contract.test.ts`; expect RED because the fields do not exist.
- [ ] **Step 3: Add the Prisma fields and relations** with nullable defaults so existing production rows remain valid; index `WorkOrderTaskExecution(pmScheduleTaskId, pmDueCycleKey)` and `PmScheduleTask(scheduleId, isActive, lastGeneratedCycleKey)`.
- [ ] **Step 4: Add the SQL migration** using only additive columns, indexes, and the nullable FK from `wo_task_executions.pm_schedule_task_id` to `pm_schedule_tasks.id`.
- [ ] **Step 5: Run** the schema contract plus `bunx prisma validate && bunx prisma generate`; expect PASS.
- [ ] **Step 6: Commit** `feat(pm): add task generation provenance`.

### Task 2: Implement canonical Scheduled Task due evaluation

**Files:**
- Create: `src/services/pm/pmScheduledTaskDueEngine.ts`
- Create: `src/services/pm/__tests__/pmScheduledTaskDueEngine.test.ts`

**Interfaces:**
- Produces: `evaluateScheduledTaskDue(input: ScheduledTaskDueInput): Promise<ScheduledTaskDueResult>` and deterministic `dueCycleKey` values.
- Consumes: active `PmScheduleTask` planning fields, latest `MeterReading`, `ComponentConditionReading`, and active IoT source state.

- [ ] **Step 1: Write RED evaluator tests** for TBM lead-window/not-due/due, UBM below/equal/above `nextDueReading`, CBM `> >= < <= outside_range`, missing source, incompatible unit, inactive task, and CBM evaluation cadence.
- [ ] **Step 2: Pin cycle identity in tests**: TBM uses the persisted `nextDueDate`, UBM uses the persisted `nextDueReading`, and CBM uses a latched condition cycle key so repeated true readings do not manufacture new maintenance cycles before closeout re-arms the task.
- [ ] **Step 3: Run** `bunx vitest run src/services/pm/__tests__/pmScheduledTaskDueEngine.test.ts`; expect RED because the engine does not exist.
- [ ] **Step 4: Implement source resolution and due evaluation** without mutating recurrence state; return explicit `due`, `reason`, `maintenanceMode`, `dueCycleKey`, source/current value, and planning context needed by generation.
- [ ] **Step 5: Persist only `lastEvaluatedAt` where evaluation cadence requires it**; do not write completion or next-due fields.
- [ ] **Step 6: Run** the evaluator tests and Repairs TypeScript hard gate; expect PASS.
- [ ] **Step 7: Commit** `feat(pm): evaluate task-level maintenance due state`.

### Task 3: Materialize due Scheduled Tasks into canonical WO task executions

**Files:**
- Create: `src/services/pm/materializePmScheduledTasks.service.ts`
- Create: `src/services/pm/__tests__/materializePmScheduledTasks.service.test.ts`

**Interfaces:**
- Produces: `materializePmScheduledTasks(tx, workOrderId, dueTasks)` creating ordered `WorkOrderTaskExecution` snapshots linked to `PmScheduleTask`.
- Consumes: due results from Task 2 and Task Master snapshots from each Scheduled Task.

- [ ] **Step 1: Write RED materialization tests** proving only selected due tasks are copied, Task Number/description/type/estimated minutes are snapshotted, sort order is preserved, `pmScheduleTaskId` and `pmDueCycleKey` are recorded, and planning context is immutable JSON.
- [ ] **Step 2: Run** the focused test; expect RED because the service does not exist.
- [ ] **Step 3: Implement transactional materialization** using the existing `WorkOrderTaskExecution` model rather than template-only checklist materialization.
- [ ] **Step 4: Reject duplicate `(pmScheduleTaskId, pmDueCycleKey)` materialization into another non-cancelled preventive WO** so retries remain idempotent.
- [ ] **Step 5: Run** focused tests plus existing work-order-task execution contracts; expect PASS.
- [ ] **Step 6: Commit** `feat(pm): snapshot scheduled tasks into work orders`.

### Task 4: Build the task-level WO generation service with deterministic bundling

**Files:**
- Create: `src/services/pm/pmScheduledTaskGeneration.service.ts`
- Create: `src/services/pm/__tests__/pmScheduledTaskGeneration.service.test.ts`
- Reuse: `src/services/pm/plannedWindow.service.ts`, `src/services/pm/templateLifecycle.service.ts`, functional-location snapshot helpers, existing PM WO-number lock convention.

**Interfaces:**
- Produces: `generateDueScheduledTaskWorkOrders(options: { plantIds?: string[]; actorId: string; scheduleIds?: string[] }): Promise<TaskLevelGenerationResult>`.
- Consumes: Task 2 evaluator and Task 3 materializer.

- [ ] **Step 1: Write RED integration tests** for one TBM task, multiple compatible due tasks bundled once, RUNNING/STOPPED split, UBM threshold generation, CBM threshold generation, far-future task exclusion, plant scope, and concurrent/repeated evaluation idempotency.
- [ ] **Step 2: Add a concurrency test** where two workers evaluate the same schedule and only one WO/cycle is committed.
- [ ] **Step 3: Run** the generation tests; expect RED because the service does not exist.
- [ ] **Step 4: Implement lightweight candidate discovery**, then inside one transaction acquire the existing schedule lifecycle lock plus a task-generation advisory lock and re-read the schedule/tasks/sources before deciding anything.
- [ ] **Step 5: Group only currently due tasks by schedule + target + equipment state**, sum `estimatedMinutes` into WO estimated hours, preserve existing priority/department/assignee/component/resource recommendations/location snapshot behavior, and allocate WO numbers with the existing shared monthly lock.
- [ ] **Step 6: Materialize due Scheduled Tasks** through Task 3, then set only `lastGeneratedAt` and `lastGeneratedCycleKey`; do not change completion/next-due fields.
- [ ] **Step 7: Add audit and notification payloads** that identify the generated Scheduled Task IDs/cycle keys and canonical WO.
- [ ] **Step 8: Run** generation tests, legacy meter/time generation tests, and Repairs TypeScript gate; expect PASS.
- [ ] **Step 9: Commit** `feat(pm): generate WOs from due scheduled tasks`.

### Task 5: Integrate task-level evaluation into the PM automation endpoint without enabling unsafe production recurrence

**Files:**
- Modify: `src/app/api/pm-schedules/check-due/route.ts`
- Create: `src/__tests__/pm/pm-task-level-generation-api-contract.test.ts`
- Modify focused legacy generation contracts only where result shape gains a task-level engine section.

**Interfaces:**
- Consumes: `generateDueScheduledTaskWorkOrders` from Task 4.
- Produces: automation response with separate `legacySchedule` and `scheduledTasks` engine results while preserving existing legacy result compatibility.

- [ ] **Step 1: Write RED API contracts** proving auth/plant scoping stays unchanged, legacy schedules still generate through the legacy path, schedules containing Scheduled Tasks never fall back to legacy generation, and task-level generation only considers schedules explicitly eligible for task-level generation.
- [ ] **Step 2: Keep current task-level authoring fail-closed**: new task-level schedule POST/PUT still persists `autoGenerateWO=false`; this slice must not silently activate production recurrence before verified-closeout advancement exists.
- [ ] **Step 3: Integrate the new engine** behind explicit service eligibility so internal/UAT fixtures can prove generation while ordinary newly authored task-level schedules remain non-generating in production.
- [ ] **Step 4: Run** API contracts plus legacy check-due/meter-trigger/condition-trigger suites; expect PASS.
- [ ] **Step 5: Commit** `feat(pm): integrate task-level due engine safely`.

### Task 6: Add end-to-end Repairs UAT evidence and release verification

**Files:**
- Create: `e2e/repairs/scenario-u-pm-task-level-generation.spec.ts`
- Modify only implementation/test files above if verification exposes a concrete defect.

**Interfaces:**
- Consumes: complete task-level generation slice.
- Produces: release evidence for exact branch head and a generated canonical preventive WO containing only the due Scheduled Tasks.

- [ ] **Step 1: Add UAT** that creates a task-level PM schedule with mixed TBM/UBM/CBM tasks, makes only a compatible subset due, runs the task-level generator through the authenticated automation endpoint/fixture, and verifies one canonical Repairs WO with exact Scheduled Task snapshots and hierarchy target.
- [ ] **Step 2: Re-run the same evaluation** and prove no duplicate WO/task execution is generated for the same cycle.
- [ ] **Step 3: Assert generation did not advance** `lastCompletedAt`, `nextDueDate`, or `nextDueReading`.
- [ ] **Step 4: Run focused suites**: `bunx vitest run src/__tests__/pm src/services/pm/__tests__` and the new Repairs UAT scenario.
- [ ] **Step 5: Run repository gates**: Prisma validate/generate, ESLint on changed files, `bunx tsx scripts/check-rwop-legacy-lifecycle-imports.ts`, `bunx tsc -p tsconfig.repairs.json --noEmit`, full Vitest, production build, and `git diff --check`.
- [ ] **Step 6: Apply the new migration to an isolated PostgreSQL fixture** with existing legacy and task-level schedules and prove additive safety.
- [ ] **Step 7: Open a PR and require exact-head green Lint, TypeScript/debt ratchet, Vitest, Build, Production Container, Repairs UAT, Platform E2E, and Required CI Gate before merge.**
