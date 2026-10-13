# Functional Location Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the additive, plant-scoped core platform for configurable functional-location hierarchies and Location Codes without yet changing asset assignment UX or legacy location fields.

**Architecture:** Introduce `HierarchySystem`, `HierarchyLevel`, and `FunctionalLocation` as first-class PostgreSQL/Prisma models using an adjacency-list tree with indexed `parentId` and `depth`. Pure Location Code and hierarchy-policy modules own deterministic validation; API routes reuse existing session/RBAC and `getPlantScope`/`canAccessPlant` rules, and every mutation writes to the existing `AuditLog`. Current single-company `CompanyProfile` remains installation metadata rather than an invented tenant FK; multi-company scoping can be added when the product has a real tenant entity.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/PostgreSQL, Vitest, existing RBAC/auth/plant-scope helpers, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-12-configurable-functional-location-hierarchy-design.md`

## Global Constraints

- Keep Functional Location, Asset/Equipment hierarchy, and Machine/Component hierarchy semantically separate.
- Location Codes are human identifiers, never database primary keys.
- Code modes are exactly `manual`, `generated`, and `mixed`; default is `mixed`.
- Preserve `Asset.plantId`, `departmentId`, `location`, `building`, `floor`, and `area`; no destructive legacy-field migration in Phase 1.
- Use adjacency-list `parentId` plus `depth`; do not add ltree/closure tables.
- Reject cross-system parents and cycles; enforce configured level order and required-level skips.
- Server APIs enforce RBAC and plant scope; UI hiding is never sufficient.
- All hierarchy create/update/move/code-change mutations write `AuditLog` entries.
- No drag/drop, asset relocation, legacy import, or report rollups in this phase.

## Review Focus

- A regular user with no `X-Plant-ID` and no plant assignments must see zero plant-scoped locations, never all locations.
- A requested parent from another hierarchy system must fail rather than silently re-parent or recode the node.
- Skipping an intermediate required hierarchy level must fail; skipping only optional levels must work.
- Moving a node below itself or any descendant must fail without partially updating `parentId`, `depth`, or Location Codes.
- Changing code rules after locations exist must not silently rewrite existing `locationCode` values.

---

### Task 1: Freeze Phase 1 contracts with RED tests

**Files:**
- Create: `src/__tests__/functional-locations/location-code.test.ts`
- Create: `src/__tests__/functional-locations/hierarchy-policy.test.ts`
- Create: `src/__tests__/functional-locations/schema-contract.test.ts`
- Create: `src/__tests__/functional-locations/api-security-contract.test.ts`

**Interfaces:**
- Consumes: approved design spec and existing `getPlantScope`/`canAccessPlant` semantics.
- Produces: executable contracts for the pure code engine, level-transition rules, additive schema, migration constraints, permissions, audit, and plant-scoped routes.

- [ ] **Step 1: Write Location Code RED tests** for uppercase normalization, allowed characters, manual/generated/mixed modes, configured separator/prefix, and missing-required-input failures.
- [ ] **Step 2: Write hierarchy-policy RED tests** for direct child levels, optional skips, required-level skip rejection, cross-system rejection, and cycle/move ancestor checks.
- [ ] **Step 3: Write source/schema RED contracts** requiring the three Prisma models, unique `(hierarchySystemId, locationCode)`, indexes, additive migration, permission slugs, `getPlantScope`, `canAccessPlant`, and `AuditLog` usage in mutating routes.
- [ ] **Step 4: Run focused tests** with `bunx vitest run src/__tests__/functional-locations` and confirm failure only because the new modules/schema/routes do not yet exist.
- [ ] **Step 5: Commit** the RED tests.

### Task 2: Add the additive PostgreSQL/Prisma hierarchy schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261013223000_functional_location_core/migration.sql`

**Interfaces:**
- Consumes: Task 1 schema contracts.
- Produces: Prisma models `HierarchySystem`, `HierarchyLevel`, `FunctionalLocation` and database constraints/indexes consumed by service/API tasks.

- [ ] **Step 1: Add `HierarchySystem`** with `name`, unique normalized `code`, `purpose`, `description`, `isPrimary`, `isActive`, `codeMode`, `codeSeparator`, `allowCodeOverride`, optional `createdById`, timestamps, and relations.
- [ ] **Step 2: Add `HierarchyLevel`** with ordered per-system level metadata, required/assignable flags, optional `codePrefix`, active flag, timestamps, and `@@unique([hierarchySystemId, order])`.
- [ ] **Step 3: Add `FunctionalLocation`** with system/level/parent/name/code fields, optional `plantId`, `depth`, status, creator, timestamps, self hierarchy, and `@@unique([hierarchySystemId, locationCode])` plus parent/system/level/plant indexes.
- [ ] **Step 4: Add reciprocal relations** to `User` and `Plant` without changing existing Asset fields.
- [ ] **Step 5: Write additive SQL migration** with foreign keys/checks/indexes and a PostgreSQL partial unique index guaranteeing at most one active primary hierarchy system for the current single-company installation.
- [ ] **Step 6: Run `bunx prisma format` and `bunx prisma generate`; run schema contracts and confirm PASS.**
- [ ] **Step 7: Commit** schema + migration.

### Task 3: Implement the pure Location Code and hierarchy-policy engines

**Files:**
- Create: `src/lib/functional-location/location-code.ts`
- Create: `src/lib/functional-location/hierarchy-policy.ts`

**Interfaces:**
- Produces:
  - `normalizeLocationCode(value: string): string`
  - `normalizeCodeSegment(value: string): string`
  - `validateCodeSeparator(value: string): string`
  - `buildLocationCode(input: LocationCodeInput): string`
  - `validateLevelTransition(input: LevelTransitionInput): void`
  - `assertNoHierarchyCycle(input: HierarchyCycleInput): void`

- [ ] **Step 1: Implement code normalization/validation** using uppercase alphanumerics plus `_` and `-` in code/segments; separators are validated independently and cannot contain alphanumerics/whitespace.
- [ ] **Step 2: Implement manual/generated/mixed code construction** where generated code is `parentCode + separator + prefix + segment`, roots omit `parentCode`, and mixed uses authorized manual override only when supplied.
- [ ] **Step 3: Implement level-transition validation** so target order must be greater than parent order and every skipped active level must be optional.
- [ ] **Step 4: Implement pure cycle detection** over supplied ancestor/descendant IDs.
- [ ] **Step 5: Run the focused pure tests** and confirm PASS.
- [ ] **Step 6: Commit** pure domain logic.

### Task 4: Add shared database service with transactional primary/move rules

**Files:**
- Create: `src/lib/functional-location/service.ts`
- Create: `src/__tests__/functional-locations/service-contract.test.ts`

**Interfaces:**
- Consumes: Prisma models and Task 3 pure functions.
- Produces:
  - `setPrimaryHierarchySystem(systemId: string, actorId: string): Promise<void>`
  - `createFunctionalLocation(input: CreateFunctionalLocationInput): Promise<FunctionalLocation>`
  - `moveFunctionalLocation(input: MoveFunctionalLocationInput): Promise<FunctionalLocation>`
  - `getFunctionalLocationPath(locationId: string): Promise<FunctionalLocationPathNode[]>`

- [ ] **Step 1: Write RED service contracts** requiring transaction use for primary switching and moves, DB uniqueness handling, no silent descendant recoding, and breadcrumb assembly.
- [ ] **Step 2: Implement primary switching in a Prisma transaction** by clearing the prior active primary before setting the requested active system primary; reject inactive target.
- [ ] **Step 3: Implement location create** by loading system/levels/parent, applying policy/code rules, validating plant/system/level relations, and surfacing code uniqueness as a conflict-ready domain error.
- [ ] **Step 4: Implement guarded move** by loading descendants/ancestors, rejecting self/descendant/cross-system moves, validating new level path, and updating parent/depth transactionally without rewriting existing codes.
- [ ] **Step 5: Implement breadcrumb/path assembly** from node to root with cycle guard.
- [ ] **Step 6: Run service/source contracts and pure tests.**
- [ ] **Step 7: Commit** service layer.

### Task 5: Seed permissions and the starter hierarchy system safely

**Files:**
- Modify: `prisma/seed-permissions-only.ts`
- Modify: `prisma/seed-all.ts`
- Modify: `prisma/seed-reference-data.ts` or create a focused idempotent hierarchy seed if the existing reference-data flow is not suitable.
- Create/modify tests under `src/__tests__/functional-locations/` for seed contracts.

**Interfaces:**
- Produces permission slugs `assets.hierarchy.view`, `assets.hierarchy.manage`, `assets.functional_locations.view`, `assets.functional_locations.manage`, `assets.functional_locations.assign` and an idempotent default active primary system with levels `Company -> Site / Plant -> Area -> Line / System -> Functional Location`.

- [ ] **Step 1: Extend canonical permission definitions in every maintained seed source** so permission-only and full seed cannot drift.
- [ ] **Step 2: Grant hierarchy management to `admin` implicitly and appropriate management roles explicitly; grant view to relevant maintenance/plant roles.**
- [ ] **Step 3: Seed the starter hierarchy system/levels idempotently** with `mixed` code mode and `-` separator, without requiring a creator user.
- [ ] **Step 4: Run seed source contracts and focused tests.**
- [ ] **Step 5: Commit** permission/reference seed changes.

### Task 6: Add plant-scoped hierarchy-system and functional-location APIs

**Files:**
- Create: `src/app/api/hierarchy-systems/route.ts`
- Create: `src/app/api/hierarchy-systems/[id]/route.ts`
- Create: `src/app/api/hierarchy-systems/[id]/levels/route.ts`
- Create: `src/app/api/functional-locations/route.ts`
- Create: `src/app/api/functional-locations/[id]/route.ts`
- Create: `src/app/api/functional-locations/[id]/move/route.ts`
- Create: `src/app/api/functional-locations/[id]/path/route.ts`

**Interfaces:**
- Consumes: existing `getSession`, `hasPermission`, `isAdmin`, `getPlantScope`, `canAccessPlant`; Task 4 service.
- Produces the Phase 1 route families defined by the design.

- [ ] **Step 1: Implement hierarchy-system GET/POST/PUT** with authenticated view/manage permissions; only manage-capable actors can mutate configuration; all mutations audit old/new values.
- [ ] **Step 2: Implement level list/create/update/reorder operations** with active-system checks and protection against structural reordering that would invalidate existing locations.
- [ ] **Step 3: Implement functional-location GET/POST/PUT/archive** with name/code search, system filter, parent filter, and plant scope applied fail-closed.
- [ ] **Step 4: Implement guarded move endpoint** through the service; explicitly verify actor can access both current and destination plant scopes when plant IDs are present.
- [ ] **Step 5: Implement path endpoint** and filter/reject inaccessible plant-scoped nodes.
- [ ] **Step 6: Map domain validation to 400, uniqueness to 409, auth to 401/403, missing resources to 404.**
- [ ] **Step 7: Run API security contracts and touched-file TypeScript checks.**
- [ ] **Step 8: Commit** API routes.

### Task 7: Phase 1 release verification and PR

**Files:**
- Update: `docs/superpowers/plans/2026-10-13-functional-location-core.md` checkboxes/status as appropriate.
- No runtime scope expansion.

**Interfaces:**
- Produces an exact-head Phase 1 PR linked to #465.

- [ ] **Step 1: Run focused functional-location Vitest suite.**
- [ ] **Step 2: Run `bunx prisma validate`, Prisma generate, ESLint for touched files, strict Repairs TypeScript gate, and the full repository touched-file debt ratchet.**
- [ ] **Step 3: Run full Vitest and production build locally where available; otherwise require them in PR CI.**
- [ ] **Step 4: Review the complete branch diff for accidental Asset/Equipment or Component-hierarchy coupling.**
- [ ] **Step 5: Open a draft PR against `main`, link #465, and require exact-head Lint, Unit Tests, strict Repairs TypeScript + debt ratchet, Production Build, Production Container Build, Repairs UAT/PostgreSQL/Redis/BullMQ, Platform E2E, and Required CI Gate.**
- [ ] **Step 6: Merge only with expected-head SHA protection after every gate is green.**
- [ ] **Step 7: Verify post-merge `main` CI and exact-SHA immutable Deploy workflow before marking Phase 1 complete in #465.**
