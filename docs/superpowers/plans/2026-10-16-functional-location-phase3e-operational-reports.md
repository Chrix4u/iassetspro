# Functional Location Phase 3E — Operational Report Rollups

**Base:** `6a47e6c85cacef40a49dec5ef3ab72782ab7d02c` (Phase 3D production)

**Goal:** Make downtime, failure-analysis, and machine-availability reporting filterable by any Functional Location node including descendants, while preserving plant scope, maintenance-location history, and legacy fallback.

## Constraints
- Work-order-backed historical events use the Phase 3C location snapshot when present.
- Records without historical snapshots may fall back to the asset's current primary Functional Location.
- Machine availability is a current-machine view and filters the current asset population by the selected subtree.
- Empty subtree results fail closed; plant scope remains independently enforced.
- Location projection is batched; no per-row location calls.

## Task 1 — Shared report location scope
- RED tests for descendant location IDs, current asset IDs, and snapshot-aware WO filter.
- Add a small shared functional-location reporting helper.

## Task 2 — Downtime report
- RED behavior tests for plant-scope + hierarchy intersection, historical snapshot filtering, current fallback, and structured location projection.
- Add `functionalLocationId` query support and coded-path fields to asset breakdowns.

## Task 3 — Failure analysis
- RED behavior tests for historical work-order location filtering plus unlinked-current-asset fallback.
- Add coded-path fields to by-asset output.

## Task 4 — Machine availability
- RED behavior tests for descendant current-asset filtering and fail-closed empty subtrees.
- Add coded-path fields to machine rows.

## Task 5 — UI and release
- Add hierarchy selector/filter plumbing to the corresponding report surfaces without weakening existing date/plant filters.
- Run focused suites, full relevant report/location regressions, lint, Repairs TypeScript/debt gates, production build, PR CI, exact-SHA deployment, production smoke.
