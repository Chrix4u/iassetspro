import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin, hasPermission } from '@/lib/auth';
import { IndustrialKpiService } from '@/services/industrialKpi.service';
import { getUnavailableOperationalModules } from '@/lib/module-access.server';

// GET /api/reporting/kpis?metric=dashboard|oee|reliability|backlog&plantId=...&days=...
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    // Permission check — must have reports.view or analytics.view, or be admin
    if (
      !isAdmin(session) &&
      !hasPermission(session, 'reports.view') &&
      !hasPermission(session, 'analytics.view')
    ) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const metric = searchParams.get('metric') || 'dashboard';
    const plantId = searchParams.get('plantId') || undefined;
    const days = parseInt(searchParams.get('days') || '30', 10);

    const requiredModulesByMetric: Record<string, string[]> = {
      dashboard: ['kpi_dashboard', 'oee', 'work_orders', 'failure_analysis', 'pm_schedules'],
      oee: ['oee', 'work_orders'],
      reliability: ['failure_analysis', 'work_orders', 'pm_schedules'],
      backlog: ['work_orders'],
    };
    const requiredModules = requiredModulesByMetric[metric];
    if (requiredModules) {
      const unavailable = await getUnavailableOperationalModules(requiredModules);
      if (unavailable.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'Required module is not licensed, enabled, and active',
            unavailableModules: unavailable,
          },
          { status: 403 },
        );
      }
    }

    switch (metric) {
      case 'dashboard': {
        const dashboard = await IndustrialKpiService.getKpiDashboard(plantId);
        return NextResponse.json({ success: true, data: dashboard });
      }

      case 'oee': {
        const oee = await IndustrialKpiService.calculateOEE(plantId, days);
        return NextResponse.json({ success: true, data: oee });
      }

      case 'reliability': {
        const reliability = await IndustrialKpiService.calculateReliability(plantId, days);
        return NextResponse.json({ success: true, data: reliability });
      }

      case 'backlog': {
        const backlog = await IndustrialKpiService.calculateBacklog(plantId);
        return NextResponse.json({ success: true, data: backlog });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown metric: ${metric}. Use dashboard, oee, reliability, or backlog.` },
          { status: 400 },
        );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'KPI calculation failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
