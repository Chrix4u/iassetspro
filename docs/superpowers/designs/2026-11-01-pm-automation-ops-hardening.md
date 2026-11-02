# PM Automation Operations Hardening Design

## Intent
Make iAssetsPro preventive-maintenance automation reproducible, fail-closed, and operationally understandable after server rebuilds or future deployments.

## Current state
Production already has a server-owned PM scheduler wired to the `maintenance-scheduling` BullMQ queue. Live logs confirm it successfully enqueues and completes a PM automation tick every minute. A separate root crontab also invokes `/home/lightworld/bin/iassetspro-pm-cron.sh` every five minutes, causing duplicate normal-path automation. That host runner is not tracked in the repository and logs in the server timezone (`-05:00`) even though its cron schedule is configured for Africa/Accra. The repository also contains a legacy Bun scheduler under `mini-services/pm-cron` with a hard-coded fallback secret and a port-3000 target that does not match production port 3001.

## Goals
- Put the PM host-watchdog runner under version control and include both watchdog scripts in the immutable production release artifact.
- Keep the runner fail-closed when `PM_CRON_SECRET` is absent.
- Use Africa/Accra timestamps in PM automation logs.
- Provide an idempotent bootstrap installer for the cron definition so a rebuilt VPS can recreate the schedule predictably.
- Keep the scheduled endpoint configurable through production port/deploy path settings rather than embedding an obsolete port.
- Remove the legacy scheduler's known-secret fallback and make it fail closed if accidentally started.
- Add automated contract tests for the runner, installer, legacy scheduler, and deployment documentation.

## Non-goals
- Do not change PM generation business logic or trigger evaluation rules.
- Do not manually invoke the production cron endpoint during tests.
- Do not change the current five-minute host-watchdog cadence or the BullMQ scheduler cadence.
- Do not introduce another always-on PM worker process.

## Approach
The canonical primary mechanism is the existing server-owned BullMQ scheduler. The host layer becomes a watchdog/fallback only. The repo will own `scripts/iassetspro-pm-cron.sh` and `scripts/install-iassetspro-pm-cron.sh`, and the compact production-artifact assembly explicitly copies and verifies both executable files. Every five minutes the watchdog will authenticate to `/api/pm-automation/status`; when health is `healthy` it logs and exits without triggering PM, and when primary health is degraded, starting, unavailable, or unknown it invokes the canonical `/api/pm-schedules/check-due-cron` fallback. The installer writes a deterministic `/etc/cron.d/iassetspro-pm` entry pointing at the tracked watchdog through `/home/lightworld/webapps/iassetspro`. During the one-time migration it removes only the legacy root-crontab line carrying the exact `# iassetspro-pm-cron` marker, preserving every unrelated root cron entry. The legacy Bun scheduler remains in-tree for compatibility but refuses to start without `PM_CRON_SECRET` and derives its target from `PRODUCTION_PORT`/`PM_CRON_TARGET_URL`.

## Safety constraints
- Never print or log `PM_CRON_SECRET`.
- Cron uses `flock` to suppress overlapping executions.
- Endpoint calls remain localhost-only by default.
- Bootstrap installation must be idempotent and safe to re-run.
- The installer must require root before writing `/etc/cron.d`.
- Legacy root-crontab cleanup must match only the exact `# iassetspro-pm-cron` marker and preserve every unrelated line.
- Existing application deploy behavior is not modified in this change; production cron activation is a separate explicit bootstrap step after the code lands.
