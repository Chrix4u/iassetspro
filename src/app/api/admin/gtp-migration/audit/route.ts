import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getSessionAsync, isAdmin } from '@/lib/auth';
import {
  auditGtpWorkbookRows,
  canonicalizeGtpTrade,
  type GtpLegacyJobRow,
  type GtpMachineMasterRow,
} from '@/services/migrations/gtpWorkbookMigration.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const REQUIRED_SHEETS = ['JobRecords', 'Machines', 'Trade', 'NewOder'] as const;
type RawRow = Record<string, unknown>;

const asText = (value: unknown) => String(value ?? '').trim();
const asNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

function toJobs(rows: RawRow[]): GtpLegacyJobRow[] {
  return rows
    .filter((row) => row['Work Order No'] !== null && row['Work Order No'] !== undefined && row['Work Order No'] !== '')
    .map((row, index) => ({
      rowNumber: asNumber(row['Row No']) ?? index + 2,
      workOrderNo: row['Work Order No'] as string | number | null,
      workOrderType: asText(row['Work Order Type']) || null,
      workRequestNo: row['Work Request No'] as string | number | null,
      reportedAt: row['Date_Time _reported'] as Date | string | number | null,
      description: asText(row['Work Request Description']) || null,
      equipmentCode: asText(row['Equip Codes']) || null,
      equipmentDescription: asText(row['Equipment Description']) || null,
      trade: asText(row['Trade type'] || row['Trade']) || null,
      workStartedAt: row['Work_Stated_Date/Time'] as Date | string | number | null,
      workStatus: asText(row['Work Status']) || null,
      workCompletedAt: row['Work_Completed_Date/Time'] as Date | string | number | null,
      technicianReport: asText(row["Technician's report after job"]) || null,
      plannedBy: asText(row['Planned by:']) || null,
      assignedTo: asText(row['Assigned to:']) || null,
      requestedBy: asText(row['Requested By']) || null,
      department: asText(row['Department']) || null,
      priority: asNumber(row['Priority']),
    }));
}

function toMachines(rows: RawRow[]): GtpMachineMasterRow[] {
  return rows
    .map((row) => ({
      code: asText(row['Machine code'] || row['Machine Code']),
      name: asText(row['Machine name'] || row['Machine Name']),
      priority: asNumber(row['Priority']),
      order: asNumber(row['Order']),
    }))
    .filter((row) => row.code || row.name);
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionAsync(request);
    if (!session || !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Administrator access required' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'GTP workbook file is required' }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ success: false, error: 'Workbook must be between 1 byte and 15 MB' }, { status: 400 });
    }
    if (!/\.(xlsm|xlsx)$/i.test(file.name)) {
      return NextResponse.json({ success: false, error: 'Only .xlsm or .xlsx workbooks are accepted' }, { status: 400 });
    }

    const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), {
      type: 'buffer',
      cellDates: true,
      bookVBA: true,
      cellFormula: true,
    });
    const missingSheets = REQUIRED_SHEETS.filter((name) => !workbook.SheetNames.includes(name));
    if (missingSheets.length) {
      return NextResponse.json({
        success: false,
        error: 'Workbook is missing required sheet(s): ' + missingSheets.join(', '),
      }, { status: 400 });
    }

    const jobs = toJobs(XLSX.utils.sheet_to_json<RawRow>(workbook.Sheets.JobRecords!, { defval: null }));
    const machines = toMachines(XLSX.utils.sheet_to_json<RawRow>(workbook.Sheets.Machines!, { defval: null }));
    const audit = auditGtpWorkbookRows(jobs, machines);

    const duplicateMachines = audit.summary.duplicateMachineCodes.map((code) => ({
      code,
      affectedJobs: jobs.filter((job) => asText(job.equipmentCode) === code).length,
      variants: machines.filter((machine) => machine.code === code).map((machine) => ({
        name: machine.name,
        priority: machine.priority ?? null,
        order: machine.order ?? null,
      })),
      sampleWorkOrders: jobs
        .filter((job) => asText(job.equipmentCode) === code)
        .slice(0, 20)
        .map((job) => String(job.workOrderNo ?? '')),
    }));

    const blankMachineCodeRows = jobs.filter((job) => !asText(job.equipmentCode)).map((job) => ({
      rowNumber: job.rowNumber ?? null,
      workOrderNo: String(job.workOrderNo ?? ''),
      description: job.description || '',
      equipmentDescription: job.equipmentDescription || '',
      trade: job.trade || '',
      workOrderType: job.workOrderType || '',
    }));

    const tradeMap = new Map<string, { from: string; to: string; count: number }>();
    for (const job of jobs) {
      const raw = asText(job.trade);
      const canonical = canonicalizeGtpTrade(raw);
      if (!raw || !canonical || raw === canonical) continue;
      const key = raw + '|||' + canonical;
      const row = tradeMap.get(key) || { from: raw, to: canonical, count: 0 };
      row.count += 1;
      tradeMap.set(key, row);
    }

    const jobByRow = new Map(jobs.map((job) => [job.rowNumber, job]));
    const blockedRows = audit.rows.filter((row) => !row.importReady).slice(0, 250).map((row) => {
      const job = jobByRow.get(row.legacyRowNumber);
      return {
        rowNumber: row.legacyRowNumber ?? null,
        workOrderNo: row.legacyWorkOrderNo,
        workOrderType: row.mappedType,
        equipmentCode: row.equipmentCode,
        equipmentName: row.equipmentName,
        description: job?.description || '',
        trade: job?.trade || '',
        priority: row.mappedPriority,
        issues: row.issues,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        dryRun: true,
        importLocked: true,
        source: {
          fileName: file.name,
          sizeBytes: file.size,
          sheets: workbook.SheetNames,
          requiredSheetsPresent: true,
          hasVba: Boolean((workbook as typeof workbook & { vbaraw?: unknown }).vbaraw),
        },
        workbook: {
          jobRecords: jobs.length,
          machineMasterRows: machines.length,
          uniqueMachineCodes: new Set(machines.map((machine) => machine.code).filter(Boolean)).size,
        },
        summary: audit.summary,
        duplicateMachines,
        blankMachineCodeRows,
        tradeNormalizations: [...tradeMap.values()].sort((a, b) => b.count - a.count || a.from.localeCompare(b.from)),
        blockedRows,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'GTP workbook audit failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

