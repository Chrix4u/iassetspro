# PM Task-Level TBM Engine + Compatibility Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make task-level time-based maintenance (TBM) recurrence evaluable and observable per Scheduled Task while safely backfilling deterministically convertible legacy calendar schedules without enabling premature task-level work-order generation.

**Architecture:** Add an explicit schedule-level recurrence-authority discriminator so migration-created Scheduled Tasks can coexist with the still-authoritative legacy header cadence. Backfill only calendar cadences that map losslessly to task-level TBM (days/weeks/months/years), keep legacy header generation authoritative for migrated schedules, and convert authority to task-level only when a planner explicitly submits `scheduledTasks`. A focused TBM engine evaluates active authoritative Scheduled Tasks and the existing cron reports that due state, but it does not create work orders; canonical task bundling/materialization and recurrence advancement remain roadmap slice 7.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma/PostgreSQL, Vitest, Bun, existing PM cron/auth/plant-scope services.

**Spec:** `docs/superpowers/specs/2026-10-22-pm-task-level-scheduling-design.md`

## Global Constraints

- The PM Schedule is a planning container; each active Scheduled Task owns its TBM/UBM/CBM cadence.
- Server code is authoritative for recurrence state and due evaluation.
- Existing legacy no-task schedules remain functional through the legacy schedule-level compatibility path.
- Migration is additive and production-safe; do not delete or rewrite historical PM work orders or execution records.
- Task-level schedules must not enter the legacy automatic generation engine.
- Slice 4 must not implement final multi-task work-order generation/bundling or verified-close recurrence advancement; those remain roadmap slice 7.
- TBM Scheduled Tasks support calendar units `days`, `weeks`, `months`, and `years`; unsupported legacy minute/hour cadences stay on the legacy path.
- Generated/executed historical work remains immutable; this slice does not rewrite `WorkOrderTaskExecution` history.
- Implementation follows TDD: every production behavior change starts with a failing focused test.

## Review Focus

1. A migrated legacy schedule with shadow Scheduled Tasks must continue legacy auto-generation and must not be silently disabled by a title/assignment edit.
2. Explicit planner submission of `scheduledTasks` must be the cutover event: authority becomes `task`, legacy auto-generation is forced off, and legacy header due state stops acting as recurrence authority.
3. Legacy minute/hour or meter cadences that cannot map losslessly to task-level TBM must remain legacy-only rather than receiving misleading task recurrence.
4. Month/year recurrence must preserve UTC calendar semantics across end-of-month and leap-year boundaries.
5. Manual PM cron runs must expose only the caller's plant-scoped task-level TBM due rows; trusted cron may evaluate system-wide.

---

## File Map

- Create `src/services/pm/tbmScheduleTaskEngine.ts`: pure TBM calendar math plus database-backed authoritative due-task evaluation.
- Create `src/services/pm/__tests__/tbmScheduleTaskEngine.test.ts`: red/green tests for due windows, calendar math, authority, and plant scoping.
- Create `src/services/pm/legacyTbmCompatibility.service.ts`: canonical mapping/synchronization for legacy header cadence shadow rows.
- Create `src/services/pm/__tests__/legacyTbmCompatibility.service.test.ts`: mapping and shadow-sync behavior tests.
- Modify `prisma/schema.prisma`: add `PmSchedule.recurrenceAuthority` and an index supporting authority/active scans.
- Create `prisma/migrations/20261026020000_task_level_tbm_authority_backfill/migration.sql`: add authority column, mark existing #547 task-level schedules, and backfill deterministic legacy TBM shadow rows.
- Create `src/__tests__/pm/pm-task-level-tbm-migration-contract.test.ts`: migration safety/mapping contract.
- Modify `src/app/api/pm-schedules/route.ts`: persist `task` authority for new task-level schedules and `legacy_header` for legacy schedules.
- Modify `src/app/api/pm-schedules/[id]/route.ts`: distinguish legacy shadow rows from authoritative task-level rows; preserve legacy generation on ordinary edits; explicit `scheduledTasks` converts authority to task.
- Modify `src/app/api/pm-schedules/check-due-cron/route.ts`: report task-level TBM evaluation alongside legacy generation/runtime trigger results without creating a second generator.
- Modify/add focused PM API contract tests under `src/__tests__/pm/` for authority and cron delegation.

### Task 1: Recurrence Authority Contract

**Files:**
- Modify: `prisma/schema.prisma`
- Test: `src/__tests__/pm/pm-task-recurrence-authority-contract.test.ts`

**Interfaces:**
- Produces: `PmSchedule.recurrenceAuthority: string` with persisted values `legacy_header` or `task`.
- Consumes: existing `PmSchedule.tasks`, `nextDueDate`, and `autoGenerateWO` compatibility state.

- [ ] **Step 1: Write the failing schema/API contract test** asserting `recurrenceAuthority` exists on `PmSchedule`, defaults to `legacy_header`, and new task-level schedule creation explicitly writes `task`.
- [ ] **Step 2: Run** `bunx vitest run src/__tests__/pm/pm-task-recurrence-authority-contract.test.ts` and verify RED because the field/write does not yet exist.
- [ ] **Step 3: Add the Prisma field/index and POST persistence** in `prisma/schema.prisma` and `src/app/api/pm-schedules/route.ts`; keep legacy creation explicitly on `legacy_header`.
- [ ] **Step 4: Run the focused test** and existing `src/__tests__/pm/pm-scheduled-task-api-contract.test.ts`; expect PASS.
- [ ] **Step 5: Commit** `feat(pm): add recurrence authority for scheduled tasks`.

### Task 2: Deterministic Legacy TBM Compatibility Mapping

**Files:**
- Create: `src/services/pm/legacyTbmCompatibility.service.ts`
- Test: `src/services/pm/__tests__/legacyTbmCompatibility.service.test.ts`

**Interfaces:**
- Produces: `resolveLegacyHeaderTbmCadence(input): { frequencyInterval: number; frequencyUnit: 'days'|'weeks'|'months'|'years' } | null`.
- Produces: `syncLegacyTbmShadowState(tx, input): Promise<void>` for `legacy_header` schedules that already have migration-created Scheduled Tasks.
- Consumes: existing `normalizePmFrequency` semantics but rejects normalized `minutes`, `hours`, and all meter cadences for task-level TBM compatibility.

- [ ] **Step 1: Write failing mapping tests** for `daily`, `weekly`, `biweekly`, `monthly`, `quarterly`, `semiannual`, `annual/annually/yearly`, `custom/custom_days`, canonical `time_day` days/weeks/months/years, and rejection of custom-hours/minutes/hours/meter values.
- [ ] **Step 2: Run** `bunx vitest run src/services/pm/__tests__/legacyTbmCompatibility.service.test.ts`; verify RED on missing service.
- [ ] **Step 3: Implement the minimal pure mapper** and rerun to GREEN.
- [ ] **Step 4: Add failing sync tests** proving supported header edits update shadow rows' interval/unit/lead/last-completed/next-due fields, while unsupported cadence deactivates shadow rows rather than leaving stale recurrence.
- [ ] **Step 5: Implement minimal transactional shadow synchronization** and rerun focused tests to GREEN.
- [ ] **Step 6: Commit** `feat(pm): synchronize legacy TBM shadow cadence`.

### Task 3: Production-Safe Authority + TBM Backfill Migration

**Files:**
- Create: `prisma/migrations/20261026020000_task_level_tbm_authority_backfill/migration.sql`
- Test: `src/__tests__/pm/pm-task-level-tbm-migration-contract.test.ts`

**Interfaces:**
- Consumes: `PmSchedule.recurrenceAuthority` from Task 1.
- Produces: migration-created `PmScheduleTask` shadow rows only for deterministic legacy calendar schedules with active template rows linked to `PmTask` and a valid `nextDueDate`.

- [ ] **Step 1: Write the failing migration contract test** asserting: add `recurrenceAuthority` default `legacy_header`; mark pre-existing #547 task-level schedules (`tasks exist`, header `nextDueDate IS NULL`, legacy auto-generation off) as `task`; insert shadow rows only when no schedule tasks already exist; map supported calendar frequency types; use conservative `equipmentState='stopped'`; copy `leadDays`, `lastCompletedDate`, and `nextDueDate`; exclude meter/minute/hour cadences.
- [ ] **Step 2: Run** the migration contract test and verify RED because the migration file is absent.
- [ ] **Step 3: Implement the additive SQL migration** with deterministic IDs and `ON CONFLICT`/`NOT EXISTS` protection so rerun-like fixtures cannot duplicate rows.
- [ ] **Step 4: Run migration contract + PM schema contracts** and verify GREEN.
- [ ] **Step 5: Run `bunx prisma generate`** to verify schema/client consistency.
- [ ] **Step 6: Commit** `feat(pm): backfill deterministic legacy TBM tasks`.

### Task 4: Safe Planner Cutover from Legacy Header to Task Authority

**Files:**
- Modify: `src/app/api/pm-schedules/[id]/route.ts`
- Test: `src/__tests__/pm/pm-task-recurrence-authority-contract.test.ts`
- Test: `src/__tests__/pm/pm-scheduled-task-api-contract.test.ts`

**Interfaces:**
- Consumes: `recurrenceAuthority` and `syncLegacyTbmShadowState`.
- Produces: explicit conversion semantics for PUT.

- [ ] **Step 1: Add failing route contract tests** proving a `legacy_header` schedule may contain shadow tasks without being treated as authoritative task-level recurrence and an ordinary title/assignment edit does not force `autoGenerateWO=false`.
- [ ] **Step 2: Add a failing conversion test** proving PUT with explicit `scheduledTasks` sets `recurrenceAuthority='task'`, forces `autoGenerateWO=false`, clears authoritative legacy `nextDueDate`/`lastCompletedDate`, and keeps header cadence only as non-authoritative compatibility placeholders.
- [ ] **Step 3: Run focused tests** and verify RED on the old presence-of-tasks logic.
- [ ] **Step 4: Replace `existingHasScheduledTasks` authority decisions with `recurrenceAuthority`**, call shadow sync only while authority remains `legacy_header`, and perform the explicit conversion state change in the same transaction as Scheduled Task synchronization.
- [ ] **Step 5: Run both API contract suites** and verify GREEN; also run `src/services/pm/__tests__/pmScheduleTask.service.test.ts`.
- [ ] **Step 6: Commit** `fix(pm): preserve legacy cadence until explicit task cutover`.

### Task 5: Task-Level TBM Due Evaluation Engine

**Files:**
- Create: `src/services/pm/tbmScheduleTaskEngine.ts`
- Test: `src/services/pm/__tests__/tbmScheduleTaskEngine.test.ts`

**Interfaces:**
- Produces: `calculateNextTbmDueDate(fromDate: Date, interval: number, unit: TbmTimeUnit): Date`.
- Produces: `evaluateTbmDueState(input): { dueForGeneration: boolean; overdue: boolean; nextDueDate: Date; leadWindowEnd: Date }`.
- Produces: `evaluateDueTbmScheduleTasks(client, options): Promise<{ evaluated: number; due: number; overdue: number; results: TbmDueTaskResult[] }>`.
- Consumes: only active `PmScheduleTask` rows with `maintenanceMode='tbm'`, active parent schedules with `recurrenceAuthority='task'`, and caller plant scope when supplied.

- [ ] **Step 1: Write failing pure tests** for before-lead, inside-lead, exactly-due, overdue, month-end clamp, and leap-year annual recurrence.
- [ ] **Step 2: Run** `bunx vitest run src/services/pm/__tests__/tbmScheduleTaskEngine.test.ts`; verify RED.
- [ ] **Step 3: Implement minimal pure TBM math/evaluation** reusing canonical UTC calendar semantics from `src/lib/pm-frequency.ts`; rerun to GREEN.
- [ ] **Step 4: Add failing database-evaluation tests** proving inactive tasks/schedules, legacy-authority shadows, and other maintenance modes are excluded; task-authority TBM rows are evaluated independently; plant scoping is applied.
- [ ] **Step 5: Implement the database evaluator** with no work-order writes and no recurrence mutation; rerun focused tests to GREEN.
- [ ] **Step 6: Commit** `feat(pm): add task-level TBM due evaluator`.

### Task 6: Cron Observability Without a Second Generator

**Files:**
- Modify: `src/app/api/pm-schedules/check-due-cron/route.ts`
- Modify: `src/__tests__/pm/pm-cron-generation-delegation-contract.test.ts`
- Create/Modify: focused cron response test under `src/__tests__/pm/`

**Interfaces:**
- Consumes: `evaluateDueTbmScheduleTasks` from Task 5.
- Produces: `data.taskLevelTbm` in cron output with evaluated/due/overdue counts and scoped due-task details.

- [ ] **Step 1: Write failing cron tests** proving legacy WO creation still delegates only to `check-due/route.ts`, task-level TBM evaluation is read-only, and manual plant scope is passed to the evaluator.
- [ ] **Step 2: Run focused cron tests** and verify RED.
- [ ] **Step 3: Integrate the evaluator into the existing cron orchestration** after auth/scope resolution; do not call `workOrder.create`, do not advance `lastCompletedAt`/`nextDueDate`, and do not send duplicate PM-overdue notifications for task-level rows yet.
- [ ] **Step 4: Run cron contract tests and PM automation runner tests**; expect GREEN.
- [ ] **Step 5: Commit** `feat(pm): expose task-level TBM due state in automation cron`.

### Task 7: Slice-4 Verification and Review

**Files:**
- Review all files changed in Tasks 1–6.

**Interfaces:**
- Produces: release-candidate branch ready for PR/CI.

- [ ] **Step 1: Run focused PM tests**: TBM engine, compatibility service, migration contract, scheduled-task API, cron delegation, cadence authority.
- [ ] **Step 2: Run Prisma and static gates**: `bunx prisma generate`, `bun run lint`, and the repository Repairs/TypeScript release gate command used by CI.
- [ ] **Step 3: Run full authoritative unit suite**: `bun run test`; expect all test files/tests green.
- [ ] **Step 4: Run production build**: `bun run build`; expect Next production build and standalone patching to succeed.
- [ ] **Step 5: Run `git diff --check` and review the diff** specifically for accidental WO generation, recurrence mutation, plant-scope bypass, destructive migration, or legacy auto-generation disablement.
- [ ] **Step 6: Use `superpowers:requesting-code-review` and `superpowers:verification-before-completion` before opening/merging the PR.**
- [ ] **Step 7: Commit any review-only corrections as focused commits, push the feature branch, open a PR, and require the existing CI/Repairs UAT/Required CI Gate before merge.**

## Self-Review Notes

- Spec coverage: slice 4 covers task-level TBM evaluation and deterministic compatibility migration; UBM, CBM, final work-order bundling/generation, completion-driven recurrence advancement, and analytics remain explicitly deferred to slices 5–8.
- Safety gap closed: a dedicated recurrence-authority field prevents migration-created shadow tasks from silently switching a legacy schedule to the task engine.
- Type consistency: all task-level TBM units are the existing `days|weeks|months|years` set; migration intentionally excludes canonical/legacy minute and hour cadences that the Scheduled Task validator cannot represent.
- Review-focus tests are assigned across Tasks 2, 4, and 5.
- No task in this plan writes a task-level preventive WorkOrder or advances recurrence state; that boundary is deliberate and test-pinned.
