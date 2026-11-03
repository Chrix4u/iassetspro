# GTP Stenter 5 Commissioning Forward-Port Design

## Intent
Forward-port the evidence-derived GTP Stenter 5 component hierarchy and historical work-order mapping package from stale PR #315 onto current `main`, while applying the same fail-closed provenance safeguards already established for Stenter 6.

## Goals
- Restore the four Stenter 5 commissioner/verifier scripts on current main.
- Preserve the evidence-derived hierarchy for asset tag `UAT-GTP-340-5-007` with `GTP-ST5-*` component codes.
- Preserve dry-run support for historical work-order mapping.
- Exclude known non-Stenter-5/cross-machine rows before mapping rules run.
- Make verification fail closed when excluded rows receive provenance-tagged links.
- Keep all hierarchy names explicitly provisional pending OEM/nameplate/master-data verification.
- Add current-main contracts proving source parsing and exclusion safety.

## Non-goals
- No production data writes during this forward-port.
- No automatic execution of commissioning scripts.
- No schema migration or PM/Repairs workflow changes.
- No reinterpretation of historical maintenance titles beyond the evidence rules already present in PR #315.

## Constraints
- Base is current `main` at `00617693149050c008519988b186fe3f08ea6999`.
- Follow existing PostgreSQL adapter/Prisma script conventions.
- Stenter 5 work-order exclusions must run before component mapping rules.
- Verifiers must expose excluded provenance links in output and fail the PASS condition when any are found.
- All GTP commissioner/verifier TypeScript files must remain parseable by the existing source contract.

## Approaches considered
1. Merge stale PR #315 directly — rejected because its base predates extensive current-main work and lacks the newer fail-closed safety pattern.
2. Copy all four scripts unchanged — rejected because current Stenter 6 hardening established stronger exclusion/verifier requirements.
3. Forward-port the four scripts onto current main and add Stenter-5-specific safety contracts — selected. It preserves the proven historical mapping while minimizing regression risk and keeps production changes script-only.

## Acceptance
- New Stenter 5 scripts parse under the existing GTP TypeScript contract.
- A dedicated test proves cross-machine/facility exclusions execute before mapping rules.
- A dedicated verifier test proves excluded provenance links force failure.
- Full repository CI passes before merge.
