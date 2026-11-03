# Continuous Steamer forward-port implementation plan (2026-11-03)

## Task 1 — RED contract
- Add `scripts/__tests__/gtp-continuous-steamer-work-order-exclusions.test.ts`.
- Assert that all four commissioning/verification scripts are present and that the historical mapper and verifier both import one shared exclusion helper.
- Exclude separately identified Drying Range, Stenter, NNI and Azoic equipment, including word-spacing variants, **before** generic rule matching; allow genuinely Continuous Steamer maintenance titles.
- Verify excluded history and foreign-component links are explicit fail-closed checks and reported in UAT output.
- Check exact asset tag, `GTP-CST` component namespace, 53-node/9-root UAT hierarchy and historical 74/66/89 verifier thresholds.
- Require observed RED because the new scripts and helper are initially missing.

## Task 2 — Conservative GREEN
- Recover the four scripts from reference PR #309 and port only those files.
- Add a pure `scripts/lib/gtp-continuous-steamer-history-exclusions.ts` helper; use its single predicate in mapper and verifier.
- Preserve names, UAT disclosure, mapping rules, dry-run mode, atomic writes and the expected historical thresholds.
- Reject any mapped component that belongs to another asset or outside `GTP-CST-`.
- Do not modify application models, schema, production data, or scheduler code.

## Task 3 — Full verification and merge
- Run focused new contract then global Vitest, lint, full TypeScript/Repairs gate, production app/container builds, Repairs UAT, platform E2E and Required CI Gate.
- Ensure the branch is reconciled to current main and use exact SHA pinning for merge.
- Follow the successful main CI through production Deploy workflow. Never run UAT commissioning scripts on live production or implicitly through deploy.
