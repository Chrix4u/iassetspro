import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getSession, hasAnyPermission, isAdmin } from '@/lib/auth';
import { generateReportPDF } from '@/lib/generate-report-pdf';
import { GET as getMaintenanceReport } from '../route';

type ReportWorkOrder = {
  woNumber?: string | null;
  title?: string | null;
  type?: string | null;
  priority?: string | null;
  status?: string | null;
  assetName?: string | null;
  assetTag?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  category?: string | null;
  criticality?: string | null;
  location?: string | null;
  assigneeName?: string | null;
  teamLeaderName?: string | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  materialCost?: number | null;
  laborCost?: number | null;
  totalCost?: number | null;
  downtimeMinutes?: number | null;
  createdAt?: string | null;
  completedDate?: string | null;
  plannedEnd?: string | null;
  departmentId?: string | null;
  plantId?: string | null;
};

type WorkOrderAssetGroup = {
  assetName?: string | null;
  assetTag?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  category?: string | null;
  criticality?: string | null;
  location?: string | null;
  workOrders?: ReportWorkOrder[];
};

type ReportData = {
  summary?: Record<string, string | number | null | undefined>;
  recentWorkOrders?: ReportWorkOrder[];
  workOrdersByAsset?: WorkOrderAssetGroup[];
  technicianProductivity?: Array<Record<string, unknown>>;
  materialConsumption?: Array<Record<string, unknown>>;
  downtimeAnalysis?: {
    byCategory?: Array<Record<string, unknown>>;
    byImpactLevel?: Array<Record<string, unknown>>;
  };
};

type ExportFormat = 'csv' | 'xlsx' | 'pdf';

const WORK_ORDER_HEADERS = [
  'WO Number', 'Title', 'Type', 'Priority', 'Status', 'Asset', 'Asset Tag',
  'Manufacturer', 'Model', 'Serial Number', 'Category', 'Criticality', 'Location',
  'Assigned To', 'Team Leader', 'Estimated Hours', 'Actual Hours', 'Material Cost',
  'Labor Cost', 'Total Cost', 'Created', 'Planned End', 'Completed', 'Department ID',
  'Plant ID',
] as const;

function workOrderRow(wo: ReportWorkOrder): Array<string | number> {
  return [
    wo.woNumber || '',
    wo.title || '',
    wo.type || '',
    wo.priority || '',
    wo.status || '',
    wo.assetName || '',
    wo.assetTag || '',
    wo.manufacturer || '',
    wo.model || '',
    wo.serialNumber || '',
    wo.category || '',
    wo.criticality || '',
    wo.location || '',
    wo.assigneeName || '',
    wo.teamLeaderName || '',
    wo.estimatedHours ?? '',
    wo.actualHours ?? '',
    wo.materialCost ?? 0,
    wo.laborCost ?? 0,
    wo.totalCost ?? 0,
    wo.createdAt || '',
    wo.plannedEnd || '',
    wo.completedDate || '',
    wo.departmentId || '',
    wo.plantId || '',
  ];
}

function getExportWorkOrders(data: ReportData): ReportWorkOrder[] {
  if (Array.isArray(data.workOrdersByAsset) && data.workOrdersByAsset.length > 0) {
    return data.workOrdersByAsset.flatMap(group =>
      (group.workOrders || []).map(workOrder => ({
        ...workOrder,
        assetName: workOrder.assetName || group.assetName || '',
        assetTag: workOrder.assetTag || group.assetTag || '',
        manufacturer: workOrder.manufacturer || group.manufacturer || '',
        model: workOrder.model || group.model || '',
        serialNumber: workOrder.serialNumber || group.serialNumber || '',
        category: workOrder.category || group.category || '',
        criticality: workOrder.criticality || group.criticality || '',
        location: workOrder.location || group.location || '',
      })),
    );
  }

  return data.recentWorkOrders || [];
}

function csvEscape(value: string | number): string {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(workOrders: ReportWorkOrder[]): string {
  return [
    WORK_ORDER_HEADERS.map(csvEscape).join(','),
    ...workOrders.map(wo => workOrderRow(wo).map(csvEscape).join(',')),
  ].join('\r\n');
}

function appendObjectSheet(workbook: XLSX.WorkBook, rows: Array<Record<string, unknown>>, name: string) {
  if (!rows.length) return;
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, name.slice(0, 31));
}

function buildWorkbook(data: ReportData): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const summaryEntries = Object.entries(data.summary || {}).map(([metric, value]) => ({
    Metric: metric,
    Value: value ?? '',
  }));
  const summarySheet = XLSX.utils.json_to_sheet(summaryEntries.length ? summaryEntries : [{ Metric: 'No summary data', Value: '' }]);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  const workOrders = getExportWorkOrders(data);
  const woSheet = XLSX.utils.aoa_to_sheet([
    [...WORK_ORDER_HEADERS],
    ...workOrders.map(workOrderRow),
  ]);
  woSheet['!autofilter'] = { ref: `A1:Y${Math.max(1, workOrders.length + 1)}` };
  woSheet['!cols'] = WORK_ORDER_HEADERS.map((header) => ({ wch: Math.min(34, Math.max(12, header.length + 2)) }));
  XLSX.utils.book_append_sheet(workbook, woSheet, 'Work Orders');

  appendObjectSheet(workbook, data.technicianProductivity || [], 'Technicians');
  appendObjectSheet(workbook, data.materialConsumption || [], 'Materials');
  appendObjectSheet(workbook, data.downtimeAnalysis?.byCategory || [], 'Downtime Category');
  appendObjectSheet(workbook, data.downtimeAnalysis?.byImpactLevel || [], 'Downtime Impact');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return new Uint8Array(buffer);
}

function summaryValue(data: ReportData, key: string): string | number {
  const value = data.summary?.[key];
  return typeof value === 'string' || typeof value === 'number' ? value : 0;
}

function readableDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
}

async function buildPdf(
  data: ReportData,
  workOrders: ReportWorkOrder[],
  searchParams: URLSearchParams,
  generatedBy: string,
): Promise<Uint8Array> {
  const start = searchParams.get('startDate') || 'All dates';
  const end = searchParams.get('endDate') || 'All dates';
  const moduleFilter = searchParams.get('moduleFilter') || 'all';
  const plantId = searchParams.get('plantId') || 'All accessible plants';
  const departmentId = searchParams.get('departmentId') || 'All departments';

  const buffer = await generateReportPDF({
    title: 'Repairs / RWOP Maintenance Report',
    subtitle: 'Enterprise maintenance performance and work-order detail',
    generatedBy,
    generatedAt: new Date(),
    filters: {
      'Date range': `${start} to ${end}`,
      'Maintenance scope': moduleFilter,
      Plant: plantId,
      Department: departmentId,
    },
    sections: [
      {
        title: 'Management Summary',
        type: 'summary-cards',
        data: [
          { label: 'Total Work Orders', value: summaryValue(data, 'totalWOs') },
          { label: 'Completed', value: summaryValue(data, 'completedWOs') },
          { label: 'Completion Rate', value: `${summaryValue(data, 'completionRate')}%` },
          { label: 'Open Work Orders', value: summaryValue(data, 'openWOs') },
          { label: 'SLA Compliance', value: `${summaryValue(data, 'slaComplianceRate')}%` },
          { label: 'Total Cost (GHS)', value: summaryValue(data, 'totalCost') },
        ],
      },
      {
        title: 'Work Order Detail',
        type: 'table',
        data: {
          headers: ['WO', 'Title', 'Type', 'Priority', 'Status', 'Asset', 'Assigned', 'Hours', 'Cost', 'Created'],
          rows: workOrders.map(wo => [
            wo.woNumber || '',
            wo.title || '',
            wo.type || '',
            wo.priority || '',
            wo.status || '',
            wo.assetName || '',
            wo.assigneeName || wo.teamLeaderName || '',
            wo.actualHours ?? wo.estimatedHours ?? '',
            wo.totalCost ?? 0,
            readableDate(wo.createdAt),
          ]),
        },
      },
    ],
  });

  return new Uint8Array(buffer);
}

function exportFilename(searchParams: URLSearchParams, extension: ExportFormat): string {
  const start = searchParams.get('startDate') || 'all';
  const end = searchParams.get('endDate') || 'all';
  const moduleFilter = searchParams.get('moduleFilter') || 'all';
  return `maintenance-report-${moduleFilter}-${start}-to-${end}.${extension}`;
}

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!hasAnyPermission(session, ['reports.export']) && !isAdmin(session)) {
    return NextResponse.json({ success: false, error: 'Insufficient permissions: reports.export required' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const format = (searchParams.get('format') || 'xlsx').toLowerCase();
  if (!['xlsx', 'csv', 'pdf'].includes(format)) {
    return NextResponse.json({ success: false, error: 'Unsupported export format. Use xlsx, csv or pdf.' }, { status: 400 });
  }

  // Reuse the canonical maintenance-report handler so export inherits exactly
  // the same authenticated plant, department, date and module scoping rules.
  const reportResponse = await getMaintenanceReport(request);
  if (!reportResponse.ok) return reportResponse;

  const payload = await reportResponse.json() as { success?: boolean; data?: ReportData; error?: string };
  if (!payload.success || !payload.data) {
    return NextResponse.json({ success: false, error: payload.error || 'Failed to build maintenance export' }, { status: 500 });
  }

  const workOrders = getExportWorkOrders(payload.data);

  if (format === 'csv') {
    const csv = `\uFEFF${buildCsv(workOrders)}`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exportFilename(searchParams, 'csv')}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  }

  if (format === 'pdf') {
    const pdf = await buildPdf(
      payload.data,
      workOrders,
      searchParams,
      session.fullName || session.userId,
    );
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${exportFilename(searchParams, 'pdf')}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  }

  const workbook = buildWorkbook(payload.data);
  return new NextResponse(workbook, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${exportFilename(searchParams, 'xlsx')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}