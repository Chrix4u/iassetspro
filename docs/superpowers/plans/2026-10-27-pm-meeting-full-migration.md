# PM Meeting Full Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make direct part-level PM assignments, first-class asset meters, machine roll-up and Running/Standstill bundling the production PM model while preserving existing data.

**Architecture:** Evolve `PmScheduleTask` into the canonical direct PM assignment, keep `PmSchedule` as nullable legacy provenance, add `AssetMeter`, and reuse the existing functional-location and component-registry trees. Cut over additively with backfill and compatibility fallbacks.

**Tech Stack:** Next.js 16, React 19, TypeScript, Prisma 7, PostgreSQL, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-27-pm-meeting-full-migration-design.md`

## Global Constraints
- Placement hierarchy and technical machine hierarchy remain separate.
- Functional-location levels remain company-configurable; no hard-coded System/District depth.
- PM task attaches to exact coded maintainable node; no schedule name is required in new authoring.
- PM Type values: tbm, ubm, cbm, fbm.
- Activity Mode values: inspection, lubrication, servicing, replacement.
- Inspection Type values exposed to users: Running, Standstill.
- Meter unit comes from the assigned asset meter.
- Migration is additive first; no destructive removal in this release.

## Review Focus
- Legacy `stopped` values normalize safely to `standstill` without breaking old rows.
- Existing schedule-linked PM tasks still generate work orders during cutover.
- Component target must belong to the selected machine/asset and plant scope.
- Meter assignment must belong to the target asset; stale or cross-asset meter IDs are rejected.
- Bundling must never combine Running and Standstill tasks or tasks from different machines.

---

### Task 1: Canonical direct-PM domain and schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/pm-assignment.ts`
- Test: `src/__tests__/pm/pm-direct-assignment-schema-contract.test.ts`
- Test: `src/lib/__tests__/pm-assignment.test.ts`

**Interfaces:**
- Produces `normalizePmInspectionType`, PM type/activity/basis constants and direct-assignment schema fields used by later tasks.

- [ ] Write failing schema/type tests for nullable legacy `scheduleId`, direct `assetId`/`componentId`, `pmType`, `activityMode`, `basis`, `assetMeterId`, and Running/Standstill normalization.
- [ ] Run focused tests and confirm RED.
- [ ] Add additive Prisma fields/relations and canonical PM helper types.
- [ ] Generate Prisma client and run focused tests GREEN.
- [ ] Commit.

### Task 2: First-class asset meters

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/app/api/assets/[id]/meters/route.ts`
- Create: `src/app/api/assets/[id]/meters/[meterId]/route.ts`
- Create: `src/services/assets/assetMeter.service.ts`
- Test: `src/__tests__/assets/asset-meter-api-contract.test.ts`
- Test: `src/services/assets/__tests__/assetMeter.service.test.ts`

**Interfaces:**
- Produces `AssetMeter` records with stable ID/name/unit/current reading and asset ownership.
- Consumed by Tasks 3-6 through `assetMeterId`.

- [ ] Write failing API/service tests for create/list/update reading, duplicate name+unit, and cross-asset rejection.
- [ ] Confirm RED.
- [ ] Implement model, service and scoped APIs; `MeterReading.assetMeterId` remains optional for legacy rows.
- [ ] Run focused tests GREEN and Prisma validation.
- [ ] Commit.

### Task 3: Direct PM assignment service and APIs

**Files:**
- Create: `src/services/pm/pmAssignment.service.ts`
- Create: `src/app/api/pm-assignments/route.ts`
- Create: `src/app/api/pm-assignments/[id]/route.ts`
- Modify: `src/services/pm/pmScheduledTaskDueEngine.ts`
- Modify: `src/services/pm/advancePmScheduledTaskRecurrence.service.ts`
- Test: `src/services/pm/__tests__/pmAssignment.service.test.ts`
- Test: `src/__tests__/pm/pm-direct-assignment-api-contract.test.ts`

**Interfaces:**
- Consumes canonical fields from Task 1 and AssetMeter from Task 2.
- Produces direct assignment CRUD and due evaluation independent of PmSchedule headers.

- [ ] Write failing tests for whole-machine and component-targeted assignments, target ownership, calendar/meter planning, FBM acceptance, and Standstill normalization.
- [ ] Confirm RED.
- [ ] Implement direct CRUD and due/recurrence fallbacks using direct target first, legacy schedule second.
- [ ] Run focused tests GREEN.
- [ ] Commit.

### Task 4: Migration/backfill with compatibility

**Files:**
- Create: `scripts/migrate-pm-direct-assignments.ts`
- Create: `src/services/pm/pmMigration.service.ts`
- Test: `src/services/pm/__tests__/pmMigration.service.test.ts`
- Modify: `src/app/api/pm-schedules/route.ts`
- Modify: `src/app/api/pm-schedules/[id]/route.ts`

**Interfaces:**
- Produces idempotent backfill for AssetMeter and direct PM fields while preserving schedule provenance.

- [ ] Write failing idempotency/backfill tests including meter reconstruction and `stopped`→`standstill`.
- [ ] Confirm RED.
- [ ] Implement transaction-safe backfill and compatibility reads.
- [ ] Run focused tests GREEN twice to prove idempotency.
- [ ] Commit.

### Task 5: Asset meter assignment and direct part-level PM authoring UI

**Files:**
- Create: `src/components/assets/AssetMetersPanel.tsx`
- Create: `src/components/modules/pm/PmAssignmentFormDialog.tsx`
- Create: `src/components/modules/pm/PmTargetTreePicker.tsx`
- Modify: `src/components/modules/MaintenancePages.tsx`
- Modify: `src/components/modules/pm/PmScheduleTaskCard.tsx`
- Test: `src/__tests__/pm/pm-direct-authoring-ui-contract.test.ts`
- Test: `src/__tests__/assets/asset-meter-ui-contract.test.ts`

**Interfaces:**
- Consumes direct PM and meter APIs.
- Produces authoring without schedule title and meter assignment from asset context.

- [ ] Write failing UI contract tests for Location Path + Technical Path, exact maintainable-node selection, `Value` label, calendar control, Running/Standstill, Activity Mode, and Add Meter flow.
- [ ] Confirm RED.
- [ ] Implement UI and replace `Value / Interval` with `Value`; show calendar date picker.
- [ ] Run focused tests GREEN.
- [ ] Commit.

### Task 6: Machine PM roll-up and shutdown bundling

**Files:**
- Create: `src/services/pm/pmMachineRollup.service.ts`
- Create: `src/services/pm/pmBundling.service.ts`
- Create: `src/app/api/pm-assignments/rollup/route.ts`
- Create: `src/app/api/pm-assignments/bundle/route.ts`
- Create: `src/components/modules/pm/PmMachineRollupPanel.tsx`
- Test: `src/services/pm/__tests__/pmMachineRollup.service.test.ts`
- Test: `src/services/pm/__tests__/pmBundling.service.test.ts`
- Test: `src/__tests__/pm/pm-machine-rollup-ui-contract.test.ts`

**Interfaces:**
- Consumes direct assignments and component ancestry.
- Produces due/near-due machine view and compatible WO bundles.

- [ ] Write failing tests for descendant roll-up, component path, planning window, machine boundary, and Running/Standstill separation.
- [ ] Confirm RED.
- [ ] Implement roll-up and deterministic bundling; reuse canonical WO generation path.
- [ ] Run focused tests GREEN.
- [ ] Commit.

### Task 7: Cutover verification

**Files:**
- Modify tests/docs only as required by verified behavior.

**Interfaces:**
- Consumes all prior tasks; produces release candidate.

- [ ] Run Prisma validate/generate.
- [ ] Run TypeScript, PM/asset focused tests, then full Vitest suite.
- [ ] Run lint and production build.
- [ ] Run Repairs UAT and platform Playwright suites.
- [ ] Review diff for data-loss, RBAC and provenance regressions.
- [ ] Commit any test-only corrections and prepare PR.
