import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { fingerprintManifestCore, signManifestFingerprint } from '@/lib/gtp-migration-manifest';
import * as XLSX from 'xlsx';
import { getSession, isAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  auditGtpWorkbookRows,
  canonicalizeGtpTrade,
  type GtpLegacyJobRow,
  type GtpMachineMasterRow,
} from '@/services/migrations/gtpWorkbookMigration.service';
import { canDirectlyApplyGtpEvidence, rankGtpHistoricalEvidence } from '@/services/migrations/gtpReconciliationEvidence.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const REQUIRED_SHEETS = ['JobRecords', 'Machines', 'Trade', 'NewOder'] as const;
type RawRow = Record<string, unknown>;

type ReconciliationOverride = {
  rowNumber: number;
  action: 'asset' | 'non_equipment' | 'historical_unassigned';
  assetId?: string;
  reason?: string;
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
    const reason = typeof row.reason === 'string' ? row.reason.trim() : undefined;
    if (!Number.isInteger(rowNumber) || rowNumber < 2) throw new Error('Invalid reconciliation row number');
    if (action !== 'asset' && action !== 'non_equipment' && action !== 'historical_unassigned') {
      throw new Error('Invalid reconciliation action');
    }
    if (action === 'asset' && !assetId) throw new Error('Asset mapping requires an assetId');
    if ((action === 'non_equipment' || action === 'historical_unassigned') && (!reason || reason.length < 8)) {
      throw new Error('Non-Asset reconciliation requires a provenance reason of at least 8 characters');
    }
    return { rowNumber, action, assetId, reason };
  });
}

const asText = (value: unknown) => String(value ?? '').trim();
const normalizeIdentity = (value: unknown) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
const asIso = (value: Date | string | number | null | undefined): string | null => {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const mrPriorityFromWorkOrder = (priority: string | null): string =>
  priority === 'critical' ? 'urgent' : (priority || 'medium');
const asNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

type WorkbookParity = {
  authoritativeJobRecords: number;
  authoritativeBreakdowns: number;
  cachedBreakdownPivotTotal: number | null;
  breakdownPivotFresh: boolean;
  breakdownWeekMismatches: Array<{ week: string; source: number; cachedPivot: number }>;
  priorityOneBreakdowns: number;
  cachedPriorityOneBreakdowns: number | null;
  priorityOneBreakdownParity: boolean;
  priorityOneResponseMinutes: number;
  cachedResponseByWeekTotal: number | null;
  cachedResponseByMachineTotal: number | null;
  responseParity: boolean;
  legacyDowntimeFormulaErrorRows: Array<{ rowNumber: number; workOrderNo: string; equipmentDescription: string; value: string }>;
  warnings: string[];
};

const pivotRows = (sheet: XLSX.WorkSheet | undefined): unknown[][] =>
  sheet ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true }) : [];

const pivotGrandTotal = (sheet: XLSX.WorkSheet | undefined): number | null => {
  for (const row of pivotRows(sheet)) {
    if (String(row[0] ?? '').trim() !== 'Grand Total') continue;
    const numeric = Number(row[row.length - 1]);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
};

const pivotWeekCounts = (sheet: XLSX.WorkSheet | undefined): Map<string, number> => {
  const result = new Map<string, number>();
  for (const row of pivotRows(sheet)) {
    const week = String(row[0] ?? '').trim();
    const numeric = Number(row[1]);
    if (/^\d+$/.test(week) && Number.isFinite(numeric)) result.set(week, numeric);
  }
  return result;
};

function buildWorkbookParity(rawRows: RawRow[], workbook: XLSX.WorkBook): WorkbookParity {
  const breakdownRows = rawRows.filter((row) => asText(row['Work Order Type']).toLowerCase() === 'breakdown');
  const sourceWeeks = new Map<string, number>();
  for (const row of breakdownRows) {
    const week = asText(row['Prod week reported']);
    if (week) sourceWeeks.set(week, (sourceWeeks.get(week) || 0) + 1);
  }

  const cachedWeeks = pivotWeekCounts(workbook.Sheets.BD_Wk);
  const breakdownWeekMismatches = [...new Set([...sourceWeeks.keys(), ...cachedWeeks.keys()])]
    .sort((a, b) => Number(a) - Number(b))
    .flatMap((week) => {
      const source = sourceWeeks.get(week) || 0;
      const cachedPivot = cachedWeeks.get(week) || 0;
      return source === cachedPivot ? [] : [{ week, source, cachedPivot }];
    });

  const priorityOneRows = breakdownRows.filter((row) =>
    asText(row['Prod year reported']) === '2025' && Number(row['Priority']) === 1);
  const priorityOneResponseMinutes = priorityOneRows.reduce((sum, row) => {
    const value = Number(row['Response Time']);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  const formulaErrors = breakdownRows.flatMap((row, index) => {
    const value = asText(row['Downtime minutes breakdowns (date completed - date reported)']);
    if (!value.startsWith('#')) return [];
    return [{
      rowNumber: Number(row['Row No']) || index + 2,
      workOrderNo: asText(row['Work Order No']),
      equipmentDescription: asText(row['Equipment Description']),
      value,
    }];
  });

  const cachedBreakdownPivotTotal = pivotGrandTotal(workbook.Sheets.BD_Wk);
  const cachedPriorityOneBreakdowns = pivotGrandTotal(workbook.Sheets.No_BD_MC);
  const cachedResponseByWeekTotal = pivotGrandTotal(workbook.Sheets.Rpon_Wk);
  const cachedResponseByMachineTotal = pivotGrandTotal(workbook.Sheets.Rpons_MC);
  const close = (a: number, b: number | null) => b !== null && Math.abs(a - b) < 0.01;

  const warnings: string[] = [];
  if (cachedBreakdownPivotTotal !== breakdownRows.length) {
    warnings.push(`Cached BD_Wk pivot is stale: source has ${breakdownRows.length} breakdowns but pivot shows ${cachedBreakdownPivotTotal ?? 'unavailable'}.`);
  }
  if (formulaErrors.length) {
    warnings.push(`${formulaErrors.length} legacy breakdown row(s) contain Excel downtime formula errors; iAssetsPro must preserve these as unavailable rather than reproducing #VALUE!.`);
  }

  return {
    authoritativeJobRecords: rawRows.length,
    authoritativeBreakdowns: breakdownRows.length,
    cachedBreakdownPivotTotal,
    breakdownPivotFresh: cachedBreakdownPivotTotal === breakdownRows.length && breakdownWeekMismatches.length === 0,
    breakdownWeekMismatches,
    priorityOneBreakdowns: priorityOneRows.length,
    cachedPriorityOneBreakdowns,
    priorityOneBreakdownParity: cachedPriorityOneBreakdowns === priorityOneRows.length,
    priorityOneResponseMinutes: Number(priorityOneResponseMinutes.toFixed(6)),
    cachedResponseByWeekTotal,
    cachedResponseByMachineTotal,
    responseParity: close(priorityOneResponseMinutes, cachedResponseByWeekTotal)
      && close(priorityOneResponseMinutes, cachedResponseByMachineTotal),
    legacyDowntimeFormulaErrorRows: formulaErrors,
    warnings,
  };
}

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

    const workbookBuffer = Buffer.from(await file.arrayBuffer());
    const sourceSha256 = createHash('sha256').update(workbookBuffer).digest('hex');
    const workbook = XLSX.read(workbookBuffer, {
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

    const rawJobSheetRows = XLSX.utils.sheet_to_json<RawRow>(workbook.Sheets.JobRecords!, { defval: null, raw: true });
    const rawJobs = toJobs(rawJobSheetRows);
    const machines = toMachines(XLSX.utils.sheet_to_json<RawRow>(workbook.Sheets.Machines!, { defval: null }));
    const workbookParity = buildWorkbookParity(rawJobSheetRows, workbook);
    const overrides = parseOverrides(formData.get('overrides'));
    const overrideByRow = new Map(overrides.map((override) => [override.rowNumber, override]));
    const reportedTimeCorrections = parseReportedTimeCorrections(formData.get('reportedTimeCorrections'));
    const reportedTimeCorrectionByRow = new Map(
      reportedTimeCorrections.map((correction) => [correction.rowNumber, correction]),
    );
    const equipmentMappings = parseEquipmentMappings(formData.get('equipmentMappings'));
    const previewRequested = formData.get('preview') === 'true';
    const equipmentMappingByCode = new Map(equipmentMappings.map((mapping) => [mapping.equipmentCode, mapping.assetId]));

    const referencedAssetIds = [...new Set([
      ...overrides.filter((override) => override.action === 'asset').map((override) => override.assetId!).filter(Boolean),
      ...equipmentMappings.map((mapping) => mapping.assetId).filter(Boolean),
    ])];
    const referencedAssets = referencedAssetIds.length
      ? await db.asset.findMany({
          where: { id: { in: referencedAssetIds }, isActive: true },
          select: { id: true, name: true, assetTag: true, criticality: true, plantId: true },
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
      action: 'asset' | 'non_equipment' | 'historical_unassigned';
      assetId: string | null;
      assetName: string | null;
      reason: string | null;
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
          reason: override.reason || null,
        });
        return {
          ...job,
          equipmentCode: syntheticCode,
          equipmentDescription: asset.assetTag ? `${asset.name} [${asset.assetTag}]` : asset.name,
          priority: criticalityToLegacyPriority(asset.criticality),
        };
      }

      const isHistoricalUnassigned = override.action === 'historical_unassigned';
      const syntheticCode = isHistoricalUnassigned
        ? `HISTORICAL-UNASSIGNED:${String(job.workOrderNo ?? rowNumber)}`
        : `NON-EQUIPMENT:${String(job.workOrderNo ?? rowNumber)}`;
      const syntheticName = isHistoricalUnassigned ? 'Unassigned historical work' : 'Non-equipment work';
      machines.push({
        code: syntheticCode,
        name: syntheticName,
        priority: [1, 2, 3].includes(Number(job.priority)) ? Number(job.priority) : 3,
        order: null,
      });
      reconciliation.push({
        rowNumber,
        workOrderNo: String(job.workOrderNo ?? ''),
        action: override.action,
        assetId: null,
        assetName: null,
        reason: override.reason || null,
      });
      return {
        ...job,
        equipmentCode: syntheticCode,
        equipmentDescription: syntheticName,
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
        .filter((code) => code
          && !code.startsWith('APP-ASSET:')
          && !code.startsWith('NON-EQUIPMENT:')
          && !code.startsWith('HISTORICAL-UNASSIGNED:')),
    )];

    const [directTagAssets, legacyMetadataAssets] = await Promise.all([
      directEquipmentCodes.length
        ? db.asset.findMany({
            where: { assetTag: { in: directEquipmentCodes }, isActive: true },
            select: { id: true, assetTag: true, name: true, criticality: true, plantId: true, specification: true },
          })
        : [],
      db.asset.findMany({
        where: { isActive: true, specification: { contains: '"legacyCode"' } },
        select: { id: true, assetTag: true, name: true, criticality: true, plantId: true, specification: true },
      }),
    ]);
    const tenantAssets = [...new Map(
      [...directTagAssets, ...legacyMetadataAssets].map((asset) => [asset.id, asset]),
    ).values()];
    const tenantAssetByTag = new Map(tenantAssets.map((asset) => [asset.assetTag, asset]));
    const tenantAssetsByLegacyCode = new Map<string, typeof tenantAssets>();
    for (const asset of legacyMetadataAssets) {
      try {
        const spec = JSON.parse(asset.specification || '{}') as Record<string, unknown>;
        const legacyCode = typeof spec.legacyCode === 'string' ? spec.legacyCode.trim() : '';
        if (!legacyCode) continue;
        const group = tenantAssetsByLegacyCode.get(legacyCode) || [];
        group.push(asset);
        tenantAssetsByLegacyCode.set(legacyCode, group);
      } catch {
        // Non-JSON free-text specifications are valid elsewhere; ignore them here.
      }
    }
    const resolveLegacyMetadataAsset = (
      equipmentCode: string,
      equipmentName: string,
      mappedPriority?: string | null,
    ) => {
      const candidates = tenantAssetsByLegacyCode.get(equipmentCode) || [];
      if (candidates.length === 1) return candidates[0];
      const normalizedName = normalizeIdentity(equipmentName);
      const exactNameMatches = candidates.filter((asset) => normalizeIdentity(asset.name) === normalizedName);
      if (exactNameMatches.length === 1) return exactNameMatches[0];

      const legacyPriority = mappedPriority === 'critical' ? 1
        : mappedPriority === 'high' ? 2
        : mappedPriority === 'medium' ? 3
        : null;
      if (legacyPriority && exactNameMatches.length > 1) {
        const priorityMatches = exactNameMatches.filter((asset) => {
          try {
            const spec = JSON.parse(asset.specification || '{}') as Record<string, unknown>;
            return Number(spec.legacyPriority) === legacyPriority;
          } catch {
            return false;
          }
        });
        if (priorityMatches.length === 1) return priorityMatches[0];
      }
      return null;
    };

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
          plantId: asset?.plantId || null,
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
          plantId: null,
          resolution: 'non_equipment' as const,
          tenantReady: true,
        };
      }
      if (row.equipmentCode.startsWith('HISTORICAL-UNASSIGNED:')) {
        return {
          legacyRowNumber: row.legacyRowNumber ?? null,
          legacyWorkOrderNo: row.legacyWorkOrderNo,
          equipmentCode: row.equipmentCode,
          equipmentName: row.equipmentName,
          assetId: null,
          assetTag: null,
          assetName: 'Unassigned historical work',
          plantId: null,
          resolution: 'historical_unassigned' as const,
          tenantReady: true,
        };
      }

      // Duplicate legacy codes are only safe when the Asset Registry carries
      // the same legacyCode metadata and the resolved machine name identifies
      // exactly one physical Asset. Otherwise require an explicit row override.
      if (row.machineResolution === 'duplicate_resolved') {
        const legacyAsset = resolveLegacyMetadataAsset(row.equipmentCode, row.equipmentName, row.mappedPriority);
        if (legacyAsset) {
          return {
            legacyRowNumber: row.legacyRowNumber ?? null,
            legacyWorkOrderNo: row.legacyWorkOrderNo,
            equipmentCode: row.equipmentCode,
            equipmentName: row.equipmentName,
            assetId: legacyAsset.id,
            assetTag: legacyAsset.assetTag,
            assetName: legacyAsset.name,
            plantId: legacyAsset.plantId,
            resolution: 'legacy_metadata_match' as const,
            tenantReady: true,
          };
        }
        return {
          legacyRowNumber: row.legacyRowNumber ?? null,
          legacyWorkOrderNo: row.legacyWorkOrderNo,
          equipmentCode: row.equipmentCode,
          equipmentName: row.equipmentName,
          assetId: null,
          assetTag: null,
          assetName: null,
          plantId: null,
          resolution: 'duplicate_variant_unconfirmed' as const,
          tenantReady: false,
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
          plantId: mappedAsset?.plantId || null,
          resolution: 'legacy_code_mapping' as const,
          tenantReady: Boolean(mappedAsset),
        };
      }

      const asset = tenantAssetByTag.get(row.equipmentCode)
        || resolveLegacyMetadataAsset(row.equipmentCode, row.equipmentName, row.mappedPriority);
      const matchedByTag = asset?.assetTag === row.equipmentCode;
      return {
        legacyRowNumber: row.legacyRowNumber ?? null,
        legacyWorkOrderNo: row.legacyWorkOrderNo,
        equipmentCode: row.equipmentCode,
        equipmentName: row.equipmentName,
        assetId: asset?.id || null,
        assetTag: asset?.assetTag || null,
        assetName: asset?.name || null,
        plantId: asset?.plantId || null,
        resolution: asset
          ? (matchedByTag ? 'asset_tag_match' as const : 'legacy_metadata_match' as const)
          : 'unlinked' as const,
        tenantReady: Boolean(asset),
      };
    });

    const tenantReadyRows = assetLinkageRows.filter((row) => row.tenantReady).length;
    const legacyMetadataMatchedRows = assetLinkageRows.filter((row) => row.resolution === 'legacy_metadata_match').length;
    const tenantBlockedRows = assetLinkageRows.length - tenantReadyRows;
    const migrationPlantIds = [...new Set(
      assetLinkageRows
        .map((row) => row.plantId)
        .filter((plantId): plantId is string => Boolean(plantId)),
    )].sort();
    const migrationPlantId = migrationPlantIds.length === 1 ? migrationPlantIds[0] : null;
    const plantScopeBlockers = migrationPlantIds.length === 0
      ? ['Historical batch does not resolve to a migration plant']
      : migrationPlantIds.length > 1
        ? [`Historical batch spans ${migrationPlantIds.length} plants and must be split before import`]
        : [];
    const unlinkedEquipmentCodes = [...new Set(
      assetLinkageRows
        .filter((row) => !row.tenantReady && row.resolution === 'unlinked')
        .map((row) => row.equipmentCode),
    )].sort();

    const previewGateOpen = audit.summary.blockedRows === 0 && tenantBlockedRows === 0 && plantScopeBlockers.length === 0;
    let importPreview: Record<string, unknown> = {
      requested: previewRequested,
      available: previewGateOpen,
      safeToInsert: false,
      blockers: [
        ...(audit.summary.blockedRows > 0 ? [`${audit.summary.blockedRows} workbook row(s) remain blocked`] : []),
        ...(tenantBlockedRows > 0 ? [`${tenantBlockedRows} row(s) still lack an iAssetsPro Asset link`] : []),
        ...plantScopeBlockers,
      ],
    };

    if (previewRequested && previewGateOpen) {
      const linkageByRow = new Map(
        assetLinkageRows.map((row) => [row.legacyRowNumber, row]),
      );
      const proposedRows = audit.rows
        .filter((row) => row.importReady)
        .map((row) => {
          const job = jobs.find((candidate) => candidate.rowNumber === row.legacyRowNumber);
          const linkage = linkageByRow.get(row.legacyRowNumber ?? null);
          const legacyNo = row.legacyWorkOrderNo;
          const reconciliationDecision = overrideByRow.get(Number(row.legacyRowNumber || 0));
          const requestNumber = `GTP-MR-${legacyNo}`;
          const woNumber = `GTP-WO-${legacyNo}`;
          const title = job?.description || `${row.mappedType} - ${row.equipmentName || 'Historical maintenance'}`;

          return {
            legacyRowNumber: row.legacyRowNumber ?? null,
            legacyWorkOrderNo: legacyNo,
            sourceType: row.mappedType,
            sourceStatus: row.mappedStatus,
            statusSource: row.statusSource,
            assetId: linkage?.assetId || null,
            assetTag: linkage?.assetTag || null,
            assetName: linkage?.assetName || row.equipmentName || null,
            assetResolution: linkage?.resolution || null,
            reconciliationReason: reconciliationDecision?.reason || null,
            reportedAt: asIso(job?.reportedAt),
            workStartedAt: asIso(job?.workStartedAt),
            workCompletedAt: asIso(job?.workCompletedAt),
            trade: canonicalizeGtpTrade(job?.trade || null),
            legacyPeople: {
              requestedBy: job?.requestedBy || null,
              plannedBy: job?.plannedBy || null,
              assignedTo: job?.assignedTo || null,
              department: job?.department || null,
            },
            proposedMaintenanceRequest: {
              requestNumber,
              title,
              priority: mrPriorityFromWorkOrder(row.mappedPriority),
              assetId: linkage?.assetId || null,
              assetName: linkage?.assetName || row.equipmentName || null,
              status: row.mappedStatus === 'closed' ? 'converted' : 'pending',
              workflowStatus: row.mappedStatus === 'closed' ? 'closed' : 'work_order_created',
              createdAt: asIso(job?.reportedAt),
            },
            proposedWorkOrder: {
              woNumber,
              title,
              type: row.mappedType,
              priority: row.mappedPriority || 'medium',
              status: row.mappedStatus || 'requested',
              assetId: linkage?.assetId || null,
              assetName: linkage?.assetName || row.equipmentName || null,
              tradeActivity: canonicalizeGtpTrade(job?.trade || null),
              actualStart: asIso(job?.workStartedAt),
              actualEnd: asIso(job?.workCompletedAt),
            },
          };
        });

      const woNumbers = proposedRows.map((row) => row.proposedWorkOrder.woNumber);
      const requestNumbers = proposedRows.map((row) => row.proposedMaintenanceRequest.requestNumber);
      const sourceIdentityCounts = new Map<string, number>();
      for (const row of proposedRows) {
        const identity = row.legacyWorkOrderNo;
        sourceIdentityCounts.set(identity, (sourceIdentityCounts.get(identity) || 0) + 1);
      }
      const sourceIdentityCollisions = [...sourceIdentityCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([legacyWorkOrderNo, count]) => ({
          legacyWorkOrderNo,
          count,
          requestNumber: `GTP-MR-${legacyWorkOrderNo}`,
          woNumber: `GTP-WO-${legacyWorkOrderNo}`,
        }));

      const [existingWorkOrders, existingRequests] = await Promise.all([
        woNumbers.length
          ? db.workOrder.findMany({ where: { woNumber: { in: woNumbers } }, select: { id: true, woNumber: true } })
          : [],
        requestNumbers.length
          ? db.maintenanceRequest.findMany({ where: { requestNumber: { in: requestNumbers } }, select: { id: true, requestNumber: true } })
          : [],
      ]);
      const existingWoNumbers = new Set(existingWorkOrders.map((row) => row.woNumber));
      const existingRequestNumbers = new Set(existingRequests.map((row) => row.requestNumber));
      const collisions = proposedRows
        .filter((row) => existingWoNumbers.has(row.proposedWorkOrder.woNumber)
          || existingRequestNumbers.has(row.proposedMaintenanceRequest.requestNumber))
        .map((row) => ({
          legacyWorkOrderNo: row.legacyWorkOrderNo,
          woNumber: row.proposedWorkOrder.woNumber,
          requestNumber: row.proposedMaintenanceRequest.requestNumber,
          workOrderExists: existingWoNumbers.has(row.proposedWorkOrder.woNumber),
          maintenanceRequestExists: existingRequestNumbers.has(row.proposedMaintenanceRequest.requestNumber),
        }));

      const previewBlockers = [
        ...(sourceIdentityCollisions.length ? [`${sourceIdentityCollisions.length} duplicate legacy identity collision(s) detected`] : []),
        ...(collisions.length ? [`${collisions.length} existing database identity collision(s) detected`] : []),
      ];
      const identityConvention = {
        maintenanceRequest: 'GTP-MR-{legacyWorkOrderNo}',
        workOrder: 'GTP-WO-{legacyWorkOrderNo}',
      };
      const manifestCore = {
        schemaVersion: 'gtp-historical-import-preview/v1',
        source: {
          fileName: file.name,
          sizeBytes: file.size,
          sha256: sourceSha256,
        },
        reconciliation: {
          overrides: [...overrides].sort((a, b) => a.rowNumber - b.rowNumber),
          reportedTimeCorrections: [...reportedTimeCorrections].sort((a, b) => a.rowNumber - b.rowNumber),
          equipmentMappings: [...equipmentMappings].sort((a, b) => a.equipmentCode.localeCompare(b.equipmentCode)),
        },
        migrationActorUserId: session.userId,
        migrationPlantId: migrationPlantId!,
        identityConvention,
        counts: {
          rows: proposedRows.length,
          maintenanceRequests: proposedRows.length,
          workOrders: proposedRows.length,
        },
        workbookParity,
        rows: proposedRows,
      };
      const previewFingerprint = fingerprintManifestCore(manifestCore);
      const approvalSignature = signManifestFingerprint(previewFingerprint);
      const executionBlockers = [
        ...previewBlockers,
        ...(!approvalSignature ? ['GTP_MIGRATION_SIGNING_KEY is not configured on this server'] : []),
        ...(proposedRows.some((row) => !row.assetId
          && row.assetResolution !== 'non_equipment'
          && row.assetResolution !== 'historical_unassigned')
          ? ['Every resolved equipment-backed historical row must bind to a real Asset before write execution']
          : []),
      ];
      const approvedManifest = {
        ...manifestCore,
        generatedAt: new Date().toISOString(),
        fingerprint: previewFingerprint,
        approval: approvalSignature ? { algorithm: 'HMAC-SHA256', signature: approvalSignature } : null,
        safeToInsert: previewBlockers.length === 0,
        executionReady: executionBlockers.length === 0,
        blockers: previewBlockers,
        executionBlockers,
      };

      importPreview = {
        requested: true,
        available: true,
        safeToInsert: previewBlockers.length === 0,
        blockers: previewBlockers,
        totalRows: proposedRows.length,
        maintenanceRequestsToCreate: proposedRows.length,
        workOrdersToCreate: proposedRows.length,
        sourceIdentityCollisions,
        idempotencyCollisions: collisions,
        migrationActorUserId: session.userId,
        migrationPlantId,
        fingerprint: previewFingerprint,
        sourceSha256,
        identityConvention,
        manifest: approvedManifest,
        sample: proposedRows.slice(0, 100),
      };
    }

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

    const codedEvidenceJobs = rawJobs.filter((job) => {
      const code = asText(job.equipmentCode);
      return code
        && !code.startsWith('APP-ASSET:')
        && !code.startsWith('NON-EQUIPMENT:')
        && !code.startsWith('HISTORICAL-UNASSIGNED:');
    });

    const blankMachineCodeRows = jobs.filter((job) => !asText(job.equipmentCode)).map((job) => {
      const rankedSuggestions = rankGtpHistoricalEvidence(job, codedEvidenceJobs, 3);
      const suggestions = rankedSuggestions.map((candidate, index) => {
        const legacyAssets = tenantAssetsByLegacyCode.get(candidate.equipmentCode) || [];
        const resolvedAsset = tenantAssetByTag.get(candidate.equipmentCode)
          || (legacyAssets.length === 1 ? legacyAssets[0] : null);
        const uniquelyResolved = Boolean(
          resolvedAsset
          && (resolvedAsset.assetTag === candidate.equipmentCode || legacyAssets.length === 1),
        );
        return {
          ...candidate,
          assetId: resolvedAsset?.id || null,
          assetTag: resolvedAsset?.assetTag || null,
          assetName: resolvedAsset?.name || null,
          canApply: canDirectlyApplyGtpEvidence(rankedSuggestions, index, uniquelyResolved),
        };
      });

      return {
        rowNumber: job.rowNumber ?? null,
        workOrderNo: String(job.workOrderNo ?? ''),
        description: job.description || '',
        equipmentDescription: job.equipmentDescription || '',
        trade: job.trade || '',
        workOrderType: job.workOrderType || '',
        suggestions,
      };
    });

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
          sha256: sourceSha256,
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
        workbookParity,
        summary: audit.summary,
        tenantReadiness: {
          spreadsheetReadyRows: audit.summary.importReadyRows,
          tenantReadyRows,
          tenantBlockedRows,
          unlinkedEquipmentCodes,
          directlyMatchedAssetTags: assetLinkageRows.filter((row) => row.resolution === 'asset_tag_match').length,
          legacyMetadataMatchedRows,
          adminAssetOverrides: assetLinkageRows.filter((row) => row.resolution === 'admin_asset_override').length,
          legacyCodeMappingsSubmitted: equipmentMappings.length,
          legacyCodeMappedRows: assetLinkageRows.filter((row) => row.resolution === 'legacy_code_mapping').length,
          nonEquipmentRows: assetLinkageRows.filter((row) => row.resolution === 'non_equipment').length,
          historicalUnassignedRows: assetLinkageRows.filter((row) => row.resolution === 'historical_unassigned').length,
          migrationPlantId,
          migrationPlantIds,
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
        importPreview,
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