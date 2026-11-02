# Direct PM Auto-Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make canonical schedule-less direct PM assignments generate idempotent preventive work orders when due, without reintroducing `PmSchedule` authority.

**Architecture:** Extend the existing direct-PM bundling service with an automatic due-only entrypoint. It enumerates machines with active direct assignments, evaluates each machine once through the existing roll-up/due engine, groups only due and unblocked assignments by machine + Running/Standstill, and materializes each group through the same transactional bundle internals used by manual planning. The canonical check-due endpoint invokes this engine beside legacy-header and schedule-linked task engines.

**Tech Stack:** Next.js 16, TypeScript, Prisma 7, PostgreSQL, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-27-pm-meeting-full-migration-design.md`

## Global Constraints
- `PmScheduleTask(scheduleId = null)` remains the canonical direct PM assignment.
- Do not recreate a schedule container for direct PM.
- Running and Standstill assignments must never share a generated work order.
- Only currently due assignments auto-generate; near-due work remains planner-controlled manual bundling.
- Existing due-cycle guards and advisory locks remain authoritative for idempotency.
- Manual plant scope must restrict direct-PM discovery; trusted cron remains system-wide.
- Generation must not advance recurrence; closeout remains responsible for recurrence advancement.

## Review Focus
- Repeated/concurrent scheduler runs do not duplicate a direct PM due cycle.
- CBM evaluation occurs once per automatic run so evaluation cadence cannot suppress its own generation.
- Running and Standstill direct work are split even on the same machine.
- A direct assignment already materialized to a non-cancelled WO is skipped.
- Plant-scoped manual runs cannot generate direct PM for another plant.

---

### Task 1: Add automatic direct-PM due bundling

**Files:**
- Modify: `src/services/pm/pmBundling.service.ts`
- Modify: `src/services/pm/__tests__/pmBundling.service.test.ts`

**Interfaces:**
- Consumes: `getPmMachineRollup()`, existing direct-PM bundle compatibility/cycle guards, `materializePmScheduledTasks()`.
- Produces: `generateDueDirectPmAssignmentWorkOrders(client, input: { actorId: string; plantIds?: string[]; now?: Date }): Promise<DirectPmAutoGenerationResult>` so tests and route supply the existing Prisma client explicitly.

- [ ] **Step 1: Write failing tests** proving due direct assignments are discovered without a schedule, Running/Standstill are split, near-due assignments are excluded, blocked cycles are skipped, and plant scope is applied.
- [ ] **Step 2: Run focused bundling tests and confirm RED** because the automatic entrypoint does not exist.
- [ ] **Step 3: Refactor bundle materialization into one transaction-local helper** so manual and automatic paths share WO creation, component linkage, execution provenance, cycle-key updates and audit behavior without a second due evaluation.
- [ ] **Step 4: Implement `generateDueDirectPmAssignmentWorkOrders`** using one roll-up evaluation per machine, due-only grouping, per-machine advisory serialization, and the shared materializer.
- [ ] **Step 5: Run focused bundling/roll-up/due-engine tests GREEN.**
- [ ] **Step 6: Commit** `fix(pm): auto-generate due direct assignments`.

### Task 2: Wire direct PM into the canonical automation endpoint

**Files:**
- Modify: `src/app/api/pm-schedules/check-due/route.ts`
- Create: `src/__tests__/pm/pm-check-due-direct-generation-contract.test.ts`

**Interfaces:**
- Consumes: `generateDueDirectPmAssignmentWorkOrders()` from Task 1.
- Produces: check-due response `engines.directAssignments` and aggregate `checked/generated/skipped` totals including direct PM.

- [ ] **Step 1: Write a failing contract test** asserting the route imports/calls the direct-PM engine with the automation actor and manual plant scope, and exposes `engines.directAssignments` in aggregate results.
- [ ] **Step 2: Run the contract test and confirm RED.**
- [ ] **Step 3: Call the direct-PM engine from `check-due/route.ts`** after resolving the automation actor, using the same plant IDs as schedule-linked task generation.
- [ ] **Step 4: Include its counts/results in the response without changing legacy or schedule-linked engine behavior.**
- [ ] **Step 5: Run the contract test plus PM generation/bundling tests GREEN.**
- [ ] **Step 6: Commit** `fix(pm): run direct assignments in PM automation`.

### Task 3: Release verification

**Files:**
- Tests/docs only if a verified behavior requires correction.

**Interfaces:**
- Consumes both implementation tasks; produces a merge-ready branch.

- [ ] Run focused PM tests, `git diff --check`, changed-file ESLint, Repairs TypeScript release gate, full Vitest via GitHub CI, production build, Repairs UAT and platform E2E.
- [ ] Perform a read-only production preview proving the two current overdue direct assignments are discoverable by the new due-only grouping without creating work orders before deployment.
- [ ] Review the complete branch diff for RBAC, plant-scope, duplicate-cycle, recurrence and audit regressions.
