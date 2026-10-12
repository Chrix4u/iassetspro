# TypeScript Debt Ratchet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make full-repository TypeScript debt memory-safe and visible while failing CI only for compiler/infrastructure failures, unattributable global diagnostics, or diagnostics in touched `.ts`/`.tsx` files.

**Architecture:** Keep `tsconfig.repairs.json` as the existing strict zero-error gate. Add a small CI ratchet runner that executes full `tsc --noEmit --pretty false` with a 4 GB heap, parses diagnostics, resolves the commit range to touched TypeScript files, writes a CI summary, and exits non-zero only for ratchet violations. Wire that runner into the existing typecheck job with full Git history available for diffing.

**Tech Stack:** TypeScript, Bun/tsx, TypeScript compiler, Vitest, GitHub Actions.

**Spec:** GitHub Issue #9 — `CI debt: ratchet full-repository TypeScript errors without blocking legacy cleanup`.

## Global Constraints

- Preserve `bunx tsc -p tsconfig.repairs.json --noEmit` unchanged as a strict hard gate.
- Full repository compile uses `--noEmit --pretty false` and at least 4096 MB Node heap.
- Compiler crash, signal, OOM, or non-diagnostic non-zero termination must fail CI.
- Global/unattributable TypeScript diagnostics must fail CI because they cannot be grandfathered to an untouched legacy file.
- Existing diagnostics in untouched files remain visible but non-blocking.
- Any diagnostic whose normalized path matches a touched `.ts` or `.tsx` file fails CI.
- CI summary reports total diagnostics, touched TypeScript files, touched-file diagnostics, and diagnostic concentration by module.

## Review Focus

- Push events where `github.event.before` is all zeros must fall back safely to the head parent.
- Workflow dispatch without a base SHA must still produce a deterministic touched-file range.
- Renamed TypeScript files must be treated as touched.
- Windows-style diagnostic paths must normalize to repository-relative slash paths.
- TypeScript config/global errors without a file path must fail instead of being counted as legacy debt.

---

### Task 1: Build the debt-ratchet policy and parser

**Files:**
- Create: `scripts/typescript-debt-ratchet.ts`
- Test: `src/__tests__/ci/typescript-debt-ratchet.test.ts`

**Interfaces:**
- Produces: `parseTypeScriptDiagnostics(output)`, `normalizeRepoPath(path)`, `evaluateCompilerRun(input)`, `diagnosticsForTouchedFiles(diagnostics, touchedFiles)`, `summarizeDiagnosticModules(diagnostics)`.

- [ ] **Step 1:** Write failing Vitest coverage for file diagnostics, global diagnostics, path normalization, touched-file matching, normal legacy-debt exit semantics, OOM/crash/non-diagnostic failure semantics, and module summaries.
- [ ] **Step 2:** Run the focused Vitest file and verify RED because the policy module does not yet exist.
- [ ] **Step 3:** Implement the pure policy/parser functions without invoking the compiler.
- [ ] **Step 4:** Run the focused Vitest file and verify GREEN.
- [ ] **Step 5:** Commit the policy and tests.

### Task 2: Add the executable CI ratchet and wire GitHub Actions

**Files:**
- Create: `scripts/check-typescript-debt-ratchet.ts`
- Modify: `.github/workflows/ci.yml`
- Test: `src/__tests__/ci/typescript-debt-ratchet.test.ts`

**Interfaces:**
- Consumes: Task 1 policy functions.
- Produces: CI command `bunx tsx scripts/check-typescript-debt-ratchet.ts` using `TYPECHECK_BASE_SHA` and `TYPECHECK_HEAD_SHA`.

- [ ] **Step 1:** Extend the failing test with source-level CI contracts: 4 GB heap, `fetch-depth: 0`, no `continue-on-error`, base/head SHA environment, and the ratchet runner command.
- [ ] **Step 2:** Run the focused test and verify RED on the existing workflow.
- [ ] **Step 3:** Implement the runner: resolve commit range, run `bunx tsc --noEmit --pretty false`, parse output, write `$GITHUB_STEP_SUMMARY`, print diagnostics, and exit according to the policy.
- [ ] **Step 4:** Replace the non-blocking debt-report step in `.github/workflows/ci.yml` with the ratchet runner while leaving the Repairs hard gate unchanged.
- [ ] **Step 5:** Run focused tests, lint, and the Repairs TypeScript gate; then run full PR CI and inspect the debt summary.
- [ ] **Step 6:** Commit and complete whole-branch review before merge.
