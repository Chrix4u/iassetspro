# Runtime, Responsive Modal, and PM Targeting Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the production React crash, prevent form/modal horizontal overflow, and add a searchable PM asset + exact machine-hierarchy target workflow with schedule details viewing.

**Architecture:** Keep the existing app structure and APIs. Fix the Production KPI data shape at its source, extend `ResponsiveDialog` with explicit literal size presets and containment, reuse the existing `MachineVisualExplorer` in an optional selection mode, and keep `PmSchedule.componentId` as the persisted exact target. The Purchase Order and PM forms opt into the new sizes rather than receiving one-off CSS hacks.

**Tech Stack:** Next.js/React, TypeScript, Tailwind, Radix UI, Vitest, Playwright, Prisma/PostgreSQL.

**Spec:** User-approved design from 2026-10-11 conversation: runtime crash fix, form-aware modal widths, PM schedule View, all-assets search, nested visual hierarchy target selection, and PO overflow containment.

## Global Constraints

- No database/schema change for PM targeting; reuse existing `PmSchedule.componentId`.
- Reuse `MachineVisualExplorer`; do not build a duplicate hierarchy browser.
- Preserve existing `ResponsiveDialog` props for backwards compatibility.
- Keep the urgent branch isolated from the parked damaged-tool quantity-custody branch.
- Use test-first red/green cycles for each behavior change.

## Review Focus

- KPI arrays must never contain non-record entries whose `icon` is undefined.
- Very long asset/component/item labels must not widen dialogs past the viewport.
- PM asset search must query beyond the initial default assets page and keep a selected value renderable.
- Changing a PM asset must clear an incompatible component target.
- Closing/cancelling the hierarchy explorer must not overwrite the main PM form target; Confirm must.

---

### Task 1: Production runtime crash regression

**Files:**
- Modify: `src/components/modules/ProductionPages.tsx`
- Test: `src/__tests__/production/resource-planning-kpi-contract.test.ts`

**Interfaces:**
- Consumes: existing KPI render loop where every item has `{label,value,icon,color}`.
- Produces: a four-record KPI list with a defined icon for every row.

- [ ] Write a failing regression test that rejects stray component entries inside the Resource Planning KPI array.
- [ ] Run the focused test and observe the expected failure on the current `Minus,` entry.
- [ ] Remove the stray entry without removing legitimate `Minus` icon usage elsewhere.
- [ ] Re-run focused test green.

### Task 2: Responsive dialog width/containment contract

**Files:**
- Modify: `src/components/shared/ResponsiveDialog.tsx`
- Test: `src/__tests__/ui/responsive-dialog-sizing.test.ts`

**Interfaces:**
- Produces: `size?: 'default' | 'wide' | 'extra-wide' | 'explorer'`, while retaining `desktopMaxWidth`, `large`, and `extraLarge`.

- [ ] Write failing tests for literal size-class mapping, precedence, and horizontal containment classes.
- [ ] Run red.
- [ ] Implement size presets and `min-w-0`/viewport-safe containment using literal Tailwind classes.
- [ ] Run green.

### Task 3: Purchase Order overflow fix

**Files:**
- Modify: `src/components/modules/InventoryPages.tsx`
- Test: `src/__tests__/inventory/purchase-order-modal-layout.test.ts`

**Interfaces:**
- Consumes: ResponsiveDialog `size="wide"`.
- Produces: PO line-item grid whose flexible column uses `minmax(0,1fr)` and cannot force modal expansion.

- [ ] Add failing layout contract test.
- [ ] Run red.
- [ ] Apply wide modal and min-width-safe grid/container classes.
- [ ] Run green.

### Task 4: Reusable machine explorer selection mode

**Files:**
- Modify: `src/components/digital-twin/MachineVisualExplorer.tsx`
- Test: `src/__tests__/assets/machine-visual-explorer-selection-contract.test.ts`

**Interfaces:**
- Produces: optional selection callback exposing the current selected component without changing normal Asset Detail behavior.

- [ ] Add failing selection-mode contract test.
- [ ] Run red.
- [ ] Add optional callback/selection-mode props and publish selected component changes while preserving existing explorer behavior.
- [ ] Run green.

### Task 5: PM Schedule asset search, target explorer, and View details

**Files:**
- Modify: `src/components/modules/MaintenancePages.tsx`
- Test: `src/__tests__/maintenance/pm-schedule-targeting-contract.test.ts`

**Interfaces:**
- Consumes: async asset search endpoint `/api/assets?search=...&page=...&limit=...`, `MachineVisualExplorer` selection callback, PM detail GET endpoint, ResponsiveDialog size presets.
- Produces: server-searchable asset selector, staged hierarchy target selection with Confirm, explicit whole-machine target, and View action/detail dialog.

- [ ] Add failing contract tests for server search, asset-change target reset, explorer open/confirm semantics, extra-wide PM form, and View action.
- [ ] Run red.
- [ ] Implement server search with enough page coverage for accessible assets and preserve selected option visibility.
- [ ] Replace the long component select with a compact target summary plus `Choose/Change PM Target` action.
- [ ] Add nested explorer dialog; Confirm commits `componentId`, Cancel leaves prior target untouched, Whole machine maps to `null`.
- [ ] Add View action and read-only detail dialog populated from `/api/pm-schedules/{id}`.
- [ ] Run green.

### Task 6: Verification and delivery

**Files:**
- No new product files beyond tasks above.

- [ ] Run all focused regression tests.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm test` and report any pre-existing/non-owned failures by name.
- [ ] Run production build.
- [ ] Run relevant browser/UAT gates available in the repository.
- [ ] Commit/push, open PR, require green CI, merge exact tested head, and verify deployed release before resuming the parked tool-custody branch.
