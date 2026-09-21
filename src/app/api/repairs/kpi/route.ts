import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasRole } from '@/lib/auth';
import { getPlantScope } from '@/lib/plant-scope';
import { getUnavailableOperationalModules } from '@/lib/module-access.server';

// GET /api/repairs/kpi
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const canViewKpi = isAdmin(session) || hasRole(session, 'maintenance_manager') || hasRole(session, 'maintenance_planner') || hasRole(session, 'plant_manager') || hasRole(session, 'maintenance_supervisor');
    if (!canViewKpi) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    const plantWhere = plantScope?.isScoped && plantScope.plantId ? { plantId: plantScope.plantId } : {};
    const unavailableModules = new Set(await getUnavailableOperationalModules([
      'work_orders',
      'inventory',
      'tools',
      'downtime',
    ]));
    const workOrdersEnabled = !unavailableModules.has('work_orders');
    const inventoryEnabled = !unavailableModules.has('inventory');
    const toolsEnabled = !unavailableModules.has('tools');
    const downtimeEnabled = !unavailableModules.has('downtime');

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
      workOrdersEnabled
        ? db.workOrder.count(Object.keys(plantWhere).length > 0 ? { where: plantWhere } : undefined)
        : Promise.resolve(0),
      // Completed WOs
      workOrdersEnabled
        ? db.workOrder.count({ where: { ...plantWhere, status: { in: ['completed', 'verified', 'closed'] } } })
        : Promise.resolve(0),
      // Closed WOs
      workOrdersEnabled
        ? db.workOrder.count({ where: { ...plantWhere, status: 'closed' } })
        : Promise.resolve(0),
      // In progress
      workOrdersEnabled
        ? db.workOrder.count({ where: { ...plantWhere, status: { in: ['assigned', 'in_progress', 'waiting_parts', 'on_hold'] } } })
        : Promise.resolve(0),
      // Overdue (planned end past, not closed)
      workOrdersEnabled
        ? db.workOrder.count({
            where: {
              ...plantWhere,
              plannedEnd: { lt: new Date() },
              status: { notIn: ['closed', 'cancelled'] },
            },
          })
        : Promise.resolve(0),
      // Avg completion time (hours) — actual labor hours from RepairCompletion (route through workOrder for plant filter)
      workOrdersEnabled
        ? db.repairCompletion.aggregate({ ...(Object.keys(plantWhere).length > 0 ? { where: { workOrder: plantWhere } } : {}), _avg: { totalLaborHours: true } })
        : Promise.resolve({ _avg: { totalLaborHours: null } }),
      // Material requests by status
      inventoryEnabled
        ? db.repairMaterialRequest.groupBy({ by: ['status'], ...(Object.keys(plantWhere).length > 0 ? { where: plantWhere } : {}), _count: true })
        : Promise.resolve([]),
      // Tool requests by status
      toolsEnabled
        ? db.repairToolRequest.groupBy({ by: ['status'], ...(Object.keys(plantWhere).length > 0 ? { where: plantWhere } : {}), _count: true })
        : Promise.resolve([]),
      // Transfer requests by status
      toolsEnabled
        ? db.toolTransferRequest.groupBy({ by: ['status'], ...(Object.keys(plantWhere).length > 0 ? { where: plantWhere } : {}), _count: true })
        : Promise.resolve([]),
      // Total downtime minutes (route through workOrder for plant filter)
      downtimeEnabled
        ? db.workOrderDowntime.aggregate({ ...(Object.keys(plantWhere).length > 0 ? { where: { workOrder: plantWhere } } : {}), _sum: { durationMinutes: true } })
        : Promise.resolve({ _sum: { durationMinutes: null } }),
      // Avg downtime per WO
      downtimeEnabled
        ? db.workOrderDowntime.aggregate({ ...(Object.keys(plantWhere).length > 0 ? { where: { workOrder: plantWhere } } : {}), _avg: { durationMinutes: true } })
        : Promise.resolve({ _avg: { durationMinutes: null } }),
      // Rework stats (route through workOrder for plant filter)
      db.repairCompletion.aggregate({
        _count: true,
        _avg: { reworkCount: true },
        _sum: { reworkCount: true },
        where: { ...(Object.keys(plantWhere).length > 0 ? { workOrder: plantWhere } : {}), reworkCount: { gt: 0 } },
      }),
      // Recent completions (last 30 days, route through workOrder for plant filter)
      workOrdersEnabled
        ? db.repairCompletion.findMany({
            where: { ...(Object.keys(plantWhere).length > 0 ? { workOrder: plantWhere } : {}), supervisorApprovedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
            include: { workOrder: { select: { woNumber: true, title: true, priority: true } } },
            orderBy: { supervisorApprovedAt: 'desc' },
            take: 10,
          })
        : Promise.resolve([]),
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
        workOrders: workOrdersEnabled ? {
          total: totalWos,
          completed: completedWos,
          closed: closedWos,
          inProgress: inProgressWos,
          overdue: overdueWos,
          completionRate: totalWos > 0 ? ((completedWos / totalWos) * 100).toFixed(1) : '0',
          avgLaborHours: avgCompletionHours._avg.totalLaborHours?.toFixed(1) || '0',
        } : null,
        materialRequests: inventoryEnabled ? {
          total: Object.values(matReqByStatus).reduce((a, b) => a + b, 0),
          pending: matReqByStatus['pending'] || 0,
          approved: (matReqByStatus['supervisor_approved'] || 0) + (matReqByStatus['storekeeper_approved'] || 0),
          issued: matReqByStatus['issued'] || 0,
          rejected: matReqByStatus['rejected'] || 0,
          byStatus: matReqByStatus,
        } : null,
        toolRequests: toolsEnabled ? {
          total: Object.values(toolReqByStatus).reduce((a, b) => a + b, 0),
          pending: toolReqByStatus['pending'] || 0,
          approved: (toolReqByStatus['supervisor_approved'] || 0) + (toolReqByStatus['storekeeper_approved'] || 0),
          issued: toolReqByStatus['issued'] || 0,
          rejected: toolReqByStatus['rejected'] || 0,
          byStatus: toolReqByStatus,
        } : null,
        toolTransfers: toolsEnabled ? {
          total: Object.values(transferReqByStatus).reduce((a, b) => a + b, 0),
          pending: transferReqByStatus['pending'] || 0,
          transferred: transferReqByStatus['transferred'] || 0,
          rejected: transferReqByStatus['rejected'] || 0,
        } : null,
        downtime: downtimeEnabled ? {
          totalMinutes: totalDowntime._sum.durationMinutes || 0,
          totalHours: ((totalDowntime._sum.durationMinutes || 0) / 60).toFixed(1),
          avgMinutesPerWo: avgDowntimePerWo._avg.durationMinutes?.toFixed(0) || '0',
        } : null,
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
