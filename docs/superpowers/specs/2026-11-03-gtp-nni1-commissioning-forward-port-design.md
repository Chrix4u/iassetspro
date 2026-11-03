# GTP NNI Machine 1 commissioning forward-port — design (2026-11-03)

## Scope and baseline
Forward-port only the four script artifacts in old PR #314 onto current main. Preserve the NNI Machine 1 UAT tag `UAT-GTP-372-1-039`, `GTP-NNI1` component-code namespace and historical mapping rules. Do not import stale surrounding application code, mutate live data, or perform any automatic production deployment.

The hierarchy is a provisional maintenance-oriented 41-node structure: 8 assemblies, 2 subassemblies, 21 components and 10 parts. Preserve atomic parent-child creation and the explicit OEM/master-data provenance disclaimer. Treat the historical expected 64 work orders, >=50 mapped, >=78 mapped links and >=78% coverage as UAT verification thresholds, not verified live facts.

## Safety invariants
- The script targets the exact asset tag and its work orders only; component IDs must come from that same target asset and `GTP-NNI1` namespace.
- Reject irrelevant records **before** rule matching: wall fans (including wall-mounted variants), construction/concrete, gutters, azoic machines and other NNI machines such as NNI 2. Do not let generic matches such as bearing, fan or pump override exclusions.
- Use one shared, directly tested exclusion predicate from mapper and verifier so their behavior cannot drift. The verifier must explicitly report excluded historical links and exit nonzero if any remain, even when other count/coverage thresholds pass.
- Source provenance is conservative and clearly provisional. Do not imply production approval from a successful UAT verifier.
- The history mapper must retain an explicit dry-run path and an atomic transaction for writes. No background mutation of a database.
- Treat old PR #314 as reference only; forward-port onto latest main with new TDD evidence.

## Test / rollout
1. RED contract: tests check all exclusion variants and ensure the commissioner, mapper and verifier are present and import/use one shared exclusion helper.
2. GREEN: port four scripts, add the shared exclusion helper, and preserve historical thresholds and hierarchy counts.
3. Verify focused unit tests, full Vitest suite, lint, full TypeScript debt gate, production application/Docker builds, Repairs UAT, platform E2E and Required CI Gate.
4. Merge only with exact verified commit SHA; verify new main. Run UAT database scripts **only** on a deliberately selected UAT database and after dry-run review; never execute commissioning or history mapping against production as part of the PR merge.
