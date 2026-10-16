# Functional Location Phase 3F — Enterprise Report Rollups

## Goal
Complete Functional Location descendant-aware reporting for the remaining operational/enterprise report APIs without weakening plant scope or historical maintenance semantics.

Production baseline: `091001b6c1f35320cb038f12f5eafba462f39ce7`.

## Scope

### 1. Labor Utilization
- Accept `functionalLocationId`.
- Resolve the selected hierarchy subtree through `resolveFunctionalLocationReportScope`.
- AND the snapshot-aware location filter with existing plant/date/department/status filters.
- Preserve current technician/department/trade calculations.

### 2. Repeat Failure Analysis
- Accept `functionalLocationId`.
- Resolve descendant scope.
- Qualify linked failure records through work orders that match the snapshot-aware hierarchy filter under plant scope.
- Include unlinked failure records only when the asset is currently in the selected subtree.
- Batch current asset locations for fallback only.
- Prefer immutable work-order location snapshots for historical failures and expose Location Code/path fields on asset results.

### 3. Enterprise Report
- Accept `functionalLocationId`.
- AND the snapshot-aware hierarchy filter into the main work-order query so backlog, labor, downtime, materials, planner, SLA and cost sections all roll up from the selected node.
- Apply the same snapshot-first/unlinked-current fallback to the enterprise repeat-failure subsection.
- Batch current live-location projection; do not add N+1 location lookups.
- Prefer coded Functional Location/path on asset-level rows while retaining legacy fields as fallback.

## Invariants
- Plant scope remains independent and authoritative; location scope is always an additional AND constraint.
- Empty/non-matching hierarchy subtrees fail closed.
- Historical work-order snapshots win over current asset location.
- Current primary Functional Location is fallback only where no frozen snapshot exists.
- No second Functional Location relationship is introduced on maintenance/report records.
- Legacy `location`, `building`, `floor`, and `area` fields remain transition fallbacks.
- No N+1 Functional Location queries.

## TDD / Verification Sequence
1. Add failing behavior tests for Labor Utilization, Repeat Failures, and Enterprise report hierarchy scoping.
2. Confirm the new tests fail on the production baseline behavior.
3. Implement the smallest API changes necessary to make those contracts green.
4. Run focused report/Functional Location regression tests.
5. Run lint, Repairs TypeScript hard gate, TypeScript debt ratchet, full Vitest, production build, container build, Repairs UAT and full platform E2E through repository CI.
6. Merge only after Required CI Gate succeeds, then deploy the exact tested main SHA through the immutable artifact workflow and verify production health.
