# Visual Machine Explorer Current-Main Forward-Port Plan

**Goal:** Forward-port the component-aware 3D Machine Visual Explorer onto current `main` while preserving the PM recurrence schema and all newer maintenance workflow behavior.

**Architecture:** Keep `ComponentRegistry` as the maintenance source of truth. Add an optional component target to `AssetMeshBinding`, validate same-machine ownership in mesh APIs, preserve component metadata through scene normalization, and let mapped 3D mesh selection drive the existing machine/component selection callbacks. Existing diagram, engineering 2D, exploded, and AI-image modes remain fallbacks.

**Forward-port constraint:** Since stale PR #562 branched, only `prisma/schema.prisma` among its 15 files changed on current `main`. Apply the schema change as a 3-way patch; never replace current schema wholesale. Rename the stale October migration to a current timestamp after the already-landed 2026-11-02 PM recurrence migration so deployment history remains monotonic.

## Verification sequence
- [ ] RED: apply only design + contract/normalization tests and prove current `main` lacks the 3D component-targeting behavior.
- [ ] GREEN: apply migration/schema/API/normalization/store/viewer/explorer implementation with current-main schema reconciliation.
- [ ] Run digital-twin + PM/Repairs hierarchy regression tests.
- [ ] Validate/generate Prisma, changed-file ESLint, Repairs TypeScript gate + debt ratchet, `git diff --check`, production build.
- [ ] Rebase/forward-port onto the latest `main` after PM portfolio #572 lands, then run exact-head GitHub CI before merge.
