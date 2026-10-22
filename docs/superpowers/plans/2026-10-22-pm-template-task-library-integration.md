# PM Template Task Library Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PM Templates plant-scoped ordered collections of reusable Task Masters, while preserving legacy template-task data and current PM work-order execution until the later Scheduled Task recurrence cutover.

**Architecture:** Add nullable plant ownership to `PmTemplate` and a nullable Task Master relation to `PmTemplateTask`. New template writes are plant-scoped and new template tasks must link Task Masters; legacy copied task fields remain only as compatibility data. Reads and future WO materialization resolve description/discipline from the Task Master when linked, preserve historical WO snapshots, and use association `sortOrder` for sequence without mutating immutable Task Numbers.

**Tech Stack:** Next.js App Router, React/TypeScript, Prisma 7.8/PostgreSQL, Vitest 4.1, `@dnd-kit` sortable UI, existing iAssetsPro plant-scope/RBAC/audit services.

**Spec:** `docs/superpowers/specs/2026-10-22-pm-task-level-scheduling-design.md`

## Global Constraints

- Task Master fields remain Task Number, Task Description, and Task Type/discipline; initial disciplines remain exactly Mechanical, Electrical, Plumbing, Lubrication.
- Task Number remains server-generated, immutable, and plant-scoped; template reorder must never renumber Task Masters.
- PM Template recurrence is not authoritative in this phase; task-level TBM/UBM/CBM belongs to the later Scheduled Task slice.
- New template task writes must not create hidden template-only task definitions: create/select Task Masters first, then link them.
- Migration is additive; existing `PmSchedule`, `PmTrigger`, legacy `PmTemplateTask` fields, and canonical Repairs/RWOP execution remain compatible.
- Legacy `PmTemplateTask.taskType` continues to mean execution action (`check|measure|inspect|lubricate|replace|record`) only; it must never be presented as the Task Master discipline.
- Master-linked template rows resolve current description/discipline from `PmTask`; historical `WorkOrderTaskExecution` snapshots must not be rewritten when a Task Master changes.
- New template/API writes require an explicitly selected authorized plant. Cross-plant Task Master linking is forbidden even when IDs are known.
- Existing legacy task rows are never auto-merged by description. Only deterministically scoped/categorized rows are backfilled automatically; ambiguous rows remain explicit legacy rows until converted by a user.
- Existing schedule-owned snapshot templates remain supported and hidden from normal template browsing as today.

## Slice Boundary

This plan intentionally implements the PM Template portion of the approved architecture plus the plant/provenance compatibility needed to make it safe. It does **not** introduce `PmScheduleTask`, TBM/UBM/CBM per-task recurrence, due-task bundling, or task-level analytics; those remain separate later implementation plans after this slice is live.

## Review Focus

- **Cross-plant ID injection:** a caller who knows another plant's template or Task Master ID must receive a scoped denial and create no association.
- **Ambiguous legacy ownership/type:** an unscoped template or legacy task whose discipline cannot be mapped to the four approved initial disciplines must remain legacy; migration must not guess.
- **Duplicate/re-add behavior:** linking the same Task Master twice must not create duplicates; re-adding a previously removed association should reactivate the existing association at the end of the order.
- **Master edits vs history:** editing a Task Master must change template display/future WO snapshots but must not mutate already-created `WorkOrderTaskExecution` rows.
- **Reorder identity safety:** drag/touch reorder changes only association sequence/order; stable Task Master Task Numbers and unrelated legacy identities remain unchanged.

---

### Task 1: Add plant ownership and Task Master association schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_link_pm_templates_to_task_library/migration.sql`
- Create: `src/__tests__/pm/pm-template-task-library-schema-contract.test.ts`

**Interfaces:**
- Consumes: existing `PmTask`, `PmTemplate`, `PmTemplateTask`, `PmSchedule.asset.plantId`.
- Produces: `PmTemplate.plantId: string | null`, `PmTemplate.plant`, `PmTemplateTask.pmTaskId: string | null`, `PmTemplateTask.pmTask`, and database indexes/constraints used by later tasks.

- [ ] **Step 1: Write the failing schema/migration contract test**

Assert that:
- `PmTemplate` has nullable `plantId` and a Plant relation.
- `PmTemplateTask` has nullable `pmTaskId` and a `PmTask` relation.
- `[templateId, pmTaskId]` is unique so one Task Master cannot have duplicate associations in one template; PostgreSQL null semantics still allow legacy null rows.
- migration backfills `PmTemplate.plantId` only when all existing schedules for a template resolve to exactly one distinct asset plant.
- migration leaves ambiguous/unassigned templates null.
- migration creates one Task Master per eligible legacy template row only when template plant is known and template category case-insensitively maps to one of `mechanical|electrical|plumbing|lubrication`; no description dedupe is allowed.
- migrated Task Numbers append after the existing plant-local maximum and never rewrite existing `pm_tasks.taskNumber` values.
- rows with controls/instrumentation/process/production/safety/unknown categories remain `pmTaskId IS NULL`.

- [ ] **Step 2: Run the focused test to prove RED**

Run: `bunx vitest run src/__tests__/pm/pm-template-task-library-schema-contract.test.ts`
Expected: FAIL because the relations/migration do not exist.

- [ ] **Step 3: Implement the additive Prisma schema and SQL migration**

Use nullable ownership/association columns for compatibility. The data migration must use deterministic SQL ordering (`plantId`, template identity, existing `sortOrder/taskNumber`, row id) and a plant-local existing maximum when assigning newly backfilled Task Numbers. Generate deterministic text IDs for migrated Task Masters from the legacy association ID rather than relying on a PostgreSQL extension.

- [ ] **Step 4: Validate schema and focused test**

Run: `bunx prisma validate && bunx prisma generate && bunx vitest run src/__tests__/pm/pm-template-task-library-schema-contract.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/__tests__/pm/pm-template-task-library-schema-contract.test.ts
git commit -m "feat(pm): link templates to plant task library"
```

### Task 2: Make PM Template CRUD plant-scoped and preserve legacy unassigned templates safely

**Files:**
- Modify: `src/app/api/pm-templates/route.ts`
- Modify: `src/app/api/pm-templates/[id]/route.ts`
- Create: `src/app/api/pm-templates/[id]/assign-plant/route.ts`
- Modify: `src/services/pm/scheduleTaskSnapshot.service.ts`
- Modify: `src/app/api/pm-schedules/route.ts`
- Modify: `src/app/api/pm-schedules/[id]/route.ts`
- Modify: `src/app/api/assets/ai-generate/route.ts`
- Create: `src/__tests__/pm/pm-template-plant-scope-contract.test.ts`

**Interfaces:**
- Consumes: `getPlantScope`, `getPlantFilterWhere`, `canAccessPlantStrict`, `PmTemplate.plantId` from Task 1.
- Produces: plant-safe template CRUD; explicit admin adoption for legacy `plantId=null`; `createPmScheduleTaskSnapshot(..., plantId)`.

- [ ] **Step 1: Write failing plant-boundary tests**

Cover:
- normal list returns only selected-plant templates and still excludes `schedule_snapshot` templates.
- POST requires selected plant and writes `plantId` from server scope, never request body.
- GET/PUT/DELETE deny direct cross-plant template IDs.
- legacy `plantId=null` templates are not exposed to ordinary plant-scoped users.
- only admin can assign an unowned legacy template to a plant; assignment is rejected if existing schedules resolve to another/multiple plants.
- schedule-owned snapshot templates and AI-generated templates receive the owning asset/request plant.

- [ ] **Step 2: Run focused tests to prove RED**

Run: `bunx vitest run src/__tests__/pm/pm-template-plant-scope-contract.test.ts`
Expected: FAIL on current global template access.

- [ ] **Step 3: Implement plant-scoped CRUD and explicit legacy adoption**

New templates always use the selected plant. `GET /api/pm-templates` may expose unassigned legacy templates only to admin via an explicit `includeUnassigned=true` query. `POST /api/pm-templates/[id]/assign-plant` is admin-only, audited, transaction-safe, and refuses any conflicting schedule plant evidence.

- [ ] **Step 4: Thread plant ownership through non-UI template creators**

Change `createPmScheduleTaskSnapshot` input to require `plantId`; both PM schedule create/edit callers pass the validated asset plant. AI asset generation writes `pmTemplate.plantId = plantId`.

- [ ] **Step 5: Verify**

Run: `bunx vitest run src/__tests__/pm/pm-template-plant-scope-contract.test.ts src/__tests__/pm/pm-schedule-task-list-contract.test.ts src/__tests__/pm/pm-template-checklist-security-contract.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/pm-templates src/app/api/pm-schedules src/app/api/assets/ai-generate/route.ts src/services/pm/scheduleTaskSnapshot.service.ts src/__tests__/pm/pm-template-plant-scope-contract.test.ts
git commit -m "security(pm): plant scope PM templates"
```

### Task 3: Add a canonical transaction-safe template association service

**Files:**
- Modify: `src/services/pm/pmTask.service.ts`
- Create: `src/services/pm/pmTemplateTaskAssociation.service.ts`
- Create: `src/services/pm/__tests__/pmTemplateTaskAssociation.service.test.ts`

**Interfaces:**
- Consumes: `PmTaskDraft`, `PmTask` validation, Task 1 schema.
- Produces:
  - `createPmTaskBatchInTransaction(tx, input): Promise<PmTask[]>`
  - `linkPmTasksToTemplate(input: { templateId; plantId; userId; pmTaskIds }): Promise<...>`
  - `createAndLinkPmTasks(input: { templateId; plantId; userId; rows }): Promise<...>`
  - `reorderPmTemplateTasks(input: { templateId; plantId; userId; associationIds }): Promise<...>`
  - `deactivatePmTemplateTask(input: { templateId; associationId; plantId; userId }): Promise<...>`
  - `convertLegacyPmTemplateTask(input: { templateId; associationId; plantId; userId; taskType: PmTaskType }): Promise<...>`

- [ ] **Step 1: Write failing service tests**

Pin the following behaviors:
- all Task Master IDs must exist, be active, and belong to the template's plant.
- duplicate IDs in one request are rejected before writes.
- an already-active association is not duplicated.
- re-adding an inactive association reactivates it and moves it to the final `sortOrder`.
- inline single/multi-row creation creates Task Masters and associations in one transaction using the same canonical Task validation/number lock.
- association compatibility columns copy the master description, set compatibility `taskType='check'`, set `requiredParts=null` and `estimatedMinutes=null`, allocate a stable compatibility `taskNumber` at the current template maximum + 1, and are never interpreted as Task Master discipline.
- reorder requires exactly the active association set and updates `sortOrder` only; it never changes `PmTask.taskNumber`.
- remove/deactivate preserves the Task Master.
- legacy conversion creates exactly one master in the same plant, preserves the association id/order, and links it; conversion is impossible for an unowned template.
- audit events for link/create-link/reorder/remove/legacy-convert are inside the same transaction.

- [ ] **Step 2: Run focused service tests to prove RED**

Run: `bunx vitest run src/services/pm/__tests__/pmTemplateTaskAssociation.service.test.ts`
Expected: FAIL because the service does not exist.

- [ ] **Step 3: Refactor Task Master creation for transaction reuse**

Move the current validated/advisory-lock create body into `createPmTaskBatchInTransaction(tx, input)`. Keep public `createPmTaskBatch(input)` as the existing transaction wrapper so Task Library APIs do not change behavior.

- [ ] **Step 4: Implement the association service**

Use one template-order advisory lock per transaction. Use `sortOrder` as template sequence. For a brand-new master-linked association set compatibility `taskType='check'`, `requiredParts=null`, `estimatedMinutes=null`, copy the current master description, and allocate legacy `taskNumber = MAX(template taskNumber) + 1`; reorder never changes that compatibility number. Keep these legacy columns only for current execution compatibility; they are not Task Master identity.

- [ ] **Step 5: Verify focused services**

Run: `bunx vitest run src/services/pm/__tests__/pmTask.service.test.ts src/services/pm/__tests__/pmTemplateTaskAssociation.service.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/pm/pmTask.service.ts src/services/pm/pmTemplateTaskAssociation.service.ts src/services/pm/__tests__
git commit -m "feat(pm): add canonical template task associations"
```

### Task 4: Replace template task APIs with Task Library association contracts

**Files:**
- Modify: `src/app/api/pm-templates/[id]/tasks/route.ts`
- Modify: `src/app/api/pm-templates/[id]/tasks/[taskId]/route.ts`
- Create: `src/__tests__/pm/pm-template-task-library-api-contract.test.ts`

**Interfaces:**
- Consumes: plant-safe template access from Task 2; association service from Task 3.
- Produces API contracts:
  - `POST /api/pm-templates/:id/tasks` with either `{ taskIds: string[] }` or `{ newTasks: PmTaskDraft[] }`.
  - `PUT /api/pm-templates/:id/tasks` with `{ associationIds: string[] }`.
  - `PATCH /api/pm-templates/:id/tasks/:associationId` with `{ convertLegacy: { taskType: PmTaskType } }` for explicit legacy conversion.
  - `DELETE /api/pm-templates/:id/tasks/:associationId` removes the association from future template use only.

- [ ] **Step 1: Write failing API contract/security tests**

Assert authentication, RBAC, selected plant, cross-plant Task Master rejection, duplicate rejection, row-level Task validation on `newTasks`, exact-set reorder, legacy conversion validation, and soft association removal.

- [ ] **Step 2: Run tests to prove RED**

Run: `bunx vitest run src/__tests__/pm/pm-template-task-library-api-contract.test.ts`
Expected: FAIL on old copied-description API contract.

- [ ] **Step 3: Implement the new route contracts**

Routes perform request/session/plant validation and delegate mutations to the canonical service; do not duplicate numbering/order business rules in route files. Preserve the existing last-active-task safety rule when an active PM schedule uses the template.

- [ ] **Step 4: Verify existing lifecycle contracts**

Run: `bunx vitest run src/__tests__/pm/pm-template-task-library-api-contract.test.ts src/__tests__/pm/pm-template-last-task-safety-contract.test.ts src/__tests__/pm/pm-template-reorder-audit-order-contract.test.ts src/__tests__/pm/pm-template-lifecycle-lock-contract.test.ts`
Expected: PASS after updating old assertions to the new sequence semantics.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/pm-templates/[id]/tasks src/__tests__/pm
git commit -m "feat(pm): expose template task library association APIs"
```

### Task 5: Make master data authoritative for template reads and future WO snapshots

**Files:**
- Create: `src/services/pm/resolvePmTemplateTasks.service.ts`
- Modify: `src/services/pm/materializePmTemplateTasks.service.ts`
- Modify: `src/app/api/pm-templates/[id]/route.ts`
- Modify: `src/app/api/pm-schedules/[id]/route.ts`
- Modify: `src/app/api/pm-schedules/check-due/route.ts`
- Modify: `src/services/pm/meterTriggerEngine.ts`
- Modify: `src/services/pm/conditionProductionTriggerEngine.ts`
- Create: `src/services/pm/__tests__/resolvePmTemplateTasks.service.test.ts`
- Create: `src/__tests__/pm/pm-template-master-snapshot-contract.test.ts`

**Interfaces:**
- Consumes: `PmTemplateTask` + optional `pmTask` relation.
- Produces `ResolvedPmTemplateTask = { associationId: string; templateId: string; pmTaskId: string | null; sequence: number; masterTaskNumber: number | null; description: string; discipline: PmTaskType | null; compatibilityActionType: string; requiredParts: string | null; estimatedMinutes: number | null; isLegacy: boolean; masterIsActive: boolean | null }`.

- [ ] **Step 1: Write failing resolution/snapshot tests**

Cover:
- master-linked row uses current `PmTask.description` and discipline even if compatibility description differs.
- legacy null-link row uses compatibility description/action and is marked legacy.
- sequence is derived from `sortOrder`, not Task Master number or legacy `taskNumber`.
- materialized `WorkOrderTaskExecution.taskNumber` is sequence 1..N and description is snapshotted at WO creation.
- editing the Task Master later changes future resolution but not an existing execution snapshot.
- generator comments identify the stable master Task Number when available and clearly fall back for legacy rows.

- [ ] **Step 2: Run tests to prove RED**

Run: `bunx vitest run src/services/pm/__tests__/resolvePmTemplateTasks.service.test.ts src/__tests__/pm/pm-template-master-snapshot-contract.test.ts`
Expected: FAIL because reads/generators still trust copied template fields/taskNumber.

- [ ] **Step 3: Implement canonical resolution and materialization**

All template task queries that feed future WOs include `pmTask` and order by `sortOrder`, then compatibility `taskNumber/id` as deterministic tie-breakers. `materializePmTemplateTasks` writes snapshots only; it never updates historical rows on master edits.

- [ ] **Step 4: Update PM generators/read paths**

Use the resolved task projection in calendar due generation, meter trigger generation, condition/production trigger generation, and schedule/template detail responses. Keep legacy schedule-owned snapshot templates working without a master link.

- [ ] **Step 5: Verify PM generation regression**

Run: `bunx vitest run src/services/pm/__tests__/resolvePmTemplateTasks.service.test.ts src/__tests__/pm/pm-template-master-snapshot-contract.test.ts src/__tests__/pm/pm-due-generation-reliability-contract.test.ts src/__tests__/pm/pm-meter-generation-reliability-contract.test.ts src/__tests__/pm/pm-signal-trigger-runtime-contract.test.ts src/__tests__/pm/pm-workorder-checklist-load-contract.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/pm src/app/api/pm-templates/[id]/route.ts src/app/api/pm-schedules src/__tests__/pm
git commit -m "refactor(pm): resolve template tasks from task masters"
```

### Task 6: Replace the template task builder with select/create/reorder Task Library UX

**Files:**
- Create: `src/components/modules/pm/PmTemplateTaskPickerDialog.tsx`
- Create: `src/components/modules/pm/PmTemplateTaskList.tsx`
- Modify: `src/components/modules/pm/PmTaskFormDialog.tsx`
- Modify: `src/components/modules/pm/PmTaskBulkDialog.tsx`
- Modify: `src/components/modules/MaintenancePages.tsx`
- Create: `src/__tests__/pm/pm-template-task-library-ui-contract.test.ts`

**Interfaces:**
- Consumes: Task Library GET, Task 4 association endpoints, `ResolvedPmTemplateTask` response shape.
- Produces: searchable multi-select picker, inline Add New Task, inline Add Multiple Tasks, touch/mouse reorder, legacy conversion affordance.

- [ ] **Step 1: Write failing UI contracts**

Assert the template editor exposes:
- **Select Existing Tasks** with search by Task Number/description and Task Type filter.
- multi-select existing active Task Masters from current plant only.
- **Add New Task** and **Add Multiple Tasks** using the existing Task Library dialogs, then linking returned created IDs.
- task rows show stable `Task #`, Task Description, discipline badge, association sequence, and legacy warning where applicable.
- reorder uses `@dnd-kit` pointer + touch/keyboard sensors and submits association ids; it never edits Task Numbers.
- remove wording says “Remove from Template,” not delete from Task Library.
- legacy row offers explicit “Add to Task Library” conversion with one of the four approved disciplines.

- [ ] **Step 2: Run UI contract to prove RED**

Run: `bunx vitest run src/__tests__/pm/pm-template-task-library-ui-contract.test.ts`
Expected: FAIL on the current copied-description checklist builder.

- [ ] **Step 3: Make Task Library dialogs return created records**

Change `PmTaskFormDialog.onSaved` to receive the saved Task Master. Change `PmTaskBulkDialog.onSaved` to receive the created Task Masters (the bulk API already returns them). Existing Task Library callers may ignore the argument.

- [ ] **Step 4: Implement picker/list components and integrate them into PM Templates**

Move task-list interaction out of the large `MaintenancePages.tsx` section. Keep template metadata editing intact. Use responsive dialogs/cards so mobile users can search, select, reorder, convert, and remove without horizontal overflow.

- [ ] **Step 5: Verify UI contracts and TypeScript**

Run: `bunx vitest run src/__tests__/pm/pm-template-task-library-ui-contract.test.ts src/__tests__/pm/pm-task-library-ui-contract.test.ts && bunx tsc -p tsconfig.repairs.json --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/modules/pm src/components/modules/MaintenancePages.tsx src/__tests__/pm
git commit -m "feat(pm): build templates from task library"
```

### Task 7: Run migration/backward-compatibility and release gates

**Files:**
- Modify only if verification exposes a concrete defect in files already owned by Tasks 1–6.

**Interfaces:**
- Consumes: complete branch.
- Produces: release evidence that the additive migration and legacy PM execution paths remain safe.

- [ ] **Step 1: Run focused PM/template suites**

Run:
```bash
bunx vitest run \
  src/lib/__tests__/pm-task.test.ts \
  src/services/pm/__tests__/pmTask.service.test.ts \
  src/services/pm/__tests__/pmTemplateTaskAssociation.service.test.ts \
  src/services/pm/__tests__/resolvePmTemplateTasks.service.test.ts \
  src/__tests__/pm/pm-template-task-library-schema-contract.test.ts \
  src/__tests__/pm/pm-template-plant-scope-contract.test.ts \
  src/__tests__/pm/pm-template-task-library-api-contract.test.ts \
  src/__tests__/pm/pm-template-master-snapshot-contract.test.ts \
  src/__tests__/pm/pm-template-task-library-ui-contract.test.ts
```
Expected: PASS.

- [ ] **Step 2: Run existing PM compatibility suite**

Run: `bunx vitest run src/__tests__/pm`
Expected: all existing PM schedule/template/trigger/checklist tests PASS after intentional contract updates.

- [ ] **Step 3: Run schema, lint, lifecycle and TypeScript gates**

Run:
```bash
bunx prisma validate
bunx prisma generate
bunx eslint \
  src/app/api/pm-templates \
  src/app/api/pm-schedules \
  src/services/pm \
  src/components/modules/pm \
  src/components/modules/MaintenancePages.tsx \
  src/__tests__/pm
bunx tsx scripts/check-rwop-legacy-lifecycle-imports.ts
bunx tsc -p tsconfig.repairs.json --noEmit
```
Expected: PASS.

- [ ] **Step 4: Run full repository regression and production build**

Run:
```bash
bunx vitest run
bun run build
git diff --check
```
Expected: PASS; no new touched-file TypeScript debt.

- [ ] **Step 5: Validate the migration against an isolated PostgreSQL database**

Apply all migrations to a clean test database and then a representative copy/fixture containing:
- existing Task Masters with nonzero Task Numbers,
- one single-plant Mechanical/Electrical/Lubrication/Plumbing legacy template,
- one ambiguous/unassigned template,
- one noncanonical discipline/category template,
- one schedule-owned snapshot template.

Assert existing Task Numbers are unchanged, deterministic eligible rows append new Task Numbers, ambiguous rows remain null-linked, and no schedule/work-order history is deleted or rewritten.

- [ ] **Step 6: Commit any verification-only fixes, then open PR**

Normal PR CI remains authoritative. Do not merge until the exact PR head has green Lint, Unit Tests, Repairs TypeScript gate, Build, Production Container Build, Repairs UAT, E2E, and Required CI Gate.
