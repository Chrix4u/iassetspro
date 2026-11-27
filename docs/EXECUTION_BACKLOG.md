# Execution backlog

This is the public-safe engineering execution ledger. Do not include customer identities, production records, credentials, infrastructure details, private audit evidence, or confidential acceptance documents. Keep detailed restricted acceptance evidence separately.

## Execution contract
- [ ] Select the highest priority unblocked vertical slice; verify requirements and current source before implementing.
- [ ] Complete database/API/UI/authorization, failure recovery, responsive layout, automated tests and documentation as applicable.
- [ ] Run exact-head required CI; merge only after all gates pass; verify combined main and release artifact deployment separately.
- [ ] Record commit, test run, deployment evidence and next action. A passing page test does not prove workflow acceptance.
- [ ] Use GitHub-built, checksum-verified releases; retain only active runtime and verified rollback on host. Never seed or mutate production for tests.

## P0 — Navigation, commissioning and acceptance
- [x] Original 73-route browser audit (#714).
- [x] Expanded 36-route operational audit (#717).
- [x] Final 17-route standalone audit (#719).
- [x] Three contextual detail routes passed on first contextual audit.
- [x] Final contextual viewer retest and combined 130-route audit (#722); deployed in f938d6c.
- [ ] Review screenshots at desktop/mobile, including intermediate widths and overflow in filter bars, tables, dialogs and navigation.
- [ ] Walk through complete isolated onboarding: organization, plant, departments, functional location hierarchy, equipment position, asset category and registration, assigned users.
- [ ] Verify primary and non-primary location assignment and historical snapshots; no implicit promotion.
- [ ] Create multilevel assemblies/parts, parameters, inspection criteria and explicit opening meter readings including zero; exercise edit, view, search and error recovery.
- [ ] Verify equipment image/nameplate ingestion, AI suggestions, human approval, duplicate prevention and source provenance.
- [ ] Verify licensed real CAD/scan import, model validation, component mapping, zoom/pan/rotate, exploded view and mobile controls. Clearly distinguish illustrative geometry; physical validation requires authorized evidence.
- [x] Installed spare-part plant and provenance integrity (#723): ten regression tests, merged and deployed.
- [ ] Independently verify remaining cross-plant asset/component relationships, concurrent duplicate/quantity handling and historical inconsistencies without mutating real records.

## P0 — Production operations
- [ ] Shift definitions including overnight, crew and team leader, planner targets and published plans.
- [ ] Restrict operator entry to assigned shift/asset and authorized time; validate target inheritance, units, delays, stoppages, defects and meter readings.
- [ ] Verify independent approval, repeat submission/idempotency, meter integration, correction audit and unauthorized role rejection.
- [ ] Compare production formulas and period aggregation to controlled workbook fixtures; daily, weekly, monthly, quarterly, yearly and custom interval exports; distinguish units and missing values.
- [x] Integrated isolated production meter → PM due → work-order closure → 10,500-yard recurrence regression (#725, CI 46033149251); merged.
- [ ] Complete owner-guided commissioning demonstration from fresh asset registration through production, PM and repairs.

## P0 — Preventive maintenance
- [ ] Task library, templates, part-specific assignments, calendar and usage frequencies only.
- [ ] Validate zero baselines, meter monotonicity, calendar recurrence, next due, scheduler idempotency and duplicate prevention.
- [ ] Inspection list filters, sight/instrument technique, parameter bounds and captured evidence.
- [ ] Failed inspections generate linked corrective work; verify authorization and lifecycle handoff.
- [ ] Planner scheduling/assignment, supervisor verification, technician evidence, completion and next-due reset only at authorized closure.
- [ ] Confirm PM reports, compliance, overdue, backlog and exports against controlled reference cases.

## P0 — Repairs and inventory
- [ ] Request, supervisor decision, planner review, conversion to work order, assignment, team lead and safety instructions.
- [ ] Parts/tools request, approval, reservation, issue, custody and handover; permissions and quantity constraints.
- [ ] Technician execution, start/pause/resume, time logs, readings before/after, attachments, tasks, used/wasted/returned materials.
- [ ] Storekeeper reconciliation, returned tools, damaged tools, transfers, defective components, refurbishment and scrap disposition.
- [ ] Verify stock/cost accounting, transaction rollback, concurrency, audit trace and no double counting.
- [ ] Supervisor verification/rework and planner closure; PDF work order, detailed repair report and historical workbook parity.
- [ ] Full isolated role-based demonstration with real fixture records; no production writes.

## P1 — Supporting modules and platform
- [ ] Asset health, reliability estimates and condition trend semantics; label proxies, validate actual data and calibration.
- [ ] Quality, safety, checklists, training, shift handover and time logs: test CRUD, workflow transitions, permissions and error states.
- [ ] IoT, monitoring, historian, connectivity, observability: test data ingestion, plant scope, empty/error/retry states and actual device integration where authorized.
- [ ] Reports, notifications, chat, settings, licensing and queue management: verify end-to-end functionality and role matrix.
- [ ] Responsive desktop/tablet/mobile UX, accessible dialogs, keyboard navigation, readable labels, loading/error/empty states.
- [ ] Security: API authorization, tenant/plant isolation, input validation, secret hygiene, concurrency, backup restoration and rollback.
- [ ] GitHub CI/CD: build, unit/browser suites, release package, checksums, deploy and health verification. Record any skipped tests and reason.
- [ ] Documentation: keep setup and role procedures accurate; distinguish automated coverage from physical/owner acceptance.
- [ ] Native/mobile/desktop packaging only where separately specified and applicable; do not claim a browser audit verifies native clients.

## Current checkpoint
- Live functional build d15a90b9 passed full CI 46044925404 and Deploy 46047719210; public health HTTP 200. Includes integrated production/PM, worker labor administration, responsive viewer and readable inspection parameters.
- Multilevel hierarchy #731 passed full CI 46045916072; independent location history #732 passed 46046323922; primary relocation and frozen MR/WO history #733 passed 46050176933. All merged; combined main 3005c550 CI 46052647826 pending.
- Private CAD runtime storage enabled and verified by storage preflight, successful restart, healthy database/cache and anonymous access denial. Active and rollback environment configuration aligned. Local encrypted backup service successful; off-server restore remains unverified.
- Commissioning preflight #734 includes primary assignment requirement and disabled/unsafe CAD storage detection; latest head 6160c627 CI 46051650427 pending.
- Photo provenance and same-machine hotspot integrity #735 forward-ports tested draft changes; full CI required. Draft #669 physical authenticity, independently approved actual-machine geometry, external backup restore and witnessed acceptance remain separate gates.
- #727 and #729 superseded by consolidated #725 and reconciled #730 respectively; do not merge stale duplicates.
- Next: merge only exact-head passing checks, deploy combined main, verify health and CAD readiness; execute remaining isolated UI commissioning and report parity, followed by witnessed site acceptance. Never certify physical machine or OEM source from synthetic fixtures.

## P0 — GitHub-first storage consolidation (2026-11-27)
- [x] Confirm current production source is reachable on GitHub main and exact-head CI/deploy succeeded (46064052137 / 46067118747).
- [x] Confirm public application and health endpoint respond successfully; database and cache health pass.
- [x] Confirm production release retention has active and immediate rollback only; checksum and deployment lock already exist.
- [ ] Rehearse checksum-verified recovery of the current active and rollback artifacts; publish durable GitHub Releases where supported.
- [ ] Complete full source checkout inventory, including nested and detached worktrees; compare local heads and edits against authoritative GitHub refs, inspect stashes, local branches, ignored data and service references.
- [ ] Preserve only reviewed legitimate changes through approved GitHub refs; never publish secrets or confidential operational data to this public repository. Keep restricted evidence separately.
- [ ] Remove entire verified obsolete checkouts with Git worktree metadata pruning; hold only specific unrecoverable or service-referenced paths and record the reason privately.
- [ ] Harden release retention with service-reference checks, verified recovery receipts and cleanup audit logging under the existing deployment lock.
- [ ] Verify authentication, admin, worker/cron, integrations, backup restoration readiness, and application health after cleanup; record measured filesystem delta separately from allocated directory bytes.
- [ ] Do not declare consolidation complete until all above gates pass. Do not initiate unnecessary deployment for documentation-only updates.
