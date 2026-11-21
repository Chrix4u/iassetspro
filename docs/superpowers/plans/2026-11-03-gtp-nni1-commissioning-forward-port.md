# NNI Machine 1 forward-port implementation plan (2026-11-03)

## Task 1 — RED safety contract
- Add `scripts/__tests__/gtp-nni1-work-order-exclusions.test.ts`.
- Assert a shared pure predicate excludes wall fan / wall-mounted fan / concrete / gutter / azoic machine / NNI Machine 2 records, but keeps a genuine NNI 1 cloth-guider/chain work order.
- Assert mapper and verifier both import/use the same predicate, while the verifier fails on any excluded linked records.
- Verify RED in CI due to the missing helper and scripts. The RED commit must contain no production script.

## Task 2 — Minimal GREEN forward-port
- Port `commission-gtp-nni1-components.ts`, `commission-gtp-nni1-work-order-components.ts`, `verify-gtp-nni1-components.ts`, `verify-gtp-nni1-work-order-components.ts` from old PR #314.
- Add `scripts/lib/gtp-nni1-history-exclusions.ts` with shared `isExcludedNni1HistoryTitle(title)`, imported into the mapper and verifier.
- Ensure filtering occurs before any rule match and the verifier explicitly rejects excluded links. Preserve the original hierarchy and coverage thresholds, UAT tag, provenance marker, dry-run support and transaction.
- Avoid schema, migration, UI, scheduled task and deployment changes.

## Task 3 — Evidence and merge
- Verify focused GREEN and the global TypeScript parser contract that includes all GTP scripts.
- Full CI: Lint, TypeScript Repairs Release Gate + debt ratchet, full Vitest, Build, Production Container Build, Repairs UAT (Playwright), Platform E2E (Playwright), Required CI Gate.
- Promote draft PR only after green. Merge using `expected_head_sha`, then confirm `main` ref equals merge SHA.
- Do not run commissioning against live data. UAT data rollout requires separate dry-run assessment, owner review and a backup.
