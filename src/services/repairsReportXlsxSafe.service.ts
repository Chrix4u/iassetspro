import { db } from '@/lib/db';
import type { SessionData } from '@/lib/auth';
import {
  createStandardWorkbook,
  addDataSheet,
  addAnalyticsSheet,
  generateXlsxBuffer,
  buildFilename,
  type ReportColumn,
  type AnalyticsRow,
} from './reportExportXlsx.service';
import {
  generateReport as generateLegacyReport,
  type ReportFilters,
  type ReportResult,
  type ReportType,
} from './repairsReportXlsx.service';

function flattenFilters(filters: ReportFilters): Record<string, string | undefined> {
  return { ...filters };
}

function buildBaseWhere(filters: ReportFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (filters.plantId) where.plantId = filters.plantId;
  if (filters.status) where.status = filters.status;
  if (filters.priority) where.priority = filters.priority;
  if (filters.type) where.type = filters.type;
  if (filters.tradeActivity) where.tradeActivity = filters.tradeActivity;
  if (filters.departmentId) where.departmentId = filters.departmentId;
  if (filters.assetId) where.assetId = filters.assetId;
  if (filters.assigneeId) where.assignedTo = filters.assigneeId;

  if (filters.dateFrom || filters.dateTo) {
    const createdAt: Record<string, Date> = {};
    if (filters.dateFrom) createdAt.gte = new Date(`${filters.dateFrom}T00:00:00`);
    if (filters.dateTo) createdAt.lte = new Date(`${filters.dateTo}T23:59:59`);
    where.createdAt = createdAt;
  }
  return where;
}

function buildMrWhere(filters: ReportFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (filters.plantId) where.plantId = filters.plantId;
  if (filters.status) where.status = filters.status;
  if (filters.priority) where.priority = filters.priority;
  if (filters.departmentId) where.departmentId = filters.departmentId;
  if (filters.assetId) where.assetId = filters.assetId;

  if (filters.dateFrom || filters.dateTo) {
    const createdAt: Record<string, Date> = {};
    if (filters.dateFrom) createdAt.gte = new Date(`${filters.dateFrom}T00:00:00`);
    if (filters.dateTo) createdAt.lte = new Date(`${filters.dateTo}T23:59:59`);
    where.createdAt = createdAt;
  }
  return where;
}

function buildBreakdown(
  items: Array<Record<string, unknown>>,
  field: string,
): AnalyticsRow[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = String(item[field] ?? 'Unknown');
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const total = items.length || 1;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({
      [field]: value,
      Count: count,
      Percentage: `${((count / total) * 100).toFixed(1)}%`,
    }));
}

const WORK_ORDER_COLUMNS: ReportColumn[] = [
  { key: 'woNumber', header: 'WO Number', width: 22 },
  { key: 'title', header: 'Title', width: 30 },
  { key: 'type', header: 'Type', width: 14 },
  { key: 'priority', header: 'Priority', width: 12 },
  { key: 'status', header: 'Status', width: 18 },
  { key: 'assetName', header: 'Asset', width: 25 },
  { key: 'assigneeName', header: 'Assigned To', width: 22 },
  { key: 'teamLeaderName', header: 'Team Leader', width: 22 },
  { key: 'tradeActivity', header: 'Trade', width: 16 },
  { key: 'failureDescription', header: 'Failure Description', width: 35 },
  { key: 'estimatedHours', header: 'Est. Hours', format: 'number', width: 14 },
  { key: 'actualHours', header: 'Actual Hours', format: 'number', width: 14 },
  { key: 'plannedStart', header: 'Planned Start', format: 'datetime', width: 20 },
  { key: 'plannedEnd', header: 'Planned End', format: 'datetime', width: 20 },
  { key: 'actualStart', header: 'Actual Start', format: 'datetime', width: 20 },
  { key: 'actualEnd', header: 'Actual End', format: 'datetime', width: 20 },
  { key: 'totalCost', header: 'Total Cost', format: 'currency', width: 14 },
  { key: 'laborCost', header: 'Labor Cost', format: 'currency', width: 14 },
  { key: 'partsCost', header: 'Parts Cost', format: 'currency', width: 14 },
  { key: 'createdAt', header: 'Created', format: 'datetime', width: 20 },
];

async function exportWorkOrderReport(
  filters: ReportFilters,
  session: SessionData,
): Promise<ReportResult> {
  const where = buildBaseWhere(filters);
  const workOrders = await db.workOrder.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    include: {
      assignee: { select: { id: true, fullName: true } },
      teamLeader: { select: { id: true, fullName: true } },
      repairCompletion: {
        select: {
          totalLaborHours: true,
          totalMaterialCost: true,
          totalDowntimeMinutes: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const rows = workOrders.map((wo) => ({
    woNumber: wo.woNumber,
    title: wo.title,
    type: wo.type,
    priority: wo.priority,
    status: wo.status,
    // WorkOrder stores assetName/assetId as scalar fields in the active schema.
    assetName: wo.assetName || '',
    assigneeName: wo.assignee?.fullName || '',
    teamLeaderName: wo.teamLeader?.fullName || '',
    tradeActivity: wo.tradeActivity || '',
    failureDescription: wo.failureDescription || '',
    estimatedHours: wo.estimatedHours ?? 0,
    actualHours: wo.repairCompletion?.totalLaborHours ?? wo.actualHours ?? 0,
    plannedStart: wo.plannedStart?.toISOString() ?? '',
    plannedEnd: wo.plannedEnd?.toISOString() ?? '',
    actualStart: wo.actualStart?.toISOString() ?? '',
    actualEnd: wo.actualEnd?.toISOString() ?? '',
    totalCost: wo.totalCost ?? 0,
    laborCost: wo.laborCost ?? 0,
    partsCost: wo.partsCost ?? 0,
    createdAt: wo.createdAt.toISOString(),
  }));

  const wb = createStandardWorkbook({
    reportName: 'Work Order Report',
    description: 'Comprehensive work order listing with authoritative costs and timeline',
    plantId: filters.plantId,
    filters: flattenFilters(filters),
    generatedBy: session.fullName || session.userId,
    kpis: [
      { label: 'Total WOs', value: workOrders.length },
      {
        label: 'Completed / Verified / Closed',
        value: workOrders.filter((wo) => ['completed', 'verified', 'closed'].includes(wo.status)).length,
      },
      {
        label: 'In Progress / Waiting',
        value: workOrders.filter((wo) => ['assigned', 'in_progress', 'waiting_parts', 'waiting_tools', 'waiting_shutdown', 'waiting_permit', 'pending_handover'].includes(wo.status)).length,
      },
      { label: 'Total Cost', value: workOrders.reduce((sum, wo) => sum + (wo.totalCost ?? 0), 0).toFixed(2) },
    ],
  });

  addDataSheet(wb, 'Work Orders', WORK_ORDER_COLUMNS, rows);
  addAnalyticsSheet(wb, 'Status Breakdown', buildBreakdown(rows, 'status'));

  return {
    buffer: generateXlsxBuffer(wb),
    filename: buildFilename('work-order-report'),
  };
}

const MR_COLUMNS: ReportColumn[] = [
  { key: 'requestNumber', header: 'MR Number', width: 22 },
  { key: 'title', header: 'Title', width: 30 },
  { key: 'priority', header: 'Priority', width: 12 },
  { key: 'category', header: 'Category', width: 16 },
  { key: 'status', header: 'Status', width: 18 },
  { key: 'workflowStatus', header: 'Workflow Status', width: 22 },
  { key: 'assetName', header: 'Asset', width: 25 },
  { key: 'location', header: 'Location', width: 20 },
  { key: 'machineDown', header: 'Machine Down', width: 14 },
  { key: 'requestedByName', header: 'Requested By', width: 20 },
  { key: 'supervisorName', header: 'Supervisor', width: 20 },
  { key: 'woNumber', header: 'Linked WO', width: 22 },
  { key: 'plannedStart', header: 'Planned Start', format: 'datetime', width: 20 },
  { key: 'plannedEnd', header: 'Planned End', format: 'datetime', width: 20 },
  { key: 'createdAt', header: 'Created', format: 'datetime', width: 20 },
];

async function exportMaintenanceRequestReport(
  filters: ReportFilters,
  session: SessionData,
): Promise<ReportResult> {
  const where = buildMrWhere(filters);
  const requests = await db.maintenanceRequest.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    include: {
      // Active Prisma schema relation is `requester`, not `requestedByUser`.
      requester: { select: { id: true, fullName: true } },
      supervisor: { select: { id: true, fullName: true } },
      workOrder: { select: { id: true, woNumber: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const rows = requests.map((mr) => ({
    requestNumber: mr.requestNumber,
    title: mr.title,
    priority: mr.priority,
    category: mr.category || '',
    status: mr.status,
    workflowStatus: mr.workflowStatus,
    assetName: mr.assetName || '',
    location: mr.location || '',
    machineDown: mr.machineDownStatus ? 'Yes' : 'No',
    requestedByName: mr.requester?.fullName || '',
    supervisorName: mr.supervisor?.fullName || '',
    woNumber: mr.workOrder?.woNumber || '',
    plannedStart: mr.plannedStart?.toISOString() ?? '',
    plannedEnd: mr.plannedEnd?.toISOString() ?? '',
    createdAt: mr.createdAt.toISOString(),
  }));

  const wb = createStandardWorkbook({
    reportName: 'Maintenance Request Report',
    description: 'Complete maintenance-request intake and workflow tracking',
    plantId: filters.plantId,
    filters: flattenFilters(filters),
    generatedBy: session.fullName || session.userId,
    kpis: [
      { label: 'Total MRs', value: requests.length },
      { label: 'Converted to WO', value: requests.filter((request) => Boolean(request.workOrder)).length },
      { label: 'Pending', value: requests.filter((request) => request.status === 'pending').length },
      { label: 'Machine Down', value: requests.filter((request) => request.machineDownStatus === true).length },
    ],
  });

  addDataSheet(wb, 'Maintenance Requests', MR_COLUMNS, rows);
  addAnalyticsSheet(wb, 'Workflow Breakdown', buildBreakdown(rows, 'workflowStatus'));

  return {
    buffer: generateXlsxBuffer(wb),
    filename: buildFilename('maintenance-request-report'),
  };
}


const OPERATIONS_COLUMNS: ReportColumn[] = [
  { key: 'date', header: 'Date', format: 'date', width: 14 },
  { key: 'opened', header: 'WOs Opened', format: 'number', width: 14 },
  { key: 'completed', header: 'WOs Completed', format: 'number', width: 16 },
  { key: 'closed', header: 'WOs Closed', format: 'number', width: 14 },
  { key: 'emergencyOpened', header: 'Emergency Opened', format: 'number', width: 18 },
  { key: 'laborHours', header: 'Labor Hours', format: 'number', width: 14 },
  { key: 'downtimeHours', header: 'Downtime Hours', format: 'number', width: 16 },
  { key: 'productionLoss', header: 'Production Loss', format: 'currency', width: 18 },
  { key: 'maintenanceCost', header: 'Maintenance Cost', format: 'currency', width: 18 },
];

function dateRangeFilter(filters: ReportFilters): Record<string, Date> | undefined {
  if (!filters.dateFrom && !filters.dateTo) return undefined;
  const range: Record<string, Date> = {};
  if (filters.dateFrom) range.gte = new Date(\`\${filters.dateFrom}T00:00:00\`);
  if (filters.dateTo) range.lte = new Date(\`\${filters.dateTo}T23:59:59\`);
  return range;
}

function dateKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function scopeWithoutDates(filters: ReportFilters): Record<string, unknown> {
  return buildBaseWhere({ ...filters, dateFrom: undefined, dateTo: undefined });
}

async function exportOperationsSummaryReport(
  filters: ReportFilters,
  session: SessionData,
): Promise<ReportResult> {
  const scope = scopeWithoutDates(filters);
  const range = dateRangeFilter(filters);
  const woWhere: Record<string, unknown> = { ...scope };
  if (range) {
    woWhere.OR = [
      { createdAt: range },
      { actualEnd: range },
    ];
  }

  const workOrders = await db.workOrder.findMany({
    where: Object.keys(woWhere).length > 0 ? woWhere : undefined,
    include: {
      repairCompletion: {
        select: { totalLaborHours: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const laborWhere: Record<string, unknown> = {};
  if (range) laborWhere.timestamp = range;
  if (Object.keys(scope).length > 0) laborWhere.workOrder = scope;
  const timeLogs = await db.workOrderTimeLog.findMany({
    where: Object.keys(laborWhere).length > 0 ? laborWhere : undefined,
    select: { timestamp: true, duration: true },
  });

  const downtimeWhere: Record<string, unknown> = {};
  if (filters.plantId) downtimeWhere.plantId = filters.plantId;
  if (range) downtimeWhere.downtimeStart = range;
  if (filters.departmentId || filters.type || filters.priority || filters.assigneeId || filters.assetId) {
    downtimeWhere.workOrder = scope;
  }
  const downtimes = await db.workOrderDowntime.findMany({
    where: Object.keys(downtimeWhere).length > 0 ? downtimeWhere : undefined,
    select: {
      downtimeStart: true,
      durationMinutes: true,
      productionLoss: true,
    },
  });

  type DailyRow = {
    date: string;
    opened: number;
    completed: number;
    closed: number;
    emergencyOpened: number;
    laborHours: number;
    downtimeHours: number;
    productionLoss: number;
    maintenanceCost: number;
  };

  const daily = new Map<string, DailyRow>();
  const ensure = (key: string): DailyRow => {
    let row = daily.get(key);
    if (!row) {
      row = {
        date: key,
        opened: 0,
        completed: 0,
        closed: 0,
        emergencyOpened: 0,
        laborHours: 0,
        downtimeHours: 0,
        productionLoss: 0,
        maintenanceCost: 0,
      };
      daily.set(key, row);
    }
    return row;
  };

  if (filters.dateFrom && filters.dateTo) {
    const cursor = new Date(\`\${filters.dateFrom}T00:00:00Z\`);
    const end = new Date(\`\${filters.dateTo}T00:00:00Z\`);
    let guard = 0;
    while (cursor <= end && guard < 367) {
      ensure(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      guard++;
    }
  }

  for (const wo of workOrders) {
    const openedKey = dateKey(wo.createdAt);
    if (openedKey) {
      const row = ensure(openedKey);
      row.opened += 1;
      if (wo.type === 'emergency') row.emergencyOpened += 1;
    }

    const completedKey = dateKey(wo.actualEnd);
    if (completedKey && ['completed', 'verified', 'closed'].includes(wo.status)) {
      const row = ensure(completedKey);
      row.completed += 1;
      if (wo.status === 'closed') row.closed += 1;
      row.maintenanceCost += wo.totalCost ?? 0;
    }
  }

  for (const log of timeLogs) {
    const key = dateKey(log.timestamp);
    if (!key) continue;
    ensure(key).laborHours += log.duration ?? 0;
  }

  for (const downtime of downtimes) {
    const key = dateKey(downtime.downtimeStart);
    if (!key) continue;
    const row = ensure(key);
    row.downtimeHours += (downtime.durationMinutes ?? 0) / 60;
    row.productionLoss += downtime.productionLoss ?? 0;
  }

  const rows = [...daily.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      ...row,
      laborHours: Number(row.laborHours.toFixed(2)),
      downtimeHours: Number(row.downtimeHours.toFixed(2)),
      productionLoss: Number(row.productionLoss.toFixed(2)),
      maintenanceCost: Number(row.maintenanceCost.toFixed(2)),
    }));

  const totals = rows.reduce(
    (acc, row) => ({
      opened: acc.opened + row.opened,
      completed: acc.completed + row.completed,
      emergencies: acc.emergencies + row.emergencyOpened,
      laborHours: acc.laborHours + row.laborHours,
      downtimeHours: acc.downtimeHours + row.downtimeHours,
      productionLoss: acc.productionLoss + row.productionLoss,
      maintenanceCost: acc.maintenanceCost + row.maintenanceCost,
    }),
    { opened: 0, completed: 0, emergencies: 0, laborHours: 0, downtimeHours: 0, productionLoss: 0, maintenanceCost: 0 },
  );

  const wb = createStandardWorkbook({
    reportName: 'Daily / Weekly Repairs Operations Summary',
    description: 'Daily operational pulse for corrective and emergency maintenance activity',
    plantId: filters.plantId,
    filters: flattenFilters(filters),
    generatedBy: session.fullName || session.userId,
    kpis: [
      { label: 'WOs Opened', value: totals.opened },
      { label: 'WOs Completed', value: totals.completed },
      { label: 'Emergency WOs', value: totals.emergencies },
      { label: 'Labor Hours', value: totals.laborHours.toFixed(2) },
      { label: 'Downtime Hours', value: totals.downtimeHours.toFixed(2) },
      { label: 'Production Loss', value: totals.productionLoss.toFixed(2) },
      { label: 'Maintenance Cost', value: totals.maintenanceCost.toFixed(2) },
    ],
  });

  addDataSheet(wb, 'Daily Operations', OPERATIONS_COLUMNS, rows);

  return {
    buffer: generateXlsxBuffer(wb),
    filename: buildFilename('repairs-operations-summary'),
  };
}

const ASSET_HISTORY_COLUMNS: ReportColumn[] = [
  { key: 'assetName', header: 'Asset', width: 26 },
  { key: 'assetTag', header: 'Asset Tag', width: 18 },
  { key: 'category', header: 'Category', width: 18 },
  { key: 'woNumber', header: 'WO Number', width: 22 },
  { key: 'title', header: 'Repair / Failure', width: 32 },
  { key: 'type', header: 'Type', width: 14 },
  { key: 'priority', header: 'Priority', width: 12 },
  { key: 'status', header: 'Status', width: 16 },
  { key: 'technician', header: 'Technician', width: 22 },
  { key: 'failureModes', header: 'Failure Mode(s)', width: 26 },
  { key: 'rootCause', header: 'Root Cause', width: 35 },
  { key: 'correctiveAction', header: 'Corrective Action', width: 35 },
  { key: 'laborHours', header: 'Labor Hours', format: 'number', width: 14 },
  { key: 'downtimeMinutes', header: 'Downtime (min)', format: 'number', width: 16 },
  { key: 'productionLoss', header: 'Production Loss', format: 'currency', width: 18 },
  { key: 'materialCost', header: 'Material Cost', format: 'currency', width: 16 },
  { key: 'contractorCost', header: 'Contractor Cost', format: 'currency', width: 17 },
  { key: 'totalCost', header: 'Total Cost', format: 'currency', width: 15 },
  { key: 'startedAt', header: 'Started', format: 'datetime', width: 20 },
  { key: 'completedAt', header: 'Completed', format: 'datetime', width: 20 },
];

async function exportAssetRepairHistoryReport(
  filters: ReportFilters,
  session: SessionData,
): Promise<ReportResult> {
  const where = buildBaseWhere(filters);
  if (!filters.type) {
    where.type = { in: ['corrective', 'emergency', 'predictive'] };
  }

  const workOrders = await db.workOrder.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    include: {
      assignee: { select: { fullName: true } },
      repairCompletion: {
        select: {
          rootCause: true,
          correctiveAction: true,
          totalLaborHours: true,
          totalMaterialCost: true,
          totalDowntimeMinutes: true,
        },
      },
      failureRecords: {
        select: {
          failureMode: true,
          rootCause: true,
          correctiveAction: true,
        },
      },
      workOrderDowntimes: {
        select: {
          durationMinutes: true,
          productionLoss: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const assetIds = [...new Set(workOrders.map((wo) => wo.assetId).filter((id): id is string => Boolean(id)))];
  const assets = assetIds.length > 0
    ? await db.asset.findMany({
        where: { id: { in: assetIds } },
        include: { category: { select: { name: true } } },
      })
    : [];
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));

  const rows = workOrders.map((wo) => {
    const asset = wo.assetId ? assetMap.get(wo.assetId) : undefined;
    const downtimeMinutes = (wo.workOrderDowntimes || []).reduce(
      (sum, record) => sum + (record.durationMinutes ?? 0),
      0,
    );
    const productionLoss = (wo.workOrderDowntimes || []).reduce(
      (sum, record) => sum + (record.productionLoss ?? 0),
      0,
    );
    const failureModes = [...new Set((wo.failureRecords || []).map((record) => record.failureMode).filter(Boolean))];
    const rootCause = wo.repairCompletion?.rootCause
      || (wo.failureRecords || []).map((record) => record.rootCause).find(Boolean)
      || wo.causeDescription
      || '';
    const correctiveAction = wo.repairCompletion?.correctiveAction
      || (wo.failureRecords || []).map((record) => record.correctiveAction).find(Boolean)
      || wo.actionDescription
      || '';

    return {
      assetName: asset?.name || wo.assetName || 'Unassigned',
      assetTag: asset?.assetTag || '',
      category: asset?.category?.name || '',
      woNumber: wo.woNumber,
      title: wo.title,
      type: wo.type,
      priority: wo.priority,
      status: wo.status,
      technician: wo.assignee?.fullName || '',
      failureModes: failureModes.join(', '),
      rootCause,
      correctiveAction,
      laborHours: wo.repairCompletion?.totalLaborHours ?? wo.actualHours ?? 0,
      downtimeMinutes: wo.repairCompletion?.totalDowntimeMinutes ?? downtimeMinutes,
      productionLoss: Number(productionLoss.toFixed(2)),
      materialCost: wo.repairCompletion?.totalMaterialCost ?? wo.partsCost ?? 0,
      contractorCost: wo.contractorCost ?? 0,
      totalCost: wo.totalCost ?? 0,
      startedAt: wo.actualStart?.toISOString() ?? '',
      completedAt: wo.actualEnd?.toISOString() ?? '',
      assetId: wo.assetId || 'unassigned',
    };
  });

  const byAsset = new Map<string, {
    asset: string;
    tag: string;
    repairs: number;
    downtimeMinutes: number;
    laborHours: number;
    productionLoss: number;
    totalCost: number;
  }>();

  for (const row of rows) {
    const current = byAsset.get(row.assetId) || {
      asset: row.assetName,
      tag: row.assetTag,
      repairs: 0,
      downtimeMinutes: 0,
      laborHours: 0,
      productionLoss: 0,
      totalCost: 0,
    };
    current.repairs += 1;
    current.downtimeMinutes += row.downtimeMinutes;
    current.laborHours += row.laborHours;
    current.productionLoss += row.productionLoss;
    current.totalCost += row.totalCost;
    byAsset.set(row.assetId, current);
  }

  const assetSummary = [...byAsset.values()]
    .sort((a, b) => b.repairs - a.repairs || b.totalCost - a.totalCost)
    .map((row) => ({
      Asset: row.asset,
      'Asset Tag': row.tag,
      Repairs: row.repairs,
      'Labor Hours': Number(row.laborHours.toFixed(2)),
      'Downtime Hours': Number((row.downtimeMinutes / 60).toFixed(2)),
      'Production Loss': Number(row.productionLoss.toFixed(2)),
      'Total Cost': Number(row.totalCost.toFixed(2)),
    }));

  const wb = createStandardWorkbook({
    reportName: 'Asset Repair History',
    description: 'Repair, failure, RCA, downtime and cost history by maintainable asset',
    plantId: filters.plantId,
    filters: flattenFilters(filters),
    generatedBy: session.fullName || session.userId,
    kpis: [
      { label: 'Assets Repaired', value: byAsset.size },
      { label: 'Repair Work Orders', value: rows.length },
      { label: 'Repeat-Repair Assets', value: [...byAsset.values()].filter((row) => row.repairs > 1).length },
      { label: 'Total Downtime (hrs)', value: (rows.reduce((sum, row) => sum + row.downtimeMinutes, 0) / 60).toFixed(2) },
      { label: 'Total Repair Cost', value: rows.reduce((sum, row) => sum + row.totalCost, 0).toFixed(2) },
    ],
  });

  addDataSheet(wb, 'Repair History', ASSET_HISTORY_COLUMNS, rows);
  addAnalyticsSheet(wb, 'Asset Summary', assetSummary);

  return {
    buffer: generateXlsxBuffer(wb),
    filename: buildFilename('asset-repair-history'),
  };
}

const DEPARTMENT_COST_COLUMNS: ReportColumn[] = [
  { key: 'departmentCode', header: 'Cost Center', width: 16 },
  { key: 'departmentName', header: 'Department', width: 26 },
  { key: 'workOrders', header: 'Work Orders', format: 'number', width: 14 },
  { key: 'completed', header: 'Completed', format: 'number', width: 14 },
  { key: 'laborHours', header: 'Labor Hours', format: 'number', width: 14 },
  { key: 'laborCost', header: 'Labor Cost', format: 'currency', width: 14 },
  { key: 'partsCost', header: 'Parts Cost', format: 'currency', width: 14 },
  { key: 'contractorCost', header: 'Contractor Cost', format: 'currency', width: 17 },
  { key: 'toolCost', header: 'Tool Cost', format: 'currency', width: 14 },
  { key: 'totalCost', header: 'Total Cost', format: 'currency', width: 15 },
  { key: 'avgCostPerWo', header: 'Avg Cost / WO', format: 'currency', width: 17 },
];

const DEPARTMENT_COST_DETAIL_COLUMNS: ReportColumn[] = [
  { key: 'departmentCode', header: 'Cost Center', width: 16 },
  { key: 'departmentName', header: 'Department', width: 24 },
  { key: 'woNumber', header: 'WO Number', width: 22 },
  { key: 'title', header: 'Title', width: 30 },
  { key: 'assetName', header: 'Asset', width: 24 },
  { key: 'type', header: 'Type', width: 14 },
  { key: 'priority', header: 'Priority', width: 12 },
  { key: 'status', header: 'Status', width: 16 },
  { key: 'laborCost', header: 'Labor Cost', format: 'currency', width: 14 },
  { key: 'partsCost', header: 'Parts Cost', format: 'currency', width: 14 },
  { key: 'contractorCost', header: 'Contractor Cost', format: 'currency', width: 17 },
  { key: 'toolCost', header: 'Tool Cost', format: 'currency', width: 14 },
  { key: 'totalCost', header: 'Total Cost', format: 'currency', width: 15 },
  { key: 'completedAt', header: 'Completed', format: 'date', width: 14 },
];

async function exportDepartmentCostReport(
  filters: ReportFilters,
  session: SessionData,
): Promise<ReportResult> {
  const where = buildBaseWhere(filters);
  const workOrders = await db.workOrder.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    include: {
      repairCompletion: {
        select: { totalLaborHours: true, totalToolCost: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const departmentIds = [...new Set(workOrders.map((wo) => wo.departmentId).filter((id): id is string => Boolean(id)))];
  const departments = departmentIds.length > 0
    ? await db.department.findMany({
        where: { id: { in: departmentIds } },
        select: { id: true, name: true, code: true },
      })
    : [];
  const departmentMap = new Map(departments.map((department) => [department.id, department]));

  const detailRows = workOrders.map((wo) => {
    const department = wo.departmentId ? departmentMap.get(wo.departmentId) : undefined;
    return {
      departmentId: wo.departmentId || 'unassigned',
      departmentCode: department?.code || 'UNASSIGNED',
      departmentName: department?.name || 'Unassigned',
      woNumber: wo.woNumber,
      title: wo.title,
      assetName: wo.assetName || '',
      type: wo.type,
      priority: wo.priority,
      status: wo.status,
      laborHours: wo.repairCompletion?.totalLaborHours ?? wo.actualHours ?? 0,
      laborCost: wo.laborCost ?? 0,
      partsCost: wo.partsCost ?? 0,
      contractorCost: wo.contractorCost ?? 0,
      toolCost: wo.repairCompletion?.totalToolCost ?? 0,
      totalCost: wo.totalCost ?? 0,
      completedAt: wo.actualEnd?.toISOString()?.split('T')[0] ?? '',
    };
  });

  const aggregation = new Map<string, {
    departmentCode: string;
    departmentName: string;
    workOrders: number;
    completed: number;
    laborHours: number;
    laborCost: number;
    partsCost: number;
    contractorCost: number;
    toolCost: number;
    totalCost: number;
  }>();

  for (const row of detailRows) {
    const current = aggregation.get(row.departmentId) || {
      departmentCode: row.departmentCode,
      departmentName: row.departmentName,
      workOrders: 0,
      completed: 0,
      laborHours: 0,
      laborCost: 0,
      partsCost: 0,
      contractorCost: 0,
      toolCost: 0,
      totalCost: 0,
    };
    current.workOrders += 1;
    if (['completed', 'verified', 'closed'].includes(row.status)) current.completed += 1;
    current.laborHours += row.laborHours;
    current.laborCost += row.laborCost;
    current.partsCost += row.partsCost;
    current.contractorCost += row.contractorCost;
    current.toolCost += row.toolCost;
    current.totalCost += row.totalCost;
    aggregation.set(row.departmentId, current);
  }

  const summaryRows = [...aggregation.values()]
    .map((row) => ({
      ...row,
      laborHours: Number(row.laborHours.toFixed(2)),
      laborCost: Number(row.laborCost.toFixed(2)),
      partsCost: Number(row.partsCost.toFixed(2)),
      contractorCost: Number(row.contractorCost.toFixed(2)),
      toolCost: Number(row.toolCost.toFixed(2)),
      totalCost: Number(row.totalCost.toFixed(2)),
      avgCostPerWo: row.workOrders > 0 ? Number((row.totalCost / row.workOrders).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.totalCost - a.totalCost);

  const totals = summaryRows.reduce(
    (acc, row) => ({
      workOrders: acc.workOrders + row.workOrders,
      labor: acc.labor + row.laborCost,
      parts: acc.parts + row.partsCost,
      contractor: acc.contractor + row.contractorCost,
      tools: acc.tools + row.toolCost,
      total: acc.total + row.totalCost,
    }),
    { workOrders: 0, labor: 0, parts: 0, contractor: 0, tools: 0, total: 0 },
  );

  const wb = createStandardWorkbook({
    reportName: 'Department / Cost-Center Maintenance Cost',
    description: 'Repairs cost allocation by department code/cost center with work-order detail',
    plantId: filters.plantId,
    filters: flattenFilters(filters),
    generatedBy: session.fullName || session.userId,
    kpis: [
      { label: 'Departments / Cost Centers', value: summaryRows.length },
      { label: 'Work Orders', value: totals.workOrders },
      { label: 'Labor Cost', value: totals.labor.toFixed(2) },
      { label: 'Parts Cost', value: totals.parts.toFixed(2) },
      { label: 'Contractor Cost', value: totals.contractor.toFixed(2) },
      { label: 'Tool Cost', value: totals.tools.toFixed(2) },
      { label: 'Total Cost', value: totals.total.toFixed(2) },
    ],
  });

  addDataSheet(wb, 'Cost Centers', DEPARTMENT_COST_COLUMNS, summaryRows);
  addDataSheet(wb, 'WO Cost Detail', DEPARTMENT_COST_DETAIL_COLUMNS, detailRows);

  return {
    buffer: generateXlsxBuffer(wb),
    filename: buildFilename('department-cost-center-report'),
  };
}

/**
 * Schema-safe Repairs report dispatcher.
 *
 * The Work Order and Maintenance Request exporters are overridden here because
 * the legacy exporter still references stale Prisma relation names. The other
 * eight exporters remain delegated to the existing implementation.
 */
export async function generateRepairsReport(
  reportType: ReportType,
  filters: ReportFilters,
  session: SessionData,
): Promise<ReportResult> {
  if (reportType === 'work-order') return exportWorkOrderReport(filters, session);
  if (reportType === 'maintenance-request') return exportMaintenanceRequestReport(filters, session);
  if (reportType === 'operations-summary') return exportOperationsSummaryReport(filters, session);
  if (reportType === 'asset-history') return exportAssetRepairHistoryReport(filters, session);
  if (reportType === 'department-cost') return exportDepartmentCostReport(filters, session);
  return generateLegacyReport(reportType, filters, session);
}
