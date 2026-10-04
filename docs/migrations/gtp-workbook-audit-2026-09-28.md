# GTP Work Orders workbook migration audit — 2026-09-28

Source workbook: `Work Orders 20062025.07(1).xlsm`

## Production import status — verified 2026-10-04

The September 28 sections below are retained as the original pre-import audit snapshot. The historical import was subsequently completed on **2026-09-30** and was verified directly against the production PostgreSQL database on **2026-10-04**.

- Historical work orders imported: **2,807 / 2,807**
- Matching maintenance requests: **2,807**
- Historical-import audit records: **2,807**
- Workbook source SHA-256: `b05a023b0486693ae54186f985e9a04b175571fabfc7a17f1b3963188a7967cc`
- Import batches:
  - workbook breakdown subset: **411**
  - remaining safe history: **2,376**
  - reconciled formerly blocked rows: **20**
- Final work-order types: **411 breakdown**, **2,372 corrective**, **24 preventive**
- Historical rows retained without an asset assignment: **19**

The 19 machine-less source rows are preserved as `Unassigned historical work` rather than discarded or fabricated onto an asset. The single source row with a missing reported timestamp was reconciled by using its recorded work-start timestamp; that correction is preserved in the row provenance as `reported_at_inferred_from_work_start`. All 2,807 imported work orders have matching historical-import audit evidence.

This snapshot records the dry-run reconciliation outcome used to prepare the historical migration into iAssetsPro. No database records were written.

## Workbook population

- Historical JobRecords: **2,807**
- True Breakdown work orders: **411**
- Import-ready after deterministic reconciliation: **2,787**
- Blocked pending manual/data repair: **20**

## Deterministic reconciliation

- Duplicate machine-master codes present: `342/1`, `360/1`, `393/1`
- Historical rows on duplicated codes that can be resolved from equipment description + legacy priority: **21**
- Remaining ambiguous duplicate-code history: **0**
- Rows with no machine code: **19**
- Rows missing reported timestamp: **1**
- Trade aliases normalized: **13**

### Duplicate-code rules proven by the workbook

- `342/1`: all 19 historical jobs identify **Inspection Table 1** with legacy priority **2**, which selects the intended machine-master row.
- `393/1`: both historical jobs identify **fountain cooler** with legacy priority **3**, which selects the intended machine-master row.
- `360/1`: duplicate master code exists but has **no historical JobRecords**, so it must be fixed in the master before future live use but does not block historical migration.

## Historical status quality

The legacy workbook contains:

- Completed: **1,802**
- Pending: **3**
- In-progress: **1**
- Blank status: **1,001**

Blank statuses are not silently treated as authoritative. iAssetsPro records them with inferred-status provenance:

- completion timestamp present → `closed`
- start timestamp present without completion → `in_progress`
- neither start nor completion timestamp → `requested`

All inferred statuses retain an audit warning so historical provenance remains visible.

## Breakdown timeline quality

Among the 411 legacy Breakdown rows:

- Missing work-start timestamp: **123**
- Missing completion timestamp: **106**

These rows may still be imported when their machine and reported timestamp are valid, but response/MTTR/restoration calculations remain unavailable where the source workbook lacks the necessary timestamp. The migration must not fabricate those values.

## Hard blockers

Only error-severity conditions stop automatic historical import:

1. missing Work Order No
2. missing/unmatched machine code
3. unresolved duplicate machine code
4. missing reported timestamp

The current workbook has **20** rows blocked by those rules.

## Next migration gate

Before historical insertion:

1. reconcile the 19 machine-less JobRecords with GTP;
2. repair or explicitly waive the single missing reported timestamp;
3. correct duplicate codes in the live Machines/Assets master, including unused `360/1`;
4. run the dry-run auditor again;
5. require zero error-severity rows before enabling the write/import command.