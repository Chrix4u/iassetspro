# Functional Location Phase 3C Maintenance Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze the functional location of a maintenance event when its Maintenance Request or Work Order is created so later asset relocation or hierarchy edits cannot rewrite historical maintenance evidence.

**Architecture:** Add denormalized, queryable snapshot columns to Maintenance Request and Work Order rather than creating a second Functional Location relationship. Snapshot builders consume the existing Phase 3B live projection, creation flows persist the snapshot, MR→WO conversion inherits the MR snapshot, and reports/search/print surfaces prefer the frozen snapshot with live-location fallback only for pre-Phase-3C rows.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/PostgreSQL, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-configurable-functional-location-hierarchy-design.md`

## Global Constraints

- The asset's current primary Functional Location remains the authoritative live relationship; snapshot fields never become an assignment relationship.
- Historical snapshot fields are immutable after MR/WO creation and are never rewritten by asset relocation or hierarchy edits.
- Preserve legacy location fields and all pre-Phase-3C records; null snapshots must fall back to the Phase 3B live/legacy projection without fabricating historical truth.
- MR→WO conversion inherits the MR snapshot when one exists; it must not silently replace the reported location with the asset's later location.
- PM schedules remain live planning records; auto-generated PM Work Orders snapshot location at WO generation time.
- Functional-location filtering/search must remain intersected with RBAC and plant scope and must not widen access.
- Historical descendant filtering uses frozen snapshot location IDs for snapshotted rows and current assignment fallback only for unsnapshotted rows.

## Review Focus

- An asset relocated after MR creation must leave the MR snapshot unchanged and the converted WO must inherit it.
- Direct WO and PM-generated WO creation must capture the current primary location exactly once without adding N+1 location lookups.
- Legacy/pre-Phase-3C rows with null snapshot columns must still render and report successfully.
- Search by an old Location Code/path must find snapshotted historical work without escaping existing role/plant filters.
- A hierarchy-node report filter must match snapshotted descendant WOs even when the asset is currently installed elsewhere.

---

### Task 1: Snapshot schema and shared snapshot resolver

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261015213000_maintenance_functional_location_snapshots/migration.sql`
- Create: `src/lib/functional-location/maintenance-snapshot.ts`
- Modify: `src/lib/functional-location/live-location.ts`
- Test: `src/__tests__/functional-locations/maintenance-location-snapshot.test.ts`

**Interfaces:**
- Produces: `MaintenanceLocationSnapshotFields`, `buildMaintenanceLocationSnapshot(projection)`, `getMaintenanceLocationSnapshot(record, liveFallback)`, and `getFunctionalLocationSubtreeIds(functionalLocationId)`.
- Snapshot columns on both `MaintenanceRequest` and `WorkOrder`: `functionalLocationIdSnapshot`, `functionalLocationNameSnapshot`, `functionalLocationCodeSnapshot`, `functionalLocationPathSnapshot`, `functionalLocationPathCodeSnapshot`, `functionalLocationSourceSnapshot`.

- [ ] **Step 1: Write failing snapshot tests** proving structured and legacy projection conversion, snapshot-first read resolution, null fallback, and subtree IDs scoped to one primary hierarchy system.
- [ ] **Step 2: Run the test and verify RED** because the snapshot helper and subtree-ID interface do not exist.
- [ ] **Step 3: Add the six nullable snapshot columns to MR/WO schema and additive SQL migration.**
- [ ] **Step 4: Implement the pure snapshot helpers and expose subtree location IDs from the existing live-location resolver without changing current assignment semantics.**
- [ ] **Step 5: Generate Prisma client and run the snapshot tests to GREEN.**
- [ ] **Step 6: Commit the snapshot contract.**

### Task 2: Capture snapshots in every canonical MR/WO creation path

**Files:**
- Modify: `src/app/api/maintenance-requests/route.ts`
- Modify: `src/app/api/work-orders/route.ts`
- Modify: `src/services/repairPlanning.service.ts`
- Modify: `src/app/api/pm-schedules/check-due/route.ts`
- Test: `src/__tests__/functional-locations/maintenance-location-snapshot-write.behavior.test.ts`

**Interfaces:**
- Consumes: Task 1 `buildMaintenanceLocationSnapshot()` and existing `getAssetLiveLocationMap()`.
- Produces: persisted snapshot columns at MR creation, direct WO creation, MR→WO conversion, and PM-generated WO creation.

- [ ] **Step 1: Write failing write-path behavior tests** asserting all four canonical creation paths persist snapshot fields.
- [ ] **Step 2: Add failing inheritance tests** proving MR→WO conversion copies the MR snapshot even when live location differs, and only falls back to current live projection for old MRs with no snapshot.
- [ ] **Step 3: Run tests and verify RED.**
- [ ] **Step 4: Capture and persist the MR snapshot and direct-WO snapshot.**
- [ ] **Step 5: Update canonical conversion to inherit MR snapshot with legacy-row live fallback.**
- [ ] **Step 6: Batch-resolve due-schedule asset locations once, then persist snapshots on PM-generated WOs without per-schedule location queries.**
- [ ] **Step 7: Run write-path tests to GREEN and commit.**

### Task 3: Historical search, reports, exports and document outputs

**Files:**
- Modify: `src/app/api/maintenance-requests/route.ts`
- Modify: `src/app/api/work-orders/route.ts`
- Modify: `src/app/api/reports/maintenance/route.ts`
- Modify: `src/app/api/work-orders/reports/route.ts`
- Modify: `src/app/api/reports/maintenance/export/route.ts`
- Modify: `src/app/api/work-orders/[id]/print/route.ts`
- Modify: `src/app/api/work-orders/[id]/closed-pack/route.ts`
- Modify: `src/lib/generate-wo-detail-pdf.ts`
- Modify: `src/lib/generate-closed-wo-pack.ts`
- Test: `src/__tests__/functional-locations/maintenance-location-snapshot-reporting.behavior.test.ts`

**Interfaces:**
- Consumes: Task 1 snapshot resolver and subtree IDs.
- Produces: snapshot-first Location Code/path in historical reports/exports/print packs; old-code/path search; historical subtree filtering with null-snapshot live fallback.

- [ ] **Step 1: Write failing report/search tests** for snapshot preference, old-location search, and descendant filtering after relocation.
- [ ] **Step 2: Run and verify RED.**
- [ ] **Step 3: Make MR/WO search include snapshot name/code/path while keeping Phase 3B live asset-ID search as an additional OR inside existing scope.**
- [ ] **Step 4: Make maintenance and WO reports resolve snapshot first and apply descendant filters as `(snapshotLocationId in subtree) OR (snapshotLocationId is null AND currentAssetId in subtree)`.**
- [ ] **Step 5: Keep CSV/XLSX export columns unchanged in shape but source Location Code/Asset Path from snapshot-first report data.**
- [ ] **Step 6: Add snapshot-first maintenance-location data to WO print and Closed WO Pack PDF output, with legacy/live fallback for old rows.**
- [ ] **Step 7: Run reporting tests to GREEN and commit.**

### Task 4: Maintenance UI differentiation and regression verification

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/components/modules/MaintenancePages.tsx`
- Test: `src/__tests__/functional-location/maintenance-location-snapshot-ui.contract.test.ts`

**Interfaces:**
- Consumes: snapshot fields already returned by MR/WO APIs plus Phase 3B `asset.functionalLocation` live projection.
- Produces: clear `Maintenance location` (frozen) and `Current asset location` display when they differ; no duplicate label when they are identical or snapshot is absent.

- [ ] **Step 1: Write failing UI contract tests** for frozen-vs-current labels and null-snapshot fallback.
- [ ] **Step 2: Run and verify RED.**
- [ ] **Step 3: Add shared types/display helper usage and render historical location only where it materially differs from current live location.**
- [ ] **Step 4: Run UI tests to GREEN.**
- [ ] **Step 5: Run all Functional Location tests, Repairs TypeScript release gate, ESLint on changed paths, `git diff --check`, and the full Vitest suite.**
- [ ] **Step 6: Review the complete diff for snapshot mutation, N+1 queries, RBAC/plant-scope widening, migration safety and report/export consistency; commit verification fixes only if tests expose them.**
- [ ] **Step 7: Push the feature branch and open a PR; merge only after Required CI Gate, Repairs UAT and platform E2E pass.**
