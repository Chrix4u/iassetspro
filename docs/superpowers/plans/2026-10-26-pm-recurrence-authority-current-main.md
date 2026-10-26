# PM Recurrence Authority Compatibility Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make explicit PM recurrence authority the sole discriminator between legacy header-cadence schedules and task-level schedules, so deterministic compatibility shadow tasks can be backfilled without switching engines or corrupting recurrence.

**Architecture:** Add `PmSchedule.recurrenceAuthority` with persisted values `legacy_header` and `task`. Existing task-authored schedules are classified from their pre-migration state, legacy calendar schedules may receive non-authoritative Scheduled Task shadows, and every generation/edit/closeout decision keys off authority rather than task-row presence. Keep the current TBM/UBM/CBM due engine, task-level generator, and verified Repairs closeout implementation; this repair only gives those systems an explicit authority boundary.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma/PostgreSQL, Vitest, Bun, existing PM/Repairs services.

**Spec:** `docs/superpowers/specs/2026-10-22-pm-task-level-scheduling-design.md`

## Global Constraints

- PM Schedule remains a planning container; authoritative recurrence belongs either to the legacy header compatibility path or to Scheduled Tasks, never both.
- Existing task-level TBM/UBM/CBM generation and verified-close recurrence behavior from merged PRs #549/#550 must remain unchanged except for authority filtering.
- Legacy schedules must keep generating through the header-cadence path even when compatibility shadow Scheduled Tasks exist.
- A planner explicitly submitting `scheduledTasks` is the cutover event from `legacy_header` to `task`.
- Migration is additive and must not rewrite historical Work Orders or WorkOrderTaskExecution rows.
- Deterministic compatibility backfill supports legacy calendar units that map losslessly to task TBM: days, weeks, months, years; minute/hour/meter schedules remain legacy-only.
- Task-level schedules created before this migration may now have `autoGenerateWO=true`; migration classification must not depend on `autoGenerateWO=false`.
- Manual automation remains plant-scoped and trusted cron remains system-wide.

## Review Focus

1. A legacy schedule with newly backfilled shadow tasks still reaches only the legacy header generator.
2. A pre-migration task-level schedule with `autoGenerateWO=true`, task rows, and null header due date is classified as `task`.
3. Ordinary edits to a legacy schedule containing shadows do not cut it over to task authority; explicit `scheduledTasks` submission does.
4. Task-level recurrence advancement at planner closeout never mutates a legacy-authority schedule merely because provenance/shadow task rows exist.
5. Corrupt/empty task-authority schedules fail closed rather than falling back to legacy header generation.

---

### Task 1: Prove the missing authority boundary

**Files:**
- Create: `src/__tests__/pm/pm-recurrence-authority-current-main-contract.test.ts`
- Modify later: `src/__tests__/pm/pm-task-level-generation-api-contract.test.ts`

**Interfaces:**
- Consumes current schema/routes/generation service as source text.
- Produces RED contracts for the exact authority field and engine filters.

- [ ] **Step 1: Write failing contract tests** asserting the Prisma field/index, POST/PUT authority writes, task-generator `task` filter, and legacy-generator `legacy_header` filter with no `tasks: { none: {} }` discriminator.
- [ ] **Step 2: Open a draft PR and run CI**; verify the new unit contract fails for the missing production behavior while lint/type gates remain healthy.
- [ ] **Step 3: Record the RED CI run in the PR body before implementing.**

### Task 2: Add additive authority schema and safe compatibility migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261026173000_pm_recurrence_authority_compatibility/migration.sql`
- Test: `src/__tests__/pm/pm-recurrence-authority-current-main-contract.test.ts`

**Interfaces:**
- Produces: `PmSchedule.recurrenceAuthority: 'legacy_header' | 'task'` persisted as text.
- Produces deterministic legacy TBM shadow rows without changing authority.

- [ ] **Step 1: Extend the failing contract** to assert migration order: add authority; classify pre-existing task schedules where header `nextDueDate IS NULL` and Scheduled Tasks already exist regardless of `autoGenerateWO`; then backfill only legacy-authority deterministic calendar schedules.
- [ ] **Step 2: Implement the Prisma field/index and additive SQL migration.**
- [ ] **Step 3: Run focused contract + Prisma validation/generation; expect GREEN for schema/migration assertions.**
- [ ] **Step 4: Commit the schema/migration slice.**

### Task 3: Make authority the generation discriminator

**Files:**
- Modify: `src/services/pm/pmScheduledTaskGeneration.service.ts`
- Modify: `src/app/api/pm-schedules/check-due/route.ts`
- Modify: `src/__tests__/pm/pm-task-level-generation-api-contract.test.ts`
- Test: `src/__tests__/pm/pm-recurrence-authority-current-main-contract.test.ts`

**Interfaces:**
- Task generator consumes only `recurrenceAuthority='task'` schedules.
- Legacy generator consumes only `recurrenceAuthority='legacy_header'` schedules, regardless of shadow task rows.

- [ ] **Step 1: Keep the new contract RED until both generator queries use authority explicitly.**
- [ ] **Step 2: Add the task authority filter to candidate discovery and in-transaction recheck.**
- [ ] **Step 3: Replace legacy `tasks: { none: {} }` selection with `recurrenceAuthority: 'legacy_header'`.**
- [ ] **Step 4: Update the older generation API contract to pin the new semantics.**
- [ ] **Step 5: Run focused due/generation/API tests and commit.**

### Task 4: Make explicit planner submission the only cutover

**Files:**
- Modify: `src/app/api/pm-schedules/route.ts`
- Modify: `src/app/api/pm-schedules/[id]/route.ts`
- Modify: `src/components/modules/MaintenancePages.tsx` only where UI currently infers task authority from row presence.
- Test: existing PM scheduled-task API/UI contracts plus the new authority contract.

**Interfaces:**
- POST with `scheduledTasks` writes `recurrenceAuthority='task'`; legacy POST writes `legacy_header`.
- PUT reads existing authority, not `existing.tasks.length`; explicit `scheduledTasks` atomically switches to `task` and clears authoritative header recurrence state.

- [ ] **Step 1: Add/adjust failing API/UI assertions for legacy-with-shadows and explicit cutover.**
- [ ] **Step 2: Replace task-presence authority inference in PUT and UI with `recurrenceAuthority`.**
- [ ] **Step 3: On explicit cutover, persist `task`, retire obsolete legacy trigger state, and keep Scheduled Task synchronization in the same transaction.**
- [ ] **Step 4: Run scheduled-task API/UI/targeting tests and commit.**

### Task 5: Protect verified-close recurrence ownership

**Files:**
- Modify if needed: `src/services/pm/advancePmScheduledTaskRecurrence.service.ts`
- Modify if needed: `src/services/workOrderClosure.service.ts`
- Test: `src/services/pm/__tests__/advancePmScheduledTaskRecurrence.service.test.ts`
- Test: `src/services/__tests__/workOrderClosure.service.test.ts`

**Interfaces:**
- Task-level closeout advancement is allowed only when the parent schedule is `task` authority.
- Legacy-authority closeout continues using the established schedule-header cadence path.

- [ ] **Step 1: Add a failing regression proving a legacy-authority schedule with task provenance/shadows cannot advance task recurrence.**
- [ ] **Step 2: Add the minimal authority guard at the canonical closeout boundary.**
- [ ] **Step 3: Run closeout/recurrence tests and commit.**

### Task 6: Verify, replace stale PR #548, and integrate

**Files:**
- Review all changed files.

**Interfaces:**
- Produces a current-main replacement for stale PR #548.

- [ ] **Step 1: Run focused PM authority, migration, generation, schedule API/UI, and closeout suites.**
- [ ] **Step 2: Run Prisma validate/generate, lint, canonical RWOP guard, Repairs TypeScript hard gate/debt ratchet, full Vitest, production build, and diff check through authoritative CI.**
- [ ] **Step 3: Require Repairs UAT, Platform E2E, production container build, and Required CI Gate on the exact final head.**
- [ ] **Step 4: Merge only the exact CI-verified head into `main`.**
- [ ] **Step 5: Close PR #548 as superseded by the current-main authority repair.**
- [ ] **Step 6: Re-run mainline CI; deployment remains blocked until the main release gate is green.**

## Self-Review Notes

- Spec coverage: this plan implements the migration/cutover safety boundary needed before later PM analytics/legacy retirement; it deliberately does not redesign the already-merged TBM/UBM/CBM engines.
- Type consistency: `recurrenceAuthority` is the single persisted discriminator everywhere; task-row presence becomes data, not authority.
- Review focus is pinned across migration, generation, edit, and closeout tests.
- The migration classification intentionally ignores `autoGenerateWO` because PR #550 enabled public task-level auto-generation before this migration exists.
- No production deployment is part of this branch; only CI-verified integration is allowed.
