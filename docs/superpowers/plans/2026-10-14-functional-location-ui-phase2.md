# Functional Location Phase 2 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved customer-configurable Asset Path experience: hierarchy-system administration, functional-location tree management, coded asset assignment/relocation, and a clear `Installed At / Asset Path` view that remains separate from equipment and machine/component hierarchies.

**Architecture:** Reuse the Phase 1 hierarchy core and Phase 2 assignment/history backend already merged in PRs #468 and #469. Add only the mutation APIs still required by the approved admin UX, then build focused reusable asset-path components under `src/components/assets/` rather than expanding the already-large settings/asset modules. Navigation integrates two dedicated pages: Hierarchy Systems under Settings and Functional Locations under Assets. Add/Edit Asset uses the existing assignment endpoint after asset persistence; Asset Detail reads the existing assignment/history API and renders coded breadcrumbs independently from parent/child asset and Component Registry structures.

**Tech Stack:** Next.js App Router, React/TypeScript, Zustand navigation/auth stores, Prisma/PostgreSQL, Tailwind/shadcn UI, Vitest, Playwright, existing `api` client and RBAC/plant-scope helpers.

**Spec:** `docs/superpowers/specs/2026-10-12-configurable-functional-location-hierarchy-design.md`

## Global Constraints

- Keep Functional Location / Asset Path, Asset/Equipment hierarchy, and Machine/Component hierarchy as three independent structures.
- Location Code is a human identifier, never a database primary key.
- Support hierarchy code modes `manual`, `generated`, and `mixed`; mixed remains the default.
- Supported hierarchy purposes remain `functional_location`, `electrical`, `process`, `utilities`, `facilities`, and `custom`.
- Existing `Asset.plantId`, `departmentId`, `location`, `building`, `floor`, and `area` remain intact during migration; structured Functional Location is preferred but legacy data is not deleted.
- Server-side RBAC and plant scope remain authoritative; UI hiding must never substitute for API enforcement.
- Do not introduce drag/drop hierarchy moves in v1; use the existing guarded Move endpoint.
- Structural hierarchy changes that would reinterpret existing location paths must fail closed once locations exist. Safe metadata edits remain allowed.
- Do not add GIS/maps, arbitrary graph relationships, ltree/closure-table optimization, or Phase 3 reporting/migration work in this slice.
- All new UI must inherit the responsive standards already completed under Issue #14: no page-level horizontal overflow, viewport-safe dialogs, intentional tree/table scrolling, `min-w-0` protection, and usable phone controls.

## Review Focus

1. **Existing hierarchy with nodes:** renaming labels must work, but reordering/removing levels must be rejected rather than silently changing historical paths.
2. **Plant change on Add/Edit Asset:** a selected Functional Location from the previous plant must be cleared/revalidated before save/relocation.
3. **Legacy asset with no structured assignment:** Asset Detail must show a precise `No functional location assigned` state while retaining legacy location text as migration context, not fabricate an assignment.
4. **Non-assignable or archived location:** picker must not allow selection, and the server must continue to reject assignment even if a crafted request bypasses the UI.
5. **Long/deep paths and codes on phones:** picker, breadcrumbs, tree rows, and dialogs must wrap/scroll intentionally without document-level overflow.

---

### Task 1: Complete safe hierarchy-system and functional-location mutation APIs

**Files:**
- Create: `src/app/api/hierarchy-systems/[id]/route.ts`
- Create: `src/app/api/functional-locations/[id]/route.ts`
- Modify: `src/lib/functional-location/service.ts`
- Test: `src/__tests__/functional-locations/hierarchy-system-mutations.behavior.test.ts`
- Test: `src/__tests__/functional-locations/location-mutations.behavior.test.ts`
- Extend: `src/__tests__/functional-locations/api-security-contract.test.ts`
- Extend: `src/__tests__/functional-locations/audit-atomicity.contract.test.ts`

**Interfaces:**
- Consumes: existing `HierarchySystem`, `HierarchyLevel`, `FunctionalLocation`; `assets.hierarchy.manage`; `assets.functional_locations.manage`; existing plant-scope helpers and Location Code normalization utilities.
- Produces: `PATCH /api/hierarchy-systems/:id`, `PATCH /api/functional-locations/:id`; safe metadata/activation updates used by Tasks 3–4.

- [ ] **Step 1: Write failing hierarchy-system mutation tests**

Cover these assertions:
- admin/manage permission is required;
- name/description/purpose/code-mode/separator/primary/active state can be safely updated;
- when `_count.functionalLocations === 0`, levels may be added/reordered/removed while maintaining unique positive order values;
- when locations exist, level IDs/order membership are immutable, but label/description/isRequired/allowAssetAssignment/codePrefix/isActive metadata may change;
- attempting to deactivate the only active primary system or leave no primary active system fails;
- every accepted structural/configuration update and audit write is one transaction.

- [ ] **Step 2: Run RED hierarchy-system tests**

Run: `bunx vitest run src/__tests__/functional-locations/hierarchy-system-mutations.behavior.test.ts src/__tests__/functional-locations/api-security-contract.test.ts src/__tests__/functional-locations/audit-atomicity.contract.test.ts`

Expected: FAIL because `/api/hierarchy-systems/[id]` and mutation policy do not yet exist.

- [ ] **Step 3: Implement `PATCH /api/hierarchy-systems/[id]`**

Use one transaction. Reuse the existing create-route validation constants/normalizers. Preserve one-active-primary semantics. Treat level structure as mutable only while the system has zero Functional Locations; otherwise match existing levels by ID and reject membership/order changes.

- [ ] **Step 4: Write failing Functional Location edit/archive tests**

Cover:
- `name`, `description`, and allowed code override can change without changing `id`;
- manual/mixed code changes normalize and respect per-system uniqueness/override policy;
- generated-only systems reject manual code mutation;
- retire/archive fails when active child locations or current asset assignments depend on the node;
- plant scope and manage permission fail closed;
- accepted edit/archive and audit are atomic.

- [ ] **Step 5: Run RED location mutation tests**

Run: `bunx vitest run src/__tests__/functional-locations/location-mutations.behavior.test.ts`

Expected: FAIL because `src/app/api/functional-locations/[id]/route.ts` does not exist.

- [ ] **Step 6: Implement Functional Location mutation service + PATCH route**

Add focused service methods such as:
- `updateFunctionalLocation(input: UpdateFunctionalLocationInput)`
- `retireFunctionalLocation(input: RetireFunctionalLocationInput)`

Do not duplicate Move logic; parent changes continue through `/api/functional-locations/:id/move`.

- [ ] **Step 7: Run focused API/domain suite**

Run: `bunx vitest run src/__tests__/functional-locations`

Expected: PASS.

- [ ] **Step 8: Commit**

Commit message: `feat: complete functional location admin mutations`

---

### Task 2: Add shared Functional Location client types and presentation helpers

**Files:**
- Create: `src/lib/functional-location/client.ts`
- Create: `src/components/assets/FunctionalLocationPath.tsx`
- Test: `src/__tests__/functional-locations/client-presentation.test.ts`

**Interfaces:**
- Consumes: current API payloads from `/api/hierarchy-systems`, `/api/functional-locations`, `/api/functional-locations/:id/path`, and `/api/assets/:id/functional-locations`.
- Produces: typed `HierarchySystemOption`, `HierarchyLevelOption`, `FunctionalLocationOption`, `AssetFunctionalLocationState`; `formatFunctionalLocationBreadcrumb(path)`; reusable `FunctionalLocationPath` presentation.

- [ ] **Step 1: Write failing presentation tests**

Pin:
- display format is `LOCATION-CODE — Name > Child > Position` (code visually distinct from breadcrumb);
- empty structured assignment renders `No functional location assigned`;
- long breadcrumbs use wrap/min-width-safe classes rather than a fixed-width row;
- legacy location text is labeled migration/legacy context and never returned as a synthetic Functional Location ID.

- [ ] **Step 2: Run RED tests**

Run: `bunx vitest run src/__tests__/functional-locations/client-presentation.test.ts`

Expected: FAIL because shared client/presentation modules do not exist.

- [ ] **Step 3: Implement typed client/presentation helpers**

Keep API calls through the existing `api` client. Centralize data-shape normalization and breadcrumb formatting so Settings, picker, and Asset Detail do not each invent a different representation.

- [ ] **Step 4: Run tests and touched-file typecheck**

Run: `bunx vitest run src/__tests__/functional-locations/client-presentation.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add functional location client presentation primitives`

---

### Task 3: Ship Settings → Asset Management → Hierarchy Systems builder

**Files:**
- Create: `src/components/modules/HierarchySystemsPage.tsx`
- Modify: `src/components/EAMApp.tsx`
- Modify: `src/components/shared/Sidebar.tsx`
- Modify: `src/types/index.ts` (PageName union)
- Modify: `src/lib/page-access.ts` if explicit page permission mapping is required
- Test: `src/__tests__/functional-locations/hierarchy-builder-ui.contract.test.ts`
- Test: `src/__tests__/navigation/functional-location-pages.contract.test.ts`

**Interfaces:**
- Consumes: Task 1 hierarchy PATCH API and existing GET/POST `/api/hierarchy-systems`.
- Produces: new page `settings-hierarchy-systems`; admin-facing create/edit/archive/primary/configuration UI.

- [ ] **Step 1: Write failing navigation and builder contracts**

Require:
- page title `Hierarchy Systems`;
- Settings child navigation entry under Asset Management context, admin-only/permission-aware;
- create form fields for name, code, purpose, code mode, separator, allow override, primary/active;
- editable ordered levels with label, required/optional, assignable, prefix and active state;
- code/path preview;
- warning/disabled structural controls when system already has locations;
- responsive two-column-or-less phone layout and viewport-safe dialog behavior.

- [ ] **Step 2: Run RED UI contracts**

Run: `bunx vitest run src/__tests__/functional-locations/hierarchy-builder-ui.contract.test.ts src/__tests__/navigation/functional-location-pages.contract.test.ts`

Expected: FAIL because page/navigation do not exist.

- [ ] **Step 3: Implement `HierarchySystemsPage`**

Use focused local state and the existing `ResponsiveDialog`. Do not move unrelated Settings code. Show system purpose, code mode, primary/active status, Location count, and ordered level chips/rows. Save through POST/PATCH APIs.

- [ ] **Step 4: Register route/title/sidebar/access**

Add `settings-hierarchy-systems` to PageName, `PAGE_TITLES`, `pageLoaders`, Sidebar Settings children, and permission map if required. Use `assets.hierarchy.view/manage`; admin remains allowed.

- [ ] **Step 5: Run contracts**

Run: `bunx vitest run src/__tests__/functional-locations/hierarchy-builder-ui.contract.test.ts src/__tests__/navigation/functional-location-pages.contract.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `feat: add hierarchy systems builder`

---

### Task 4: Ship Functional Locations tree browser and guarded management UX

**Files:**
- Create: `src/components/modules/FunctionalLocationsPage.tsx`
- Create: `src/components/assets/FunctionalLocationTree.tsx`
- Modify: `src/components/EAMApp.tsx`
- Modify: `src/components/shared/Sidebar.tsx`
- Modify: `src/types/index.ts`
- Test: `src/__tests__/functional-locations/tree-ui.contract.test.ts`

**Interfaces:**
- Consumes: existing list/create/path/move APIs plus Task 1 PATCH API; Task 2 presentation types.
- Produces: new Asset page `assets-functional-locations`, reusable expandable tree.

- [ ] **Step 1: Write failing tree contracts**

Require:
- hierarchy-system selector defaults to active primary;
- name/code search uses server `search` query;
- roots load with `parentId=root`; children lazy-load by `parentId`;
- rows show Location Code, name, configured level label, plant/global indicator, child count, and status;
- actions: Add Child, Edit, Move, Retire/Archive; no drag/drop;
- Add Child preselects the next valid level and previews generated/mixed code behavior;
- Move uses a guarded destination selector and the existing move endpoint;
- tree/path content is `min-w-0` and internally scroll-safe on phone.

- [ ] **Step 2: Run RED**

Run: `bunx vitest run src/__tests__/functional-locations/tree-ui.contract.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement reusable `FunctionalLocationTree`**

Keep node fetch/cache state inside the tree component or a small hook colocated with it. Refresh only affected branches after mutation; do not reload the entire application.

- [ ] **Step 4: Implement page shell + navigation**

Register `assets-functional-locations` under Assets with `assets.functional_locations.view`; management actions additionally require manage permission.

- [ ] **Step 5: Run focused contracts**

Run: `bunx vitest run src/__tests__/functional-locations/tree-ui.contract.test.ts src/__tests__/navigation/functional-location-pages.contract.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `feat: add functional location tree browser`

---

### Task 5: Add reusable Functional Location picker for asset assignment

**Files:**
- Create: `src/components/assets/FunctionalLocationPicker.tsx`
- Test: `src/__tests__/functional-locations/picker-ui.contract.test.ts`

**Interfaces:**
- Consumes: Task 2 client types, `/api/hierarchy-systems`, `/api/functional-locations`, `/api/functional-locations/:id/path`.
- Produces: `FunctionalLocationPicker({ plantId, hierarchySystemId?, value, onChange, disabled? })` where selected value is a real Functional Location ID or empty string.

- [ ] **Step 1: Write failing picker contracts**

Require:
- active primary hierarchy is default when system is not supplied;
- options are limited to active nodes on `allowAssetAssignment=true` levels;
- displayed option contains code + breadcrumb;
- changing `plantId` clears a selection that is not valid in the new plant;
- archived/non-assignable nodes are not selectable;
- empty and unavailable states are explicit;
- search is keyboard accessible and phone-safe.

- [ ] **Step 2: Run RED**

Run: `bunx vitest run src/__tests__/functional-locations/picker-ui.contract.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement picker**

Use existing searchable-select primitives where practical. Load path labels lazily/cached rather than issuing duplicate path calls on every render.

- [ ] **Step 4: Run tests**

Run: `bunx vitest run src/__tests__/functional-locations/picker-ui.contract.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add functional location asset picker`

---

### Task 6: Integrate structured location into Add/Edit Asset without deleting legacy fields

**Files:**
- Modify: `src/components/modules/AssetPages.tsx`
- Test: `src/__tests__/assets/functional-location-asset-form.contract.test.ts`
- Extend: `src/__tests__/functional-locations/asset-assignment-api.behavior.test.ts` only if an uncovered server case is found.

**Interfaces:**
- Consumes: Task 5 picker; existing asset create/update APIs; existing POST `/api/assets/:id/functional-locations`.
- Produces: Add/Edit Asset form state `functionalLocationId` and optional `relocationReason`; post-persistence assignment/relocation.

- [ ] **Step 1: Write failing Asset form contract**

Require:
- structured `Functional Location / Asset Path` field appears in Add/Edit Asset;
- picker receives current `plantId`;
- legacy location/building/floor/area fields remain available and are clearly marked legacy/migration context rather than removed;
- create flow persists Asset first, then assigns selected Functional Location using returned asset ID;
- edit flow loads current assignment and POSTs only when the selected location changed;
- relocation reason is requested when changing an existing structured location;
- plant changes invalidate/reselect Functional Location before assignment;
- assignment failure after asset create is surfaced as a partial-success warning with the created asset retained, never silently rolled back client-side.

- [ ] **Step 2: Run RED**

Run: `bunx vitest run src/__tests__/assets/functional-location-asset-form.contract.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement form integration**

Do not overload `Asset.location` with Location Code or Functional Location ID. Keep structured assignment exclusively in `AssetFunctionalLocationAssignment` through the existing endpoint.

- [ ] **Step 4: Run focused Asset + Functional Location tests**

Run: `bunx vitest run src/__tests__/assets/functional-location-asset-form.contract.test.ts src/__tests__/functional-locations`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: assign assets to functional locations`

---

### Task 7: Fix Asset Detail hierarchy semantics and show Installed At / Asset Path

**Files:**
- Modify: `src/components/modules/AssetDetailPage.tsx`
- Modify: `src/components/modules/AssetPages.tsx` only where the legacy sheet/detail path is still active
- Reuse: `src/components/assets/FunctionalLocationPath.tsx`
- Reuse: `src/components/assets/HierarchyCommissioningPanel.tsx`
- Test: `src/__tests__/assets/asset-detail-hierarchy-separation.contract.test.ts`

**Interfaces:**
- Consumes: GET `/api/assets/:id/functional-locations`; Task 2 path renderer; existing Asset parent/child and Component Registry data.
- Produces: three explicit UI sections/states: `Installed At / Asset Path`, `Asset / Equipment Structure`, `Machine / Component Structure`.

- [ ] **Step 1: Write failing hierarchy-separation contract**

Require:
- no generic `No Hierarchy` state is used as the sole machine hierarchy status;
- Functional Location empty state is `No functional location assigned`;
- Asset/equipment empty state is `No parent or child assets configured`;
- machine/component empty state is `No machine components registered`;
- assigned primary location renders code + full breadcrumb;
- other current hierarchy-system assignments are visible without replacing the primary path;
- relocation history can be expanded/viewed with assigned/unassigned timestamps and reason;
- legacy free-text location is displayed only as fallback/migration context if no structured primary assignment exists.

- [ ] **Step 2: Run RED**

Run: `bunx vitest run src/__tests__/assets/asset-detail-hierarchy-separation.contract.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement three independent sections**

The machine/component section must read the Component Registry/commissioning structure, not infer absence from `asset.parent`/`asset.children`. The Asset/equipment section continues to use parent/child Asset relationships.

- [ ] **Step 4: Run Asset detail contracts**

Run: `bunx vitest run src/__tests__/assets/asset-detail-hierarchy-separation.contract.test.ts src/__tests__/functional-locations/client-presentation.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: separate asset path and equipment hierarchies`

---

### Task 8: Add responsive/browser regression coverage for the complete Phase 2 flow

**Files:**
- Create: `src/__tests__/layout/functional-location-responsive-contract.test.ts`
- Modify/Create: appropriate Playwright spec under existing platform E2E or Repairs UAT test structure, e.g. `e2e/functional-location-asset-path.spec.ts` following repository convention discovered at implementation time.

**Interfaces:**
- Consumes: Tasks 3–7 complete UI.
- Produces: release-level proof for admin configuration → location creation → asset assignment → detail breadcrumb.

- [ ] **Step 1: Add responsive contract assertions**

Cover 360/390-style classes and shared primitives for:
- Hierarchy Systems level editor;
- Functional Location tree/action rows;
- picker/breadcrumb wrapping;
- Asset Detail path/history sections;
- no fixed minimum width that can force page-level overflow.

- [ ] **Step 2: Add one browser happy-path scenario**

Seed/use an authorized admin and execute:
1. open Hierarchy Systems;
2. create or use a test system with an assignable terminal level;
3. create root + child Functional Location and verify generated/mixed Location Code;
4. open/create an asset and assign the location;
5. open Asset Detail and verify the coded `Installed At / Asset Path` breadcrumb;
6. verify Equipment Structure and Machine Structure remain separate headings.

- [ ] **Step 3: Run focused Vitest + Playwright discovery/run**

Run focused tests first, then the repository-standard Chromium Playwright command used by CI.

Expected: PASS.

- [ ] **Step 4: Run static/release checks locally where available**

Run:
- `bunx eslint .`
- `bunx vitest run`
- `bunx tsc -p tsconfig.repairs.json --noEmit`
- the repository TypeScript debt ratchet for the feature branch
- `bun run build`

Expected: no new failures; touched TypeScript files report zero diagnostics.

- [ ] **Step 5: Commit**

Commit message: `test: cover functional location phase 2 workflow`

---

### Task 9: PR, exact-head release gates, merge, and production verification

**Files:**
- No new product files unless CI reveals a real defect.

**Interfaces:**
- Consumes: completed feature branch.
- Produces: merged/deployed Phase 2 UI slice with evidence.

- [ ] **Step 1: Open PR tracking #465**

PR body must state that Phase 3 migration/reporting/rollups remain intentionally deferred.

- [ ] **Step 2: Require exact-head full CI**

Do not merge until the exact reviewed head passes:
- ESLint
- Vitest
- strict Repairs/RWOP TypeScript gate
- touched-file full-repository TypeScript ratchet
- production application build
- production container build
- PostgreSQL migration/UAT
- Redis/BullMQ RC1 preflight
- notification burst validation
- Repairs/RWOP Playwright UAT
- full platform Playwright E2E
- Required CI Gate

- [ ] **Step 3: Whole-branch review and merge with expected-head protection**

Review for RBAC/plant leakage, hierarchy conflation, unintended legacy-field removal, unsafe structural level edits, and responsive regressions before squash merge.

- [ ] **Step 4: Verify post-merge `main` CI**

Require the same Required CI Gate on the merge SHA.

- [ ] **Step 5: Verify exact-SHA Deploy workflow**

Confirm provenance validation, tested-artifact download, integrity verification, upload, and immutable VPS activation all succeed for the merge SHA.

- [ ] **Step 6: Update #465**

Mark Phase 2 UI complete but keep #465 open for Phase 3 migration/reporting/search/rollups unless all remaining acceptance criteria have independently landed.
