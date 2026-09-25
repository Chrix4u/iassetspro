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
  if (filters.type) {
    where.type = filters.type;
  } else if (filters.maintenanceScope === 'repairs') {
    where.type = { in: ['corrective', 'emergency', 'predictive'] };
  } else if (filters.maintenanceScope === 'pm') {
    where.type = 'preventive';
  }
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
  if (filters.dateFrom) range.gte = new Date(`${filters.dateFrom}T00:00:00`);
  if (filters.dateTo) range.lte = new Date(`${filters.dateTo}T23:59:59`);
  return range;
}

function dateKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function dateWithinFilters(key: string, filters: ReportFilters): boolean {
  if (filters.dateFrom && key < filters.dateFrom) return false;
  if (filters.dateTo && key > filters.dateTo) return false;
  return true;
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
  if (Object.keys(scope).length > 0) {
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
    const cursor = new Date(`${filters.dateFrom}T00:00:00Z`);
    const end = new Date(`${filters.dateTo}T00:00:00Z`);
    let guard = 0;
    while (cursor <= end && guard < 367) {
      ensure(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      guard++;
    }
  }

  for (const wo of workOrders) {
    const openedKey = dateKey(wo.createdAt);
    if (openedKey && dateWithinFilters(openedKey, filters)) {
      const row = ensure(openedKey);
      row.opened += 1;
      if (wo.type === 'emergency') row.emergencyOpened += 1;
    }

    const completedKey = dateKey(wo.actualEnd);
    if (
      completedKey
      && dateWithinFilters(completedKey, filters)
      && ['completed', 'verified', 'closed'].includes(wo.status)
    ) {
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


function hoursBetweenReports(
  from: Date | string | null | undefined,
  to: Date | string | null | undefined,
): number | null {
  if (!from || !to) return null;
  const value = (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function reportWorkOrderScope(filters: ReportFilters): Record<string, unknown> {
  return scopeWithoutDates({ ...filters, maintenanceScope: filters.maintenanceScope || 'repairs' });
}

const MATERIAL_RECONCILIATION_COLUMNS: ReportColumn[] = [
  { key: 'woNumber', header: 'WO Number', width: 22 },
  { key: 'itemCode', header: 'Item Code', width: 16 },
  { key: 'itemName', header: 'Item', width: 26 },
  { key: 'unit', header: 'Unit', width: 10 },
  { key: 'issuedQty', header: 'Issued', format: 'number', width: 12 },
  { key: 'declaredConsumedQty', header: 'Declared Used', format: 'number', width: 15 },
  { key: 'declaredWastedQty', header: 'Declared Waste', format: 'number', width: 15 },
  { key: 'declaredReturnQty', header: 'Declared Return', format: 'number', width: 16 },
  { key: 'consumedQty', header: 'Verified Used', format: 'number', width: 14 },
  { key: 'wastedQty', header: 'Verified Waste', format: 'number', width: 15 },
  { key: 'reconciledReturnQty', header: 'Verified Return', format: 'number', width: 16 },
  { key: 'recordedReturnQty', header: 'Store Return', format: 'number', width: 14 },
  { key: 'balanceDelta', header: 'Balance Delta', format: 'number', width: 14 },
  { key: 'reconciliationStatus', header: 'Reconciliation', width: 18 },
  { key: 'unitCost', header: 'Unit Cost', format: 'currency', width: 14 },
  { key: 'issuedCost', header: 'Issued Cost', format: 'currency', width: 14 },
  { key: 'consumedCost', header: 'Consumed Cost', format: 'currency', width: 16 },
  { key: 'wastedCost', header: 'Waste Cost', format: 'currency', width: 14 },
  { key: 'returnValue', header: 'Return Value', format: 'currency', width: 14 },
  { key: 'requestedBy', header: 'Requested By', width: 20 },
  { key: 'issuedBy', header: 'Issued By', width: 20 },
  { key: 'issuedAt', header: 'Issued At', format: 'datetime', width: 20 },
];

async function exportMaterialReconciliationReport(
  filters: ReportFilters,
  session: SessionData,
): Promise<ReportResult> {
  const scope = reportWorkOrderScope(filters);
  const range = dateRangeFilter(filters);
  const where: Record<string, unknown> = {
    status: { in: ['issued', 'picking', 'closed', 'partially_returned', 'fully_returned', 'returned'] },
  };
  if (filters.plantId) where.plantId = filters.plantId;
  if (range) where.issuedAt = range;
  if (Object.keys(scope).length > 0) where.workOrder = scope;

  const records = await db.repairMaterialRequest.findMany({
    where,
    include: {
      workOrder: { select: { woNumber: true, title: true } },
      item: { select: { itemCode: true, name: true } },
      requestedBy: { select: { fullName: true } },
      issuedByUser: { select: { fullName: true } },
    },
    orderBy: { issuedAt: 'desc' },
  });

  const rows = records.map((record) => {
    const issuedQty = record.quantityIssued || record.quantityApproved || 0;
    const consumedQty = record.consumedQty ?? 0;
    const wastedQty = record.wastedQty ?? 0;
    const reconciledReturnQty = Math.max(0, issuedQty - consumedQty - wastedQty);
    const recordedReturnQty = record.quantityReturned || 0;
    const balanceDelta = Number((reconciledReturnQty - recordedReturnQty).toFixed(4));
    const unitCost = record.unitCost || 0;
    const isReconciled = record.consumedQty !== null;
    const reconciliationStatus = !isReconciled
      ? 'Pending'
      : Math.abs(balanceDelta) > 0.0001
        ? 'Variance'
        : 'Reconciled';

    return {
      woNumber: record.workOrder?.woNumber || '',
      itemCode: record.item?.itemCode || '',
      itemName: record.itemName,
      unit: record.unit,
      issuedQty,
      declaredConsumedQty: record.declaredConsumedQty ?? 0,
      declaredWastedQty: record.declaredWastedQty ?? 0,
      declaredReturnQty: record.declaredReturnQty ?? 0,
      consumedQty,
      wastedQty,
      reconciledReturnQty,
      recordedReturnQty,
      balanceDelta,
      reconciliationStatus,
      unitCost,
      issuedCost: Number((issuedQty * unitCost).toFixed(2)),
      consumedCost: Number((consumedQty * unitCost).toFixed(2)),
      wastedCost: Number((wastedQty * unitCost).toFixed(2)),
      returnValue: Number((reconciledReturnQty * unitCost).toFixed(2)),
      requestedBy: record.requestedBy?.fullName || '',
      issuedBy: record.issuedByUser?.fullName || '',
      issuedAt: record.issuedAt?.toISOString() || '',
    };
  });

  const totals = rows.reduce(
    (acc, row) => ({
      issuedCost: acc.issuedCost + row.issuedCost,
      consumedCost: acc.consumedCost + row.consumedCost,
      wastedCost: acc.wastedCost + row.wastedCost,
      returnValue: acc.returnValue + row.returnValue,
      pending: acc.pending + (row.reconciliationStatus === 'Pending' ? 1 : 0),
      variance: acc.variance + (row.reconciliationStatus === 'Variance' ? 1 : 0),
    }),
    { issuedCost: 0, consumedCost: 0, wastedCost: 0, returnValue: 0, pending: 0, variance: 0 },
  );

  const wb = createStandardWorkbook({
    reportName: 'Material Reconciliation Audit',
    description: 'Issued material reconciliation with verified consumption, waste, returns, cost and variance exceptions',
    plantId: filters.plantId,
    filters: flattenFilters(filters),
    generatedBy: session.fullName || session.userId,
    kpis: [
      { label: 'Issued Records', value: rows.length },
      { label: 'Pending Reconciliation', value: totals.pending },
      { label: 'Variance Exceptions', value: totals.variance },
      { label: 'Issued Cost', value: totals.issuedCost.toFixed(2) },
      { label: 'Waste Cost', value: totals.wastedCost.toFixed(2) },
      { label: 'Return Value', value: totals.returnValue.toFixed(2) },
    ],
  });

  addDataSheet(wb, 'Reconciliation', MATERIAL_RECONCILIATION_COLUMNS, rows);
  addAnalyticsSheet(wb, 'Status Summary', buildBreakdown(rows, 'reconciliationStatus'));

  return {
    buffer: generateXlsxBuffer(wb),
    filename: buildFilename('material-reconciliation-audit'),
  };
}

const TOOL_CUSTODY_COLUMNS: ReportColumn[] = [
  { key: 'requestNumber', header: 'Request #', width: 22 },
  { key: 'woNumber', header: 'WO Number', width: 22 },
  { key: 'toolCode', header: 'Tool Code', width: 16 },
  { key: 'toolName', header: 'Tool', width: 26 },
  { key: 'quantityRequested', header: 'Qty Requested', format: 'number', width: 15 },
  { key: 'quantityIssued', header: 'Qty Issued', format: 'number', width: 13 },
  { key: 'quantityReturned', header: 'Qty Returned', format: 'number', width: 14 },
  { key: 'quantityTransferred', header: 'Qty Transferred', format: 'number', width: 16 },
  { key: 'pendingReturnQty', header: 'Pending Return', format: 'number', width: 15 },
  { key: 'requestedBy', header: 'Requested By', width: 20 },
  { key: 'status', header: 'Request Status', width: 18 },
  { key: 'custodyStatus', header: 'Custody Status', width: 24 },
  { key: 'conditionAtIssue', header: 'Condition at Issue', width: 18 },
  { key: 'conditionAtReturn', header: 'Condition at Return', width: 20 },
  { key: 'issuedBy', header: 'Issued By', width: 20 },
  { key: 'issuedAt', header: 'Issued At', format: 'datetime', width: 20 },
  { key: 'returnedBy', header: 'Returned By', width: 20 },
  { key: 'returnedAt', header: 'Returned At', format: 'datetime', width: 20 },
  { key: 'confirmedBy', header: 'Return Confirmed By', width: 22 },
  { key: 'returnConfirmedAt', header: 'Return Confirmed At', format: 'datetime', width: 22 },
  { key: 'custodyHours', header: 'Custody Hours', format: 'number', width: 14 },
  { key: 'reason', header: 'Reason', width: 30 },
  { key: 'notes', header: 'Notes', width: 30 },
];

async function exportToolCustodyReport(
  filters: ReportFilters,
  session: SessionData,
): Promise<ReportResult> {
  const scope = reportWorkOrderScope(filters);
  const range = dateRangeFilter(filters);
  const where: Record<string, unknown> = {};
  if (filters.plantId) where.plantId = filters.plantId;
  if (range) where.createdAt = range;
  if (Object.keys(scope).length > 0) where.workOrder = scope;

  const requests = await db.repairToolRequest.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    include: {
      workOrder: { select: { woNumber: true, title: true } },
      requestedBy: { select: { fullName: true } },
      issuedByUser: { select: { fullName: true } },
      returnedByUser: { select: { fullName: true } },
      returnConfirmedByUser: { select: { fullName: true } },
      items: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const now = new Date();
  const rows = requests.flatMap((request) => {
    const custodyEnd = request.returnConfirmedAt || request.returnedAt || now;
    const custodyHours = request.issuedAt
      ? hoursBetweenReports(request.issuedAt, custodyEnd) || 0
      : 0;
    const custodyStatus = !request.issuedAt
      ? 'Not Issued'
      : request.returnConfirmedAt
        ? 'Returned / Confirmed'
        : request.returnedAt || request.items.some((item) => (item.pendingReturnQty || 0) > 0)
          ? 'Awaiting Store Confirmation'
          : 'In Custody';

    const lineItems = request.items.length > 0
      ? request.items
      : [{
          toolCode: null,
          toolName: request.toolName,
          quantityRequested: 1,
          quantityIssued: request.issuedAt ? 1 : 0,
          quantityReturned: request.returnConfirmedAt ? 1 : 0,
          quantityTransferred: 0,
          pendingReturnQty: request.returnedAt && !request.returnConfirmedAt ? 1 : 0,
          conditionAtIssue: request.toolConditionAtIssue,
          conditionAtReturn: request.toolConditionAtReturn,
          pendingReturnCondition: null,
          pendingReturnNotes: null,
        }];

    return lineItems.map((item) => ({
      requestNumber: request.requestNumber || '',
      woNumber: request.workOrder?.woNumber || '',
      toolCode: item.toolCode || '',
      toolName: item.toolName || request.toolName,
      quantityRequested: item.quantityRequested || 0,
      quantityIssued: item.quantityIssued || 0,
      quantityReturned: item.quantityReturned || 0,
      quantityTransferred: item.quantityTransferred || 0,
      pendingReturnQty: item.pendingReturnQty || 0,
      requestedBy: request.requestedBy?.fullName || '',
      status: request.status,
      custodyStatus,
      conditionAtIssue: item.conditionAtIssue || request.toolConditionAtIssue || '',
      conditionAtReturn: item.conditionAtReturn || item.pendingReturnCondition || request.toolConditionAtReturn || '',
      issuedBy: request.issuedByUser?.fullName || '',
      issuedAt: request.issuedAt?.toISOString() || '',
      returnedBy: request.returnedByUser?.fullName || '',
      returnedAt: request.returnedAt?.toISOString() || '',
      confirmedBy: request.returnConfirmedByUser?.fullName || '',
      returnConfirmedAt: request.returnConfirmedAt?.toISOString() || '',
      custodyHours: Number(custodyHours.toFixed(2)),
      reason: request.reason || '',
      notes: [request.notes, item.pendingReturnNotes].filter(Boolean).join(' · '),
    }));
  });

  const outstanding = rows.filter((row) => row.custodyStatus === 'In Custody').length;
  const awaitingConfirmation = rows.filter((row) => row.custodyStatus === 'Awaiting Store Confirmation').length;
  const poorReturns = rows.filter((row) => ['poor', 'damaged'].includes(String(row.conditionAtReturn).toLowerCase())).length;

  const wb = createStandardWorkbook({
    reportName: 'Tool Custody & Return Audit',
    description: 'Issued tool custody, returns, store confirmation and condition exceptions',
    plantId: filters.plantId,
    filters: flattenFilters(filters),
    generatedBy: session.fullName || session.userId,
    kpis: [
      { label: 'Tool Request Lines', value: rows.length },
      { label: 'Outstanding Custody', value: outstanding },
      { label: 'Awaiting Store Confirmation', value: awaitingConfirmation },
      { label: 'Returned / Confirmed', value: rows.filter((row) => row.custodyStatus === 'Returned / Confirmed').length },
      { label: 'Poor / Damaged Returns', value: poorReturns },
    ],
  });

  addDataSheet(wb, 'Tool Custody', TOOL_CUSTODY_COLUMNS, rows);
  addAnalyticsSheet(wb, 'Custody Status', buildBreakdown(rows, 'custodyStatus'));

  return {
    buffer: generateXlsxBuffer(wb),
    filename: buildFilename('tool-custody-return-audit'),
  };
}

const ASSISTANCE_COLUMNS: ReportColumn[] = [
  { key: 'woNumber', header: 'WO Number', width: 22 },
  { key: 'requestedBy', header: 'Requested By', width: 20 },
  { key: 'requestedTrade', header: 'Trade / Skill', width: 20 },
  { key: 'requestedUser', header: 'Assigned Assistant', width: 22 },
  { key: 'role', header: 'Role', width: 16 },
  { key: 'status', header: 'Status', width: 14 },
  { key: 'reviewedBy', header: 'Reviewed By', width: 20 },
  { key: 'reviewHours', header: 'Review Hours', format: 'number', width: 14 },
  { key: 'reason', header: 'Reason', width: 32 },
  { key: 'reviewNotes', header: 'Review Notes', width: 30 },
  { key: 'createdAt', header: 'Requested At', format: 'datetime', width: 20 },
  { key: 'reviewedAt', header: 'Reviewed At', format: 'datetime', width: 20 },
];

async function exportAssistanceReport(
  filters: ReportFilters,
  session: SessionData,
): Promise<ReportResult> {
  const scope = reportWorkOrderScope(filters);
  const range = dateRangeFilter(filters);
  const where: Record<string, unknown> = {};
  if (range) where.createdAt = range;
  if (Object.keys(scope).length > 0) where.workOrder = scope;

  const requests = await db.woTeamMemberRequest.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    include: {
      workOrder: { select: { woNumber: true, title: true } },
      requestedByUser: { select: { fullName: true } },
      requestedUser: { select: { fullName: true } },
      reviewedByUser: { select: { fullName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const rows = requests.map((request) => ({
    woNumber: request.workOrder?.woNumber || '',
    requestedBy: request.requestedByUser?.fullName || '',
    requestedTrade: request.requestedTrade || '',
    requestedUser: request.requestedUser?.fullName || '',
    role: request.role,
    status: request.status,
    reviewedBy: request.reviewedByUser?.fullName || '',
    reviewHours: Number((hoursBetweenReports(request.createdAt, request.reviewedAt) || 0).toFixed(2)),
    reason: request.reason || '',
    reviewNotes: request.reviewNotes || '',
    createdAt: request.createdAt.toISOString(),
    reviewedAt: request.reviewedAt?.toISOString() || '',
  }));

  const reviewedRows = rows.filter((row) => row.reviewedAt);
  const avgReviewHours = reviewedRows.length > 0
    ? reviewedRows.reduce((sum, row) => sum + row.reviewHours, 0) / reviewedRows.length
    : 0;

  const wb = createStandardWorkbook({
    reportName: 'Assistance Request Turnaround',
    description: 'Technician assistance requests, review outcomes and approval turnaround',
    plantId: filters.plantId,
    filters: flattenFilters(filters),
    generatedBy: session.fullName || session.userId,
    kpis: [
      { label: 'Requests', value: rows.length },
      { label: 'Pending', value: rows.filter((row) => row.status === 'pending').length },
      { label: 'Approved', value: rows.filter((row) => row.status === 'approved').length },
      { label: 'Rejected', value: rows.filter((row) => row.status === 'rejected').length },
      { label: 'Cancelled', value: rows.filter((row) => row.status === 'cancelled').length },
      { label: 'Avg Review Hours', value: avgReviewHours.toFixed(2) },
    ],
  });

  addDataSheet(wb, 'Assistance Requests', ASSISTANCE_COLUMNS, rows);
  addAnalyticsSheet(wb, 'Status Summary', buildBreakdown(rows, 'status'));

  return {
    buffer: generateXlsxBuffer(wb),
    filename: buildFilename('assistance-turnaround-report'),
  };
}

function readableJsonText(value: string | null | undefined): string {
  if (!value) return '';
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join('; ');
    }
    if (parsed && typeof parsed === 'object') return JSON.stringify(parsed);
    return String(parsed ?? '');
  } catch {
    return value;
  }
}

const HANDOVER_COLUMNS: ReportColumn[] = [
  { key: 'shiftDate', header: 'Shift Date', format: 'date', width: 14 },
  { key: 'shiftType', header: 'Shift', width: 14 },
  { key: 'fromShift', header: 'From Shift', width: 14 },
  { key: 'toShift', header: 'To Shift', width: 14 },
  { key: 'woNumber', header: 'WO Number', width: 22 },
  { key: 'status', header: 'Status', width: 14 },
  { key: 'handedOverBy', header: 'Handed Over By', width: 22 },
  { key: 'receivedBy', header: 'Received By', width: 22 },
  { key: 'elapsedToLastUpdateHours', header: 'Elapsed to Last Update (hrs)', format: 'number', width: 24 },
  { key: 'createdAt', header: 'Created At', format: 'datetime', width: 20 },
  { key: 'updatedAt', header: 'Last Updated', format: 'datetime', width: 20 },
  { key: 'tasksSummary', header: 'Tasks Summary', width: 40 },
  { key: 'pendingIssues', header: 'Pending Issues', width: 40 },
  { key: 'safetyNotes', header: 'Safety Notes', width: 35 },
  { key: 'equipmentStatus', header: 'Equipment Status', width: 35 },
  { key: 'notes', header: 'Notes', width: 30 },
];

async function exportShiftHandoverReport(
  filters: ReportFilters,
  session: SessionData,
): Promise<ReportResult> {
  const scope = reportWorkOrderScope(filters);
  const range = dateRangeFilter(filters);
  const where: Record<string, unknown> = {
    workOrder: scope,
  };
  if (range) where.shiftDate = range;

  const handovers = await db.shiftHandover.findMany({
    where,
    include: {
      handedOverBy: { select: { fullName: true } },
      receivedBy: { select: { fullName: true } },
      workOrder: { select: { woNumber: true, title: true } },
    },
    orderBy: { shiftDate: 'desc' },
  });

  const rows = handovers.map((handover) => ({
    shiftDate: handover.shiftDate.toISOString().split('T')[0],
    shiftType: handover.shiftType,
    fromShift: handover.fromShift || '',
    toShift: handover.toShift || '',
    woNumber: handover.workOrder?.woNumber || '',
    status: handover.status,
    handedOverBy: handover.handedOverBy?.fullName || '',
    receivedBy: handover.receivedBy?.fullName || '',
    elapsedToLastUpdateHours: Number((hoursBetweenReports(handover.createdAt, handover.updatedAt) || 0).toFixed(2)),
    createdAt: handover.createdAt.toISOString(),
    updatedAt: handover.updatedAt.toISOString(),
    tasksSummary: readableJsonText(handover.tasksSummary),
    pendingIssues: readableJsonText(handover.pendingIssues),
    safetyNotes: handover.safetyNotes || '',
    equipmentStatus: readableJsonText(handover.equipmentStatus),
    notes: handover.notes || '',
  }));

  const wb = createStandardWorkbook({
    reportName: 'Shift Handover Audit',
    description: 'Repairs shift handovers, pending issues, safety notes and confirmation status',
    plantId: filters.plantId,
    filters: flattenFilters(filters),
    generatedBy: session.fullName || session.userId,
    kpis: [
      { label: 'Handovers', value: rows.length },
      { label: 'Pending', value: rows.filter((row) => row.status === 'pending').length },
      { label: 'Confirmed', value: rows.filter((row) => row.status === 'confirmed').length },
      { label: 'With Pending Issues', value: rows.filter((row) => Boolean(row.pendingIssues)).length },
      { label: 'With Safety Notes', value: rows.filter((row) => Boolean(row.safetyNotes)).length },
    ],
  });

  addDataSheet(wb, 'Shift Handovers', HANDOVER_COLUMNS, rows);
  addAnalyticsSheet(wb, 'Status Summary', buildBreakdown(rows, 'status'));

  return {
    buffer: generateXlsxBuffer(wb),
    filename: buildFilename('shift-handover-audit'),
  };
}

const CLOSURE_AUDIT_COLUMNS: ReportColumn[] = [
  { key: 'woNumber', header: 'WO Number', width: 22 },
  { key: 'title', header: 'Title', width: 30 },
  { key: 'assetName', header: 'Asset', width: 24 },
  { key: 'type', header: 'Type', width: 14 },
  { key: 'priority', header: 'Priority', width: 12 },
  { key: 'status', header: 'WO Status', width: 16 },
  { key: 'technician', header: 'Technician', width: 22 },
  { key: 'rcaRequired', header: 'RCA Required', width: 14 },
  { key: 'rcaComplete', header: 'RCA Complete', width: 14 },
  { key: 'supervisorStatus', header: 'Supervisor Review', width: 18 },
  { key: 'plannerStatus', header: 'Planner Closure', width: 18 },
  { key: 'reworkCount', header: 'Rework Count', format: 'number', width: 14 },
  { key: 'fullyCompliant', header: 'Fully Compliant', width: 16 },
  { key: 'rootCause', header: 'Root Cause', width: 35 },
  { key: 'correctiveAction', header: 'Corrective Action', width: 35 },
  { key: 'findings', header: 'Findings', width: 35 },
  { key: 'supervisorApprovedBy', header: 'Supervisor Approved By', width: 24 },
  { key: 'supervisorApprovedAt', header: 'Supervisor Approved At', format: 'datetime', width: 22 },
  { key: 'plannerClosedBy', header: 'Planner Closed By', width: 22 },
  { key: 'plannerClosedAt', header: 'Planner Closed At', format: 'datetime', width: 20 },
];

async function exportClosureAuditReport(
  filters: ReportFilters,
  session: SessionData,
): Promise<ReportResult> {
  const where = buildBaseWhere({ ...filters, maintenanceScope: filters.maintenanceScope || 'repairs' });
  where.status = { in: ['completed', 'verified', 'closed'] };

  const workOrders = await db.workOrder.findMany({
    where,
    include: {
      assignee: { select: { fullName: true } },
      repairCompletion: {
        include: {
          supervisorApprovedBy: { select: { fullName: true } },
          plannerClosedBy: { select: { fullName: true } },
        },
      },
    },
    orderBy: { actualEnd: 'desc' },
  });

  const rows = workOrders.map((wo) => {
    const completion = wo.repairCompletion;
    const rcaRequired = ['corrective', 'emergency', 'predictive'].includes(wo.type);
    const rcaComplete = !rcaRequired || Boolean(
      completion?.rootCause?.trim() && completion?.correctiveAction?.trim(),
    );
    const supervisorApproved = completion?.supervisorStatus === 'approved'
      && Boolean(completion.supervisorApprovedAt);
    const plannerClosed = completion?.plannerStatus === 'closed'
      && Boolean(completion.plannerClosedAt);
    const fullyCompliant = wo.status === 'closed'
      && rcaComplete
      && supervisorApproved
      && plannerClosed;

    return {
      woNumber: wo.woNumber,
      title: wo.title,
      assetName: wo.assetName || '',
      type: wo.type,
      priority: wo.priority,
      status: wo.status,
      technician: wo.assignee?.fullName || '',
      rcaRequired: rcaRequired ? 'Yes' : 'No',
      rcaComplete: rcaComplete ? 'Yes' : 'No',
      supervisorStatus: completion?.supervisorStatus || 'Missing Completion',
      plannerStatus: completion?.plannerStatus || 'Missing Completion',
      reworkCount: completion?.reworkCount || 0,
      fullyCompliant: fullyCompliant ? 'Yes' : 'No',
      rootCause: completion?.rootCause || '',
      correctiveAction: completion?.correctiveAction || '',
      findings: completion?.findings || '',
      supervisorApprovedBy: completion?.supervisorApprovedBy?.fullName || '',
      supervisorApprovedAt: completion?.supervisorApprovedAt?.toISOString() || '',
      plannerClosedBy: completion?.plannerClosedBy?.fullName || '',
      plannerClosedAt: completion?.plannerClosedAt?.toISOString() || '',
    };
  });

  const compliant = rows.filter((row) => row.fullyCompliant === 'Yes').length;
  const missingRca = rows.filter((row) => row.rcaRequired === 'Yes' && row.rcaComplete === 'No').length;
  const pendingSupervisor = rows.filter((row) => row.supervisorStatus !== 'approved').length;
  const pendingClosure = rows.filter((row) => row.plannerStatus !== 'closed').length;
  const reworkWos = rows.filter((row) => row.reworkCount > 0).length;

  const wb = createStandardWorkbook({
    reportName: 'Closure / RCA Compliance Audit',
    description: 'Completion records, RCA quality, supervisor approval, planner closure and rework exceptions',
    plantId: filters.plantId,
    filters: flattenFilters(filters),
    generatedBy: session.fullName || session.userId,
    kpis: [
      { label: 'Completed / Verified / Closed WOs', value: rows.length },
      { label: 'Fully Compliant', value: compliant },
      { label: 'Compliance Rate', value: rows.length > 0 ? ((compliant / rows.length) * 100).toFixed(1) + '%' : '100%' },
      { label: 'Missing RCA', value: missingRca },
      { label: 'Pending Supervisor Review', value: pendingSupervisor },
      { label: 'Pending Planner Closure', value: pendingClosure },
      { label: 'Rework WOs', value: reworkWos },
    ],
  });

  addDataSheet(wb, 'Closure Audit', CLOSURE_AUDIT_COLUMNS, rows);
  addAnalyticsSheet(wb, 'Compliance Status', buildBreakdown(rows, 'fullyCompliant'));

  return {
    buffer: generateXlsxBuffer(wb),
    filename: buildFilename('closure-rca-compliance-audit'),
  };
}


const BREAKDOWN_DETAIL_COLUMNS: ReportColumn[] = [
  { key: 'woNumber', header: 'WO Number', width: 20 },
  { key: 'reportedAt', header: 'Reported', format: 'datetime', width: 20 },
  { key: 'week', header: 'ISO Week', width: 12 },
  { key: 'assetName', header: 'Machine / Asset', width: 28 },
  { key: 'assetTag', header: 'Asset Tag', width: 16 },
  { key: 'priority', header: 'Priority', width: 12 },
  { key: 'trade', header: 'Trade', width: 20 },
  { key: 'status', header: 'Status', width: 16 },
  { key: 'responseMinutes', header: 'Response Time (min)', format: 'number', width: 18 },
  { key: 'repairMinutes', header: 'Repair Time (min)', format: 'number', width: 17 },
  { key: 'restorationMinutes', header: 'Reported→Restored (min)', format: 'number', width: 22 },
  { key: 'recordedDowntimeMinutes', header: 'Recorded Downtime (min)', format: 'number', width: 22 },
  { key: 'productionLoss', header: 'Production Loss', format: 'number', width: 17 },
  { key: 'totalCost', header: 'Total Cost', format: 'currency', width: 15 },
];

const BREAKDOWN_WEEK_COLUMNS: ReportColumn[] = [
  { key: 'week', header: 'ISO Week', width: 14 },
  { key: 'breakdowns', header: 'No. of Breakdowns', format: 'number', width: 18 },
  { key: 'avgResponseMinutes', header: 'Avg Response (min)', format: 'number', width: 18 },
  { key: 'avgRepairMinutes', header: 'Avg Repair / MTTR (min)', format: 'number', width: 22 },
  { key: 'restorationMinutes', header: 'Reported→Restored (min)', format: 'number', width: 22 },
  { key: 'recordedDowntimeMinutes', header: 'Recorded Downtime (min)', format: 'number', width: 22 },
];

const BREAKDOWN_ASSET_COLUMNS: ReportColumn[] = [
  { key: 'assetName', header: 'Machine / Asset', width: 28 },
  { key: 'assetTag', header: 'Asset Tag', width: 16 },
  { key: 'breakdowns', header: 'No. of Breakdowns', format: 'number', width: 18 },
  { key: 'avgResponseMinutes', header: 'Avg Response (min)', format: 'number', width: 18 },
  { key: 'avgRepairMinutes', header: 'Avg Repair / MTTR (min)', format: 'number', width: 22 },
  { key: 'restorationMinutes', header: 'Reported→Restored (min)', format: 'number', width: 22 },
  { key: 'recordedDowntimeMinutes', header: 'Recorded Downtime (min)', format: 'number', width: 22 },
  { key: 'totalCost', header: 'Total Cost', format: 'currency', width: 15 },
  { key: 'lastBreakdown', header: 'Last Breakdown', format: 'datetime', width: 20 },
];

const BREAKDOWN_TRADE_COLUMNS: ReportColumn[] = [
  { key: 'trade', header: 'Trade', width: 22 },
  { key: 'breakdowns', header: 'No. of Breakdowns', format: 'number', width: 18 },
  { key: 'avgResponseMinutes', header: 'Avg Response (min)', format: 'number', width: 18 },
  { key: 'avgRepairMinutes', header: 'Avg Repair / MTTR (min)', format: 'number', width: 22 },
  { key: 'recordedDowntimeMinutes', header: 'Recorded Downtime (min)', format: 'number', width: 22 },
];

function minutesBetweenDates(start?: Date | null, end?: Date | null): number | null {
  if (!start || !end) return null;
  const value = (end.getTime() - start.getTime()) / 60000;
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function isoWeekKey(date: Date): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

type BreakdownDetailRow = {
  woNumber: string;
  reportedAt: string;
  startedAt: string;
  completedAt: string;
  week: string;
  assetName: string;
  assetTag: string;
  priority: string;
  trade: string;
  status: string;
  responseMinutes: number | '';
  repairMinutes: number | '';
  restorationMinutes: number | '';
  recordedDowntimeMinutes: number;
  productionLoss: number;
  totalCost: number;
};

type BreakdownPreparedData = {
  detailRows: BreakdownDetailRow[];
  weeklyRows: Array<{
    week: string;
    breakdowns: number;
    avgResponseMinutes: number;
    avgRepairMinutes: number;
    restorationMinutes: number;
    recordedDowntimeMinutes: number;
  }>;
  assetRows: Array<{
    assetName: string;
    assetTag: string;
    breakdowns: number;
    avgResponseMinutes: number;
    avgRepairMinutes: number;
    restorationMinutes: number;
    recordedDowntimeMinutes: number;
    totalCost: number;
    mtbfDays: number | '';
    repeatFailure: string;
    lastBreakdown: string;
  }>;
  tradeRows: Array<{
    trade: string;
    breakdowns: number;
    avgResponseMinutes: number;
    avgRepairMinutes: number;
    recordedDowntimeMinutes: number;
  }>;
  responseValues: number[];
  repairValues: number[];
  restorationValues: number[];
  totalRecordedDowntime: number;
};

async function prepareBreakdownPerformanceData(filters: ReportFilters): Promise<BreakdownPreparedData> {
  const where = buildBaseWhere({ ...filters, maintenanceScope: 'repairs' });
  where.type = { in: ['corrective', 'emergency'] };

  const workOrders = await db.workOrder.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    include: { workOrderDowntimes: true },
    orderBy: { createdAt: 'asc' },
    take: 10000,
  });

  const assetIds = [...new Set(workOrders.map((wo) => wo.assetId).filter((id): id is string => Boolean(id)))];
  const assets = assetIds.length
    ? await db.asset.findMany({
        where: { id: { in: assetIds } },
        select: { id: true, name: true, assetTag: true },
      })
    : [];
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));

  const detailRows: BreakdownDetailRow[] = workOrders.map((wo) => {
    const asset = wo.assetId ? assetMap.get(wo.assetId) : undefined;
    const responseMinutes = minutesBetweenDates(wo.createdAt, wo.actualStart);
    const repairMinutes = minutesBetweenDates(wo.actualStart, wo.actualEnd);
    const restorationMinutes = minutesBetweenDates(wo.createdAt, wo.actualEnd);
    const recordedDowntimeMinutes = (wo.workOrderDowntimes || [])
      .reduce((sum, row) => sum + (row.durationMinutes || 0), 0);
    const productionLoss = (wo.workOrderDowntimes || [])
      .reduce((sum, row) => sum + (row.productionLoss || 0), 0);

    return {
      woNumber: wo.woNumber,
      reportedAt: wo.createdAt.toISOString(),
      startedAt: wo.actualStart?.toISOString() || '',
      completedAt: wo.actualEnd?.toISOString() || '',
      week: isoWeekKey(wo.createdAt),
      assetName: asset?.name || wo.assetName || 'Unassigned',
      assetTag: asset?.assetTag || '',
      priority: wo.priority,
      trade: wo.tradeActivity || 'Unspecified',
      status: wo.status,
      responseMinutes: responseMinutes === null ? '' : Number(responseMinutes.toFixed(2)),
      repairMinutes: repairMinutes === null ? '' : Number(repairMinutes.toFixed(2)),
      restorationMinutes: restorationMinutes === null ? '' : Number(restorationMinutes.toFixed(2)),
      recordedDowntimeMinutes: Number(recordedDowntimeMinutes.toFixed(2)),
      productionLoss: Number(productionLoss.toFixed(2)),
      totalCost: Number((wo.totalCost || 0).toFixed(2)),
    };
  });

  type BreakdownAggregate = {
    breakdowns: number;
    response: number[];
    repair: number[];
    restorationMinutes: number;
    recordedDowntimeMinutes: number;
    totalCost: number;
    failureTimes: number[];
    lastBreakdown?: string;
    assetTag?: string;
  };

  const byWeek = new Map<string, BreakdownAggregate>();
  const byAsset = new Map<string, BreakdownAggregate>();
  const byTrade = new Map<string, BreakdownAggregate>();

  for (const row of detailRows) {
    const accumulate = (map: Map<string, BreakdownAggregate>, key: string, assetTag?: string) => {
      const current = map.get(key) || {
        breakdowns: 0,
        response: [],
        repair: [],
        restorationMinutes: 0,
        recordedDowntimeMinutes: 0,
        totalCost: 0,
        failureTimes: [],
        assetTag,
      };
      current.breakdowns += 1;
      current.failureTimes.push(new Date(row.reportedAt).getTime());
      if (typeof row.responseMinutes === 'number') current.response.push(row.responseMinutes);
      if (typeof row.repairMinutes === 'number') current.repair.push(row.repairMinutes);
      if (typeof row.restorationMinutes === 'number') current.restorationMinutes += row.restorationMinutes;
      current.recordedDowntimeMinutes += row.recordedDowntimeMinutes;
      current.totalCost += row.totalCost;
      current.lastBreakdown = !current.lastBreakdown || row.reportedAt > current.lastBreakdown ? row.reportedAt : current.lastBreakdown;
      if (assetTag && !current.assetTag) current.assetTag = assetTag;
      map.set(key, current);
    };

    accumulate(byWeek, row.week);
    accumulate(byAsset, row.assetName, row.assetTag);
    accumulate(byTrade, row.trade);
  }

  const weeklyRows = [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, row]) => ({
      week,
      breakdowns: row.breakdowns,
      avgResponseMinutes: Number(average(row.response).toFixed(2)),
      avgRepairMinutes: Number(average(row.repair).toFixed(2)),
      restorationMinutes: Number(row.restorationMinutes.toFixed(2)),
      recordedDowntimeMinutes: Number(row.recordedDowntimeMinutes.toFixed(2)),
    }));

  const assetRows = [...byAsset.entries()]
    .map(([assetName, row]) => {
      const ordered = [...row.failureTimes].sort((a, b) => a - b);
      const intervals = ordered.slice(1).map((time, index) => (time - ordered[index]) / 86400000);
      return {
        assetName,
        assetTag: row.assetTag || '',
        breakdowns: row.breakdowns,
        avgResponseMinutes: Number(average(row.response).toFixed(2)),
        avgRepairMinutes: Number(average(row.repair).toFixed(2)),
        restorationMinutes: Number(row.restorationMinutes.toFixed(2)),
        recordedDowntimeMinutes: Number(row.recordedDowntimeMinutes.toFixed(2)),
        totalCost: Number(row.totalCost.toFixed(2)),
        mtbfDays: intervals.length ? Number(average(intervals).toFixed(2)) : '',
        repeatFailure: row.breakdowns > 1 ? 'Yes' : 'No',
        lastBreakdown: row.lastBreakdown || '',
      };
    })
    .sort((a, b) => b.breakdowns - a.breakdowns || b.recordedDowntimeMinutes - a.recordedDowntimeMinutes);

  const tradeRows = [...byTrade.entries()]
    .map(([trade, row]) => ({
      trade,
      breakdowns: row.breakdowns,
      avgResponseMinutes: Number(average(row.response).toFixed(2)),
      avgRepairMinutes: Number(average(row.repair).toFixed(2)),
      recordedDowntimeMinutes: Number(row.recordedDowntimeMinutes.toFixed(2)),
    }))
    .sort((a, b) => b.breakdowns - a.breakdowns);

  const responseValues = detailRows.flatMap((row) => typeof row.responseMinutes === 'number' ? [row.responseMinutes] : []);
  const repairValues = detailRows.flatMap((row) => typeof row.repairMinutes === 'number' ? [row.repairMinutes] : []);
  const restorationValues = detailRows.flatMap((row) => typeof row.restorationMinutes === 'number' ? [row.restorationMinutes] : []);
  const totalRecordedDowntime = detailRows.reduce((sum, row) => sum + row.recordedDowntimeMinutes, 0);

  return { detailRows, weeklyRows, assetRows, tradeRows, responseValues, repairValues, restorationValues, totalRecordedDowntime };
}

const BREAKDOWN_FREQUENCY_ASSET_COLUMNS: ReportColumn[] = [
  { key: 'rank', header: 'Rank', format: 'number', width: 10 },
  { key: 'assetName', header: 'Machine / Asset', width: 30 },
  { key: 'assetTag', header: 'Asset Tag', width: 16 },
  { key: 'breakdowns', header: 'No. of Breakdowns', format: 'number', width: 18 },
  { key: 'sharePercent', header: 'Share %', format: 'number', width: 12 },
  { key: 'cumulativePercent', header: 'Cumulative %', format: 'number', width: 14 },
  { key: 'lastBreakdown', header: 'Last Breakdown', format: 'datetime', width: 20 },
];

const RESPONSE_DETAIL_COLUMNS: ReportColumn[] = [
  { key: 'woNumber', header: 'WO Number', width: 20 },
  { key: 'assetName', header: 'Machine / Asset', width: 28 },
  { key: 'assetTag', header: 'Asset Tag', width: 16 },
  { key: 'priority', header: 'Priority', width: 12 },
  { key: 'trade', header: 'Trade', width: 20 },
  { key: 'reportedAt', header: 'Reported', format: 'datetime', width: 20 },
  { key: 'startedAt', header: 'Work Started', format: 'datetime', width: 20 },
  { key: 'responseMinutes', header: 'Response Time (min)', format: 'number', width: 18 },
  { key: 'status', header: 'Status', width: 16 },
];

const REPAIR_TIME_DETAIL_COLUMNS: ReportColumn[] = [
  { key: 'woNumber', header: 'WO Number', width: 20 },
  { key: 'assetName', header: 'Machine / Asset', width: 28 },
  { key: 'assetTag', header: 'Asset Tag', width: 16 },
  { key: 'trade', header: 'Trade', width: 20 },
  { key: 'startedAt', header: 'Work Started', format: 'datetime', width: 20 },
  { key: 'completedAt', header: 'Work Completed', format: 'datetime', width: 20 },
  { key: 'repairMinutes', header: 'Repair Time / MTTR (min)', format: 'number', width: 22 },
  { key: 'recordedDowntimeMinutes', header: 'Recorded Downtime (min)', format: 'number', width: 22 },
  { key: 'totalCost', header: 'Total Cost', format: 'currency', width: 15 },
];

const RELIABILITY_COLUMNS: ReportColumn[] = [
  { key: 'rank', header: 'Rank', format: 'number', width: 10 },
  { key: 'assetName', header: 'Machine / Asset', width: 30 },
  { key: 'assetTag', header: 'Asset Tag', width: 16 },
  { key: 'breakdowns', header: 'Breakdowns', format: 'number', width: 14 },
  { key: 'repeatFailure', header: 'Repeat Failure', width: 15 },
  { key: 'mtbfDays', header: 'MTBF (days)', format: 'number', width: 14 },
  { key: 'avgRepairMinutes', header: 'Avg MTTR (min)', format: 'number', width: 16 },
  { key: 'avgResponseMinutes', header: 'Avg Response (min)', format: 'number', width: 18 },
  { key: 'recordedDowntimeMinutes', header: 'Downtime (min)', format: 'number', width: 16 },
  { key: 'totalCost', header: 'Repair Cost', format: 'currency', width: 15 },
  { key: 'lastBreakdown', header: 'Last Breakdown', format: 'datetime', width: 20 },
];

async function exportBreakdownPerformanceReport(filters: ReportFilters, session: SessionData): Promise<ReportResult> {
  const data = await prepareBreakdownPerformanceData(filters);
  const wb = createStandardWorkbook({
    reportName: 'Breakdown Performance & Response',
    description: 'Breakdown frequency, response time and downtime analysis with separated response, repair and restoration intervals',
    plantId: filters.plantId,
    filters: flattenFilters(filters),
    generatedBy: session.fullName || session.userId,
    kpis: [
      { label: 'Number of Breakdowns', value: data.detailRows.length },
      { label: 'Assets with Breakdowns', value: data.assetRows.length },
      { label: 'Avg Response Time (min)', value: average(data.responseValues).toFixed(2) },
      { label: 'Avg Repair Time / MTTR (min)', value: average(data.repairValues).toFixed(2) },
      { label: 'Avg Reported→Restored (min)', value: average(data.restorationValues).toFixed(2) },
      { label: 'Recorded Downtime (hrs)', value: (data.totalRecordedDowntime / 60).toFixed(2) },
      { label: 'Total Repair Cost', value: data.detailRows.reduce((sum, row) => sum + row.totalCost, 0).toFixed(2) },
    ],
  });
  addDataSheet(wb, 'Breakdown Detail', BREAKDOWN_DETAIL_COLUMNS, data.detailRows);
  addDataSheet(wb, 'Weekly Trend', BREAKDOWN_WEEK_COLUMNS, data.weeklyRows);
  addDataSheet(wb, 'By Machine', BREAKDOWN_ASSET_COLUMNS, data.assetRows);
  addDataSheet(wb, 'By Trade', BREAKDOWN_TRADE_COLUMNS, data.tradeRows);
  return { buffer: generateXlsxBuffer(wb), filename: buildFilename('breakdown-performance-response-report') };
}

async function exportBreakdownFrequencyReport(filters: ReportFilters, session: SessionData): Promise<ReportResult> {
  const data = await prepareBreakdownPerformanceData(filters);
  const total = data.detailRows.length || 1;
  let cumulative = 0;
  const ranked = data.assetRows.map((row, index) => {
    const share = (row.breakdowns / total) * 100;
    cumulative += share;
    return {
      rank: index + 1,
      assetName: row.assetName,
      assetTag: row.assetTag,
      breakdowns: row.breakdowns,
      sharePercent: Number(share.toFixed(2)),
      cumulativePercent: Number(Math.min(100, cumulative).toFixed(2)),
      lastBreakdown: row.lastBreakdown,
    };
  });

  const wb = createStandardWorkbook({
    reportName: 'Breakdown Frequency Report',
    description: 'Breakdown count by machine, week and maintenance trade with Pareto ranking',
    plantId: filters.plantId,
    filters: flattenFilters(filters),
    generatedBy: session.fullName || session.userId,
    kpis: [
      { label: 'Total Breakdowns', value: data.detailRows.length },
      { label: 'Affected Assets', value: data.assetRows.length },
      { label: 'Repeat-Failure Assets', value: data.assetRows.filter(row => row.breakdowns > 1).length },
      { label: 'Highest Asset Count', value: ranked[0]?.breakdowns || 0 },
    ],
  });
  addDataSheet(wb, 'Machine Pareto', BREAKDOWN_FREQUENCY_ASSET_COLUMNS, ranked);
  addDataSheet(wb, 'Weekly Frequency', BREAKDOWN_WEEK_COLUMNS.slice(0, 2), data.weeklyRows);
  addDataSheet(wb, 'Trade Frequency', BREAKDOWN_TRADE_COLUMNS.slice(0, 2), data.tradeRows);
  addDataSheet(wb, 'Breakdown Detail', BREAKDOWN_DETAIL_COLUMNS, data.detailRows);
  return { buffer: generateXlsxBuffer(wb), filename: buildFilename('breakdown-frequency-report') };
}

async function exportResponseTimePerformanceReport(filters: ReportFilters, session: SessionData): Promise<ReportResult> {
  const data = await prepareBreakdownPerformanceData(filters);
  const valid = data.detailRows.filter(row => typeof row.responseMinutes === 'number');
  const missing = data.detailRows.length - valid.length;
  const byAsset = data.assetRows
    .filter(row => row.avgResponseMinutes > 0)
    .sort((a, b) => b.avgResponseMinutes - a.avgResponseMinutes);

  const wb = createStandardWorkbook({
    reportName: 'Response Time Performance',
    description: 'Time from work-order reporting to actual maintenance work start',
    plantId: filters.plantId,
    filters: flattenFilters(filters),
    generatedBy: session.fullName || session.userId,
    kpis: [
      { label: 'Breakdowns Evaluated', value: valid.length },
      { label: 'Avg Response (min)', value: average(data.responseValues).toFixed(2) },
      { label: 'Fastest Response (min)', value: valid.length ? Math.min(...data.responseValues).toFixed(2) : '0' },
      { label: 'Slowest Response (min)', value: valid.length ? Math.max(...data.responseValues).toFixed(2) : '0' },
      { label: 'Missing Start Time', value: missing },
    ],
  });
  addDataSheet(wb, 'Response Detail', RESPONSE_DETAIL_COLUMNS, data.detailRows);
  addDataSheet(wb, 'Weekly Response', BREAKDOWN_WEEK_COLUMNS.slice(0, 3), data.weeklyRows);
  addDataSheet(wb, 'Response by Machine', [
    { key: 'assetName', header: 'Machine / Asset', width: 30 },
    { key: 'assetTag', header: 'Asset Tag', width: 16 },
    { key: 'breakdowns', header: 'Breakdowns', format: 'number', width: 14 },
    { key: 'avgResponseMinutes', header: 'Avg Response (min)', format: 'number', width: 18 },
  ], byAsset);
  addDataSheet(wb, 'Response by Trade', [
    { key: 'trade', header: 'Trade', width: 22 },
    { key: 'breakdowns', header: 'Breakdowns', format: 'number', width: 14 },
    { key: 'avgResponseMinutes', header: 'Avg Response (min)', format: 'number', width: 18 },
  ], data.tradeRows);
  return { buffer: generateXlsxBuffer(wb), filename: buildFilename('response-time-performance-report') };
}

async function exportRepairTimeMttrReport(filters: ReportFilters, session: SessionData): Promise<ReportResult> {
  const data = await prepareBreakdownPerformanceData(filters);
  const valid = data.detailRows.filter(row => typeof row.repairMinutes === 'number');
  const missing = data.detailRows.length - valid.length;
  const byAsset = data.assetRows
    .filter(row => row.avgRepairMinutes > 0)
    .sort((a, b) => b.avgRepairMinutes - a.avgRepairMinutes);

  const wb = createStandardWorkbook({
    reportName: 'Repair Time / MTTR Report',
    description: 'Repair duration from actual work start to work completion, with machine and trade comparisons',
    plantId: filters.plantId,
    filters: flattenFilters(filters),
    generatedBy: session.fullName || session.userId,
    kpis: [
      { label: 'Completed Repair Intervals', value: valid.length },
      { label: 'Average MTTR (min)', value: average(data.repairValues).toFixed(2) },
      { label: 'Fastest Repair (min)', value: valid.length ? Math.min(...data.repairValues).toFixed(2) : '0' },
      { label: 'Longest Repair (min)', value: valid.length ? Math.max(...data.repairValues).toFixed(2) : '0' },
      { label: 'Missing Repair Interval', value: missing },
    ],
  });
  addDataSheet(wb, 'Repair Time Detail', REPAIR_TIME_DETAIL_COLUMNS, data.detailRows);
  addDataSheet(wb, 'MTTR by Machine', [
    { key: 'assetName', header: 'Machine / Asset', width: 30 },
    { key: 'assetTag', header: 'Asset Tag', width: 16 },
    { key: 'breakdowns', header: 'Breakdowns', format: 'number', width: 14 },
    { key: 'avgRepairMinutes', header: 'Avg MTTR (min)', format: 'number', width: 16 },
    { key: 'recordedDowntimeMinutes', header: 'Downtime (min)', format: 'number', width: 16 },
  ], byAsset);
  addDataSheet(wb, 'MTTR by Trade', [
    { key: 'trade', header: 'Trade', width: 22 },
    { key: 'breakdowns', header: 'Breakdowns', format: 'number', width: 14 },
    { key: 'avgRepairMinutes', header: 'Avg MTTR (min)', format: 'number', width: 16 },
  ], data.tradeRows);
  return { buffer: generateXlsxBuffer(wb), filename: buildFilename('repair-time-mttr-report') };
}

async function exportReliabilityBadActorsReport(filters: ReportFilters, session: SessionData): Promise<ReportResult> {
  const data = await prepareBreakdownPerformanceData(filters);
  const ranked = data.assetRows.map((row, index) => ({ rank: index + 1, ...row }));
  const repeatAssets = ranked.filter(row => row.repeatFailure === 'Yes');

  const wb = createStandardWorkbook({
    reportName: 'Reliability & Repeat Failure Report',
    description: 'Bad-actor ranking using breakdown frequency, MTBF, MTTR, downtime and repair cost',
    plantId: filters.plantId,
    filters: flattenFilters(filters),
    generatedBy: session.fullName || session.userId,
    kpis: [
      { label: 'Assets with Breakdowns', value: ranked.length },
      { label: 'Repeat-Failure Assets', value: repeatAssets.length },
      { label: 'Single-Failure Assets', value: ranked.length - repeatAssets.length },
      { label: 'Total Breakdown Downtime (hrs)', value: (data.totalRecordedDowntime / 60).toFixed(2) },
    ],
  });
  addDataSheet(wb, 'Bad Actors', RELIABILITY_COLUMNS, ranked);
  addDataSheet(wb, 'Repeat Failures', RELIABILITY_COLUMNS, repeatAssets);
  addDataSheet(wb, 'Breakdown Detail', BREAKDOWN_DETAIL_COLUMNS, data.detailRows);
  return { buffer: generateXlsxBuffer(wb), filename: buildFilename('reliability-repeat-failure-report') };
}

/**
 * Schema-safe Repairs report dispatcher.
 *
 * Work Order and Maintenance Request remain schema-safe overrides for legacy
 * relation drift. The operational summary, asset history and department-cost
 * reports are implemented here against the active Prisma schema; the remaining
 * established report types delegate to the existing implementation.
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
  if (reportType === 'material-reconciliation') return exportMaterialReconciliationReport(filters, session);
  if (reportType === 'tool-custody') return exportToolCustodyReport(filters, session);
  if (reportType === 'assistance') return exportAssistanceReport(filters, session);
  if (reportType === 'shift-handover') return exportShiftHandoverReport(filters, session);
  if (reportType === 'closure-audit') return exportClosureAuditReport(filters, session);
  if (reportType === 'breakdown-performance') return exportBreakdownPerformanceReport(filters, session);
  if (reportType === 'breakdown-frequency') return exportBreakdownFrequencyReport(filters, session);
  if (reportType === 'response-time-performance') return exportResponseTimePerformanceReport(filters, session);
  if (reportType === 'repair-time-mttr') return exportRepairTimeMttrReport(filters, session);
  if (reportType === 'reliability-bad-actors') return exportReliabilityBadActorsReport(filters, session);
  return generateLegacyReport(reportType, filters, session);
}
