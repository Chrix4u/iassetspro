// ============================================================================
// REPAIRS XLSX REPORT EXPORTS — 10 report-specific XLSX generators
// ============================================================================
//
// Each function:
//   1. Queries data from the database (server-side)
//   2. Builds a workbook using the reusable reportExportXlsx helpers
//   3. Returns { buffer, filename }
//
// All functions accept filters, a validated session, and optionally
// a plant scope to enforce data isolation.

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
import { createLogger } from '@/lib/logger';

const logger = createLogger('repairsReportXlsx');

export interface ReportFilters {
  plantId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  priority?: string;
  type?: string;
  tradeActivity?: string;
  departmentId?: string;
  assetId?: string;
  assigneeId?: string;
  maintenanceScope?: 'repairs' | 'pm' | 'all';
}

export interface ReportResult {
  buffer: Buffer;
  filename: string;
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

export async function exportWorkOrderReport(
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
    take: 5000,
  });

  const rows = workOrders.map((wo) => ({
    woNumber: wo.woNumber,
    title: wo.title,
    type: wo.type,
    priority: wo.priority,
    status: wo.status,
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
    description: 'Comprehensive work order listing with costs and timeline',
    plantId: filters.plantId,
    filters: flattenFilters(filters),
    generatedBy: session.fullName,
    kpis: [
      { label: 'Total WOs', value: workOrders.length },
      { label: 'Completed', value: workOrders.filter((w) => w.status === 'completed' || w.status === 'verified' || w.status === 'closed').length },
      { label: 'In Progress', value: workOrders.filter((w) => ['assigned', 'in_progress', 'waiting_parts'].includes(w.status)).length },
      { label: 'Total Cost', value: `GHS ${workOrders.reduce((s, w) => s + (w.totalCost ?? 0), 0).toFixed(2)}` },
    ],
  });

  addDataSheet(wb, 'Work Orders', WORK_ORDER_COLUMNS, rows);
  addAnalyticsSheet(wb, 'Status Breakdown', buildStatusBreakdown(workOrders, 'status'));

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

export async function exportMaintenanceRequestReport(
  filters: ReportFilters,
  session: SessionData,
): Promise<ReportResult> {
  const where = buildMrWhere(filters);

  const requests = await db.maintenanceRequest.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    include: {
      requester: { select: { id: true, fullName: true } },
      supervisor: { select: { id: true, fullName: true } },
      workOrder: { select: { id: true, woNumber: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 5000,
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
    description: 'All maintenance requests with workflow tracking',
    plantId: filters.plantId,
    filters: flattenFilters(filters),
    generatedBy: session.fullName,
    kpis: [
      { label: 'Total MRs', value: requests.length },
      { label: 'Converted to WO', value: requests.filter((r) => r.workOrderId).length },
      { label: 'Pending', value: requests.filter((r) => r.status === 'pending').length },
    ],
  });

  addDataSheet(wb, 'Maintenance Requests', MR_COLUMNS, rows);
  addAnalyticsSheet(wb, 'Workflow Breakdown', buildStatusBreakdown(requests, 'workflowStatus'));

  return {
    buffer: generateXlsxBuffer(wb),
    filename: buildFilename('maintenance-request-report'),
  };
}

const LABOR_COLUMNS: ReportColumn[] = [
  { key: 'woNumber', header: 'WO Number', width: 22 },
  { key: 'workerName', header: 'Worker', width: 22 },
  { key: 'action', header: 'Action', width: 14 },
  { key: 'duration', header: 'Duration (hrs)', format: 'number', width: 16 },
  { key: 'activityType', header: 'Activity Type', width: 16 },
  { key: 'startTime', header: 'Start Time', format: 'datetime', width: 20 },
  { key: 'endTime', header: 'End Time', format: 'datetime', width: 20 },
  { key: 'breakMinutes', header: 'Break (min)', format: 'number', width: 14 },
  { key: 'isTeamLog', header: 'Team Log', width: 12 },
  { key: 'notes', header: 'Notes', width: 30 },
  { key: 'timestamp', header: 'Logged At', format: 'datetime', width: 20 },
];

export async function exportLaborReport(
  filters: ReportFilters,
  session: SessionData,
): Promise<ReportResult> {
  const where = buildLaborWhere(filters);

  const timeLogs = await db.workOrderTimeLog.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    include: {
      workOrder: { select: { woNumber: true, title: true } },
      user: { select: { fullName: true } },
    },
    orderBy: { timestamp: 'desc' },
    take: 10000,
  });

  const rows = timeLogs.map((tl) => ({
    woNumber: tl.workOrder?.woNumber || '',
    workerName: tl.user?.fullName || '',
    action: tl.action,
    duration: tl.duration ?? 0,
    activityType: tl.activityType,
    startTime: tl.startTime?.toISOString() ?? '',
    endTime: tl.endTime?.toISOString() ?? '',
    breakMinutes: tl.breakMinutes,
    isTeamLog: tl.isTeamLog ? 'Yes' : 'No',
    notes: tl.notes || '',
    timestamp: tl.timestamp.toISOString(),
  }));

  const totalHours = timeLogs.reduce((s, t) => s + (t.duration ?? 0), 0);

  const wb = createStandardWorkbook({
    reportName: 'Labor / Time Report',
    description: 'Technician time logs across work orders',
    plantId: filters.plantId,
    filters: flattenFilters(filters),
    generatedBy: session.fullName,
    kpis: [
      { label: 'Total Log Entries', value: timeLogs.length },
      { label: 'Total Labor Hours', value: totalHours.toFixed(1) },
      { label: 'Avg Duration (hrs)', value: timeLogs.length > 0 ? (totalHours / timeLogs.length).toFixed(2) : '0' },
    ],
  });

  addDataSheet(wb, 'Time Logs', LABOR_COLUMNS, rows);
  addAnalyticsSheet(wb, 'Activity Breakdown', buildStatusBreakdown(timeLogs, 'activityType'));

  return {
    buffer: generateXlsxBuffer(wb),
    filename: buildFilename('labor-time-report'),
  };
}

const DOWNTIME_COLUMNS: ReportColumn[] = [
  { key: 'woNumber', header: 'WO Number', width: 22 },
  { key: 'assetName', header: 'Asset', width: 25 },
  { key: 'category', header: 'Category', width: 14 },
  { key: 'impactLevel', header: 'Impact', width: 14 },
  { key: 'downtimeStart', header: 'Downtime Start', format: 'datetime', width: 20 },
  { key: 'downtimeEnd', header: 'Downtime End', format: 'datetime', width: 20 },
  { key: 'durationMinutes', header: 'Duration (min)', format: 'number', width: 16 },
  { key: 'productionLoss', header: 'Production Loss', format: 'currency', width: 16 },
  { key: 'reason', header: 'Reason', width: 35 },
  { key: 'createdByName', header: 'Logged By', width: 20 },
  { key: 'notes', header: 'Notes', width: 30 },
  { key: 'createdAt', header: 'Created', format: 'datetime', width: 20 },
];

export async function exportDowntimeReport(
  filters: ReportFilters,
  session: SessionData,
): Promise<ReportResult> {
  const where = buildDowntimeWhere(filters);

  const downtimes = await db.workOrderDowntime.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    include: {
      workOrder: { select: { woNumber: true, title: true } },
      createdBy: { select: { fullName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });

  const totalMinutes = downtimes.reduce((s, d) => s + (d.durationMinutes ?? 0), 0);
  const totalLoss = downtimes.reduce((s, d) => s + (d.productionLoss ?? 0), 0);

  const rows = downtimes.map((dt) => ({
    woNumber: dt.workOrder?.woNumber || '',
    assetName: dt.assetName || '',
    category: dt.category,
    impactLevel: dt.impactLevel,
    downtimeStart: dt.downtimeStart.toISOString(),
    downtimeEnd: dt.downtimeEnd?.toISOString() ?? '',
    durationMinutes: dt.durationMinutes ?? 0,
    productionLoss: dt.productionLoss ?? 0,
    reason: dt.reason,
    createdByName: dt.createdBy?.fullName || '',
    notes: dt.notes || '',
    createdAt: dt.createdAt.toISOString(),
  }));

  const wb = createStandardWorkbook({
    reportName: 'Downtime Report',
    description: 'Equipment downtime events with production impact',
    plantId: filters.plantId,
    filters: flattenFilters(filters),
    generatedBy: session.fullName,
    kpis: [
      { label: 'Total Events', value: downtimes.length },
      { label: 'Total Downtime (hrs)', value: (totalMinutes / 60).toFixed(1) },
      { label: 'Total Prod. Loss', value: `GHS ${totalLoss.toFixed(2)}` },
    ],
  });

  addDataSheet(wb, 'Downtime Events', DOWNTIME_COLUMNS, rows);
  addAnalyticsSheet(wb, 'Category Breakdown', buildStatusBreakdown(downtimes, 'category'));

  return {
    buffer: generateXlsxBuffer(wb),
    filename: buildFilename('downtime-report'),
  };
}

const MATERIAL_COLUMNS: ReportColumn[] = [
  { key: 'requestNumber', header: 'Req #', width: 10 },
  { key: 'woNumber', header: 'WO Number', width: 22 },
  { key: 'itemName', header: 'Item Name', width: 25 },
  { key: 'componentName', header: 'Component', width: 20 },
  { key: 'quantityRequested', header: 'Qty Requested', format: 'number', width: 16 },
  { key: 'quantityApproved', header: 'Qty Approved', format: 'number', width: 16 },
  { key: 'quantityIssued', header: 'Qty Issued', format: 'number', width: 14 },
  { key: 'quantityReturned', header: 'Qty Returned', format: 'number', width: 16 },
  { key: 'unit', header: 'Unit', width: 10 },
  { key: 'unitCost', header: 'Unit Cost', format: 'currency', width: 14 },
  { key: 'estimatedCost', header: 'Est. Cost', format: 'currency', width: 14 },
  { key: 'urgency', header: 'Urgency', width: 12 },
  { key: 'source', header: 'Source', width: 16 },
  { key: 'status', header: 'Status', width: 18 },
  { key: 'reason', header: 'Reason', width: 30 },
  { key: 'createdAt', header: 'Created', format: 'datetime', width: 20 },
];

export async function exportMaterialReport(
  filters: ReportFilters,
  session: SessionData,
): Promise<ReportResult> {
  const where = buildMaterialWhere(filters);

  const materials = await db.repairMaterialRequest.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    include: {
      workOrder: { select: { woNumber: true } },
      componentRegistry: { select: { name: true, componentCode: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 10000,
  });

  const totalCost = materials.reduce((s, m) => s + (m.estimatedCost ?? 0), 0);

  const rows = materials.map((m, idx) => ({
    requestNumber: String(idx + 1),
    woNumber: m.workOrder?.woNumber || '',
    itemName: m.itemName,
    componentName: m.componentRegistry?.name || '',
    quantityRequested: m.quantityRequested,
    quantityApproved: m.quantityApproved || m.supervisorApprovedQuantity || m.storekeeperApprovedQuantity || 0,
    quantityIssued: m.quantityIssued,
    quantityReturned: m.quantityReturned,
    unit: m.unit,
    unitCost: m.unitCost ?? 0,
    estimatedCost: m.estimatedCost,
    urgency: m.urgency,
    source: m.source,
    status: m.status,
    reason: m.reason,
    createdAt: m.createdAt.toISOString(),
  }));

  const wb = createStandardWorkbook({
    reportName: 'Material Usage Report',
    description: 'Repair material requests with issue tracking',
    plantId: filters.plantId,
    filters: flattenFilters(filters),
    generatedBy: session.fullName,
    kpis: [
      { label: 'Total Requests', value: materials.length },
      { label: 'Issued', value: materials.filter((m) => m.status === 'issued').length },
      { label: 'Pending', value: materials.filter((m) => m.status === 'pending').length },
      { label: 'Est. Total Cost', value: `GHS ${totalCost.toFixed(2)}` },
    ],
  });

  addDataSheet(wb, 'Materials', MATERIAL_COLUMNS, rows);

  return {
    buffer: generateXlsxBuffer(wb),
    filename: buildFilename('material-usage-report'),
  };
}

const TOOL_COLUMNS: ReportColumn[] = [
  { key: 'requestNumber', header: 'Req #', width: 22 },
  { key: 'woNumber', header: 'WO Number', width: 22 },
  { key: 'toolName', header: 'Tool Name', width: 25 },
  { key: 'urgency', header: 'Urgency', width: 12 },
  { key: 'source', header: 'Source', width: 16 },
  { key: 'status', header: 'Status', width: 18 },
  { key: 'requestedByName', header: 'Requested By', width: 20 },
  { key: 'conditionAtIssue', header: 'Cond. at Issue', width: 16 },
  { key: 'conditionAtReturn', header: 'Cond. at Return', width: 18 },
  { key: 'reason', header: 'Reason', width: 30 },
  { key: 'rejectionReason', header: 'Rejection Reason', width: 25 },
  { key: 'createdAt', header: 'Created', format: 'datetime', width: 20 },
];

export async function exportToolReport(
  filters: ReportFilters,
  session: SessionData,
): Promise<ReportResult> {
  const where = buildToolWhere(filters);

  const tools = await db.repairToolRequest.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    include: {
      workOrder: { select: { woNumber: true } },
      requestedBy: { select: { fullName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });

  const rows = tools.map((t) => ({
    requestNumber: t.requestNumber || '',
    woNumber: t.workOrder?.woNumber || '',
    toolName: t.toolName,
    urgency: t.urgency,
    source: t.source,
    status: t.status,
    requestedByName: t.requestedBy?.fullName || '',
    conditionAtIssue: t.toolConditionAtIssue || '',
    conditionAtReturn: t.toolConditionAtReturn || '',
    reason: t.reason,
    rejectionReason: t.rejectionReason || '',
    createdAt: t.createdAt.toISOString(),
  }));

  const wb = createStandardWorkbook({
    reportName: 'Tool Usage Report',
    description: 'Repair tool requests with condition tracking',
    plantId: filters.plantId,
    filters: flattenFilters(filters),
    generatedBy: session.fullName,
    kpis: [
      { label: 'Total Requests', value: tools.length },
      { label: 'Issued', value: tools.filter((t) => t.status === 'issued').length },
      { label: 'Returned', value: tools.filter((t) => t.status === 'returned').length },
      { label: 'Rejected', value: tools.filter((t) => t.status === 'rejected').length },
    ],
  });

  addDataSheet(wb, 'Tools', TOOL_COLUMNS, rows);

  return {
    buffer: generateXlsxBuffer(wb),
    filename: buildFilename('tool-usage-report'),
  };
}

const FAILURE_COLUMNS: ReportColumn[] = [
  { key: 'id', header: 'ID', width: 28 },
  { key: 'assetName', header: 'Asset', width: 25 },
  { key: 'componentName', header: 'Component', width: 22 },
  { key: 'failureMode', header: 'Failure Mode', width: 18 },
  { key: 'failureCode', header: 'Failure Code', width: 16 },
  { key: 'failureSeverity', header: 'Severity', width: 12 },
  { key: 'rootCause', header: 'Root Cause', width: 30 },
  { key: 'correctiveAction', header: 'Corrective Action', width: 35 },
  { key: 'preventiveAction', header: 'Preventive Action', width: 35 },
  { key: 'downtimeMinutes', header: 'Downtime (min)', format: 'number', width: 16 },
  { key: 'repairCost', header: 'Repair Cost', format: 'currency', width: 14 },
  { key: 'detectedAt', header: 'Detected At', format: 'datetime', width: 20 },
  { key: 'resolvedAt', header: 'Resolved At', format: 'datetime', width: 20 },
  { key: 'woNumber', header: 'Linked WO', width: 22 },
];

export async function exportFailureAnalysisReport(
  filters: ReportFilters,
  session: SessionData,
): Promise<ReportResult> {
  const where = buildFailureWhere(filters);

  const failures = await db.failureRecord.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    include: {
      asset: { select: { name: true } },
      component: { select: { name: true } },
      workOrder: { select: { woNumber: true } },
    },
    orderBy: { detectedAt: 'desc' },
    take: 5000,
  });

  const totalDowntime = failures.reduce((s, f) => s + (f.downtimeMinutes ?? 0), 0);
  const totalCost = failures.reduce((s, f) => s + (f.repairCost ?? 0), 0);

  const rows = failures.map((f) => ({
    id: f.id,
    assetName: f.asset?.name || '',
    componentName: f.component?.name || '',
    failureMode: f.failureMode,
    failureCode: f.failureCode || '',
    failureSeverity: f.failureSeverity,
    rootCause: f.rootCause || '',
    correctiveAction: f.correctiveAction || '',
    preventiveAction: f.preventiveAction || '',
    downtimeMinutes: f.downtimeMinutes ?? 0,
    repairCost: f.repairCost ?? 0,
    detectedAt: f.detectedAt.toISOString(),
    resolvedAt: f.resolvedAt?.toISOString() ?? '',
    woNumber: f.workOrder?.woNumber || '',
  }));

  const wb = createStandardWorkbook({
    reportName: 'Failure Analysis Report',
    description: 'Failure records with RCA and corrective actions',
    plantId: filters.plantId,
    filters: flattenFilters(filters),
    generatedBy: session.fullName,
    kpis: [
      { label: 'Total Failures', value: failures.length },
      { label: 'Total Downtime (hrs)', value: (totalDowntime / 60).toFixed(1) },
      { label: 'Total Repair Cost', value: `GHS ${totalCost.toFixed(2)}` },
    ],
  });

  addDataSheet(wb, 'Failure Records', FAILURE_COLUMNS, rows);
  addAnalyticsSheet(wb, 'Failure Mode Pareto', buildFailureModePareto(failures));

  return {
    buffer: generateXlsxBuffer(wb),
    filename: buildFilename('failure-analysis-report'),
  };
}

const COST_COLUMNS: ReportColumn[] = [
  { key: 'woNumber', header: 'WO Number', width: 22 },
  { key: 'title', header: 'Title', width: 30 },
  { key: 'type', header: 'Type', width: 14 },
  { key: 'priority', header: 'Priority', width: 12 },
  { key: 'status', header: 'Status', width: 18 },
  { key: 'assetName', header: 'Asset', width: 25 },
  { key: 'laborCost', header: 'Labor Cost', format: 'currency', width: 14 },
  { key: 'partsCost', header: 'Parts Cost', format: 'currency', width: 14 },
  { key: 'contractorCost', header: 'Contractor Cost', format: 'currency', width: 16 },
  { key: 'toolCost', header: 'Tool Cost', format: 'currency', width: 14 },
  { key: 'totalCost', header: 'Total Cost', format: 'currency', width: 14 },
  { key: 'actualHours', header: 'Actual Hours', format: 'number', width: 14 },
  { key: 'completedAt', header: 'Completed', format: 'date', width: 14 },
];

export async function exportCostReport(
  filters: ReportFilters,
  session: SessionData,
): Promise<ReportResult> {
  const where = buildBaseWhere(filters);
  (where as Record<string, unknown>).status = { in: ['completed', 'verified', 'closed'] };

  const workOrders = await db.workOrder.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    include: {
      repairCompletion: { select: { totalLaborHours: true, totalMaterialCost: true, totalToolCost: true } },
    },
    orderBy: { actualEnd: 'desc' },
    take: 5000,
  });

  const totals = workOrders.reduce(
    (acc, wo) => ({
      labor: acc.labor + (wo.laborCost ?? 0),
      parts: acc.parts + (wo.partsCost ?? 0),
      contractor: acc.contractor + (wo.contractorCost ?? 0),
      tools: acc.tools + (wo.repairCompletion?.totalToolCost ?? 0),
      total: acc.total + (wo.totalCost ?? 0),
    }),
    { labor: 0, parts: 0, contractor: 0, tools: 0, total: 0 },
  );

  const rows = workOrders.map((wo) => ({
    woNumber: wo.woNumber,
    title: wo.title,
    type: wo.type,
    priority: wo.priority,
    status: wo.status,
    assetName: wo.assetName || '',
    laborCost: wo.laborCost ?? 0,
    partsCost: wo.partsCost ?? 0,
    contractorCost: wo.contractorCost ?? 0,
    toolCost: wo.repairCompletion?.totalToolCost ?? 0,
    totalCost: wo.totalCost ?? 0,
    actualHours: wo.repairCompletion?.totalLaborHours ?? wo.actualHours ?? 0,
    completedAt: wo.actualEnd?.toISOString()?.split('T')[0] ?? '',
  }));

  const wb = createStandardWorkbook({
    reportName: 'Cost Analysis Report',
    description: 'Work order cost breakdown by labor, parts, contractors, tools',
    plantId: filters.plantId,
    filters: flattenFilters(filters),
    generatedBy: session.fullName,
    kpis: [
      { label: 'Total WOs', value: workOrders.length },
      { label: 'Total Labor', value: `GHS ${totals.labor.toFixed(2)}` },
      { label: 'Total Parts', value: `GHS ${totals.parts.toFixed(2)}` },
      { label: 'Total Contractor', value: `GHS ${totals.contractor.toFixed(2)}` },
      { label: 'Total Tools', value: `GHS ${totals.tools.toFixed(2)}` },
      { label: 'Grand Total', value: `GHS ${totals.total.toFixed(2)}` },
    ],
  });

  addDataSheet(wb, 'Cost Details', COST_COLUMNS, rows);
  addAnalyticsSheet(wb, 'Cost by Type', buildCostByType(workOrders));

  return {
    buffer: generateXlsxBuffer(wb),
    filename: buildFilename('cost-analysis-report'),
  };
}

const BACKLOG_COLUMNS: ReportColumn[] = [
  { key: 'woNumber', header: 'WO Number', width: 22 },
  { key: 'title', header: 'Title', width: 30 },
  { key: 'type', header: 'Type', width: 14 },
  { key: 'priority', header: 'Priority', width: 12 },
  { key: 'status', header: 'Status', width: 18 },
  { key: 'assetName', header: 'Asset', width: 25 },
  { key: 'assigneeName', header: 'Assigned To', width: 20 },
  { key: 'ageDays', header: 'Age (days)', format: 'number', width: 12 },
  { key: 'ageBucket', header: 'Age Bucket', width: 18 },
  { key: 'isOverdue', header: 'Overdue', width: 10 },
  { key: 'plannedStart', header: 'Planned Start', format: 'date', width: 16 },
  { key: 'plannedEnd', header: 'Planned End', format: 'date', width: 16 },
  { key: 'createdAt', header: 'Created', format: 'date', width: 14 },
];

export async function exportBacklogAgingReport(
  filters: ReportFilters,
  session: SessionData,
): Promise<ReportResult> {
  const where = buildBaseWhere(filters);
  (where as Record<string, unknown>).status = {
    notIn: ['completed', 'verified', 'closed', 'cancelled'],
  };

  const workOrders = await db.workOrder.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    include: {
      assignee: { select: { fullName: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: 5000,
  });

  const now = new Date();
  const rows = workOrders.map((wo) => {
    const ageMs = now.getTime() - wo.createdAt.getTime();
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    const isOverdue = wo.plannedEnd ? now > wo.plannedEnd : false;

    let ageBucket: string;
    if (ageDays <= 7) ageBucket = '0-7 days';
    else if (ageDays <= 14) ageBucket = '8-14 days';
    else if (ageDays <= 30) ageBucket = '15-30 days';
    else if (ageDays <= 60) ageBucket = '31-60 days';
    else if (ageDays <= 90) ageBucket = '61-90 days';
    else ageBucket = '90+ days';

    return {
      woNumber: wo.woNumber,
      title: wo.title,
      type: wo.type,
      priority: wo.priority,
      status: wo.status,
      assetName: wo.assetName || '',
      assigneeName: wo.assignee?.fullName || '',
      ageDays,
      ageBucket,
      isOverdue: isOverdue ? 'Yes' : 'No',
      plannedStart: wo.plannedStart?.toISOString()?.split('T')[0] ?? '',
      plannedEnd: wo.plannedEnd?.toISOString()?.split('T')[0] ?? '',
      createdAt: wo.createdAt.toISOString().split('T')[0],
    };
  });

  const overdueCount = rows.filter((r) => r.isOverdue === 'Yes').length;

  const wb = createStandardWorkbook({
    reportName: 'Backlog / Aging Report',
    description: 'Open work orders with age analysis and overdue tracking',
    plantId: filters.plantId,
    filters: flattenFilters(filters),
    generatedBy: session.fullName,
    kpis: [
      { label: 'Open WOs', value: workOrders.length },
      { label: 'Overdue', value: overdueCount },
      { label: 'Unassigned', value: workOrders.filter((w) => !w.assignedTo).length },
      { label: 'Critical Priority', value: workOrders.filter((w) => w.priority === 'critical').length },
    ],
  });

  addDataSheet(wb, 'Backlog', BACKLOG_COLUMNS, rows);
  addAnalyticsSheet(wb, 'Aging Buckets', buildAgingBuckets(rows));

  return {
    buffer: generateXlsxBuffer(wb),
    filename: buildFilename('backlog-aging-report'),
  };
}

const SLA_COLUMNS: ReportColumn[] = [
  { key: 'woNumber', header: 'WO Number', width: 22 },
  { key: 'title', header: 'Title', width: 30 },
  { key: 'type', header: 'Type', width: 14 },
  { key: 'priority', header: 'Priority', width: 12 },
  { key: 'status', header: 'Status', width: 18 },
  { key: 'assetName', header: 'Asset', width: 25 },
  { key: 'slaTargetHours', header: 'SLA Target (hrs)', format: 'number', width: 18 },
  { key: 'actualHours', header: 'Actual Hours', format: 'number', width: 14 },
  { key: 'slaMet', header: 'SLA Met', width: 10 },
  { key: 'varianceHours', header: 'Variance (hrs)', format: 'number', width: 16 },
  { key: 'plannedStart', header: 'Planned Start', format: 'date', width: 14 },
  { key: 'plannedEnd', header: 'Planned End', format: 'date', width: 14 },
  { key: 'actualStart', header: 'Actual Start', format: 'date', width: 14 },
  { key: 'actualEnd', header: 'Actual End', format: 'date', width: 14 },
  { key: 'createdAt', header: 'Created', format: 'date', width: 14 },
];

const SLA_TARGETS: Record<string, number> = {
  critical: 4,
  high: 24,
  medium: 72,
  low: 168,
};

export async function exportSLAReport(
  filters: ReportFilters,
  session: SessionData,
): Promise<ReportResult> {
  const where = buildBaseWhere(filters);
  (where as Record<string, unknown>).status = {
    in: ['completed', 'verified', 'closed'],
  };

  const workOrders = await db.workOrder.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    include: {
      repairCompletion: { select: { totalLaborHours: true } },
    },
    orderBy: { actualEnd: 'desc' },
    take: 5000,
  });

  const rows = workOrders.map((wo) => {
    const slaTarget = SLA_TARGETS[wo.priority] ?? 72;
    const actualHrs = wo.repairCompletion?.totalLaborHours ?? wo.actualHours ?? 0;

    let wallClockHours = 0;
    if (wo.createdAt && wo.actualEnd) {
      wallClockHours = (wo.actualEnd.getTime() - wo.createdAt.getTime()) / (1000 * 60 * 60);
    }
    const effectiveHours = wallClockHours > 0 ? wallClockHours : actualHrs;

    const slaMet = effectiveHours <= slaTarget ? 'Yes' : 'No';
    const variance = slaTarget - effectiveHours;

    return {
      woNumber: wo.woNumber,
      title: wo.title,
      type: wo.type,
      priority: wo.priority,
      status: wo.status,
      assetName: wo.assetName || '',
      slaTargetHours: slaTarget,
      actualHours: Number(actualHrs.toFixed(2)),
      slaMet,
      varianceHours: Number(variance.toFixed(2)),
      plannedStart: wo.plannedStart?.toISOString()?.split('T')[0] ?? '',
      plannedEnd: wo.plannedEnd?.toISOString()?.split('T')[0] ?? '',
      actualStart: wo.actualStart?.toISOString()?.split('T')[0] ?? '',
      actualEnd: wo.actualEnd?.toISOString()?.split('T')[0] ?? '',
      createdAt: wo.createdAt.toISOString().split('T')[0],
    };
  });

  const metCount = rows.filter((r) => r.slaMet === 'Yes').length;
  const complianceRate = rows.length > 0 ? ((metCount / rows.length) * 100).toFixed(1) : '0';

  const wb = createStandardWorkbook({
    reportName: 'SLA Compliance Report',
    description: 'Work order SLA compliance by priority level',
    plantId: filters.plantId,
    filters: flattenFilters(filters),
    generatedBy: session.fullName,
    kpis: [
      { label: 'Total Evaluated', value: rows.length },
      { label: 'SLA Met', value: metCount },
      { label: 'SLA Breached', value: rows.length - metCount },
      { label: 'Compliance Rate', value: `${complianceRate}%` },
    ],
  });

  addDataSheet(wb, 'SLA Details', SLA_COLUMNS, rows);
  addAnalyticsSheet(wb, 'Compliance by Priority', buildSlaByPriority(rows));

  return {
    buffer: generateXlsxBuffer(wb),
    filename: buildFilename('sla-compliance-report'),
  };
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
    const df: Record<string, unknown> = {};
    if (filters.dateFrom) df.gte = new Date(filters.dateFrom + 'T00:00:00');
    if (filters.dateTo) df.lte = new Date(filters.dateTo + 'T23:59:59');
    where.createdAt = df;
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
    const df: Record<string, unknown> = {};
    if (filters.dateFrom) df.gte = new Date(filters.dateFrom + 'T00:00:00');
    if (filters.dateTo) df.lte = new Date(filters.dateTo + 'T23:59:59');
    where.createdAt = df;
  }
  return where;
}

function buildLaborWhere(filters: ReportFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (filters.dateFrom || filters.dateTo) {
    const df: Record<string, unknown> = {};
    if (filters.dateFrom) df.gte = new Date(filters.dateFrom + 'T00:00:00');
    if (filters.dateTo) df.lte = new Date(filters.dateTo + 'T23:59:59');
    where.timestamp = df;
  }
  if (
    filters.plantId
    || filters.status
    || filters.type
    || filters.assigneeId
    || filters.departmentId
    || filters.assetId
    || filters.priority
    || filters.maintenanceScope
  ) {
    const woWhere: Record<string, unknown> = {};
    if (filters.plantId) woWhere.plantId = filters.plantId;
    if (filters.status) woWhere.status = filters.status;
    if (filters.priority) woWhere.priority = filters.priority;
    if (filters.departmentId) woWhere.departmentId = filters.departmentId;
    if (filters.assetId) woWhere.assetId = filters.assetId;
    if (filters.type) {
      woWhere.type = filters.type;
    } else if (filters.maintenanceScope === 'repairs') {
      woWhere.type = { in: ['corrective', 'emergency', 'predictive'] };
    } else if (filters.maintenanceScope === 'pm') {
      woWhere.type = 'preventive';
    }
    if (filters.assigneeId) woWhere.assignedTo = filters.assigneeId;
    where.workOrder = woWhere;
  }
  return where;
}

function buildDowntimeWhere(filters: ReportFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (filters.plantId) where.plantId = filters.plantId;

  const woWhere: Record<string, unknown> = {};
  if (filters.status) woWhere.status = filters.status;
  if (filters.priority) woWhere.priority = filters.priority;
  if (filters.departmentId) woWhere.departmentId = filters.departmentId;
  if (filters.assetId) woWhere.assetId = filters.assetId;
  if (filters.assigneeId) woWhere.assignedTo = filters.assigneeId;
  if (filters.type) {
    woWhere.type = filters.type;
  } else if (filters.maintenanceScope === 'repairs') {
    woWhere.type = { in: ['corrective', 'emergency', 'predictive'] };
  } else if (filters.maintenanceScope === 'pm') {
    woWhere.type = 'preventive';
  }
  if (Object.keys(woWhere).length > 0) where.workOrder = woWhere;

  if (filters.dateFrom || filters.dateTo) {
    const df: Record<string, unknown> = {};
    if (filters.dateFrom) df.gte = new Date(filters.dateFrom + 'T00:00:00');
    if (filters.dateTo) df.lte = new Date(filters.dateTo + 'T23:59:59');
    where.downtimeStart = df;
  }
  return where;
}

function buildResourceWorkOrderWhere(filters: ReportFilters): Record<string, unknown> {
  const woWhere: Record<string, unknown> = {};
  if (filters.plantId) woWhere.plantId = filters.plantId;
  if (filters.priority) woWhere.priority = filters.priority;
  if (filters.departmentId) woWhere.departmentId = filters.departmentId;
  if (filters.assetId) woWhere.assetId = filters.assetId;
  if (filters.assigneeId) woWhere.assignedTo = filters.assigneeId;
  if (filters.type) {
    woWhere.type = filters.type;
  } else if (filters.maintenanceScope === 'repairs') {
    woWhere.type = { in: ['corrective', 'emergency', 'predictive'] };
  } else if (filters.maintenanceScope === 'pm') {
    woWhere.type = 'preventive';
  }
  return woWhere;
}

function buildMaterialWhere(filters: ReportFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (filters.plantId) where.plantId = filters.plantId;
  if (filters.status) where.status = filters.status;

  const woWhere = buildResourceWorkOrderWhere(filters);
  if (Object.keys(woWhere).length > 0) where.workOrder = woWhere;

  if (filters.dateFrom || filters.dateTo) {
    const df: Record<string, unknown> = {};
    if (filters.dateFrom) df.gte = new Date(filters.dateFrom + 'T00:00:00');
    if (filters.dateTo) df.lte = new Date(filters.dateTo + 'T23:59:59');
    where.createdAt = df;
  }
  return where;
}

function buildToolWhere(filters: ReportFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (filters.plantId) where.plantId = filters.plantId;
  if (filters.status) where.status = filters.status;

  const woWhere = buildResourceWorkOrderWhere(filters);
  if (Object.keys(woWhere).length > 0) where.workOrder = woWhere;

  if (filters.dateFrom || filters.dateTo) {
    const df: Record<string, unknown> = {};
    if (filters.dateFrom) df.gte = new Date(filters.dateFrom + 'T00:00:00');
    if (filters.dateTo) df.lte = new Date(filters.dateTo + 'T23:59:59');
    where.createdAt = df;
  }
  return where;
}

function buildFailureWhere(filters: ReportFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (filters.assetId) where.assetId = filters.assetId;

  if (filters.dateFrom || filters.dateTo) {
    const df: Record<string, unknown> = {};
    if (filters.dateFrom) df.gte = new Date(filters.dateFrom + 'T00:00:00');
    if (filters.dateTo) df.lte = new Date(filters.dateTo + 'T23:59:59');
    where.detectedAt = df;
  }

  if (filters.plantId) {
    where.asset = { plantId: filters.plantId };
  }

  const woWhere = buildResourceWorkOrderWhere(filters);
  if (Object.keys(woWhere).length > 0) {
    where.workOrder = woWhere;
  }

  return where;
}

function buildStatusBreakdown(
  items: Array<{
    status?: string | null;
    workflowStatus?: string | null;
    activityType?: string | null;
    category?: string | null;
  }>,
  field: string,
): AnalyticsRow[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const val = (item as Record<string, string | null | undefined>)[field] || 'Unknown';
    counts.set(val, (counts.get(val) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({ [field]: value, Count: count, Percentage: `${((count / items.length) * 100).toFixed(1)}%` }));
}

function buildFailureModePareto(
  failures: Array<{ failureMode: string; downtimeMinutes: number }>,
): AnalyticsRow[] {
  const counts = new Map<string, { count: number; downtime: number }>();
  for (const f of failures) {
    const existing = counts.get(f.failureMode) ?? { count: 0, downtime: 0 };
    existing.count++;
    existing.downtime += f.downtimeMinutes ?? 0;
    counts.set(f.failureMode, existing);
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
  const total = sorted.reduce((s, [, v]) => s + v.count, 0);

  let cumulative = 0;
  return sorted.map(([mode, data]) => {
    cumulative += data.count;
    return {
      'Failure Mode': mode,
      Count: data.count,
      'Downtime (min)': data.downtime,
      Percentage: `${((data.count / total) * 100).toFixed(1)}%`,
      'Cumulative %': `${((cumulative / total) * 100).toFixed(1)}%`,
    };
  });
}

function buildCostByType(
  wos: Array<{ type: string; totalCost: number; laborCost: number; partsCost: number; contractorCost: number }>,
): AnalyticsRow[] {
  const agg = new Map<string, { total: number; labor: number; parts: number; contractor: number }>();
  for (const wo of wos) {
    const existing = agg.get(wo.type) ?? { total: 0, labor: 0, parts: 0, contractor: 0 };
    existing.total += wo.totalCost ?? 0;
    existing.labor += wo.laborCost ?? 0;
    existing.parts += wo.partsCost ?? 0;
    existing.contractor += wo.contractorCost ?? 0;
    agg.set(wo.type, existing);
  }
  return [...agg.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([type, data]) => ({
      Type: type,
      'Total Cost': data.total,
      'Labor Cost': data.labor,
      'Parts Cost': data.parts,
      'Contractor Cost': data.contractor,
    }));
}

function buildAgingBuckets(rows: Array<{ ageBucket: string }>): AnalyticsRow[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    counts.set(r.ageBucket, (counts.get(r.ageBucket) ?? 0) + 1);
  }
  const order = ['0-7 days', '8-14 days', '15-30 days', '31-60 days', '61-90 days', '90+ days'];
  return order
    .filter((b) => counts.has(b))
    .map((b) => ({ 'Age Bucket': b, Count: counts.get(b)! }));
}

function buildSlaByPriority(rows: Array<{ priority: string; slaMet: string }>): AnalyticsRow[] {
  const data = new Map<string, { total: number; met: number }>();
  for (const r of rows) {
    const existing = data.get(r.priority) ?? { total: 0, met: 0 };
    existing.total++;
    if (r.slaMet === 'Yes') existing.met++;
    data.set(r.priority, existing);
  }
  return [...data.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([priority, d]) => ({
      Priority: priority,
      Total: d.total,
      'SLA Met': d.met,
      'SLA Breached': d.total - d.met,
      'Compliance Rate': `${((d.met / d.total) * 100).toFixed(1)}%`,
    }));
}

function flattenFilters(filters: ReportFilters): Record<string, string | undefined> {
  return { ...filters };
}

export const SUPPORTED_REPORT_TYPES = [
  'work-order',
  'maintenance-request',
  'labor',
  'downtime',
  'material',
  'tool',
  'failure-analysis',
  'cost',
  'backlog-aging',
  'sla',
  'operations-summary',
  'asset-history',
  'department-cost',
  'material-reconciliation',
  'tool-custody',
  'assistance',
  'shift-handover',
  'closure-audit',
] as const;

export type ReportType = (typeof SUPPORTED_REPORT_TYPES)[number];

export async function generateReport(
  reportType: ReportType,
  filters: ReportFilters,
  session: SessionData,
): Promise<ReportResult> {
  switch (reportType) {
    case 'work-order':
      return exportWorkOrderReport(filters, session);
    case 'maintenance-request':
      return exportMaintenanceRequestReport(filters, session);
    case 'labor':
      return exportLaborReport(filters, session);
    case 'downtime':
      return exportDowntimeReport(filters, session);
    case 'material':
      return exportMaterialReport(filters, session);
    case 'tool':
      return exportToolReport(filters, session);
    case 'failure-analysis':
      return exportFailureAnalysisReport(filters, session);
    case 'cost':
      return exportCostReport(filters, session);
    case 'backlog-aging':
      return exportBacklogAgingReport(filters, session);
    case 'sla':
      return exportSLAReport(filters, session);
    default:
      logger.error('Unsupported repairs report type', { reportType });
      throw new Error(`Unsupported report type: ${reportType}`);
  }
}
