/**
 * CSV export for the *visible, plant-scoped* PM inspection worksheet page.
 * This receives only API-authorized rows; it does not query hidden plant data.
 */
export interface PmInspectionExportRow {
  name: string;
  inspectionType: string;
  parameterKey: string | null;
  normalRange: string | null;
  frequency: string;
  nextInspection: string | null;
  dueState: string;
  component: {
    name: string;
    componentCode: string;
    asset: { name: string; assetTag: string } | null;
  };
  latestRecord: {
    result: string;
    value: string | null;
    findings: string | null;
    inspectedAt: string;
  } | null;
  openCorrectiveWorkOrder: { woNumber: string; status: string } | null;
}

const headers = [
  'Machine', 'Asset tag', 'Part', 'Part code', 'Inspection', 'Method',
  'Parameter', 'Unit', 'Minimum', 'Maximum', 'Frequency', 'Next due',
  'Due status', 'Latest result', 'Latest reading', 'Last inspected',
  'Findings', 'Outstanding corrective WO', 'WO status',
];

function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  // Spreadsheet apps can evaluate untrusted text beginning with a formula
  // prefix. Prefix with a single quote before quoting the cell.
  const safe = /^[\u0000-\u0020]*[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function limits(source: string | null): { min: number | null; max: number | null; unit: string } {
  try {
    const range = JSON.parse(source || '{}') as { min?: unknown; max?: unknown; unit?: unknown };
    return {
      min: typeof range.min === 'number' && Number.isFinite(range.min) ? range.min : null,
      max: typeof range.max === 'number' && Number.isFinite(range.max) ? range.max : null,
      unit: typeof range.unit === 'string' ? range.unit : '',
    };
  } catch {
    return { min: null, max: null, unit: '' };
  }
}

function isoDate(value: string | null): string {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : '';
}

export function buildPmInspectionPageCsv(rows: PmInspectionExportRow[]): string {
  const data = rows.map((point) => {
    const range = limits(point.normalRange);
    return [
      point.component.asset?.name ?? '',
      point.component.asset?.assetTag ?? '',
      point.component.name,
      point.component.componentCode,
      point.name,
      point.inspectionType === 'measurement' ? 'Instrument' : 'Sight',
      point.parameterKey ?? '',
      range.unit,
      range.min,
      range.max,
      point.frequency,
      isoDate(point.nextInspection),
      point.dueState,
      point.latestRecord?.result ?? '',
      point.latestRecord?.value ?? '',
      isoDate(point.latestRecord?.inspectedAt ?? null),
      point.latestRecord?.findings ?? '',
      point.openCorrectiveWorkOrder?.woNumber ?? '',
      point.openCorrectiveWorkOrder?.status ?? '',
    ];
  });
  return [headers, ...data].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
