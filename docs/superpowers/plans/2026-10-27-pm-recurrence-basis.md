# PM Task Recurrence Basis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-task Fixed Schedule vs After Completion recurrence semantics for task-authority PM schedules without changing existing tasks unexpectedly.

**Architecture:** Persist a small `recurrenceBasis` discriminator on `PmScheduleTask`. Keep due evaluation and WO generation unchanged; only TBM recurrence advancement at verified planner closeout uses the new basis. Existing rows default to `after_completion`; new task-form drafts default to `fixed_schedule`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Prisma/PostgreSQL, Vitest, existing PM/Repairs closeout services.

**Spec:** `docs/superpowers/specs/2026-10-27-pm-recurrence-basis-design.md`

## Global Constraints

- Existing persisted Scheduled Tasks retain `after_completion` behavior after migration.
- New TBM task drafts default to `fixed_schedule`.
- UBM and CBM semantics remain unchanged.
- Fixed schedule advances to the first anchored cadence occurrence strictly after verified completion.
- Skipped/pending/failed executions never advance recurrence.
- The existing eight-column planning grid remains intact.

## Review Focus

1. A weekly fixed task completed one day late stays on the original weekday/time.
2. A fixed task completed several cycles late advances to the first future anchored occurrence rather than creating an immediate backlog loop.
3. Month-end fixed recurrence preserves the anchor where calendar length permits (Jan 31 -> Feb 28 -> Mar 31).
4. Existing/API-omitted recurrence basis remains `after_completion` for backward compatibility.
5. UBM/CBM closeout behavior and duplicate-cycle generation remain unchanged.

---

### Task 1: Persist and validate recurrence basis

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261027021500_pm_schedule_task_recurrence_basis/migration.sql`
- Modify: `src/services/pm/pmScheduleTask.service.ts`
- Test: `src/services/pm/__tests__/pmScheduleTask.service.test.ts`

**Interfaces:**
- Produces: `PmRecurrenceBasis = 'after_completion' | 'fixed_schedule'` and normalized `recurrenceBasis` on Scheduled Tasks.
- Database default/backfill: `after_completion`.

- [ ] Write failing normalization tests for valid bases, invalid input, and omitted-field backward compatibility.
- [ ] Run focused test and confirm RED because recurrence basis is not represented.
- [ ] Add schema column/migration and service normalization/persistence.
- [ ] Run focused test and Prisma validation/generation; expect GREEN.
- [ ] Commit.

### Task 2: Implement anchored fixed-schedule recurrence

**Files:**
- Modify: `src/lib/pm-frequency.ts`
- Modify: `src/services/pm/advancePmScheduledTaskRecurrence.service.ts`
- Test: `src/services/pm/__tests__/advancePmScheduledTaskRecurrence.service.test.ts`

**Interfaces:**
- Produces: `calculateFixedScheduleNextDueDate(anchorDueDate, completedAt, frequencyValue, frequencyUnit)`.
- Closeout consumes persisted `recurrenceBasis` for TBM only.

- [ ] Write failing tests for weekly late completion, multiple missed cycles, month-end anchor preservation, and unchanged after-completion behavior.
- [ ] Run focused recurrence tests and confirm RED.
- [ ] Implement anchored calendar calculation and TBM closeout branch; include basis in audit details.
- [ ] Run focused recurrence tests and PM frequency tests; expect GREEN.
- [ ] Commit.

### Task 3: Add planner control and safe defaults

**Files:**
- Modify: `src/lib/pm-schedule-task.ts`
- Modify: `src/components/modules/pm/PmScheduleTaskCard.tsx`
- Test: `src/__tests__/pm/pm-scheduled-task-ui-contract.test.ts`
- Test: relevant `pm-schedule-task`/schedule form contracts.

**Interfaces:**
- New task draft default: `fixed_schedule`.
- API-loaded missing basis: `after_completion`.
- Payload sends basis for TBM; UBM/CBM normalize to `after_completion` server-side.

- [ ] Write failing UI/payload contract assertions for default, edit hydration, payload, and TBM-only selector.
- [ ] Run focused UI tests and confirm RED.
- [ ] Add `recurrenceBasis` to draft mapping/payload and compact secondary selector.
- [ ] Run focused UI and schedule-form tests; expect GREEN.
- [ ] Commit.

### Task 4: Full verification and integration gate

**Files:**
- Review all changed files.

**Interfaces:**
- Produces a CI-verifiable PR based on the exact current main head.

- [ ] Run targeted PM recurrence/schedule tests, Prisma validate/generate, lint, `git diff --check`, full Vitest, and production build through authoritative CI.
- [ ] Require Repairs UAT, Platform E2E, container build, and Required CI Gate on the exact final head.
- [ ] Review the branch diff for unintended schedule/UBM/CBM changes.
- [ ] Open PR; merge only after exact-head CI is green.

## Self-Review Notes

- The change is intentionally task-level and TBM-only at runtime.
- Database default differs from new-form UI default to protect existing/integration-created rows from silent semantic changes.
- Fixed schedule skips missed past cadence points after a late completion but preserves the original anchor for the next future occurrence.
