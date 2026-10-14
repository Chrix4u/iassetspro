# Functional Location Phase 2 Settings UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first production UI for configurable Hierarchy Systems and Functional Locations so administrators can create coded hierarchy definitions, browse/search the location tree, add locations, and perform guarded moves using the already-merged backend core.

**Architecture:** Add a focused `FunctionalLocationSettingsPage` instead of expanding the very large `SettingsPages.tsx`. Route it through a new `settings-hierarchy` page key and the existing Settings sidebar. Keep backend services authoritative for Location Code generation, plant scope, level validation, cycle protection, and guarded moves. Existing hierarchy definitions are read-only in this slice because current backend APIs expose safe create/list operations but not generic configuration edits/archives yet.

**Tech Stack:** Next.js/React, TypeScript, Tailwind/shadcn primitives, Zustand navigation/auth stores, existing `api` client, Vitest source-contract regression tests.

**Spec:** `docs/superpowers/specs/2026-10-12-configurable-functional-location-hierarchy-design.md` on `design/configurable-functional-location-hierarchy-20261012`

## Global Constraints

- Keep Functional Location / Asset Path separate from asset-to-asset equipment hierarchy and Component Registry hierarchy.
- Location Codes are human identifiers, never relational/database keys.
- Code modes are `manual`, `generated`, and `mixed`; mixed is the UI default.
- Supported separators are `-`, `_`, `.`, `/`, and `:`.
- All writes use the existing server APIs; do not duplicate cycle, plant, code, or level-order logic client-side as authority.
- Settings page remains admin/settings-only through the existing settings page guard; server RBAC remains authoritative.
- No legacy asset location fields are removed or rewritten in this slice.
- No drag/drop moves; use the existing guarded Move endpoint.

## Review Focus

- A system with many levels/locations must remain usable on 360px phones and wide desktop without page-level overflow.
- Search results must not lose the Location Code or level identity needed to distinguish similarly named locations.
- Add Child must target the next valid active level and must not silently invent a level when none exists.
- Generated/manual/mixed systems must present only the code input appropriate to the system mode while leaving final validation to the server.
- Move candidates must exclude the selected node itself in the UI, while the server remains authoritative for descendant/cycle rejection.

---

### Task 1: Route and navigation contract

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/components/EAMApp.tsx`
- Modify: `src/components/shared/Sidebar.tsx`
- Test: `src/__tests__/functional-location/hierarchy-settings-ui.contract.test.ts`

**Interfaces:**
- Produces page key `settings-hierarchy` loading `FunctionalLocationSettingsPage`.

- [ ] Write a failing source contract requiring the new `PageName`, page title/loader, and Settings sidebar item.
- [ ] Run focused Vitest and confirm RED because the page key is absent.
- [ ] Add the page key, title, dynamic loader, and `Hierarchy & Locations` sidebar child using `GitBranch`/`MapPin` semantics already present in the sidebar icon set.
- [ ] Re-run focused Vitest and confirm this task's assertions pass.

### Task 2: Hierarchy-system builder page

**Files:**
- Create: `src/components/modules/FunctionalLocationSettingsPage.tsx`
- Test: `src/__tests__/functional-location/hierarchy-settings-ui.contract.test.ts`

**Interfaces:**
- Consumes `GET/POST /api/hierarchy-systems`.
- Produces selected hierarchy system state used by the location tree in Task 3.

- [ ] Extend the failing contract to require the page to fetch hierarchy systems and post new systems with name, code, purpose, code mode, separator, `allowCodeOverride`, and ordered levels.
- [ ] Implement a responsive page header/system selector and Create Hierarchy dialog.
- [ ] The create dialog supports add/remove/reorder-before-save levels, label, required/optional, assignable toggle, and code prefix; it does not expose unsupported post-create level editing.
- [ ] Show primary/active status, code mode, separator, location count, and ordered level chips for the selected system.
- [ ] Re-run the focused contract.

### Task 3: Searchable functional-location tree and creation

**Files:**
- Modify: `src/components/modules/FunctionalLocationSettingsPage.tsx`
- Test: `src/__tests__/functional-location/hierarchy-settings-ui.contract.test.ts`

**Interfaces:**
- Consumes `GET/POST /api/functional-locations`.
- Uses `hierarchySystemId`, `hierarchyLevelId`, `parentId`, `name`, `codeSegment`/`locationCode`, `description`, `plantId`.

- [ ] Extend the contract for system-scoped location loading/search and tree construction using `parentId`.
- [ ] Render each tree row with Location Code, name, level label, plant/global context, child count, and responsive actions.
- [ ] Add root/child creation dialog; root uses the first active level, child resolves the next active ordered level.
- [ ] In generated mode request a code segment; in manual mode request full Location Code; in mixed mode allow both segment and optional manual override when permitted.
- [ ] Reload the selected system tree after successful create.
- [ ] Re-run focused contract.

### Task 4: Guarded move UX

**Files:**
- Modify: `src/components/modules/FunctionalLocationSettingsPage.tsx`
- Test: `src/__tests__/functional-location/hierarchy-settings-ui.contract.test.ts`

**Interfaces:**
- Consumes `POST /api/functional-locations/:id/move` with `newParentId` and optional `hierarchyLevelId`.

- [ ] Add RED assertions for guarded Move, no drag/drop, self-exclusion, and server-error surfacing.
- [ ] Add a Move dialog listing root plus same-system candidate parents, excluding the selected node itself.
- [ ] Submit through the move endpoint and surface domain errors from cycle/level/plant validation.
- [ ] Reload tree after success.
- [ ] Re-run focused contract.

### Task 5: Responsive/permission and full verification

**Files:**
- Modify: `src/__tests__/functional-location/hierarchy-settings-ui.contract.test.ts`

**Interfaces:** None.

- [ ] Require mobile stacking and `min-w-0`/internal overflow protection for the two-pane desktop layout.
- [ ] Require manage actions to use `assets.hierarchy.manage` / `assets.functional_locations.manage` in addition to admin status; view remains backed by server authorization.
- [ ] Run focused Vitest.
- [ ] Run ESLint on touched files.
- [ ] Run strict Repairs TypeScript release gate and full-repository touched-file ratchet.
- [ ] Open a draft PR against `main` and require exact-head full CI: Vitest, lint, production build/container, PostgreSQL/Redis/BullMQ Repairs UAT, platform E2E, Required CI Gate.
- [ ] Merge only after exact-head full CI is green and verify post-merge CI/deploy before proceeding to Asset picker/detail UI.
