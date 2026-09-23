import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasPermission } from '@/lib/auth';
import { getPlantScope } from '@/lib/plant-scope';

// GET /api/repairs/kpi
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const canViewKpi = isAdmin(session) || hasPermission(session, 'work_orders.dashboard');
    if (!canViewKpi) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    const plantWhere = plantScope?.isScoped && plantScope.plantId ? { plantId: plantScope.plantId } : {};

    const [
      totalWos,
      completedWos,
      closedWos,
      inProgressWos,
      overdueWos,
      avgCompletionHours,
      matRequestsByStatus,
      toolRequestsByStatus,
      transferRequestsByStatus,
      totalDowntime,
      avgDowntimePerWo,
      reworkStats,
      recentCompletions,
    ] = await Promise.all([
      // Total WOs
      db.workOrder.count(Object.keys(plantWhere).length > 0 ? { where: plantWhere } : undefined),
      // Completed WOs
      db.workOrder.count({ where: { ...plantWhere, status: { in: ['completed', 'verified', 'closed'] } } }),
      // Closed WOs
      db.workOrder.count({ where: { ...plantWhere, status: 'closed' } }),
      // In progress
      db.workOrder.count({ where: { ...plantWhere, status: { in: ['assigned', 'in_progress', 'waiting_parts', 'on_hold'] } } }),
      // Overdue (planned end past, not closed)
      db.workOrder.count({
        where: {
          ...plantWhere,
          plannedEnd: { lt: new Date() },
          status: { notIn: ['closed', 'cancelled'] },
        },
      }),
      // Avg completion time (hours) — actual labor hours from RepairCompletion (route through workOrder for plant filter)
      db.repairCompletion.aggregate({ ...(Object.keys(plantWhere).length > 0 ? { where: { workOrder: plantWhere } } : {}), _avg: { totalLaborHours: true } }),
      // Material requests by status
      db.repairMaterialRequest.groupBy({ by: ['status'], ...(Object.keys(plantWhere).length > 0 ? { where: plantWhere } : {}), _count: true }),
      // Tool requests by status
      db.repairToolRequest.groupBy({ by: ['status'], ...(Object.keys(plantWhere).length > 0 ? { where: plantWhere } : {}), _count: true }),
      // Transfer requests by status
      db.toolTransferRequest.groupBy({ by: ['status'], ...(Object.keys(plantWhere).length > 0 ? { where: plantWhere } : {}), _count: true }),
      // Total downtime minutes (route through workOrder for plant filter)
      db.workOrderDowntime.aggregate({ ...(Object.keys(plantWhere).length > 0 ? { where: { workOrder: plantWhere } } : {}), _sum: { durationMinutes: true } }),
      // Avg downtime per WO
      db.workOrderDowntime.aggregate({ ...(Object.keys(plantWhere).length > 0 ? { where: { workOrder: plantWhere } } : {}), _avg: { durationMinutes: true } }),
      // Rework stats (route through workOrder for plant filter)
      db.repairCompletion.aggregate({
        _count: true,
        _avg: { reworkCount: true },
        _sum: { reworkCount: true },
        where: { ...(Object.keys(plantWhere).length > 0 ? { workOrder: plantWhere } : {}), reworkCount: { gt: 0 } },
      }),
      // Recent completions (last 30 days, route through workOrder for plant filter)
      db.repairCompletion.findMany({
        where: { ...(Object.keys(plantWhere).length > 0 ? { workOrder: plantWhere } : {}), supervisorApprovedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        include: { workOrder: { select: { woNumber: true, title: true, priority: true } } },
        orderBy: { supervisorApprovedAt: 'desc' },
        take: 10,
      }),
    ]);

    const matReqByStatus: Record<string, number> = {};
    for (const r of matRequestsByStatus) matReqByStatus[r.status] = r._count;

    const toolReqByStatus: Record<string, number> = {};
    for (const r of toolRequestsByStatus) toolReqByStatus[r.status] = r._count;

    const transferReqByStatus: Record<string, number> = {};
    for (const r of transferRequestsByStatus) transferReqByStatus[r.status] = r._count;

    return NextResponse.json({
      success: true,
      data: {
        workOrders: {
          total: totalWos,
          completed: completedWos,
          closed: closedWos,
          inProgress: inProgressWos,
          overdue: overdueWos,
          completionRate: totalWos > 0 ? ((completedWos / totalWos) * 100).toFixed(1) : '0',
          avgLaborHours: avgCompletionHours._avg.totalLaborHours?.toFixed(1) || '0',
        },
        materialRequests: {
          total: Object.values(matReqByStatus).reduce((a, b) => a + b, 0),
          pending: matReqByStatus['pending'] || 0,
          approved: (matReqByStatus['supervisor_approved'] || 0) + (matReqByStatus['storekeeper_approved'] || 0),
          issued: matReqByStatus['issued'] || 0,
          rejected: matReqByStatus['rejected'] || 0,
          byStatus: matReqByStatus,
        },
        toolRequests: {
          total: Object.values(toolReqByStatus).reduce((a, b) => a + b, 0),
          pending: toolReqByStatus['pending'] || 0,
          approved: (toolReqByStatus['supervisor_approved'] || 0) + (toolReqByStatus['storekeeper_approved'] || 0),
          issued: toolReqByStatus['issued'] || 0,
          rejected: toolReqByStatus['rejected'] || 0,
          byStatus: toolReqByStatus,
        },
        toolTransfers: {
          total: Object.values(transferReqByStatus).reduce((a, b) => a + b, 0),
          pending: transferReqByStatus['pending'] || 0,
          transferred: transferReqByStatus['transferred'] || 0,
          rejected: transferReqByStatus['rejected'] || 0,
        },
        downtime: {
          totalMinutes: totalDowntime._sum.durationMinutes || 0,
          totalHours: ((totalDowntime._sum.durationMinutes || 0) / 60).toFixed(1),
          avgMinutesPerWo: avgDowntimePerWo._avg.durationMinutes?.toFixed(0) || '0',
        },
        rework: {
          wosWithRework: reworkStats._count,
          avgReworkCount: reworkStats._avg.reworkCount?.toFixed(1) || '0',
          totalReworks: reworkStats._sum.reworkCount || 0,
          reworkRate: completedWos > 0 ? ((reworkStats._count / completedWos) * 100).toFixed(1) : '0',
        },
        recentCompletions,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load KPI data';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
