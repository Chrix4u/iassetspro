import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KNOWN_GTP_BASELINES: Record<string, {
  sourceRows: number;
  breakdowns: number;
  priorityOne2025: number;
  priorityOneResponseMinutes: number;
  week32Breakdowns: number;
  staleCachedPivotBreakdowns: number;
}> = {
  b05a023b0486693ae54186f985e9a04b175571fabfc7a17f1b3963188a7967cc: {
    sourceRows: 2807,
    breakdowns: 411,
    priorityOne2025: 236,
    priorityOneResponseMinutes: 308180,
    week32Breakdowns: 6,
    staleCachedPivotBreakdowns: 412,
  },
};

function isoWeekNumber(date: Date): number {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session || !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Administrator access required' }, { status: 403 });
    }

    const sourceSha256 = String(new URL(request.url).searchParams.get('sourceSha256') || '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(sourceSha256)) {
      return NextResponse.json({ success: false, error: 'A valid sourceSha256 is required' }, { status: 400 });
    }

    const audits = await db.auditLog.findMany({
      where: {
        action: 'historical_import',
        entityType: 'work_order',
        newValues: { contains: sourceSha256 },
      },
      select: { entityId: true, plantId: true, newValues: true },
    });

    const plantIds = [...new Set(audits.map((row) => row.plantId).filter((value): value is string => Boolean(value)))];
    if (plantIds.length > 1) {
      return NextResponse.json({ success: false, error: 'Historical import audit rows span multiple plants unexpectedly' }, { status: 409 });
    }

    const workOrderIds = [...new Set(audits.map((row) => row.entityId).filter(Boolean))];
    const workOrders = workOrderIds.length
      ? await db.workOrder.findMany({
          where: { id: { in: workOrderIds } },
          select: {
            id: true,
            woNumber: true,
            type: true,
            priority: true,
            createdAt: true,
            actualStart: true,
            maintenanceRequestId: true,
            plantId: true,
          },
        })
      : [];

    const mrIds = [...new Set(workOrders.map((row) => row.maintenanceRequestId).filter((value): value is string => Boolean(value)))];
    const maintenanceRequests = mrIds.length
      ? await db.maintenanceRequest.findMany({
          where: { id: { in: mrIds } },
          select: { id: true, requestNumber: true, workOrderId: true, plantId: true },
        })
      : [];

    const woById = new Map(workOrders.map((row) => [row.id, row]));
    const linkedPairs = maintenanceRequests.filter((mr) => {
      if (!mr.workOrderId) return false;
      const wo = woById.get(mr.workOrderId);
      return Boolean(wo && wo.maintenanceRequestId === mr.id);
    }).length;

    const breakdowns = workOrders.filter((row) => row.type === 'breakdown');
    const priorityOne2025 = breakdowns.filter((row) =>
      row.priority === 'critical' && row.createdAt.getUTCFullYear() === 2025);
    const priorityOneResponseMinutes = round2(priorityOne2025.reduce((sum, row) => {
      if (!row.actualStart) return sum;
      const minutes = (row.actualStart.getTime() - row.createdAt.getTime()) / 60000;
      return sum + (Number.isFinite(minutes) && minutes >= 0 ? minutes : 0);
    }, 0));
    const week32Breakdowns = breakdowns.filter((row) =>
      row.createdAt.getUTCFullYear() === 2025 && isoWeekNumber(row.createdAt) === 32).length;

    const baseline = KNOWN_GTP_BASELINES[sourceSha256] || null;
    const metrics = {
      importedWorkOrders: workOrders.length,
      importedMaintenanceRequests: maintenanceRequests.length,
      auditRows: audits.length,
      linkedPairs,
      breakdowns: breakdowns.length,
      priorityOne2025: priorityOne2025.length,
      priorityOneResponseMinutes,
      week32Breakdowns,
    };

    const checks = baseline ? {
      sourceRows: metrics.importedWorkOrders === baseline.sourceRows,
      maintenanceRequests: metrics.importedMaintenanceRequests === baseline.sourceRows,
      auditRows: metrics.auditRows === baseline.sourceRows,
      linkedPairs: metrics.linkedPairs === baseline.sourceRows,
      breakdowns: metrics.breakdowns === baseline.breakdowns,
      priorityOne2025: metrics.priorityOne2025 === baseline.priorityOne2025,
      priorityOneResponseMinutes: Math.abs(metrics.priorityOneResponseMinutes - baseline.priorityOneResponseMinutes) < 0.01,
      week32Breakdowns: metrics.week32Breakdowns === baseline.week32Breakdowns,
    } : null;

    return NextResponse.json({
      success: true,
      data: {
        sourceSha256,
        migrationPlantId: plantIds[0] || null,
        baseline,
        metrics,
        checks,
        allPass: checks ? Object.values(checks).every(Boolean) : false,
        note: baseline
          ? 'Authoritative JobRecords values are compared to PostgreSQL. The stale cached Excel breakdown pivot is informational only and is not treated as the source of truth.'
          : 'No locked workbook baseline is registered for this source SHA-256.',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Post-import parity verification failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
