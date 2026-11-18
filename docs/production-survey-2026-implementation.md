# Production Survey 2026 — workbook parity and UAT

Source: user-supplied `PRODUCTION SURVEY 2026.xlsx`, sheet `prod survey`, B:AY, rows 7–54.

## Workflow implemented

1. **Production planner** selects a registered machine. The workbook machine code is matched exactly against its asset tag for prefill of the 44 reference standard-utilization and speed benchmarks. A machine must exist in Assets; the application does not silently create duplicate asset records.
2. Planner registers machine-specific **Product (Design) Codes** and their units, selects morning/afternoon/night or a custom shift, sets start/end time, number of planned shifts, target per shift, available minutes and break allocation, and assigns active users for that plant including **one** shift leader. A shift template may be used for different days; roster and targets are date-specific. Up to 31 consecutive days may be scheduled in one action.
3. An operator with `production_surveys.create` sees only their own machine/date/shift roster. POST is checked against the same assignment in the database transaction. Operators cannot alter planner-owned targets. Records are submitted after the shift end (including overnight end on the following date).
4. Operator enters gross output and separate defective output, shift start delay and seven stoppage categories. Good output = gross - defective. An independent manager approves/rejects; only approved gross output advances the linked production meter, which the existing meter-based PM engine then reads.
5. Reports group **approved** entries by day, Sunday–Saturday week, month, quarter or year, with arbitrary dates (up to 366 days), machine filter, and CSV export. Planned targets are drawn from shift plans, not just submitted shifts; figures identify missing/unapproved shifts.

## Workbook fields and formulas

| Workbook cells | Corresponding system values/formula |
| --- | --- |
| B/C, O/P, AJ/AK | Registered machine / asset code |
| D–L | Planner shifts, hours, break allocation, shift target, available time |
| Q | Product/Design Code tied to the selected machine |
| R–T | Dated shift, assigned crew, shift team leader |
| U | Start-delay minutes (reported separately; not in Excel stoppage sum) |
| V and AQ | Defective output; quality losses tracked separately |
| W, X–AD | Total stoppages = break + repair + input/delivery + changeover + start-up/cleaning + others + PM |
| AE–AG, AP | Actual gross output aggregated across approved shifts |
| AL, AO | Productive minutes = available minutes - stoppages |
| AM | Available minutes |
| AR | Planner target for the period. Workbook formula D×K; the system sums published per-shift plan targets to support distinct shift targets |
| AS | Utilization % = 100×productive / available |
| AT | Standard utilization %; 44 machine benchmark references imported for exact asset-tag matches |
| AU | Speed = gross output / productive minutes |
| AV | Standard speed (yards/min) machine benchmark |
| AW | Productivity = gross output / available minutes |
| AX | Engineering efficiency % = 100×(available minutes - repair minutes) / available minutes |
| AY | Workbook cumulative within the report period = sum of approved shift output |
| Extended metric | All-time cumulative across prior approved machine-unit reports, useful for PM context |
| Extended metric | Good output and defect rate % = defects / gross × 100 |

Rates return null/— on zero denominators. Do not force blank shifts to zero. Mixed output units must not be added into a single misleading figure. The workbook does not supply real user identities, assigned plant mapping, shift times or product codes; planners configure those through the application.

## Data integrity and permissions

- One plan per machine/date/shift; one operator record per machine/date/shift; one leader per dated crew.
- Planner changes are rejected after an entry exists, and changes to rosters/targets are transactionally audited.
- Crew assignments must reference active plant users; users with production entry permissions cannot self-assign.
- Rejected records are correctable only by their original operator. Approved records and posted PM meter readings are immutable through this form.
- Meter quantities use **gross produced output**, not good output after quality losses; measured runtime must come from verified counter readings, not estimated productive minutes.
- New tables and columns are applied by migration `20261118231000_production_survey_roster_products_defects`; no user or machine records are silently seeded.

## Deployment / acceptance checks

1. Review PR and deploy the migration to a PostgreSQL staging/UAT database **before** serving the updated application. Do not run schema reset or modify the production database during development.
2. Create product codes on a registered machine, assign a supervisor and two operators, and schedule morning and night shifts on a test day.
3. Log in as one morning operator: only their shift should appear. Direct POST for the night shift must be rejected, even if the caller tampers with the request.
4. Attempt entry before the scheduled shift end, submit 20 gross output with 3 defective units afterward, and validate 17 good units in reports.
5. Independently approve the record; check gross output advanced only its linked production meter. Run PM threshold evaluation using the existing engine and confirm due/scheduled work orders separately.
6. Confirm report totals, targets, missing shifts, zero denominators and exports across daily/week/month/quarter/year.
7. Regression-test old, already-approved shift records and compare report period output against workbook formulas.
