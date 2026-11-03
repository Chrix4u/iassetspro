# GTP Continuous Steamer commissioning forward-port — design (2026-11-03)

## Context
The stale PR #309 holds four UAT commissioning/verification scripts for asset `UAT-GTP-333-1-005` and component prefix `GTP-CST`. This design records how to forward-port it later onto current main without replaying stale application code. The asset hierarchy is provisional, not OEM-certified.

## Retained UAT contracts
- 53 nodes with 9 roots: 9 assemblies, 3 subassemblies, 17 components, 22 parts and 2 instruments.
- The historical work-order verifier expects exactly 74 work orders, at least 66 mapped (>=89%), and at least 89 matching links. These are old UAT expectations and must be verified against current data before any real commissioning.
- Preserve precise asset scoping, atomic hierarchy creation/update, historical provenance notes and title-rule mapping.
- Keep `DRY_RUN=1` on the history mapper; never run the commissioner or history writer during CI, merge or automatic production deploy.

## Safety upgrades before forward-port
- Replace the mapper's isolated `/drying range/i` exclusion with a shared pure title exclusion helper consumed by both mapper and verifier.
- Exclude drying range and similarly named neighboring machines/units and explicit unrelated utility work orders **before** matching generic component rules. Maintain a reviewed allowlist of genuinely asset-related titles; do not over-broaden exclusions based only on shared words like steam, bearing or fan.
- The verifier must explicitly list excluded-history links and fail if there are any, even if counts/coverage pass.
- Verify all mapped components belong to the target asset and `GTP-CST-` namespace; fail closed on foreign links.
- Preserve mapping thresholds and original rules unless test evidence demonstrates a specific correction.

## Execution
1. Branch from latest tested main after current NNI Machine 1 PR #580 is merged, or safely reconcile this design-only branch with main.
2. Add a RED contract for missing scripts, shared exclusions, and fail-closed cross-machine validation.
3. Forward-port exactly four scripts plus the pure shared predicate; drive focused tests GREEN.
4. Require full lint, TypeScript, Vitest, production builds, Repairs UAT, platform E2E, Required CI Gate, exact-head merge, and post-merge main CI/deploy verification.
5. Do not execute UAT scripts on production. Any data-writing UAT requires independent backup, targeted connection and dry-run assessment.
