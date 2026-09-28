import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getSession, isAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
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

type ReconciliationOverride = {
  rowNumber: number;
  action: 'asset' | 'non_equipment';
  assetId?: string;
};

type ReportedTimeCorrection = {
  rowNumber: number;
  reportedAt: string;
  reason: string;
};

type EquipmentAssetMapping = {
  equipmentCode: string;
  assetId: string;
};


function parseReportedTimeCorrections(raw: FormDataEntryValue | null): ReportedTimeCorrection[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Invalid reported-time correction payload');

  return parsed.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid reported-time correction entry');
    const row = item as Record<string, unknown>;
    const rowNumber = Number(row.rowNumber);
    const reportedAt = typeof row.reportedAt === 'string' ? row.reportedAt.trim() : '';
    const reason = typeof row.reason === 'string' ? row.reason.trim() : '';

    if (!Number.isInteger(rowNumber) || rowNumber < 2) throw new Error('Invalid reported-time correction row number');
    const parsedDate = new Date(reportedAt);
    if (!reportedAt || Number.isNaN(parsedDate.getTime())) throw new Error('Reported-time correction requires a valid timestamp');
    if (reason.length < 8) throw new Error('Reported-time correction requires a reason of at least 8 characters');

    return { rowNumber, reportedAt: parsedDate.toISOString(), reason };
  });
}


function parseEquipmentMappings(raw: FormDataEntryValue | null): EquipmentAssetMapping[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Invalid equipment mapping payload');

  return parsed.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid equipment mapping entry');
    const row = item as Record<string, unknown>;
    const equipmentCode = typeof row.equipmentCode === 'string' ? row.equipmentCode.trim() : '';
    const assetId = typeof row.assetId === 'string' ? row.assetId.trim() : '';
    if (!equipmentCode) throw new Error('Equipment mapping requires an equipment code');
    if (!assetId) throw new Error('Equipment mapping requires an assetId');
    return { equipmentCode, assetId };
  });
}

const criticalityToLegacyPriority = (criticality?: string | null): number => {
  const value = String(criticality || '').toLowerCase();
  if (value === 'critical') return 1;
  if (value === 'high') return 2;
  return 3;
};

function parseOverrides(raw: FormDataEntryValue | null): ReconciliationOverride[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Invalid reconciliation override payload');
  return parsed.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid reconciliation override entry');
    const row = item as Record<string, unknown>;
    const rowNumber = Number(row.rowNumber);
    const action = row.action;
    const assetId = typeof row.assetId === 'string' ? row.assetId.trim() : undefined;
    if (!Number.isInteger(rowNumber) || rowNumber < 2) throw new Error('Invalid reconciliation row number');
    if (action !== 'asset' && action !== 'non_equipment') throw new Error('Invalid reconciliation action');
    if (action === 'asset' && !assetId) throw new Error('Asset mapping requires an assetId');
    return { rowNumber, action, assetId };
  });
}

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
    const session = getSession(request);
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

    const rawJobs = toJobs(XLSX.utils.sheet_to_json<RawRow>(workbook.Sheets.JobRecords!, { defval: null }));
    const machines = toMachines(XLSX.utils.sheet_to_json<RawRow>(workbook.Sheets.Machines!, { defval: null }));
    const overrides = parseOverrides(formData.get('overrides'));
    const overrideByRow = new Map(overrides.map((override) => [override.rowNumber, override]));
    const reportedTimeCorrections = parseReportedTimeCorrections(formData.get('reportedTimeCorrections'));
    const reportedTimeCorrectionByRow = new Map(
      reportedTimeCorrections.map((correction) => [correction.rowNumber, correction]),
    );
    const equipmentMappings = parseEquipmentMappings(formData.get('equipmentMappings'));
    const equipmentMappingByCode = new Map(equipmentMappings.map((mapping) => [mapping.equipmentCode, mapping.assetId]));

    const referencedAssetIds = [...new Set([
      ...overrides.filter((override) => override.action === 'asset').map((override) => override.assetId!).filter(Boolean),
      ...equipmentMappings.map((mapping) => mapping.assetId).filter(Boolean),
    ])];
    const referencedAssets = referencedAssetIds.length
      ? await db.asset.findMany({
          where: { id: { in: referencedAssetIds } },
          select: { id: true, name: true, assetTag: true, criticality: true },
        })
      : [];
    const assetById = new Map(referencedAssets.map((asset) => [asset.id, asset]));
    const missingAssetIds = referencedAssetIds.filter((id) => !assetById.has(id));
    if (missingAssetIds.length) {
      return NextResponse.json({
        success: false,
        error: 'One or more reconciliation Assets no longer exist',
        missingAssetIds,
      }, { status: 400 });
    }

    const reconciliation: Array<{
      rowNumber: number;
      workOrderNo: string;
      action: 'asset' | 'non_equipment';
      assetId: string | null;
      assetName: string | null;
    }> = [];

    const appliedReportedTimeCorrections: Array<{
      rowNumber: number;
      workOrderNo: string;
      reportedAt: string;
      reason: string;
    }> = [];

    const jobs = rawJobs.map((sourceJob) => {
      const rowNumber = Number(sourceJob.rowNumber || 0);
      const timeCorrection = reportedTimeCorrectionByRow.get(rowNumber);
      let job = sourceJob;

      if (timeCorrection) {
        if (sourceJob.reportedAt !== null && sourceJob.reportedAt !== undefined && String(sourceJob.reportedAt).trim() !== '') {
          throw new Error(`Reported time can only be corrected when the legacy row is missing it (row ${rowNumber})`);
        }
        job = { ...sourceJob, reportedAt: timeCorrection.reportedAt };
        appliedReportedTimeCorrections.push({
          rowNumber,
          workOrderNo: String(sourceJob.workOrderNo ?? ''),
          reportedAt: timeCorrection.reportedAt,
          reason: timeCorrection.reason,
        });
      }

      const override = overrideByRow.get(rowNumber);
      if (!override) return job;

      if (override.action === 'asset') {
        const asset = assetById.get(override.assetId!);
        if (!asset) return job;
        const syntheticCode = `APP-ASSET:${asset.id}`;
        machines.push({
          code: syntheticCode,
          name: asset.name,
          priority: criticalityToLegacyPriority(asset.criticality),
          order: null,
        });
        reconciliation.push({
          rowNumber,
          workOrderNo: String(job.workOrderNo ?? ''),
          action: 'asset',
          assetId: asset.id,
          assetName: asset.name,
        });
        return {
          ...job,
          equipmentCode: syntheticCode,
          equipmentDescription: asset.assetTag ? `${asset.name} [${asset.assetTag}]` : asset.name,
          priority: criticalityToLegacyPriority(asset.criticality),
        };
      }

      const syntheticCode = `NON-EQUIPMENT:${String(job.workOrderNo ?? rowNumber)}`;
      machines.push({
        code: syntheticCode,
        name: 'Non-equipment work',
        priority: [1, 2, 3].includes(Number(job.priority)) ? Number(job.priority) : 3,
        order: null,
      });
      reconciliation.push({
        rowNumber,
        workOrderNo: String(job.workOrderNo ?? ''),
        action: 'non_equipment',
        assetId: null,
        assetName: null,
      });
      return {
        ...job,
        equipmentCode: syntheticCode,
        equipmentDescription: 'Non-equipment work',
        priority: [1, 2, 3].includes(Number(job.priority)) ? job.priority : 3,
      };
    });

    const audit = auditGtpWorkbookRows(jobs, machines);

    // Spreadsheet consistency is not enough for a database import. Every
    // equipment-backed row must also resolve to a real iAssetsPro Asset.
    const readyAuditRows = audit.rows.filter((row) => row.importReady);
    const directEquipmentCodes = [...new Set(
      readyAuditRows
        .map((row) => row.equipmentCode)
        .filter((code) => code && !code.startsWith('APP-ASSET:') && !code.startsWith('NON-EQUIPMENT:')),
    )];

    const tenantAssets = directEquipmentCodes.length
      ? await db.asset.findMany({
          where: { assetTag: { in: directEquipmentCodes } },
          select: { id: true, assetTag: true, name: true, criticality: true, plantId: true },
        })
      : [];
    const tenantAssetByTag = new Map(tenantAssets.map((asset) => [asset.assetTag, asset]));

    const assetLinkageRows = readyAuditRows.map((row) => {
      if (row.equipmentCode.startsWith('APP-ASSET:')) {
        const assetId = row.equipmentCode.slice('APP-ASSET:'.length);
        const asset = referencedAssets.find((candidate) => candidate.id === assetId);
        return {
          legacyRowNumber: row.legacyRowNumber ?? null,
          legacyWorkOrderNo: row.legacyWorkOrderNo,
          equipmentCode: row.equipmentCode,
          equipmentName: row.equipmentName,
          assetId: asset?.id || assetId,
          assetTag: asset?.assetTag || null,
          assetName: asset?.name || row.equipmentName,
          resolution: 'admin_asset_override' as const,
          tenantReady: Boolean(asset),
        };
      }
      if (row.equipmentCode.startsWith('NON-EQUIPMENT:')) {
        return {
          legacyRowNumber: row.legacyRowNumber ?? null,
          legacyWorkOrderNo: row.legacyWorkOrderNo,
          equipmentCode: row.equipmentCode,
          equipmentName: row.equipmentName,
          assetId: null,
          assetTag: null,
          assetName: 'Non-equipment work',
          resolution: 'non_equipment' as const,
          tenantReady: true,
        };
      }

      const mappedAssetId = equipmentMappingByCode.get(row.equipmentCode);
      if (mappedAssetId) {
        const mappedAsset = assetById.get(mappedAssetId);
        return {
          legacyRowNumber: row.legacyRowNumber ?? null,
          legacyWorkOrderNo: row.legacyWorkOrderNo,
          equipmentCode: row.equipmentCode,
          equipmentName: row.equipmentName,
          assetId: mappedAsset?.id || mappedAssetId,
          assetTag: mappedAsset?.assetTag || null,
          assetName: mappedAsset?.name || null,
          resolution: 'legacy_code_mapping' as const,
          tenantReady: Boolean(mappedAsset),
        };
      }

      const asset = tenantAssetByTag.get(row.equipmentCode);
      return {
        legacyRowNumber: row.legacyRowNumber ?? null,
        legacyWorkOrderNo: row.legacyWorkOrderNo,
        equipmentCode: row.equipmentCode,
        equipmentName: row.equipmentName,
        assetId: asset?.id || null,
        assetTag: asset?.assetTag || null,
        assetName: asset?.name || null,
        resolution: asset ? 'asset_tag_match' as const : 'unlinked' as const,
        tenantReady: Boolean(asset),
      };
    });

    const tenantReadyRows = assetLinkageRows.filter((row) => row.tenantReady).length;
    const tenantBlockedRows = assetLinkageRows.length - tenantReadyRows;
    const unlinkedEquipmentCodes = [...new Set(
      assetLinkageRows
        .filter((row) => !row.tenantReady && row.resolution === 'unlinked')
        .map((row) => row.equipmentCode),
    )].sort();

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
        reconciliation: {
          overridesSubmitted: overrides.length,
          overridesApplied: reconciliation.length,
          rows: reconciliation,
          reportedTimeCorrectionsSubmitted: reportedTimeCorrections.length,
          reportedTimeCorrectionsApplied: appliedReportedTimeCorrections.length,
          reportedTimeCorrections: appliedReportedTimeCorrections,
        },
        workbook: {
          jobRecords: jobs.length,
          machineMasterRows: machines.length,
          uniqueMachineCodes: new Set(machines.map((machine) => machine.code).filter(Boolean)).size,
        },
        summary: audit.summary,
        tenantReadiness: {
          spreadsheetReadyRows: audit.summary.importReadyRows,
          tenantReadyRows,
          tenantBlockedRows,
          unlinkedEquipmentCodes,
          directlyMatchedAssetTags: tenantAssets.length,
          adminAssetOverrides: assetLinkageRows.filter((row) => row.resolution === 'admin_asset_override').length,
          legacyCodeMappingsSubmitted: equipmentMappings.length,
          legacyCodeMappedRows: assetLinkageRows.filter((row) => row.resolution === 'legacy_code_mapping').length,
          nonEquipmentRows: assetLinkageRows.filter((row) => row.resolution === 'non_equipment').length,
        },
        equipmentMappings: equipmentMappings.map((mapping) => {
          const asset = assetById.get(mapping.assetId);
          return {
            equipmentCode: mapping.equipmentCode,
            assetId: mapping.assetId,
            assetTag: asset?.assetTag || null,
            assetName: asset?.name || null,
          };
        }),
        assetLinkageRows: assetLinkageRows.slice(0, 500),
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