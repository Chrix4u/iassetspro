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
- [ ] Check cross-plant asset/component/part relationships, inventory source and work order integrity (#723). Test concurrent duplicate/quantity handling and historical inconsistencies without mutating real records.

## P0 — Production operations
- [ ] Shift definitions including overnight, crew and team leader, planner targets and published plans.
- [ ] Restrict operator entry to assigned shift/asset and authorized time; validate target inheritance, units, delays, stoppages, defects and meter readings.
- [ ] Verify independent approval, repeat submission/idempotency, meter integration, correction audit and unauthorized role rejection.
- [ ] Compare production formulas and period aggregation to controlled workbook fixtures; daily, weekly, monthly, quarterly, yearly and custom interval exports; distinguish units and missing values.
- [ ] Execute integrated asset → production plan → operator submission → approval → usage-based PM due → work order → completion and next due.

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
- Verified live build 9ab5eb09; deployment 46027449260 passed. Installed part integrity #723 merged and deployed.
- Standalone viewer responsive correction #726 passed 46025805370 and merged as 237dd10a; combined deployment pending.
- Consolidated final acceptance branch #725 includes #727 labor configuration and #728 readable inspection parameters. Previous artifacts confirmed those views rendered; corrected test selectors and dialog close behavior. Replaced failed test-only DB import with real administrator rate API in the integrated PM workflow.
- Next: exact-head combined CI, fix failures only, merge, deploy, verify live health, then isolated owner demonstration. Do not claim full physical acceptance or OEM provenance without authorized evidence.
