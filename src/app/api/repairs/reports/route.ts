import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasPermission } from '@/lib/auth';
import { getPlantScope, canAccessPlant } from '@/lib/plant-scope';
import { generateReportPDF, type ReportPDFParams } from '@/lib/generate-report-pdf';

type ReportType = 'lifecycle' | 'execution' | 'materials' | 'tools' | 'downtime' | 'technician_performance';

// GET /api/repairs/reports?type=lifecycle&plantId=&from=&to=&priority=&department=
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const canViewReports = isAdmin(session) || hasPermission(session, 'reports.view');
    if (!canViewReports) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions to view reports' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as ReportType | null;

    if (!type || !['lifecycle', 'execution', 'materials', 'tools', 'downtime', 'technician_performance'].includes(type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid report type. Must be one of: lifecycle, execution, materials, tools, downtime, technician_performance' },
        { status: 400 },
      );
    }

    // Reports must never widen a user's plant scope. An explicit active plant
    // wins over query-string selection. Ordinary users with multiple accessible
    // plants must choose one, because these aggregate handlers currently accept
    // a single plantId rather than an IN-list.
    const requestedPlantId = searchParams.get('plantId') || undefined;
    let plantId: string | undefined;
    if (plantScope.isScoped && plantScope.plantId) {
      if (requestedPlantId && requestedPlantId !== plantScope.plantId) {
        return NextResponse.json({ success: false, error: 'Forbidden: requested plant is outside the active plant scope' }, { status: 403 });
      }
      plantId = plantScope.plantId;
    } else if (plantScope.isSystemWide) {
      plantId = requestedPlantId;
    } else if (requestedPlantId) {
      if (!canAccessPlant(plantScope, requestedPlantId)) {
        return NextResponse.json({ success: false, error: 'Forbidden: no access to requested plant' }, { status: 403 });
      }
      plantId = requestedPlantId;
    } else if (plantScope.accessiblePlantIds.length === 1) {
      plantId = plantScope.accessiblePlantIds[0];
    } else {
      return NextResponse.json(
        { success: false, error: 'Select one of your accessible plants before generating this report' },
        { status: 400 },
      );
    }

    const from = searchParams.get('from') ? new Date(searchParams.get('from')!) : undefined;
    const to = searchParams.get('to') ? new Date(searchParams.get('to')!) : undefined;
    const priority = searchParams.get('priority') || undefined;
    const department = searchParams.get('department') || undefined;
    const assignee = searchParams.get('assignee') || undefined;
    const format = searchParams.get('format');
    if (format === 'pdf' && !hasPermission(session, 'reports.export') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions: reports.export required' }, { status: 403 });
    }

    const dateFilter: Record<string, unknown> = {};
    if (from) dateFilter.gte = from;
    if (to) dateFilter.lte = to;

    let result: NextResponse;
    switch (type) {
      case 'lifecycle': result = await handleLifecycleReport(plantId, from, to, priority, department, dateFilter); break;
      case 'execution': result = await handleExecutionReport(plantId, from, to, priority, assignee, dateFilter); break;
      case 'technician_performance': result = await handleTechnicianPerformanceReport(plantId, from, to, department, dateFilter); break;
      case 'materials': result = await handleMaterialsReport(plantId, from, to, dateFilter); break;
      case 'downtime': result = await handleDowntimeReport(plantId, from, to, dateFilter); break;
      case 'tools': result = await handleToolsReport(plantId, from, to, dateFilter); break;
      default:
        return NextResponse.json({ success: false, error: 'Unknown report type' }, { status: 400 });
    }

    // ========== PDF FORMAT ==========
    if (format === 'pdf') {
      const jsonBody = await result.json();
      if (jsonBody.success && jsonBody.data) {
        const pdfBuffer = await generateReportPDF(buildRepairPdfParams(type, jsonBody.data, session.fullName || session.userId, from, to, plantId, priority, department));
        const filename = `repair-${type}-report.pdf`;
        return new NextResponse(new Uint8Array(pdfBuffer), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
          },
        });
      }
    }

    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate report';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// ── LIFECYCLE REPORT ──────────────────────────────────────────────────────────
// Full lifecycle from MR → WO closure including time at each stage
async function handleLifecycleReport(
  plantId: string | undefined,
  from: Date | undefined,
  to: Date | undefined,
  priority: string | undefined,
  _department: string | undefined,
  dateFilter: Record<string, unknown>,
) {
  const mrWhere: Record<string, unknown> = { plantId: plantId || undefined };
  if (priority) mrWhere.priority = priority;
  if (Object.keys(dateFilter).length > 0) mrWhere.createdAt = dateFilter;

  const mrs = await db.maintenanceRequest.findMany({
    where: mrWhere,
    include: {
      workOrder: {
        include: {
          statusHistory: { orderBy: { createdAt: 'asc' } },
        },
      },
      requester: { select: { id: true, fullName: true } },
      supervisor: { select: { id: true, fullName: true } },
      approver: { select: { id: true, fullName: true } },
      assignedPlanner: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const lifecycleEntries = mrs.map((mr) => {
    const stages: Record<string, { timestamp: Date | null; durationHours: number | null }> = {};
    let previousTimestamp: Date | null = mr.createdAt;

    stages.mr_created = { timestamp: mr.createdAt, durationHours: null };

    if (mr.workflowStatus === 'supervisor_review' || mr.supervisorId) {
      const nextStage: Date | null = mr.updatedAt;
      stages.mr_supervisor_review = { timestamp: nextStage, durationHours: previousTimestamp && nextStage ? (nextStage.getTime() - previousTimestamp.getTime()) / (1000 * 3600) : null };
      previousTimestamp = nextStage;
    }

    if (mr.status === 'approved' || mr.status === 'converted') {
      const approvalTime = mr.updatedAt;
      stages.mr_approved = { timestamp: approvalTime, durationHours: previousTimestamp && approvalTime ? (approvalTime.getTime() - previousTimestamp.getTime()) / (1000 * 3600) : null };
      previousTimestamp = approvalTime;
    }

    if (mr.assignedPlannerId) {
      stages.mr_planner_assigned = { timestamp: mr.updatedAt, durationHours: previousTimestamp ? (mr.updatedAt.getTime() - previousTimestamp.getTime()) / (1000 * 3600) : null };
      previousTimestamp = mr.updatedAt;
    }

    const wo = mr.workOrder;
    if (wo) {
      stages.wo_created = { timestamp: wo.createdAt, durationHours: previousTimestamp ? (wo.createdAt.getTime() - previousTimestamp.getTime()) / (1000 * 3600) : null };
      previousTimestamp = wo.createdAt;

      for (const sh of wo.statusHistory) {
        const duration = previousTimestamp ? (sh.createdAt.getTime() - previousTimestamp.getTime()) / (1000 * 3600) : null;
        stages[`wo_${sh.toStatus}`] = { timestamp: sh.createdAt, durationHours: duration };
        previousTimestamp = sh.createdAt;
      }
    }

    const totalTurnaround = mr.createdAt && wo?.actualEnd
      ? (wo.actualEnd.getTime() - mr.createdAt.getTime()) / (1000 * 3600)
      : null;

    return {
      mrId: mr.id,
      mrNumber: mr.requestNumber,
      mrTitle: mr.title,
      priority: mr.priority,
      status: mr.status,
      workflowStatus: mr.workflowStatus,
      hasWorkOrder: !!wo,
      woNumber: wo?.woNumber || null,
      woStatus: wo?.status || null,
      stages,
      totalTurnaroundHours: totalTurnaround,
      requester: mr.requester,
      supervisor: mr.supervisor,
      approver: mr.approver,
      planner: mr.assignedPlanner,
    };
  });

  const completedWithWo = lifecycleEntries.filter((e) => e.woStatus === 'closed' && e.totalTurnaroundHours !== null);
  const avgTurnaround = completedWithWo.length > 0
    ? completedWithWo.reduce((sum, e) => sum + (e.totalTurnaroundHours || 0), 0) / completedWithWo.length
    : null;

  const stageDurations: Record<string, number[]> = {};
  for (const entry of lifecycleEntries) {
    for (const [stageName, stageData] of Object.entries(entry.stages)) {
      if (stageData.durationHours !== null) {
        if (!stageDurations[stageName]) stageDurations[stageName] = [];
        stageDurations[stageName].push(stageData.durationHours);
      }
    }
  }
  const avgStageDurations: Record<string, number> = {};
  for (const [stageName, durations] of Object.entries(stageDurations)) {
    avgStageDurations[stageName] = durations.length > 0 ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0;
  }

  return NextResponse.json({
    success: true,
    data: {
      totalRequests: mrs.length,
      convertedToWo: mrs.filter((m) => m.workOrder).length,
      closed: completedWithWo.length,
      avgTurnaroundHours: Math.round((avgTurnaround || 0) * 100) / 100,
      avgStageDurations,
      entries: lifecycleEntries,
    },
  });
}

// ── EXECUTION REPORT ─────────────────────────────────────────────────────────
// WO completion rates, actual vs estimated, rework, team performance
async function handleExecutionReport(
  plantId: string | undefined,
  from: Date | undefined,
  to: Date | undefined,
  priority: string | undefined,
  assignee: string | undefined,
  dateFilter: Record<string, unknown>,
) {
  const woWhere: Record<string, unknown> = { plantId: plantId || undefined };
  if (priority) woWhere.priority = priority;
  if (assignee) woWhere.assignedTo = assignee;
  if (Object.keys(dateFilter).length > 0) woWhere.createdAt = dateFilter;

  const workOrders = await db.workOrder.findMany({
    where: woWhere,
    include: {
      assignee: { select: { id: true, fullName: true, department: true } },
      teamLeader: { select: { id: true, fullName: true } },
      repairCompletion: true,
      timeLogs: true,
      statusHistory: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const total = workOrders.length;
  const closed = workOrders.filter((wo) => wo.status === 'closed');
  const completed = workOrders.filter((wo) => ['completed', 'verified', 'closed'].includes(wo.status));
  const laborHours = (wo: (typeof workOrders)[number]) => wo.repairCompletion?.totalLaborHours ?? wo.actualHours ?? 0;

  const byType: Record<string, { total: number; closed: number; rate: number; totalHours: number }> = {};
  for (const wo of workOrders) {
    if (!byType[wo.type]) byType[wo.type] = { total: 0, closed: 0, rate: 0, totalHours: 0 };
    byType[wo.type].total++;
    byType[wo.type].totalHours += laborHours(wo);
    if (wo.status === 'closed') byType[wo.type].closed++;
  }
  for (const typeKey of Object.keys(byType)) {
    byType[typeKey].rate = byType[typeKey].total > 0 ? byType[typeKey].closed / byType[typeKey].total : 0;
  }

  const byPriority: Record<string, { total: number; closed: number; rate: number }> = {};
  for (const wo of workOrders) {
    if (!byPriority[wo.priority]) byPriority[wo.priority] = { total: 0, closed: 0, rate: 0 };
    byPriority[wo.priority].total++;
    if (wo.status === 'closed') byPriority[wo.priority].closed++;
  }
  for (const priorityKey of Object.keys(byPriority)) {
    byPriority[priorityKey].rate = byPriority[priorityKey].total > 0 ? byPriority[priorityKey].closed / byPriority[priorityKey].total : 0;
  }

  const avgActual = completed.length > 0
    ? completed.reduce((sum, wo) => sum + laborHours(wo), 0) / completed.length
    : 0;
  const comparable = completed.filter((wo) => (wo.estimatedHours ?? 0) > 0);
  const avgEstimated = comparable.length > 0
    ? comparable.reduce((sum, wo) => sum + (wo.estimatedHours ?? 0), 0) / comparable.length
    : 0;
  const avgComparableActual = comparable.length > 0
    ? comparable.reduce((sum, wo) => sum + laborHours(wo), 0) / comparable.length
    : 0;
  const avgVariance = comparable.length > 0 ? avgComparableActual - avgEstimated : 0;

  const reworkCount = workOrders.filter((wo) => (wo.repairCompletion?.reworkCount ?? 0) > 0).length;
  const reworkRate = total > 0 ? reworkCount / total : 0;
  const totalReworkInstances = workOrders.reduce((sum, wo) => sum + (wo.repairCompletion?.reworkCount || 0), 0);

  const teamMetrics: Record<string, { fullName: string; total: number; closed: number; avgActualHours: number; rework: number }> = {};
  for (const wo of workOrders) {
    const key = wo.assignedTo || 'unassigned';
    const techName = wo.assignee?.fullName || 'Unassigned';
    if (!teamMetrics[key]) {
      teamMetrics[key] = { fullName: techName, total: 0, closed: 0, avgActualHours: 0, rework: 0 };
    }
    teamMetrics[key].total++;
    if (wo.status === 'closed') teamMetrics[key].closed++;
    teamMetrics[key].rework += wo.repairCompletion?.reworkCount || 0;
  }
  for (const [technicianId, metric] of Object.entries(teamMetrics)) {
    const techClosed = workOrders.filter((wo) => (wo.assignedTo || 'unassigned') === technicianId && wo.status === 'closed');
    metric.avgActualHours = techClosed.length > 0
      ? techClosed.reduce((sum, wo) => sum + laborHours(wo), 0) / techClosed.length
      : 0;
  }

  const byTypeArray = Object.entries(byType).map(([typeName, data]) => ({
    type: typeName,
    count: data.total,
    closed: data.closed,
    rate: Math.round(data.rate * 10000) / 100,
    avgHours: data.total > 0 ? Math.round((data.totalHours / data.total) * 100) / 100 : 0,
  }));

  const byPriorityArray = Object.entries(byPriority).map(([priorityName, data]) => ({
    priority: priorityName,
    total: data.total,
    closed: data.closed,
    rate: Math.round(data.rate * 10000) / 100,
  }));

  return NextResponse.json({
    success: true,
    data: {
      totalWOs: total,
      completionRate: Math.round((total > 0 ? completed.length / total : 0) * 10000) / 100,
      avgActualHours: Math.round(avgActual * 100) / 100,
      reworkRate: Math.round(reworkRate * 10000) / 100,
      byType: byTypeArray,
      byPriority: byPriorityArray,
      summary: {
        total,
        completed: completed.length,
        closed: closed.length,
        completionRate: total > 0 ? completed.length / total : 0,
        closureRate: total > 0 ? closed.length / total : 0,
      },
      byPriorityObj: byPriority,
      labor: {
        avgEstimatedHours: Math.round(avgEstimated * 100) / 100,
        avgActualHours: Math.round(avgActual * 100) / 100,
        avgComparableActualHours: Math.round(avgComparableActual * 100) / 100,
        avgVarianceHours: Math.round(avgVariance * 100) / 100,
        variancePercent: avgEstimated > 0 ? Math.round((avgVariance / avgEstimated) * 10000) / 100 : 0,
      },
      rework: {
        reworkWos: reworkCount,
        reworkRate: Math.round(reworkRate * 10000) / 100,
        totalReworkInstances,
      },
      teamMetrics: Object.values(teamMetrics)
        .map((metric) => ({ ...metric, avgActualHours: Math.round(metric.avgActualHours * 100) / 100 }))
        .sort((a, b) => b.closed - a.closed),
    },
  });
}

// ── TECHNICIAN PERFORMANCE REPORT ────────────────────────────────────────────
async function handleTechnicianPerformanceReport(
  plantId: string | undefined,
  from: Date | undefined,
  to: Date | undefined,
  department: string | undefined,
  dateFilter: Record<string, unknown>,
) {
  const woWhere: Record<string, unknown> = { plantId: plantId || undefined };
  if (department) woWhere.departmentId = department;
  if (Object.keys(dateFilter).length > 0) woWhere.createdAt = dateFilter;

  const workOrders = await db.workOrder.findMany({
    where: woWhere,
    include: {
      assignee: { select: { id: true, fullName: true, username: true, department: true, primaryTrade: true } },
      repairCompletion: true,
      timeLogs: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const techMap: Record<string, {
    user: { id: string; fullName: string; username: string; department: string | null; primaryTrade: string | null };
    woCount: number;
    closedCount: number;
    totalTimeLogged: number;
    totalEstimated: number;
    reworkCount: number;
    avgTimePerWo: number;
    timeAccuracy: number;
  }> = {};

  for (const wo of workOrders) {
    const uid = wo.assignedTo;
    if (!uid || !wo.assignee) continue;

    if (!techMap[uid]) {
      techMap[uid] = {
        user: wo.assignee,
        woCount: 0,
        closedCount: 0,
        totalTimeLogged: 0,
        totalEstimated: 0,
        reworkCount: 0,
        avgTimePerWo: 0,
        timeAccuracy: 0,
      };
    }

    techMap[uid].woCount++;
    if (wo.status === 'closed') techMap[uid].closedCount++;
    techMap[uid].totalTimeLogged += wo.repairCompletion?.totalLaborHours ?? wo.actualHours ?? 0;
    techMap[uid].totalEstimated += wo.estimatedHours || 0;
    techMap[uid].reworkCount += wo.repairCompletion?.reworkCount || 0;
  }

  const technicians = Object.values(techMap).map((tech) => {
    const avgTimePerWo = tech.woCount > 0 ? tech.totalTimeLogged / tech.woCount : 0;
    const timeAccuracy = tech.totalEstimated > 0
      ? 100 - Math.abs(tech.totalTimeLogged - tech.totalEstimated) / tech.totalEstimated * 100
      : 0;

    return {
      ...tech,
      avgTimePerWo: Math.round(avgTimePerWo * 100) / 100,
      timeAccuracy: Math.max(0, Math.round(timeAccuracy * 100) / 100),
      reworkRate: tech.woCount > 0 ? Math.round((tech.reworkCount / tech.woCount) * 10000) / 100 : 0,
      completionRate: tech.woCount > 0 ? Math.round((tech.closedCount / tech.woCount) * 10000) / 100 : 0,
    };
  }).sort((a, b) => b.closedCount - a.closedCount);

  return NextResponse.json({
    success: true,
    data: {
      totalTechnicians: technicians.length,
      totalWorkOrders: workOrders.length,
      technicians,
    },
  });
}

// ── MATERIALS REPORT ─────────────────────────────────────────────────────────
async function handleMaterialsReport(
  plantId: string | undefined,
  from: Date | undefined,
  to: Date | undefined,
  dateFilter: Record<string, unknown>,
) {
  const woWhere: Record<string, unknown> = { plantId: plantId || undefined };
  if (Object.keys(dateFilter).length > 0) woWhere.createdAt = dateFilter;

  const workOrders = await db.workOrder.findMany({
    where: woWhere,
    include: {
      repairMaterialRequests: true,
      repairCompletion: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const materialCostByWo = workOrders.map((wo) => {
    const materialCost = wo.repairMaterialRequests.reduce((sum, material) => {
      const unitCost = material.unitCost ?? 0;
      const consumed = material.consumedQty ?? 0;
      const wasted = material.wastedQty ?? 0;
      const authoritativeUsedCost = (consumed + wasted) * unitCost;
      const issuedFallbackCost = (material.quantityIssued ?? 0) * unitCost;
      return sum + (authoritativeUsedCost > 0 ? authoritativeUsedCost : (material.estimatedCost ?? issuedFallbackCost));
    }, 0);
    const totalIssued = wo.repairMaterialRequests.filter((material) => (material.quantityIssued ?? 0) > 0).length;
    const totalReturned = wo.repairMaterialRequests.filter((material) => (material.quantityReturned ?? 0) > 0 || material.status === 'returned').length;

    return {
      workOrderId: wo.id,
      woNumber: wo.woNumber,
      title: wo.title,
      materialCount: wo.repairMaterialRequests.length,
      issuedCount: totalIssued,
      returnedCount: totalReturned,
      totalMaterialCost: Math.round(materialCost * 100) / 100,
      completionCost: wo.repairCompletion?.totalMaterialCost ?? materialCost,
    };
  }).filter((entry) => entry.materialCount > 0);

  const totalMaterialCost = materialCostByWo.reduce((sum, entry) => sum + entry.totalMaterialCost, 0);

  const sprWhere: Record<string, unknown> = { plantId: plantId || undefined };
  if (Object.keys(dateFilter).length > 0) sprWhere.createdAt = dateFilter;

  const sparePartReturns = await db.sparePartReturn.findMany({ where: sprWhere });
  const totalReturns = sparePartReturns.length;
  const returnedToStore = sparePartReturns.filter((returnRecord) => returnRecord.status === 'returned_to_store').length;
  const disposed = sparePartReturns.filter((returnRecord) => returnRecord.status === 'disposed').length;
  const totalRefurbCost = sparePartReturns.reduce((sum, returnRecord) => sum + (returnRecord.actualRefurbCost || 0), 0);
  const returnRate = totalReturns > 0 ? Math.round((returnedToStore / totalReturns) * 10000) / 100 : 0;

  const itemIds = [...new Set(workOrders.flatMap((wo) => wo.repairMaterialRequests.map((material) => material.itemId).filter(Boolean) as string[]))];
  const topItems = itemIds.length > 0 ? await db.inventoryItem.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, itemCode: true, name: true, category: true, unitCost: true },
    take: 20,
  }) : [];

  return NextResponse.json({
    success: true,
    data: {
      summary: {
        totalMaterialCost: Math.round(totalMaterialCost * 100) / 100,
        workOrdersWithMaterials: materialCostByWo.length,
        avgCostPerWo: materialCostByWo.length > 0 ? Math.round(totalMaterialCost / materialCostByWo.length * 100) / 100 : 0,
      },
      costByWorkOrder: materialCostByWo.sort((a, b) => b.totalMaterialCost - a.totalMaterialCost).slice(0, 20),
      sparePartReturns: {
        total: totalReturns,
        returnedToStore,
        disposed,
        returnRate,
        totalRefurbCost: Math.round(totalRefurbCost * 100) / 100,
      },
      topItems,
    },
  });
}

// ── DOWNTIME REPORT ──────────────────────────────────────────────────────────
async function handleDowntimeReport(
  plantId: string | undefined,
  from: Date | undefined,
  to: Date | undefined,
  dateFilter: Record<string, unknown>,
) {
  const dtWhere: Record<string, unknown> = { plantId: plantId || undefined };
  if (Object.keys(dateFilter).length > 0) dtWhere.createdAt = dateFilter;

  const downtimes = await db.workOrderDowntime.findMany({
    where: dtWhere,
    include: {
      workOrder: { select: { id: true, woNumber: true, title: true, status: true } },
      createdBy: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const total = downtimes.length;
  const totalDowntimeMinutes = downtimes.reduce((sum, downtime) => sum + (downtime.durationMinutes || 0), 0);
  const totalDowntimeHours = Math.round((totalDowntimeMinutes / 60) * 100) / 100;
  const avgDurationHours = total > 0 ? Math.round((totalDowntimeMinutes / 60 / total) * 100) / 100 : 0;
  const totalProductionLoss = downtimes.reduce((sum, downtime) => sum + (downtime.productionLoss || 0), 0);

  const byAsset: Record<string, { assetName: string; count: number; totalHours: number; totalLoss: number }> = {};
  for (const downtime of downtimes) {
    const key = downtime.assetId || 'unknown';
    if (!byAsset[key]) byAsset[key] = { assetName: downtime.assetName, count: 0, totalHours: 0, totalLoss: 0 };
    byAsset[key].count++;
    byAsset[key].totalHours += (downtime.durationMinutes || 0) / 60;
    byAsset[key].totalLoss += downtime.productionLoss || 0;
  }

  const byCategory: Record<string, { count: number; totalHours: number }> = {};
  for (const downtime of downtimes) {
    if (!byCategory[downtime.category]) byCategory[downtime.category] = { count: 0, totalHours: 0 };
    byCategory[downtime.category].count++;
    byCategory[downtime.category].totalHours += (downtime.durationMinutes || 0) / 60;
  }

  const byImpactLevel: Record<string, { count: number; totalHours: number }> = {};
  for (const downtime of downtimes) {
    if (!byImpactLevel[downtime.impactLevel]) byImpactLevel[downtime.impactLevel] = { count: 0, totalHours: 0 };
    byImpactLevel[downtime.impactLevel].count++;
    byImpactLevel[downtime.impactLevel].totalHours += (downtime.durationMinutes || 0) / 60;
  }

  const topAssetsByDowntime = Object.entries(byAsset)
    .map(([assetId, data]) => ({ assetId, ...data, totalHours: Math.round(data.totalHours * 100) / 100 }))
    .sort((a, b) => b.totalHours - a.totalHours)
    .slice(0, 10);

  return NextResponse.json({
    success: true,
    data: {
      summary: {
        totalEvents: total,
        totalDowntimeHours,
        avgDurationHours,
        totalProductionLoss: Math.round(totalProductionLoss * 100) / 100,
        avgLossPerHour: totalDowntimeHours > 0 ? Math.round((totalProductionLoss / totalDowntimeHours) * 100) / 100 : 0,
      },
      byAsset: topAssetsByDowntime,
      byCategory: Object.fromEntries(Object.entries(byCategory).map(([key, value]) => [key, { ...value, totalHours: Math.round(value.totalHours * 100) / 100 }])),
      byImpactLevel: Object.fromEntries(Object.entries(byImpactLevel).map(([key, value]) => [key, { ...value, totalHours: Math.round(value.totalHours * 100) / 100 }])),
    },
  });
}

// ── TOOLS REPORT ─────────────────────────────────────────────────────────────
async function handleToolsReport(
  plantId: string | undefined,
  from: Date | undefined,
  to: Date | undefined,
  dateFilter: Record<string, unknown>,
) {
  const dtrWhere: Record<string, unknown> = { plantId: plantId || undefined };
  if (Object.keys(dateFilter).length > 0) dtrWhere.createdAt = dateFilter;

  const damagedReports = await db.damagedToolReport.findMany({
    where: dtrWhere,
    include: {
      tool: { select: { id: true, toolCode: true, name: true, category: true, purchaseCost: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const totalDamageReports = damagedReports.length;
  const totalRepairCost = damagedReports.reduce((sum, report) => sum + (report.actualRepairCost || 0), 0);
  const writtenOff = damagedReports.filter((report) => report.status === 'written_off').length;
  const repaired = damagedReports.filter((report) => report.status === 'repaired').length;
  const inProgress = damagedReports.filter((report) => report.status === 'repair_in_progress').length;

  const byDamageType: Record<string, { count: number; cost: number }> = {};
  for (const report of damagedReports) {
    if (!byDamageType[report.damageType]) byDamageType[report.damageType] = { count: 0, cost: 0 };
    byDamageType[report.damageType].count++;
    byDamageType[report.damageType].cost += report.actualRepairCost || 0;
  }

  const bySeverity: Record<string, { count: number; cost: number }> = {};
  for (const report of damagedReports) {
    if (!bySeverity[report.damageSeverity]) bySeverity[report.damageSeverity] = { count: 0, cost: 0 };
    bySeverity[report.damageSeverity].count++;
    bySeverity[report.damageSeverity].cost += report.actualRepairCost || 0;
  }

  const byCategory: Record<string, { count: number; cost: number }> = {};
  for (const report of damagedReports) {
    const category = report.tool?.category || 'Unknown';
    if (!byCategory[category]) byCategory[category] = { count: 0, cost: 0 };
    byCategory[category].count++;
    byCategory[category].cost += report.actualRepairCost || 0;
  }

  const txWhere: Record<string, unknown> = {};
  if (from || to) txWhere.createdAt = dateFilter;

  const transfers = await db.toolTransferRequest.findMany({
    where: { ...txWhere, plantId: plantId || undefined },
    orderBy: { createdAt: 'desc' },
  });

  const totalTransfers = transfers.length;
  const completedTransfers = transfers.filter((transfer) => transfer.status === 'transferred').length;

  const damagedToolsMap: Record<string, { toolName: string; toolCode: string; category: string; damageCount: number; totalCost: number }> = {};
  for (const report of damagedReports) {
    if (!report.tool) continue;
    const key = report.toolId;
    if (!damagedToolsMap[key]) {
      damagedToolsMap[key] = { toolName: report.tool.name, toolCode: report.tool.toolCode, category: report.tool.category, damageCount: 0, totalCost: 0 };
    }
    damagedToolsMap[key].damageCount++;
    damagedToolsMap[key].totalCost += report.actualRepairCost || 0;
  }

  const mostDamagedTools = Object.values(damagedToolsMap)
    .sort((a, b) => b.damageCount - a.damageCount)
    .slice(0, 10);

  return NextResponse.json({
    success: true,
    data: {
      summary: {
        totalDamageReports,
        totalRepairCost: Math.round(totalRepairCost * 100) / 100,
        repaired,
        writtenOff,
        inProgress,
        avgRepairCost: totalDamageReports > 0 ? Math.round((totalRepairCost / totalDamageReports) * 100) / 100 : 0,
        totalTransfers,
        completedTransfers,
      },
      byDamageType: Object.fromEntries(Object.entries(byDamageType).map(([key, value]) => [key, { ...value, cost: Math.round(value.cost * 100) / 100 }])),
      bySeverity: Object.fromEntries(Object.entries(bySeverity).map(([key, value]) => [key, { ...value, cost: Math.round(value.cost * 100) / 100 }])),
      byCategory: Object.fromEntries(Object.entries(byCategory).map(([key, value]) => [key, { ...value, cost: Math.round(value.cost * 100) / 100 }])),
      mostDamagedTools,
    },
  });
}

// ── PDF PARAMS BUILDER ─────────────────────────────────────────────────────────
function buildRepairPdfParams(
  type: ReportType,
  data: any,
  generatedBy: string,
  from?: Date,
  to?: Date,
  plantId?: string,
  priority?: string,
  department?: string,
): ReportPDFParams {
  const filters: Record<string, string> = {
    from: from?.toISOString().slice(0, 10) || 'All time',
    to: to?.toISOString().slice(0, 10) || 'Present',
    ...(plantId && { plantId }),
    ...(priority && { priority }),
    ...(department && { department }),
  };

  const reportTitles: Record<ReportType, { title: string; subtitle: string }> = {
    lifecycle: { title: 'Maintenance Request Lifecycle Report', subtitle: 'MR → WO Conversion & Stage Durations' },
    execution: { title: 'WO Execution Report', subtitle: 'Completion Rates, Rework & Team Performance' },
    technician_performance: { title: 'Technician Performance Report', subtitle: 'Individual Technician Metrics & Rankings' },
    materials: { title: 'Materials Report', subtitle: 'Material Cost Analysis & Spare Part Returns' },
    downtime: { title: 'Downtime Report', subtitle: 'Equipment Downtime Analysis & Impact Assessment' },
    tools: { title: 'Tool Damage Report', subtitle: 'Damage Incidents, Repair Costs & Tool Transfers' },
  };

  const { title, subtitle } = reportTitles[type];
  const sections: ReportPDFParams['sections'] = [];

  switch (type) {
    case 'lifecycle': {
      sections.push(
        { title: 'Key Metrics', type: 'summary-cards', data: [
          { label: 'Total MRs', value: data.totalRequests },
          { label: 'Converted to WO', value: data.convertedToWo },
          { label: 'Closed', value: data.closed },
          { label: 'Avg Turnaround', value: `${data.avgTurnaroundHours}h` },
        ]},
        { title: 'Average Stage Durations', type: 'table', data: {
          headers: ['Stage', 'Avg Hours'],
          rows: Object.entries(data.avgStageDurations as Record<string, number>).map(([stage, hours]) => [
            stage.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase()),
            `${Math.round(hours * 100) / 100}`,
          ]),
        }},
      );
      break;
    }

    case 'execution': {
      sections.push(
        { title: 'Key Metrics', type: 'summary-cards', data: [
          { label: 'Total WOs', value: data.totalWOs },
          { label: 'Completion Rate', value: `${data.completionRate}%` },
          { label: 'Avg Actual Hours', value: `${data.avgActualHours}h` },
          { label: 'Rework Rate', value: `${data.reworkRate}%` },
        ]},
        { title: 'Work Orders by Type', type: 'table', data: {
          headers: ['Type', 'Count', 'Closed', 'Rate (%)', 'Avg Hours'],
          rows: (data.byType as any[]).map((entry) => [entry.type, String(entry.count), String(entry.closed), String(entry.rate), String(entry.avgHours)]),
        }},
        { title: 'Team Performance', type: 'table', data: {
          headers: ['Name', 'Total', 'Closed', 'Avg Hours', 'Rework'],
          rows: (data.teamMetrics as any[]).map((entry) => [entry.fullName, String(entry.total), String(entry.closed), String(entry.avgActualHours), String(entry.rework)]),
        }},
      );
      break;
    }

    case 'technician_performance': {
      sections.push(
        { title: 'Technician Performance', type: 'table', data: {
          headers: ['Name', 'WO Count', 'Closed', 'Avg Time/WO', 'Time Accuracy (%)', 'Rework Rate (%)'],
          rows: (data.technicians as any[]).map((entry) => [
            entry.user?.fullName || 'Unknown',
            String(entry.woCount),
            String(entry.closedCount),
            String(entry.avgTimePerWo),
            String(entry.timeAccuracy),
            String(entry.reworkRate),
          ]),
        }},
      );
      break;
    }

    case 'materials': {
      sections.push(
        { title: 'Material Summary', type: 'summary-cards', data: [
          { label: 'Total Material Cost', value: `$${data.summary.totalMaterialCost.toLocaleString()}` },
          { label: 'WOs with Materials', value: data.summary.workOrdersWithMaterials },
          { label: 'Avg Cost/WO', value: `$${data.summary.avgCostPerWo.toLocaleString()}` },
        ]},
        { title: 'Material Cost by Work Order', type: 'table', data: {
          headers: ['WO #', 'Title', 'Items', 'Cost'],
          rows: (data.costByWorkOrder as any[]).slice(0, 15).map((entry) => [
            entry.woNumber || '—',
            entry.title || '—',
            String(entry.materialCount),
            `$${entry.totalMaterialCost.toLocaleString()}`,
          ]),
        }},
        { title: 'Spare Part Returns', type: 'key-value', data: [
          { key: 'Total Returns', value: String(data.sparePartReturns.total) },
          { key: 'Returned to Store', value: String(data.sparePartReturns.returnedToStore) },
          { key: 'Disposed', value: String(data.sparePartReturns.disposed) },
          { key: 'Return Rate', value: `${data.sparePartReturns.returnRate}%` },
          { key: 'Total Refurb Cost', value: `$${data.sparePartReturns.totalRefurbCost.toLocaleString()}` },
        ]},
      );
      break;
    }

    case 'downtime': {
      sections.push(
        { title: 'Downtime Summary', type: 'summary-cards', data: [
          { label: 'Total Events', value: data.summary.totalEvents },
          { label: 'Total Hours', value: `${data.summary.totalDowntimeHours}h` },
          { label: 'Avg Duration', value: `${data.summary.avgDurationHours}h` },
          { label: 'Production Loss', value: `$${data.summary.totalProductionLoss.toLocaleString()}` },
        ]},
        { title: 'Top 10 Assets by Downtime', type: 'table', data: {
          headers: ['Asset', 'Events', 'Hours', 'Loss'],
          rows: (data.byAsset as any[]).slice(0, 10).map((entry) => [
            entry.assetName || '—',
            String(entry.count),
            String(entry.totalHours),
            `$${(entry.totalLoss || 0).toLocaleString()}`,
          ]),
        }},
        { title: 'Downtime by Category', type: 'table', data: {
          headers: ['Category', 'Events', 'Hours'],
          rows: Object.entries(data.byCategory as Record<string, any>).map(([category, value]) => [
            category,
            String(value.count),
            String(value.totalHours),
          ]),
        }},
      );
      break;
    }

    case 'tools': {
      sections.push(
        { title: 'Tool Summary', type: 'summary-cards', data: [
          { label: 'Damage Reports', value: data.summary.totalDamageReports },
          { label: 'Repair Cost', value: `$${data.summary.totalRepairCost.toLocaleString()}` },
          { label: 'Repaired', value: data.summary.repaired },
          { label: 'Written Off', value: data.summary.writtenOff },
          { label: 'Transfers', value: data.summary.totalTransfers },
        ]},
        { title: 'Most Damaged Tools', type: 'table', data: {
          headers: ['Tool', 'Code', 'Category', 'Damage Count', 'Repair Cost'],
          rows: (data.mostDamagedTools as any[]).slice(0, 10).map((entry) => [
            entry.toolName,
            entry.toolCode,
            entry.category,
            String(entry.damageCount),
            `$${entry.totalCost.toLocaleString()}`,
          ]),
        }},
        { title: 'By Damage Type', type: 'table', data: {
          headers: ['Damage Type', 'Count', 'Cost'],
          rows: Object.entries(data.byDamageType as Record<string, any>).map(([damageType, value]) => [
            damageType,
            String(value.count),
            `$${value.cost.toLocaleString()}`,
          ]),
        }},
      );
      break;
    }
  }

  return {
    title,
    subtitle,
    generatedBy,
    generatedAt: new Date(),
    filters,
    sections,
  };
}
