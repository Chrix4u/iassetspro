# GTP Stenter 5 Commissioning Forward-Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Forward-port the Stenter 5 hierarchy and historical work-order commissioning scripts onto current main with fail-closed exclusion safety and zero automatic production writes.

**Architecture:** Keep the work isolated to four Prisma/TypeScript commissioning scripts plus source-level regression contracts. Reuse the stale PR #315 evidence mappings, but upgrade work-order exclusion and verifier behavior to the current Stenter 6 safety standard.

**Tech Stack:** TypeScript, Prisma, PostgreSQL adapter, Vitest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-03-gtp-stenter5-commissioning-forward-port-design.md`

## Global Constraints
- Base is `00617693149050c008519988b186fe3f08ea6999`.
- Do not run commissioning scripts against production.
- Preserve `DRY_RUN=1` support in historical work-order mapping.
- Exclusions must be checked before mapping rules.
- Verifier PASS must require zero excluded provenance links.
- No schema, PM, or Repairs behavior changes.

## Review Focus
- A Stenter 6 historical title must never map to Stenter 5.
- Air-condition, wooden platform/pallet, and chemical-trolley rows must remain excluded.
- Excluded rows with old provenance links must be surfaced and fail verification.
- Hierarchy scripts must remain idempotent for existing `GTP-ST5-*` codes.
- Every GTP commissioner/verifier must parse as TypeScript after the forward-port.

---

### Task 1: Add Stenter 5 safety contracts

**Files:**
- Create: `scripts/__tests__/gtp-stenter5-work-order-exclusions.test.ts`
- Modify: `src/__tests__/assets/stenter6-commissioning-script-contract.test.ts`

**Interfaces:**
- Consumes: source text from the four Stenter 5 scripts.
- Produces: RED contracts for exclusion order, fail-closed verification, and global GTP script parsing.

- [ ] **Step 1:** Add source contracts asserting the Stenter 5 commissioner excludes cross-machine/facility rows before `RULES.filter(...)`.
- [ ] **Step 2:** Add verifier assertions requiring `crossMachineLinks`/excluded provenance links to participate in PASS.
- [ ] **Step 3:** Run the focused tests and verify RED because Stenter 5 scripts are absent on current main.
- [ ] **Step 4:** Commit the RED tests.

### Task 2: Forward-port hierarchy commissioner and verifier

**Files:**
- Create: `scripts/commission-gtp-stenter5-components.ts`
- Create: `scripts/verify-gtp-stenter5-components.ts`

**Interfaces:**
- Consumes: asset tag `UAT-GTP-340-5-007`, `GTP-ST5-*` hierarchy specification.
- Produces: idempotent hierarchy commissioner and structural verifier.

- [ ] **Step 1:** Port the hierarchy definitions and current PostgreSQL/Prisma adapter pattern from PR #315.
- [ ] **Step 2:** Preserve provisional-history notes and structural checks (node/root/orphan counts).
- [ ] **Step 3:** Run parsing/source contracts; fix only current-main compatibility issues.
- [ ] **Step 4:** Commit.

### Task 3: Forward-port historical work-order mapping with hardened exclusions

**Files:**
- Create: `scripts/commission-gtp-stenter5-work-order-components.ts`
- Create: `scripts/verify-gtp-stenter5-work-order-components.ts`

**Interfaces:**
- Consumes: Stenter 5 hierarchy codes, historical WO titles, provenance notes.
- Produces: dry-run capable mapping proposals/writes and fail-closed verification output.

- [ ] **Step 1:** Port PR #315 mapping rules and `DRY_RUN` behavior.
- [ ] **Step 2:** Apply exclusions for Stenter 6, air-condition, wooden platform/pallet, and chemical-trolley rows before rules run.
- [ ] **Step 3:** Make verifier collect excluded provenance links, include them in output, and require zero for PASS.
- [ ] **Step 4:** Run focused contracts and verify GREEN.
- [ ] **Step 5:** Commit.

### Task 4: Release verification and PR

**Files:**
- No production-file changes unless verification exposes a defect.

**Interfaces:**
- Consumes: completed forward-port branch.
- Produces: draft PR with full CI evidence and stale #315 supersession note.

- [ ] **Step 1:** Run focused Stenter 5/Stenter 6 source contracts.
- [ ] **Step 2:** Open a draft PR against current main.
- [ ] **Step 3:** Require full CI: unit, lint, TypeScript, production build, container build, Repairs UAT, platform E2E, Required CI Gate.
- [ ] **Step 4:** If full green, promote and merge exact verified head.
- [ ] **Step 5:** Close stale PR #315 with a pointer to the merged forward-port.
