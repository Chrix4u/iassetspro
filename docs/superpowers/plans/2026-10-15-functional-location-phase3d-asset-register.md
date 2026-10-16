# Functional Location Phase 3D — Asset Register Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Asset Register so current primary Functional Locations are authoritative in list/search/export surfaces, while preserving legacy fallback and plant authorization.

**Architecture:** Reuse the existing batch live-location resolver in `src/lib/functional-location/live-location.ts`; do not add another asset-location relationship or per-row API calls. The asset list route will compose location-aware search/subtree constraints under existing plant scope, then batch-project a `functionalLocation` object onto returned rows. The client register will consume that projection for search, display, and filtered CSV export.

**Tech Stack:** Next.js 16 route handlers, TypeScript, Prisma/PostgreSQL, React 19, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-configurable-functional-location-hierarchy-design.md` on branch `design/configurable-functional-location-hierarchy-20261012`, plus GitHub issue #465.

## Global Constraints

- Current live location is the asset's current assignment in the active primary Functional Location hierarchy.
- Structured Functional Location is authoritative; legacy `location/building/floor/area` remains fallback/migration data.
- Do not create a second location relationship or duplicate hierarchy model.
- Final asset queries must retain authenticated plant scope and existing RBAC boundaries.
- Location filtering must include descendants of the selected Functional Location.
- Batch projection only; no N+1 location reads from the Asset Register.
- Empty/no-match Functional Location constraints must fail closed to zero matching assets, not widen scope.

## Review Focus

- Location text search must remain ANDed with plant scope rather than replacing authorization filters.
- A selected parent Functional Location must include assigned assets at descendants, but final results must still be plant-scoped.
- Assets without structured assignments must continue to show legacy location fallback.
- Empty subtree/search location matches must not accidentally return all assets.
- CSV export must be permission-gated, quote-safe, and include Location Code + Asset Path from the currently filtered register.

---

### Task 1: Asset Register live-location API projection and filtering

**Files:**
- Create: `src/__tests__/functional-locations/asset-register-live-location.behavior.test.ts`
- Modify: `src/app/api/assets/route.ts`

**Interfaces:**
- Consumes: `getAssetLiveLocationMap(assetIds)`, `findAssetIdsByLiveLocationSearch(search)`, `getAssetIdsInFunctionalLocationSubtree(functionalLocationId)` from `src/lib/functional-location/live-location.ts`.
- Produces: `/api/assets` rows with `functionalLocation`; query support for `search` matching live location and `functionalLocationId` descendant filtering.

- [ ] **Step 1: Write failing API behavior tests** for batch projection, location-aware search under plant scope, subtree filtering, and search+subtree intersection.
- [ ] **Step 2: Run focused test and verify RED** because `/api/assets` does not yet import/project/filter through live-location helpers.
- [ ] **Step 3: Implement the minimal route integration** using AND-composed filters and one batch projection after the paged asset query.
- [ ] **Step 4: Run focused tests and verify GREEN.**
- [ ] **Step 5: Run existing live-location projection/maintenance behavior tests for regression coverage.**
- [ ] **Step 6: Commit** as `feat: project functional locations into asset register`.

### Task 2: Asset Register search, coded-path display, and CSV export

**Files:**
- Create: `src/__tests__/assets/asset-register-functional-location.contract.test.ts`
- Modify: `src/components/modules/AssetPages.tsx`

**Interfaces:**
- Consumes: Task 1's `asset.functionalLocation` projection with `locationCode`, `path`, and `pathCode`.
- Produces: client search over asset identity + structured location, `Installed At` structured display with legacy fallback, and filtered CSV export containing Location Code and Asset Path.

- [ ] **Step 1: Write failing UI contract tests** for structured location search, structured-first display, and permission-gated CSV export fields.
- [ ] **Step 2: Run focused tests and verify RED.**
- [ ] **Step 3: Implement minimal UI behavior** without changing the existing 500-row scoped-load architecture in this slice.
- [ ] **Step 4: Run focused tests and verify GREEN.**
- [ ] **Step 5: Run existing Asset Register responsive/search contracts for regression coverage.**
- [ ] **Step 6: Commit** as `feat: expose coded locations in asset register`.

### Task 3: Release verification and delivery

**Files:**
- Modify only if verification uncovers a real regression; every fix must begin with a failing test.

**Interfaces:**
- Consumes: Tasks 1-2 branch head.
- Produces: CI-ready branch/PR and, only after exact-SHA required gates pass, a deployable immutable release SHA.

- [ ] **Step 1: Run functional-location focused suites and full Vitest.**
- [ ] **Step 2: Run ESLint, canonical RWOP import check, Repairs TypeScript hard gate, and TypeScript debt ratchet.**
- [ ] **Step 3: Run production build locally with a non-secret placeholder DATABASE_URL where generation only requires configuration.**
- [ ] **Step 4: Review the complete branch diff against the plan/spec and fix any Critical/Important finding via RED→GREEN.**
- [ ] **Step 5: Push the feature branch to the personal fork and open a PR to `Chrix4u/iassetspro:main`.**
- [ ] **Step 6: Require GitHub `Required CI Gate` success before merge/deployment; deploy only the exact verified merge SHA and run production health/smoke checks.**
