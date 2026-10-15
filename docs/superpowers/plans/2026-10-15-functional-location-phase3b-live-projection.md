# Functional Location Phase 3B Live Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the asset's current primary Functional Location/Location Code the live location shown and searched across Maintenance Requests, Work Orders, PM, maintenance reporting and exports, while preserving legacy location fields as fallback and enabling descendant roll-up filtering.

**Architecture:** Add one batch-oriented functional-location projection service that resolves current primary assignments and constructs coded breadcrumbs without creating new MR/WO/PM location relationships. API routes enrich their existing asset payloads from that service; search and report filters translate location code/name/path or a selected hierarchy node into asset IDs and then combine those filters with existing role and plant restrictions using AND semantics.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/PostgreSQL, Vitest, React.

**Spec:** `docs/superpowers/specs/2026-10-12-configurable-functional-location-hierarchy-design.md`

## Global Constraints

- The asset's current primary functional-location assignment is the authoritative live location relationship.
- Maintenance Request, Work Order and PM must not create a second competing functional-location relationship.
- Structured location is preferred; legacy `location`, `building`, `floor`, `area`, Plant and Department remain migration inputs/fallbacks and are not deleted.
- Server-side RBAC and plant scope remain authoritative; location search/filtering must never widen an existing user/role/plant scope.
- Resolve location projections in batches; do not introduce per-row/N+1 database queries.
- Location Code and coded breadcrumb must be available to UI/report/export consumers.
- Selecting a hierarchy node for reports includes assets currently installed at that node or any descendant.
- No schema migration is required in this slice; historical immutable maintenance snapshots are a later additive phase.

## Review Focus

- A secondary hierarchy assignment must never replace the current primary live location.
- Ended assignments must never appear as current live location.
- Missing/legacy-only assets must still display a useful fallback without errors.
- Search by Location Code/path must remain intersected with existing view-own/technician and plant restrictions.
- Descendant report filtering must stay inside the selected hierarchy system and plant scope.

---

### Task 1: Shared live-location projection and descendant/search resolver

**Files:**
- Create: `src/lib/functional-location/live-location.ts`
- Test: `src/__tests__/functional-locations/live-location-projection.test.ts`

**Interfaces:**
- Produces: `AssetLiveLocationProjection`, `getAssetLiveLocationMap(assetIds: string[])`, `findAssetIdsByLiveLocationSearch(search: string)`, `getAssetIdsInFunctionalLocationSubtree(functionalLocationId: string)`.
- `AssetLiveLocationProjection` exposes `id`, `name`, `locationCode`, `path`, `pathCode`, and `source: 'structured' | 'legacy'` plus legacy fallback text when no structured assignment exists.

- [ ] **Step 1: Write failing projection tests** for primary-vs-secondary selection, ended-assignment exclusion, coded breadcrumb order, deduplicated asset IDs, and legacy fallback.
- [ ] **Step 2: Run the new test file and verify RED** because `live-location.ts` does not exist.
- [ ] **Step 3: Implement the minimal batch projection resolver** using current (`endedAt: null`) assignments in the active primary hierarchy and one hierarchy-node fetch per involved system, building paths in memory with cycle/missing-parent guards.
- [ ] **Step 4: Run the projection tests and verify GREEN.**
- [ ] **Step 5: Add failing tests for location text search and subtree asset resolution**, including no cross-system descendant leakage.
- [ ] **Step 6: Implement minimal search/subtree functions and verify GREEN.**
- [ ] **Step 7: Commit the shared resolver.**

### Task 2: Maintenance Request, Work Order and PM API projection + search

**Files:**
- Modify: `src/app/api/maintenance-requests/route.ts`
- Modify: `src/app/api/maintenance-requests/[id]/route.ts`
- Modify: `src/app/api/work-orders/route.ts`
- Modify: `src/app/api/work-orders/[id]/route.ts`
- Modify: `src/app/api/pm-schedules/route.ts`
- Modify: `src/app/api/pm-schedules/[id]/route.ts`
- Test: `src/__tests__/functional-locations/maintenance-live-location-api.behavior.test.ts`

**Interfaces:**
- Consumes: Task 1 projection/search helpers.
- Produces: each linked `asset` includes `functionalLocation`; list `search` matches title/reference/asset plus live Location Code/name/path without weakening existing scope.

- [ ] **Step 1: Write failing route behavior tests** asserting live structured location in MR/WO/PM payloads and legacy fallback when unassigned.
- [ ] **Step 2: Run tests and verify RED.**
- [ ] **Step 3: Enrich list/detail responses in batches** and expose `asset.functionalLocation` without persisting duplicate location fields.
- [ ] **Step 4: Verify projection tests GREEN.**
- [ ] **Step 5: Write failing security/search tests** proving a location search cannot escape `view_own`, technician, explicit plant, or accessible-plant filters.
- [ ] **Step 6: Implement search as an additional AND condition** using Task 1 asset IDs; keep existing role OR clauses intact.
- [ ] **Step 7: Verify all route tests GREEN and commit.**

### Task 3: Maintenance reports, exports and descendant roll-up filter

**Files:**
- Modify: `src/app/api/reports/maintenance/route.ts`
- Modify: `src/app/api/reports/maintenance/export/route.ts`
- Modify: `src/app/api/work-orders/reports/route.ts`
- Test: `src/__tests__/functional-locations/maintenance-location-reporting.behavior.test.ts`

**Interfaces:**
- Consumes: Task 1 projection/subtree helpers.
- Produces: report rows/groups carry `functionalLocationCode`, `functionalLocationPath`, `functionalLocationPathCode`; optional `functionalLocationId` filters to that node plus descendants.

- [ ] **Step 1: Write failing report tests** for structured-preferred/legacy-fallback output and subtree filtering.
- [ ] **Step 2: Run and verify RED.**
- [ ] **Step 3: Enrich report asset maps in one batch and intersect `functionalLocationId` asset IDs with existing report filters.**
- [ ] **Step 4: Verify report tests GREEN.**
- [ ] **Step 5: Write failing export assertions** for Location Code and Asset Path columns in CSV/XLSX row construction.
- [ ] **Step 6: Add the export fields and verify GREEN.**
- [ ] **Step 7: Commit reporting/export integration.**

### Task 4: Maintenance UI and shared types

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/components/modules/MaintenancePages.tsx`
- Test: `src/__tests__/functional-location/maintenance-live-location-ui.contract.test.ts`

**Interfaces:**
- Consumes: API `asset.functionalLocation` from Task 2.
- Produces: consistent `Functional Location` / `Location Code` display in MR detail/cards, WO detail/cards and PM detail; legacy reported location remains separately labelled when present.

- [ ] **Step 1: Write failing UI contract tests** requiring functional location code/path labels and structured-first helper usage.
- [ ] **Step 2: Run and verify RED.**
- [ ] **Step 3: Add shared TypeScript projection types and minimal display helper**, then replace legacy-only asset-location renders in MR/WO/PM surfaces.
- [ ] **Step 4: Update asset selector labels where data is available to show code/path without removing asset tag.**
- [ ] **Step 5: Verify UI contract tests GREEN and commit.**

### Task 5: Verification and publication

**Files:**
- Modify only if verification uncovers a Phase 3B regression.

- [ ] **Step 1: Run all functional-location and new Phase 3B tests.**
- [ ] **Step 2: Run targeted ESLint for every changed path and `git diff --check`.**
- [ ] **Step 3: Run the Repairs TypeScript release gate or changed-path compiler check; record unrelated baseline debt separately.**
- [ ] **Step 4: Review the complete diff for plant-scope/RBAC widening, N+1 queries, duplicate live-location persistence, and export consistency.**
- [ ] **Step 5: Push branch, open PR, require CI/Build/Repairs UAT/platform E2E green before merge.**
- [ ] **Step 6: After merge, verify the deployed `main` SHA and smoke the affected MR/WO/PM/report endpoints.**
