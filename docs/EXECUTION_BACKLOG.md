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
- [x] Isolated independent location history and primary relocation/frozen MR/WO snapshots (#732–733); actual browser reports passed in CI 46052647826.
- [x] Isolated factory workbook onboarding, multilevel assemblies/parts, parameters and meters (#731); actual browser test passed in CI 46052647826.
- [ ] Complete interactive commissioning for all input variants, editing, search, opening meter and error recovery.
- [ ] Verify equipment image/nameplate ingestion, AI suggestions, human approval, duplicate prevention and source provenance.
- [ ] Verify licensed real CAD/scan import, model validation, component mapping, zoom/pan/rotate, exploded view and mobile controls. Clearly distinguish illustrative geometry; physical validation requires authorized evidence.
- [x] Installed spare-part plant and provenance integrity (#723): ten regression tests, merged and deployed.
- [ ] Independently verify remaining cross-plant asset/component relationships, concurrent duplicate/quantity handling and historical inconsistencies without mutating real records.

## P0 — Production operations
- [ ] Shift definitions including overnight, crew and team leader, planner targets and published plans.
- [ ] Restrict operator entry to assigned shift/asset and authorized time; validate target inheritance, units, delays, stoppages, defects and meter readings.
- [ ] Verify independent approval, repeat submission/idempotency, meter integration, correction audit and unauthorized role rejection.
- [x] Compare production formula and period aggregation to controlled repository workbook mapping (#739, CI 46136357384); daily, Sunday-start weekly, monthly, quarterly, yearly, custom intervals, mixed units and unreported vs approved-zero shifts passed. Original external workbook and export parity remain separate acceptance tasks.
- [ ] Confirm original owner workbook and exported figures against witnessed input.
- [x] Integrated isolated production meter → PM due → work-order closure → 10,500-yard recurrence regression (#725, CI 46033149251); merged.
- [ ] Complete owner-guided commissioning demonstration from fresh asset registration through production, PM and repairs.

## P0 — Preventive maintenance
- [ ] Task library, templates, part-specific assignments, calendar and usage frequencies only.
- [ ] Validate zero baselines, meter monotonicity, calendar recurrence, next due, scheduler idempotency and duplicate prevention.
- [x] PM inspection filter layout and synthetic planner-to-A4 portrait worksheet (#736, #738 CI 46136160210); all 44 Repairs UAT cases passed, PDF attached.
- [ ] Verify sight/instrument technique, actual parameter bounds and physical evidence with engineer.
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
- Main 794996b8 passed required CI 46082341387 and Deploy 46084158226. Live health verified; earlier combined release 0589776f deployed via 46067118747.
- #731–733 actual isolated browser reports verified multilevel factory onboarding, independent location history and frozen maintenance location snapshots. Deployed CI 46052647826 platform reports: 220 passes, zero failures/flaky, 46 skips. Some older suites catch errors and skip; do not count those as coverage.
- #734 commissioning preflight and #735 private photo provenance/hotspot integrity merged and deployed. CAD storage preflight passes; private synthetic photo/scan acceptance passed. Genuine OEM geometry, actual machine evidence and off-server recovery remain separate gates.
- #736 PM and asset filter corrections merged; both responsive filter scenarios passed, but sticky shortcut scenario passed only on retry in CI 46066271910. This change reserves the shortcut footprint and checks the scroll viewport remains stable across visibility transitions on desktop/mobile. Exact-head CI required before merge.
- #737–739 merged and deployed as 815aacb4; combined CI 46138113796 and Deploy 46139776676 succeeded, live health verified. Main platform actual reports: 220 passes, 47 skips, no unexpected/flaky failures. The individual #738 Repairs UAT report had 44/44 first-pass; #739 period regression passed.
- #740 first exact-head CI 46140636752: 34 rewritten authentication, assets, dashboard and navigation tests passed first attempt; platform total 244 passed, 23 skips. Extended #740 replaces all eleven legacy suites with strict assertions and an isolated-fixture guard, adds viewer self-preferences access without administrative permissions, and corrects saved day-first date formatting. Latest head requires fresh CI and real report review before merge. Do not count intentional local-only/physical exclusions as passed.
- Next: resolve any strict-suite failures, verify combined main and deployment, complete additional isolated cross-module commissioning, and obtain genuine OEM/field evidence and witnessed owner/engineer acceptance. Never certify physical geometry or provenance using synthetic fixtures.
