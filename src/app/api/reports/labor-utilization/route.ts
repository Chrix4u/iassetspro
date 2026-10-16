import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasAnyPermission } from '@/lib/auth';
import { getPlantScope, getPlantFilterWhere } from '@/lib/plant-scope';
import { resolveFunctionalLocationReportScope } from '@/lib/functional-location/reporting';

// GET /api/reports/labor-utilization
// Per-technician and per-department labor utilization, overtime, skill-based analysis
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasAnyPermission(session, ['reports.view', 'reports.export', 'analytics.view']) && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions: reports.view required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const department = searchParams.get('department');
    const functionalLocationId = searchParams.get('functionalLocationId');

    const plantScope = await getPlantScope(request, session);
    const plantFilter = getPlantFilterWhere(plantScope);
    const locationScope = functionalLocationId
      ? await resolveFunctionalLocationReportScope(functionalLocationId)
      : null;

    const dateFilter: Record<string, unknown> = {};
    if (from) dateFilter.gte = new Date(from + 'T00:00:00');
    if (to) dateFilter.lte = new Date(to + 'T23:59:59');

    const woWhere: Record<string, unknown> = {
      ...plantFilter,
      status: { notIn: ['cancelled', 'draft'] },
    };
    if (Object.keys(dateFilter).length > 0) woWhere.createdAt = dateFilter;
    if (department) woWhere.departmentId = department;
    if (locationScope) woWhere.AND = [locationScope.workOrderFilter];

    // Fetch WOs with time logs, assignee, team members
    const workOrders = await db.workOrder.findMany({
      where: Object.keys(woWhere).length > 0 ? woWhere : undefined,
      include: {
        assignee: { select: { id: true, fullName: true } },
        teamLeader: { select: { id: true, fullName: true } },
        teamMembers: { include: { user: { select: { id: true, fullName: true } } } },
        timeLogs: true,
      },
    });

    // Standard available hours: 8h/day, 5 days/week
    // Calculate date range span
    const earliest = workOrders.length > 0
      ? workOrders.reduce((min, wo) => new Date(wo.createdAt) < min ? new Date(wo.createdAt) : min, new Date(workOrders[0].createdAt))
      : new Date();
    const latest = workOrders.length > 0
      ? workOrders.reduce((max, wo) => {
          const end = wo.actualEnd || wo.createdAt;
          return new Date(end) > max ? new Date(end) : max;
        }, new Date(workOrders[0].createdAt))
      : new Date();
    const totalDays = Math.max(1, Math.ceil((latest.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24)));
    const workingDays = Math.max(1, Math.round(totalDays * 5 / 7)); // rough estimate
    const standardHoursPerDay = 8;

    // ========== PER-TECHNICIAN ==========
    const techMap: Record<string, {
      userId: string; userName: string;
      totalWorkedHours: number;
      availableHours: number;
      woAssigned: number;
      woCompleted: number;
      overtimeHours: number;
      timeLogCount: number;
    }> = {};

    workOrders.forEach(wo => {
      // Collect all technicians involved (assignee + team members)
      const technicians: Array<{ id: string; name: string }> = [];
      if (wo.assignedTo) technicians.push({ id: wo.assignedTo, name: wo.assignee?.fullName || 'Unknown' });
      (wo.teamMembers || []).forEach(tm => {
        technicians.push({ id: tm.userId, name: tm.user?.fullName || 'Unknown' });
      });

      technicians.forEach(tech => {
        if (!techMap[tech.id]) {
          techMap[tech.id] = {
            userId: tech.id,
            userName: tech.name,
            totalWorkedHours: 0,
            availableHours: workingDays * standardHoursPerDay,
            woAssigned: 0,
            woCompleted: 0,
            overtimeHours: 0,
            timeLogCount: 0,
          };
        }
        techMap[tech.id].woAssigned += 1;
        if (['completed', 'verified', 'closed'].includes(wo.status)) {
          techMap[tech.id].woCompleted += 1;
        }
      });

      // Worked hours — use timeLogs sum if available, else fall back to actualHours.
      // Avoid double-counting by adding both sources.
      if (wo.assignedTo) {
        let timeLogsHours = 0;
        let timeLogCount = 0;
        if (wo.timeLogs) {
          wo.timeLogs.forEach(tl => {
            if (tl.duration && tl.duration > 0) {
              timeLogsHours += tl.duration;
              timeLogCount += 1;
            }
          });
        }

        if (timeLogsHours > 0) {
          techMap[wo.assignedTo].totalWorkedHours += timeLogsHours;
          techMap[wo.assignedTo].timeLogCount += timeLogCount;
        } else if (wo.actualHours) {
          // Fall back to WO-level actualHours when no detailed time logs exist
          techMap[wo.assignedTo].totalWorkedHours += wo.actualHours;
        }
      }
    });

    const perTechnician = Object.values(techMap).map(t => {
      const utilizationPercent = t.availableHours > 0 ? Math.round((t.totalWorkedHours / t.availableHours) * 100) : 0;
      const overtimeHours = Math.max(0, t.totalWorkedHours - t.availableHours);
      return {
        ...t,
        totalWorkedHours: Math.round(t.totalWorkedHours * 100) / 100,
        utilizationPercent,
        overtimeHours: Math.round(overtimeHours * 100) / 100,
      };
    }).sort((a, b) => b.totalWorkedHours - a.totalWorkedHours);

    // ========== PER-DEPARTMENT ==========
    const deptTechHours: Record<string, { workedHours: number; availableHours: number; techCount: Set<string>; woCount: number }> = {};
    workOrders.forEach(wo => {
      const dept = wo.departmentId || 'Unassigned';
      if (!deptTechHours[dept]) deptTechHours[dept] = { workedHours: 0, availableHours: 0, techCount: new Set(), woCount: 0 };
      deptTechHours[dept].woCount += 1;
      deptTechHours[dept].workedHours += (wo.actualHours || 0);
      if (wo.assignedTo) deptTechHours[dept].techCount.add(wo.assignedTo);
    });

    const perDepartment = Object.entries(deptTechHours).map(([departmentId, data]) => {
      const techCount = data.techCount.size;
      const availableHours = techCount * workingDays * standardHoursPerDay;
      return {
        departmentId,
        technicianCount: techCount,
        workOrderCount: data.woCount,
        totalWorkedHours: Math.round(data.workedHours * 100) / 100,
        availableHours: Math.round(availableHours * 100) / 100,
        utilizationPercent: availableHours > 0 ? Math.round((data.workedHours / availableHours) * 100) : 0,
      };
    }).sort((a, b) => b.totalWorkedHours - a.totalWorkedHours);

    // ========== OVERTIME ANALYSIS ==========
    const overtimeEntries = perTechnician
      .filter(t => t.overtimeHours > 0)
      .map(t => ({
        userId: t.userId,
        userName: t.userName,
        overtimeHours: t.overtimeHours,
        totalWorkedHours: t.totalWorkedHours,
        overtimePercent: t.totalWorkedHours > 0 ? Math.round((t.overtimeHours / t.totalWorkedHours) * 100) : 0,
      }))
      .sort((a, b) => b.overtimeHours - a.overtimeHours);

    const totalOvertimeHours = overtimeEntries.reduce((sum, e) => sum + e.overtimeHours, 0);
    const techWithOvertime = overtimeEntries.length;
    const avgOvertimePerTech = techWithOvertime > 0 ? Math.round(totalOvertimeHours / techWithOvertime * 100) / 100 : 0;

    // ========== SKILL-BASED UTILIZATION ==========
    // Hours by trade activity
    const tradeMap: Record<string, { totalHours: number; woCount: number }> = {};
    workOrders.forEach(wo => {
      const trade = wo.tradeActivity || 'Unassigned';
      if (!tradeMap[trade]) tradeMap[trade] = { totalHours: 0, woCount: 0 };
      tradeMap[trade].totalHours += (wo.actualHours || wo.estimatedHours || 0);
      tradeMap[trade].woCount += 1;
    });
    const byTrade = Object.entries(tradeMap)
      .map(([trade, data]) => ({
        trade,
        totalHours: Math.round(data.totalHours * 100) / 100,
        woCount: data.woCount,
      }))
      .sort((a, b) => b.totalHours - a.totalHours);

    // ========== SUMMARY ==========
    const totalAvailableHours = perTechnician.reduce((s, t) => s + t.availableHours, 0);
    const totalWorkedHours = perTechnician.reduce((s, t) => s + t.totalWorkedHours, 0);
    const overallUtilization = totalAvailableHours > 0 ? Math.round((totalWorkedHours / totalAvailableHours) * 100) : 0;

    return NextResponse.json({
      success: true,
      data: {
        dateRange: { from: from || null, to: to || null },
        summary: {
          totalTechnicians: perTechnician.length,
          totalDepartments: perDepartment.length,
          totalAvailableHours: Math.round(totalAvailableHours * 100) / 100,
          totalWorkedHours: Math.round(totalWorkedHours * 100) / 100,
          overallUtilizationPercent: overallUtilization,
          totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
          techniciansWithOvertime: techWithOvertime,
          avgOvertimePerTech,
        },
        perTechnician,
        perDepartment,
        overtimeAnalysis: {
          entries: overtimeEntries,
          totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
          technicianCount: techWithOvertime,
          averagePerTechnician: avgOvertimePerTech,
        },
        byTrade,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate labor utilization report';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
