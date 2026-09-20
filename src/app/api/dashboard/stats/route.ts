import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasPermission, hasAnyPermission } from '@/lib/auth';
import { getPlantScope, getPlantFilterWhere, canAccessPlant } from '@/lib/plant-scope';

// Prevent caching — dashboard data changes frequently
export const dynamic = 'force-dynamic';

/**
 * Wrap a promise with a fallback value so a single failing query
 * doesn't crash the entire dashboard response.
 */
function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  return p.catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[dashboard:stats] Query failed, using fallback:', msg);
    return fallback;
  });
}

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'dashboard.view') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const isAdm = isAdmin(session);

    // Resolve plant scope for multi-plant data isolation
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }
    const plantFilter = getPlantFilterWhere(plantScope);

    // Some optional-module tables are not directly plant-scoped. Resolve the
    // plant boundary through their actual owning relation/department rather
    // than spreading a non-existent plantId field into Prisma queries.
    const scopedDepartmentIds = plantScope.isSystemWide
      ? []
      : (await db.department.findMany({
          where: { ...plantFilter },
          select: { id: true },
        })).map((department) => department.id);
    const departmentPlantFilter: Record<string, unknown> = plantScope.isSystemWide
      ? {}
      : {
          departmentId: {
            in: scopedDepartmentIds.length > 0
              ? scopedDepartmentIds
              : ['__ACCESS_DENIED__'],
          },
        };
    const iotAlertPlantFilter: Record<string, unknown> = plantScope.isSystemWide
      ? {}
      : { device: { ...plantFilter } };

    // Resolve optional-module licensing/activation before exposing any
    // cross-module dashboard data. Missing optional modules fail closed.
    const optionalCodes = ['safety', 'production', 'iot_sensors', 'quality', 'pm_schedules', 'analytics', 'reports'];
    const moduleRows = await db.systemModule.findMany({
      where: { code: { in: optionalCodes } },
      include: { companyModules: true },
    });
    const moduleOperational = (code: string) => {
      const systemModule = moduleRows.find((row) => row.code === code);
      if (!systemModule) return false;
      if (systemModule.isCore) return true;
      const companyModule = systemModule.companyModules.find((cm) => cm.companyId === '__default__')
        ?? systemModule.companyModules.find((cm) => cm.companyId === null)
        ?? systemModule.companyModules[0];
      const now = new Date();
      const systemLicenseValid = systemModule.isSystemLicensed === true
        && (!systemModule.validFrom || systemModule.validFrom <= now)
        && (!systemModule.validUntil || systemModule.validUntil >= now);
      return systemLicenseValid
        && Boolean(companyModule?.licensedAt)
        && companyModule?.isEnabled === true
        && companyModule?.isActive === true;
    };

    const canViewAssetKPIs = isAdm || hasAnyPermission(session, ['assets.view', 'assets.view_all']);
    const canViewSafetyKPIs = moduleOperational('safety')
      && (isAdm || hasPermission(session, 'safety_incidents.view'));
    const canViewProductionKPIs = moduleOperational('production')
      && (isAdm || hasPermission(session, 'production.view'));
    const canViewIoTKPIs = moduleOperational('iot_sensors')
      && (isAdm || hasPermission(session, 'iot_devices.view'));
    const canViewQualityKPIs = moduleOperational('quality')
      && (isAdm || hasPermission(session, 'quality_ncr.view'));
    const canViewInventoryKPIs = isAdm || hasAnyPermission(session, [
      'inventory.view_all',
      'inventory.manage',
      'inventory.create',
      'inventory.update',
      'inventory.stock_in',
      'inventory.stock_out',
      'inventory.reserve',
      'inventory.export',
    ]);
    const canViewPmKPIs = moduleOperational('pm_schedules')
      && (isAdm || hasPermission(session, 'pm_schedules.view'));
    const canViewAnalyticsKPIs = moduleOperational('analytics')
      && (isAdm || hasPermission(session, 'analytics.view'));
    const canViewFinancialKPIs = moduleOperational('reports')
      && (isAdm || hasPermission(session, 'reports.view'));

    // Build base where clauses for role-based filtering
    const mrWhere: Record<string, unknown> = { ...plantFilter };
    const woWhere: Record<string, unknown> = { ...plantFilter };

    // Track supervised departments for reuse (pending-count and dashboard pending queries)
    let supervisedDeptIds: string[] = [];

    if (session && !isAdm) {
      // Non-admin: show own items or items assigned to them
      if (session.roles.includes('maintenance_technician')) {
        const teamWoIds = await db.workOrderTeamMember.findMany({
          where: { userId: session.userId },
          select: { workOrderId: true },
        });
        const teamIds = teamWoIds.map((row) => row.workOrderId);
        if (teamIds.length > 0) {
          (woWhere as Record<string, unknown>).OR = [
            { assignedTo: session.userId },
            { id: { in: teamIds } },
          ];
        } else {
          (woWhere as Record<string, unknown>).assignedTo = session.userId;
        }
        (mrWhere as Record<string, unknown>).requestedBy = session.userId;
      } else if (session.roles.includes('production_operator')) {
        (mrWhere as Record<string, unknown>).requestedBy = session.userId;
        // Operators only see WOs created from their requests
        const myMRIds = await db.maintenanceRequest.findMany({
          where: { requestedBy: session.userId },
          select: { id: true },
        });
        if (myMRIds.length > 0) {
          (woWhere as Record<string, unknown>).maintenanceRequestId = { in: myMRIds.map(mr => mr.id) };
        } else {
          // No MRs, so no WOs to show
          (woWhere as Record<string, unknown>).id = '__none__';
        }
      } else if (session.roles.includes('maintenance_supervisor')) {
        // Supervisors see requests from their supervised departments AND explicitly assigned to them
        const supervisedDepts = await db.department.findMany({
          where: { supervisorId: session.userId },
          select: { id: true },
        });
        supervisedDeptIds = supervisedDepts.map(d => d.id);
        if (supervisedDeptIds.length > 0) {
          (mrWhere as Record<string, unknown>).OR = [
            { supervisorId: session.userId },
            { departmentId: { in: supervisedDeptIds } },
          ];
        } else {
          (mrWhere as Record<string, unknown>).supervisorId = session.userId;
        }
      }
      // Planners and admins see everything
    }

    // Build role-based where clause for pending requests (NO plant filter — matches pending-count API)
    // Supervisors, managers, and admins see ALL pending+approved requests (they need visibility into all actionable items)
    let pendingMrWhere: Record<string, unknown>;
    const isSupervisorLike = isAdm || session.roles.includes('maintenance_supervisor') || session.roles.includes('maintenance_manager') || session.roles.includes('plant_manager');
    const isPlannerRole = session.roles.includes('maintenance_planner');

    if (isAdm || isSupervisorLike) {
      // Admins, supervisors, managers, plant managers — actionable requests in
      // the validated plant scope only.
      pendingMrWhere = { ...plantFilter, status: { in: ['pending', 'approved'] } };
    } else if (isPlannerRole) {
      // Planners only need approved requests in their accessible plant scope.
      pendingMrWhere = { ...plantFilter, status: 'approved' };
    } else {
      // Technicians, operators — only their own requests in plant scope.
      pendingMrWhere = { ...plantFilter, status: { in: ['pending', 'approved'] }, requestedBy: session.userId };
    }

    // Today's start for trend queries
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(todayStart);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    // Helper: generate array of last 7 day dates
    const last7Days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last7Days.push(d.toISOString().slice(0, 10));
    }

    // Helper: fill a day-count map into a 7-element array matching last7Days
    function fillTrendArray(
      rows: Array<Record<string, Date | null>>,
      field: string,
    ): number[] {
      const map = new Map<string, number>();
      for (const row of rows) {
        const value = row[field];
        if (!value) continue;
        const day = value.toISOString().slice(0, 10);
        map.set(day, (map.get(day) || 0) + 1);
      }
      return last7Days.map((day) => map.get(day) || 0);
    }

    // Date boundaries for this month and last month
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const emptyAggregate = { _sum: { totalCost: 0, laborCost: 0, partsCost: 0, contractorCost: 0 }, _count: 0 };
    const emptyWoList: { id: string; actualStart: Date | null; actualEnd: Date | null; actualHours: number | null; updatedAt: Date; type: string }[] = [];

    const [
      mrByStatus,
      woByStatus,
      totalMR,
      totalWO,
      pendingApprovals,
      overdueWorkOrders,
      createdTodayMR,
      completedTodayWO,
      createdTodayWO,
      recentRequests,
      recentWorkOrders,
      // Asset health
      assetsAtRiskCount,
      assetPoorCount,
      assetCriticalCount,
      assetTotalCount,
      assetByCondition,
      // Safety alerts
      safetyOpenIncidents,
      safetyOverdueInspections,
      // Production
      productionActiveOrders,
      productionOverdueOrders,
      productionTotalCompleted,
      productionTotalAll,
      // IoT status
      iotTotalDevices,
      iotOfflineCount,
      iotAlertCount,
      // Quality
      qualityOpenNcrs,
      qualityFailedInspections,
      qualityPendingAudits,
      // Inventory alerts
      inventoryLowStockItems,
      inventoryPendingRequests,
      // Weekly trends (raw SQL)
      weeklyWoResult,
      weeklyCompletedWoResult,
      weeklyMrResult,
      weeklyProdResult,
      // ===== Enhanced KPIs =====
      // Maintenance KPIs: MTBF, MTTR, planned vs reactive
      completedWOsForKPI,
      preventiveWOsForKPI,
      correctiveWOsForKPI,
      // PM schedules
      pmSchedulesDue,
      pmSchedulesOverdue,
      // Cost analysis: this month vs last month
      thisMonthCostResult,
      lastMonthCostResult,
      costByTypeResult,
      // My assigned work orders (for technician/supervisor dashboards)
      myActiveWOs,
      myPendingTasks,
      myCompletedThisWeek,
      // Tools checked out (for technicians)
      myToolsCheckedOut,
      // Team workload (for supervisors)
      teamPendingApprovals,
      teamActiveWOs,
      // Planning queue (for planners)
      planningQueueWOs,
      // Pending team member requests (for planner/admin)
      pendingTeamRequests,
      // Pending team requests detail (for dashboard)
      pendingTeamRequestsDetail,
      // Recent notifications count
      unreadNotifications,
      // WO type breakdown for donut chart
      preventiveWO,
      correctiveWO,
      emergencyWO,
      inspectionWO,
      predictiveWO,
      // Priority breakdown for MR
      highPriorityMR,
      mediumPriorityMR,
      lowPriorityMR,
      // Role-based actionable requests (pending + approved)
      roleBasedPending,
      newTodayPending,
    ] = await Promise.all([
      // MR counts by status
      safe(db.maintenanceRequest.groupBy({
        by: ['status'],
        _count: { status: true },
        where: Object.keys(mrWhere).length > 0 ? mrWhere : undefined,
      }), []),
      // WO counts by status
      safe(db.workOrder.groupBy({
        by: ['status'],
        _count: { status: true },
        where: Object.keys(woWhere).length > 0 ? woWhere : undefined,
      }), []),
      // Total MR count
      safe(db.maintenanceRequest.count({
        where: Object.keys(mrWhere).length > 0 ? mrWhere : undefined,
      }), 0),
      // Total WO count
      safe(db.workOrder.count({
        where: Object.keys(woWhere).length > 0 ? woWhere : undefined,
      }), 0),
      // Pending approvals (requests in 'pending' or 'in_progress' workflow)
      safe(db.maintenanceRequest.count({
        where: {
          ...mrWhere,
          status: { in: ['pending', 'in_progress'] },
        },
      }), 0),
      // Overdue WOs — must match WO list API filter exactly
      safe(db.workOrder.count({
        where: {
          ...woWhere,
          plannedEnd: { lt: new Date() },
          status: { notIn: ['completed', 'verified', 'closed', 'cancelled'] },
        },
      }), 0),
      // Today's counts for trends
      safe(db.maintenanceRequest.count({
        where: { ...mrWhere, createdAt: { gte: todayStart } },
      }), 0),
      safe(db.workOrder.count({
        where: { ...woWhere, actualEnd: { gte: todayStart }, status: 'completed' },
      }), 0),
      safe(db.workOrder.count({
        where: { ...woWhere, createdAt: { gte: todayStart } },
      }), 0),
      // Recent activity — also filtered by role
      safe(db.maintenanceRequest.findMany({
        where: Object.keys(mrWhere).length > 0 ? mrWhere : plantFilter,
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          requester: { select: { id: true, fullName: true, username: true } },
        },
      }), []),
      safe(db.workOrder.findMany({
        where: Object.keys(woWhere).length > 0 ? woWhere : plantFilter,
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          assignee: { select: { id: true, fullName: true } },
          assigner: { select: { id: true, fullName: true } },
        },
      }), []),
      // Assets at risk: only query when this actor can open Asset Management.
      canViewAssetKPIs
        ? safe(db.asset.count({ where: { isActive: true, ...plantFilter, OR: [{ condition: 'poor' }, { criticality: 'critical' }] } }), 0)
        : Promise.resolve(0),
      canViewAssetKPIs
        ? safe(db.asset.count({ where: { condition: 'poor', isActive: true, ...plantFilter } }), 0)
        : Promise.resolve(0),
      canViewAssetKPIs
        ? safe(db.asset.count({ where: { criticality: 'critical', isActive: true, ...plantFilter } }), 0)
        : Promise.resolve(0),
      canViewAssetKPIs
        ? safe(db.asset.count({ where: { isActive: true, ...plantFilter } }), 0)
        : Promise.resolve(0),
      canViewAssetKPIs
        ? safe(db.asset.groupBy({
            by: ['condition'],
            _count: { condition: true },
            where: { isActive: true, ...plantFilter },
          }), [])
        : Promise.resolve([]),
      // Safety: only query an operational/authorized module. SafetyInspection
      // scopes through department because that table has no direct plantId.
      canViewSafetyKPIs
        ? safe(db.safetyIncident.count({ where: { ...plantFilter, status: { in: ['open', 'investigating'] } } }), 0)
        : Promise.resolve(0),
      canViewSafetyKPIs
        ? safe(db.safetyInspection.count({
            where: {
              ...departmentPlantFilter,
              scheduledDate: { lt: new Date() },
              status: { notIn: ['completed', 'failed'] },
            },
          }), 0)
        : Promise.resolve(0),
      // Production
      canViewProductionKPIs
        ? safe(db.productionOrder.count({ where: { ...plantFilter, status: 'in_progress' } }), 0)
        : Promise.resolve(0),
      canViewProductionKPIs
        ? safe(db.productionOrder.count({
            where: {
              ...plantFilter,
              scheduledEnd: { lt: new Date() },
              status: { notIn: ['completed', 'cancelled'] },
            },
          }), 0)
        : Promise.resolve(0),
      canViewProductionKPIs
        ? safe(db.productionOrder.count({ where: { ...plantFilter, status: 'completed' } }), 0)
        : Promise.resolve(0),
      canViewProductionKPIs
        ? safe(db.productionOrder.count({ where: { ...plantFilter } }), 0)
        : Promise.resolve(0),
      // IoT alerts scope through their owning device.
      canViewIoTKPIs
        ? safe(db.iotDevice.count({ where: { ...plantFilter } }), 0)
        : Promise.resolve(0),
      canViewIoTKPIs
        ? safe(db.iotDevice.count({ where: { ...plantFilter, status: 'offline' } }), 0)
        : Promise.resolve(0),
      canViewIoTKPIs
        ? safe(db.iotAlert.count({ where: { ...iotAlertPlantFilter, status: 'active' } }), 0)
        : Promise.resolve(0),
      // Quality NCR/audit tables scope through department; inspections own plantId.
      canViewQualityKPIs
        ? safe(db.nonConformanceReport.count({ where: { ...departmentPlantFilter, status: { in: ['open', 'investigating', 'root_cause_found', 'corrective_action'] } } }), 0)
        : Promise.resolve(0),
      canViewQualityKPIs
        ? safe(db.qualityInspection.count({ where: { ...plantFilter, status: 'failed' } }), 0)
        : Promise.resolve(0),
      canViewQualityKPIs
        ? safe(db.qualityAudit.count({ where: { ...departmentPlantFilter, status: { in: ['planned', 'in_progress'] } } }), 0)
        : Promise.resolve(0),
      // Inventory
      canViewInventoryKPIs
        ? safe(db.inventoryItem.findMany({
            where: { isActive: true, ...plantFilter },
            select: { id: true, currentStock: true, minStockLevel: true },
          }), [])
        : Promise.resolve([]),
      canViewInventoryKPIs
        ? safe(db.inventoryRequest.count({ where: { ...plantFilter, status: { in: ['pending', 'partially_fulfilled'] } } }), 0)
        : Promise.resolve(0),
      // Weekly trends use the same role/plant scope as their destination lists.
      safe(db.workOrder.findMany({
        where: { ...woWhere, createdAt: { gte: sevenDaysAgo } },
        select: { createdAt: true },
      }), []),
      safe(db.workOrder.findMany({
        where: { ...woWhere, actualEnd: { gte: sevenDaysAgo }, status: 'completed' },
        select: { actualEnd: true },
      }), []),
      safe(db.maintenanceRequest.findMany({
        where: { ...mrWhere, createdAt: { gte: sevenDaysAgo } },
        select: { createdAt: true },
      }), []),
      canViewProductionKPIs
        ? safe(db.productionOrder.findMany({
            where: { ...plantFilter, createdAt: { gte: sevenDaysAgo } },
            select: { createdAt: true },
          }), [])
        : Promise.resolve([]),
      // ===== Enhanced KPIs =====
      // Completed WOs with actual hours for MTBF/MTTR
      safe(db.workOrder.findMany({
        where: { ...plantFilter, status: { in: ['completed', 'closed'] }, actualEnd: { not: null }, actualStart: { not: null } },
        select: { id: true, actualStart: true, actualEnd: true, actualHours: true, updatedAt: true, type: true },
        orderBy: { actualEnd: 'desc' },
        take: 200,
      }), emptyWoList),
      // Preventive vs corrective count for planned ratio
      safe(db.workOrder.count({ where: { ...plantFilter, type: 'preventive' } }), 0),
      safe(db.workOrder.count({ where: { ...plantFilter, type: { in: ['corrective', 'emergency'] } } }), 0),
      // PM schedules due (nextDueDate within 7 days) — plant filter routes through asset relation
      safe(db.pmSchedule.count({
        where: {
          asset: { ...plantFilter },
          isActive: true,
          nextDueDate: { lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
        },
      }), 0),
      // PM schedules overdue — plant filter routes through asset relation
      safe(db.pmSchedule.count({
        where: {
          asset: { ...plantFilter },
          isActive: true,
          nextDueDate: { lt: new Date() },
        },
      }), 0),
      // This month cost (exclude draft & cancelled — matches by-category filter)
      safe(db.workOrder.aggregate({
        where: { ...plantFilter, createdAt: { gte: thisMonthStart }, status: { notIn: ['cancelled', 'draft'] } },
        _sum: { totalCost: true, laborCost: true, partsCost: true, contractorCost: true },
        _count: true,
      }), emptyAggregate),
      // Last month cost (exclude draft & cancelled — matches by-category filter)
      safe(db.workOrder.aggregate({
        where: { ...plantFilter, createdAt: { gte: lastMonthStart, lte: lastMonthEnd }, status: { notIn: ['cancelled', 'draft'] } },
        _sum: { totalCost: true, laborCost: true, partsCost: true, contractorCost: true },
        _count: true,
      }), emptyAggregate),
      // Cost by WO type
      safe(db.workOrder.groupBy({
        by: ['type'],
        _sum: { totalCost: true, laborCost: true, partsCost: true },
        where: { ...plantFilter, status: { notIn: ['cancelled', 'draft'] } },
      }), []),
      // My active WOs (assigned to me, not terminal)
      safe(db.workOrder.count({
        where: {
          ...plantFilter,
          assignedTo: session.userId,
          status: { in: ['assigned', 'in_progress', 'waiting_parts', 'on_hold'] },
        },
      }), 0),
      // My pending tasks (MRs I submitted that are pending/approved — matches nav filter)
      safe(db.maintenanceRequest.count({
        where: { ...plantFilter, requestedBy: session.userId, status: { in: ['pending', 'approved'] } },
      }), 0),
      // My completed this week
      safe(db.workOrder.count({
        where: {
          ...plantFilter,
          assignedTo: session.userId,
          status: 'completed',
          updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }), 0),
      // Tools checked out by me
      safe(db.tool.count({
        where: { status: 'checked_out', assignedToId: session.userId },
      }), 0),
      // Team pending approvals (for supervisors)
      isAdm || session.roles.includes('maintenance_supervisor')
        ? safe(db.maintenanceRequest.count({
            where: { ...plantFilter, status: { in: ['pending', 'in_progress'] } },
          }), 0)
        : Promise.resolve(0),
      // Team active WOs (for supervisors — consistent with myActiveWOs definition)
      isAdm || session.roles.includes('maintenance_supervisor')
        ? safe(db.workOrder.count({
            where: { ...plantFilter, status: { in: ['assigned', 'in_progress', 'waiting_parts', 'on_hold'] } },
          }), 0)
        : Promise.resolve(0),
      // Planning queue (for planners)
      isAdm || session.roles.includes('maintenance_planner')
        ? safe(db.workOrder.count({
            where: { ...plantFilter, status: { in: ['draft', 'approved', 'requested'] } },
          }), 0)
        : Promise.resolve(0),
      // Pending team member requests (for planner/admin — count WOs where current user is planner or assigner)
      isAdm || session.roles.includes('maintenance_planner')
        ? safe(db.woTeamMemberRequest.count({
            where: {
              status: 'pending',
              ...(isAdm ? {} : { OR: [
                { workOrder: { plannerId: session.userId } },
                { workOrder: { assignedBy: session.userId } },
              ]}),
            },
          }), 0)
        : Promise.resolve(0),
      // Pending team requests detail (WO number + trade) for dashboard cards
      isAdm || session.roles.includes('maintenance_planner')
        ? safe(db.woTeamMemberRequest.findMany({
            where: {
              status: 'pending',
              ...(isAdm ? {} : { OR: [
                { workOrder: { plannerId: session.userId } },
                { workOrder: { assignedBy: session.userId } },
              ]}),
            },
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: {
              workOrder: { select: { id: true, woNumber: true, title: true } },
              requestedByUser: { select: { id: true, fullName: true } },
            },
          }), [])
        : Promise.resolve([]),
      // Unread notification count
      safe(db.notification.count({
        where: { userId: session.userId, isRead: false },
      }), 0),
      // WO type breakdown for donut chart (role-filtered to match status chart)
      safe(db.workOrder.count({ where: { ...plantFilter, ...Object.keys(woWhere).length > 0 ? woWhere : {}, type: 'preventive' } }), 0),
      safe(db.workOrder.count({ where: { ...plantFilter, ...Object.keys(woWhere).length > 0 ? woWhere : {}, type: 'corrective' } }), 0),
      safe(db.workOrder.count({ where: { ...plantFilter, ...Object.keys(woWhere).length > 0 ? woWhere : {}, type: 'emergency' } }), 0),
      safe(db.workOrder.count({ where: { ...plantFilter, ...Object.keys(woWhere).length > 0 ? woWhere : {}, type: 'inspection' } }), 0),
      safe(db.workOrder.count({ where: { ...plantFilter, ...Object.keys(woWhere).length > 0 ? woWhere : {}, type: 'predictive' } }), 0),
      // Priority breakdown for MR (role-filtered to match status chart)
      safe(db.maintenanceRequest.count({ where: { ...plantFilter, ...Object.keys(mrWhere).length > 0 ? mrWhere : {}, priority: { in: ['high', 'urgent'] } } }), 0),
      safe(db.maintenanceRequest.count({ where: { ...plantFilter, ...Object.keys(mrWhere).length > 0 ? mrWhere : {}, priority: 'medium' } }), 0),
      safe(db.maintenanceRequest.count({ where: { ...plantFilter, ...Object.keys(mrWhere).length > 0 ? mrWhere : {}, priority: 'low' } }), 0),
      // Role-based: pending + approved requests (actionable by current user, no plant filter)
      safe(db.maintenanceRequest.count({ where: pendingMrWhere }), 0),
      // Role-based: new today (pending + approved created today, no plant filter)
      safe(db.maintenanceRequest.count({ where: { ...pendingMrWhere, createdAt: { gte: todayStart } } }), 0),
    ]);

    const mrStats: Record<string, number> = {};
    mrByStatus.forEach((r) => {
      mrStats[r.status] = r._count.status;
    });

    const woStats: Record<string, number> = {};
    woByStatus.forEach((w) => {
      woStats[w.status] = w._count.status;
    });

    // Active WOs — consistent definition across all cards: in_progress + assigned + waiting_parts + on_hold
    const activeWorkOrders =
      (woStats['in_progress'] || 0) + (woStats['assigned'] || 0) + (woStats['waiting_parts'] || 0) + (woStats['on_hold'] || 0);

    // Completed WOs
    const completedWorkOrders = woStats['completed'] || 0;

    // Calculate low stock from inventory items
    const lowStock = inventoryLowStockItems.filter(
      (i) => i.currentStock <= i.minStockLevel && i.minStockLevel > 0,
    ).length;

    // Calculate production completion rate
    const productionCompletionRate = productionTotalAll > 0
      ? Math.round((productionTotalCompleted / productionTotalAll) * 100)
      : 0;

    // Build weekly trend arrays
    const weeklyTrends = {
      workOrders: fillTrendArray(weeklyWoResult as Array<{ createdAt: Date }>, 'createdAt'),
      completedWorkOrders: fillTrendArray(weeklyCompletedWoResult as Array<{ actualEnd: Date | null }>, 'actualEnd'),
      maintenanceRequests: fillTrendArray(weeklyMrResult as Array<{ createdAt: Date }>, 'createdAt'),
      productionOrders: fillTrendArray(weeklyProdResult as Array<{ createdAt: Date }>, 'createdAt'),
    };

    // ===== Compute Enhanced KPIs =====

    // MTTR (Mean Time To Repair) in hours: avg of actualHours for completed WOs
    const wosWithActualHours = completedWOsForKPI.filter(w => w.actualHours && w.actualHours > 0);
    const mttr = wosWithActualHours.length > 0
      ? Math.round((wosWithActualHours.reduce((sum, w) => sum + (w.actualHours || 0), 0) / wosWithActualHours.length) * 10) / 10
      : 0;

    // MTBF (Mean Time Between Failures) in hours: avg time between completed corrective/emergency WOs
    const failureWOs = completedWOsForKPI
      .filter(w => w.type === 'corrective' || w.type === 'emergency')
      .filter(w => w.actualEnd && w.actualStart)
      .sort((a, b) => new Date(a.actualEnd!).getTime() - new Date(b.actualEnd!).getTime());
    let mtbf = 0;
    if (failureWOs.length >= 2) {
      let totalHours = 0;
      for (let i = 1; i < failureWOs.length; i++) {
        const diff = new Date(failureWOs[i].actualEnd!).getTime() - new Date(failureWOs[i - 1].actualEnd!).getTime();
        totalHours += diff / (1000 * 60 * 60);
      }
      mtbf = Math.round(totalHours / (failureWOs.length - 1));
    } else if (failureWOs.length === 1) {
      // Use 30-day window as denominator
      const diff = Date.now() - new Date(failureWOs[0].actualEnd!).getTime();
      mtbf = Math.round(diff / (1000 * 60 * 60));
    }

    // Planned vs reactive ratio
    const totalMaintWOs = preventiveWOsForKPI + correctiveWOsForKPI;
    const plannedRatio = totalMaintWOs > 0
      ? Math.round((preventiveWOsForKPI / totalMaintWOs) * 100)
      : 0;

    // Asset condition breakdown
    const assetConditionMap: Record<string, number> = {};
    assetByCondition.forEach((r) => {
      assetConditionMap[r.condition] = r._count.condition;
    });

    // Cost analysis
    const thisMonthTotal = thisMonthCostResult._sum.totalCost || 0;
    const lastMonthTotal = lastMonthCostResult._sum.totalCost || 0;
    const costChangePercent = lastMonthTotal > 0
      ? Math.round(((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100)
      : thisMonthTotal > 0 ? 100 : 0;

    const costByCategory: Record<string, { totalCost: number; laborCost: number; partsCost: number }> = {};
    costByTypeResult.forEach((r) => {
      costByCategory[r.type] = {
        totalCost: r._sum.totalCost || 0,
        laborCost: r._sum.laborCost || 0,
        partsCost: r._sum.partsCost || 0,
      };
    });

    // User roles for frontend role detection
    const userRoles = session.roles || [];

    return NextResponse.json({
      success: true,
      data: {
        totalWorkOrders: totalWO,
        activeWorkOrders,
        completedWorkOrders,
        overdueWorkOrders,
        pendingRequests: roleBasedPending,
        pendingApprovals,
        totalRequests: totalMR,
        // Trends
        createdTodayMR,
        newTodayPending,
        createdTodayWO,
        completedTodayWO,
        // MR breakdown (aliased for frontend)
        approvedRequests: mrStats['approved'] || 0,
        rejectedRequests: mrStats['rejected'] || 0,
        convertedRequests: mrStats['converted'] || 0,
        pendingMR: mrStats['pending'] || 0,
        inProgressMR: mrStats['in_progress'] || 0,
        approvedMR: mrStats['approved'] || 0,
        rejectedMR: mrStats['rejected'] || 0,
        convertedMR: mrStats['converted'] || 0,
        // WO breakdown
        draftWO: woStats['draft'] || 0,
        requestedWO: woStats['requested'] || 0,
        approvedWO: woStats['approved'] || 0,
        assignedWO: woStats['assigned'] || 0,
        inProgressWO: woStats['in_progress'] || 0,
        completedWO: woStats['completed'] || 0,
        closedWO: woStats['closed'] || 0,
        // WO type breakdown for donut chart
        preventiveWO: canViewPmKPIs ? preventiveWO : 0,
        correctiveWO,
        emergencyWO,
        inspectionWO,
        predictiveWO,
        // Priority breakdown for MR
        highPriorityMR,
        mediumPriorityMR,
        lowPriorityMR,
        // Recent items
        recentRequests,
        recentWorkOrders,

        // ===== Cross-Module KPIs =====
        assetHealth: canViewAssetKPIs ? {
          atRisk: assetsAtRiskCount,
          poor: assetPoorCount,
          critical: assetCriticalCount,
          total: assetTotalCount,
          byCondition: assetConditionMap,
        } : { atRisk: 0, poor: 0, critical: 0, total: 0, byCondition: {} },
        safetyAlerts: canViewSafetyKPIs ? {
          openIncidents: safetyOpenIncidents,
          overdueInspections: safetyOverdueInspections,
        } : { openIncidents: 0, overdueInspections: 0 },
        production: canViewProductionKPIs ? {
          activeOrders: productionActiveOrders,
          overdueOrders: productionOverdueOrders,
          completionRate: productionCompletionRate,
        } : { activeOrders: 0, overdueOrders: 0, completionRate: 0 },
        iotStatus: canViewIoTKPIs ? {
          totalDevices: iotTotalDevices,
          offlineCount: iotOfflineCount,
          alertCount: iotAlertCount,
        } : { totalDevices: 0, offlineCount: 0, alertCount: 0 },
        quality: canViewQualityKPIs ? {
          openNcrs: qualityOpenNcrs,
          failedInspections: qualityFailedInspections,
          pendingAudits: qualityPendingAudits,
        } : { openNcrs: 0, failedInspections: 0, pendingAudits: 0 },
        inventoryAlerts: canViewInventoryKPIs ? {
          lowStock: lowStock,
          pendingRequests: inventoryPendingRequests,
        } : { lowStock: 0, pendingRequests: 0 },
        weeklyTrends: {
          ...weeklyTrends,
          productionOrders: canViewProductionKPIs ? weeklyTrends.productionOrders : last7Days.map(() => 0),
        },

        // ===== Enhanced KPIs =====

        // Maintenance KPIs
        maintenanceKPIs: {
          mtbf: canViewAnalyticsKPIs ? mtbf : 0, // hours between failures
          mttr: canViewAnalyticsKPIs ? mttr : 0, // hours to repair
          plannedRatio: canViewAnalyticsKPIs && canViewPmKPIs ? plannedRatio : 0,
          preventiveCount: canViewAnalyticsKPIs && canViewPmKPIs ? preventiveWOsForKPI : 0,
          reactiveCount: canViewAnalyticsKPIs ? correctiveWOsForKPI : 0,
        },

        // PM Schedules
        pmScheduleAlerts: canViewPmKPIs ? {
          dueSoon: pmSchedulesDue - pmSchedulesOverdue,
          overdue: pmSchedulesOverdue,
        } : { dueSoon: 0, overdue: 0 },

        // Cost Analysis
        costAnalysis: canViewFinancialKPIs ? {
          thisMonthTotal: Math.round(thisMonthTotal * 100) / 100,
          lastMonthTotal: Math.round(lastMonthTotal * 100) / 100,
          changePercent: costChangePercent,
          thisMonthLabor: Math.round((thisMonthCostResult._sum.laborCost || 0) * 100) / 100,
          thisMonthParts: Math.round((thisMonthCostResult._sum.partsCost || 0) * 100) / 100,
          thisMonthContractor: Math.round((thisMonthCostResult._sum.contractorCost || 0) * 100) / 100,
          byCategory: costByCategory,
        } : {
          thisMonthTotal: 0,
          lastMonthTotal: 0,
          changePercent: 0,
          thisMonthLabor: 0,
          thisMonthParts: 0,
          thisMonthContractor: 0,
          byCategory: {},
        },

        // ===== Role-Based Personal KPIs =====
        myKPIs: {
          activeWorkOrders: myActiveWOs,
          pendingTasks: myPendingTasks,
          completedThisWeek: myCompletedThisWeek,
          toolsCheckedOut: myToolsCheckedOut,
          unreadNotifications,
        },

        // Supervisor KPIs
        supervisorKPIs: {
          pendingApprovals: teamPendingApprovals,
          teamActiveWOs,
        },

        // Planner KPIs
        plannerKPIs: {
          planningQueue: planningQueueWOs,
          pmSchedulesDue: canViewPmKPIs ? pmSchedulesDue - pmSchedulesOverdue : 0,
          pendingTeamRequests,
        },
        // Pending team requests detail
        pendingTeamRequestsDetail,

        // User roles for frontend
        userRoles,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load dashboard stats';
    console.error('[dashboard:stats] Fatal error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
