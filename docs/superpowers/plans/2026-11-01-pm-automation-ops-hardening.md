# PM Automation Operations Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make iAssetsPro PM automation cron execution repository-owned, fail-closed, Accra-time logged, and reproducible on a rebuilt VPS.

**Architecture:** Keep the existing server-owned BullMQ scheduler as the primary PM scheduler. Store a five-minute watchdog runner and installer in `scripts/`, point the watchdog at the active release symlink, have it check `/api/pm-automation/status` first and fall back to `/api/pm-schedules/check-due-cron` only when primary automation is not confirmed healthy, and harden the legacy Bun scheduler so it cannot use a known fallback secret or stale port. No PM domain logic changes.

**Tech Stack:** Bash, Bun/TypeScript, Vitest, cron/flock, Next.js production runtime.

**Spec:** `docs/superpowers/designs/2026-11-01-pm-automation-ops-hardening.md`

## Global Constraints
- Preserve the current five-minute host-watchdog cadence and existing BullMQ scheduler cadence.
- Never print or persist `PM_CRON_SECRET` outside the existing `.env`.
- Default PM cron traffic to localhost.
- Do not change PM trigger/generation business logic.
- Do not change production deployment cutover behavior in this branch.

## Review Focus
- Missing `PM_CRON_SECRET` must fail closed without making an HTTP request.
- Two overlapping cron invocations must not execute simultaneously.
- Re-running the installer must produce the same cron definition without duplicate entries.
- Cron logs must render Africa/Accra time regardless of server timezone.
- Legacy Bun scheduler must not contain a default secret or assume port 3000.

---

### Task 1: Repository-owned PM watchdog runner

**Files:**
- Create: `scripts/iassetspro-pm-cron.sh`
- Create: `scripts/__tests__/pm-automation-ops.test.ts`

**Interfaces:**
- Consumes: active release `.env` at `${DEPLOY_PATH:-/home/lightworld/webapps/iassetspro}/.env` and `${PRODUCTION_PORT:-3001}`.
- Produces: executable watchdog that first reads `/api/pm-automation/status`, skips fallback when BullMQ is healthy, POSTs `/api/pm-schedules/check-due-cron` only when primary automation is not confirmed healthy, writes structured summaries, and uses an overlap lock.

- [ ] **Step 1: Write failing behavioral tests** that execute the runner against a temporary active-release directory: a valid secret produces a dry-run endpoint on port 3001 with an Africa/Accra timestamp and never exposes the secret; a missing secret fails before any HTTP call; two concurrent real-mode invocations with a controlled fake local HTTP boundary prove the second invocation logs `skip=overlap`.
- [ ] **Step 2: Run** `bunx vitest run scripts/__tests__/pm-automation-ops.test.ts` and confirm failure because the runner does not exist.
- [ ] **Step 3: Implement** `scripts/iassetspro-pm-cron.sh` with the production-proven behavior and environment-configurable paths/port.
- [ ] **Step 4: Run** the focused test and confirm it passes.

### Task 2: Idempotent cron bootstrap installer

**Files:**
- Create: `scripts/install-iassetspro-pm-cron.sh`
- Modify: `scripts/__tests__/pm-automation-ops.test.ts`
- Modify: `docs/VPS-DEPLOYMENT-GUIDE.md`

**Interfaces:**
- Consumes: tracked runner at `/home/lightworld/webapps/iassetspro/scripts/iassetspro-pm-cron.sh`.
- Produces: deterministic `/etc/cron.d/iassetspro-pm` with `CRON_TZ=Africa/Accra` and `*/5 * * * * root ...`; migrates away from the legacy marked root-crontab entry without touching unrelated cron lines.

- [ ] **Step 1: Add failing behavioral tests** that execute the installer modes: rendering twice returns the same `/etc/cron.d` payload with Africa/Accra and the five-minute active-release runner path; filtering a sample root crontab removes only the exact `# iassetspro-pm-cron` entry and is idempotent; normal installation as an unprivileged child exits with a root-required error before writing anything.
- [ ] **Step 2: Run** the focused test and confirm the new assertions fail.
- [ ] **Step 3: Implement** the installer using `install`/temporary file + atomic move, root check, and final validation.
- [ ] **Step 4: Document** the one-time bootstrap and verification commands in the VPS deployment guide.
- [ ] **Step 5: Run** the focused test and confirm it passes.

### Task 3: Fail-closed legacy Bun scheduler

**Files:**
- Modify: `mini-services/pm-cron/index.ts`
- Modify: `scripts/__tests__/pm-automation-ops.test.ts`

**Interfaces:**
- Consumes: `PM_CRON_SECRET`, optional `PM_CRON_TARGET_URL`, optional `PRODUCTION_PORT`.
- Produces: legacy scheduler process that refuses startup without a secret and defaults to `http://127.0.0.1:${PRODUCTION_PORT:-3001}/api/pm-schedules/check-due-cron`.

- [ ] **Step 1: Add failing behavioral tests** that start the legacy scheduler module in a child process: startup without `PM_CRON_SECRET` exits non-zero with a configuration error, while startup with a secret and `PRODUCTION_PORT=3999` reports the derived localhost:3999 target before the process is terminated.
- [ ] **Step 2: Run** the focused test and confirm failure on the current legacy implementation.
- [ ] **Step 3: Implement** fail-closed environment validation and configurable target URL.
- [ ] **Step 4: Run** the focused test and confirm it passes.

### Task 4: Ship the cron scripts in the immutable production artifact

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/__tests__/deploy-workflow-gate.test.ts`

**Interfaces:**
- Consumes: the two repository-owned PM cron scripts.
- Produces: a production release archive containing both executable scripts at `scripts/`.

- [ ] **Step 1: Add a failing artifact contract test** proving CI copies and verifies both executable cron scripts.
- [ ] **Step 2: Run** the focused deployment workflow test and confirm it fails on the current whitelist.
- [ ] **Step 3: Update** compact release assembly to copy, chmod, and `test -x` both files.
- [ ] **Step 4: Run** PM-ops plus deployment workflow tests and confirm they pass together.

### Task 5: Verification and branch completion

**Files:**
- No new production files.

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: verified branch ready for review/PR.

- [ ] **Step 1: Run** `bash -n scripts/iassetspro-pm-cron.sh scripts/install-iassetspro-pm-cron.sh`.
- [ ] **Step 2: Run** `bunx vitest run scripts/__tests__/pm-automation-ops.test.ts`.
- [ ] **Step 3: Run** `bun run lint` and record results.
- [ ] **Step 4: Run** `bun run test` and record full-suite results.
- [ ] **Step 5: Run** `git diff --check` and inspect final diff for secrets or production-only values.
- [ ] **Step 6: Commit** with a focused PM operations hardening message and push to the user's fork for PR creation.
