#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import {
  auditGtpWorkbookRows,
  type GtpLegacyJobRow,
  type GtpMachineMasterRow,
} from '../src/services/migrations/gtpWorkbookMigration.service';

const workbookPath = process.argv[2] || process.env.GTP_WORKBOOK_PATH;
if (!workbookPath) {
  console.error('Usage: npx tsx scripts/audit-gtp-workbook.ts /path/to/Work\ Orders.xlsm [output.json]');
  process.exit(2);
}
if (!fs.existsSync(workbookPath)) {
  console.error(`Workbook not found: ${workbookPath}`);
  process.exit(2);
}

const workbook = XLSX.readFile(workbookPath, { cellDates: true, bookVBA: true });
for (const required of ['JobRecords', 'Machines', 'Trade', 'NewOder']) {
  if (!workbook.SheetNames.includes(required)) {
    throw new Error(`Required GTP sheet is missing: ${required}`);
  }
}

const jobRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.JobRecords, { defval: null });
const machineRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Machines, { defval: null });

const jobs: GtpLegacyJobRow[] = jobRows
  .filter((row) => row['Work Order No'] !== null && row['Work Order No'] !== '')
  .map((row, index) => ({
    rowNumber: Number(row['Row No']) || index + 2,
    workOrderNo: row['Work Order No'] as string | number | null,
    workOrderType: row['Work Order Type'] as string | null,
    workRequestNo: row['Work Request No'] as string | number | null,
    reportedAt: row['Date_Time _reported'] as Date | string | number | null,
    description: row['Work Request Description'] as string | null,
    equipmentCode: row['Equip Codes'] as string | null,
    equipmentDescription: row['Equipment Description'] as string | null,
    trade: (row['Trade'] || row['Trade type']) as string | null,
    workStartedAt: row['Work_Stated_Date/Time'] as Date | string | number | null,
    workStatus: row['Work Status'] as string | null,
    workCompletedAt: row['Work_Completed_Date/Time'] as Date | string | number | null,
    technicianReport: row["Technician's report after job"] as string | null,
    plannedBy: row['Planned by:'] as string | null,
    assignedTo: row['Assigned to:'] as string | null,
    requestedBy: row['Requested By'] as string | null,
    department: row['Department'] as string | null,
    priority: Number(row['Priority']) || null,
  }));

const machines: GtpMachineMasterRow[] = machineRows
  .map((row) => ({
    code: String(row['Machine code'] || row['Machine Code'] || '').trim(),
    name: String(row['Machine name'] || row['Machine Name'] || '').trim(),
    priority: Number(row['Priority']) || null,
    order: Number(row['Order']) || null,
  }))
  .filter((row) => row.code || row.name);

const audit = auditGtpWorkbookRows(jobs, machines);
const result = {
  source: path.basename(workbookPath),
  generatedAt: new Date().toISOString(),
  dryRun: true,
  workbook: {
    sheets: workbook.SheetNames,
    hasVba: Boolean((workbook as any).vbaraw),
    jobRecords: jobs.length,
    machines: machines.length,
  },
  ...audit,
};

const outputPath = process.argv[3];
if (outputPath) {
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`GTP audit written to ${outputPath}`);
}
console.log(JSON.stringify(result.summary, null, 2));
console.log('DRY RUN ONLY: no database records were created or changed.');