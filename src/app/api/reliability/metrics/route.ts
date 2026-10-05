import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { authorizeAssetPlant, authorizeComponentPlant } from '@/lib/plant-auth-helpers';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'digital_twin.view') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const assetId = searchParams.get('assetId');
    const componentId = searchParams.get('componentId');

    if (!assetId && !componentId) {
      return NextResponse.json(
        { success: false, error: 'Either assetId or componentId is required' },
        { status: 400 },
      );
    }

    const plantAuth = componentId
      ? await authorizeComponentPlant(request, session, componentId)
      : await authorizeAssetPlant(request, session, assetId!);
    if (!plantAuth.ok) return plantAuth.response;

    // Build the where clause for failure records
    const failureWhere: Record<string, unknown> = {};
    if (componentId) {
      failureWhere.componentId = componentId;
    } else if (assetId) {
      failureWhere.assetId = assetId;
    }

    // Get all failures
    const failures = await db.failureRecord.findMany({
      where: failureWhere,
      orderBy: { detectedAt: 'asc' },
    });

    const totalDowntimeMinutes = failures.reduce((sum, f) => sum + f.downtimeMinutes, 0);

    // MTBF: Mean Time Between Failures (hours)
    const resolvedFailures = failures.filter((f) => f.resolvedAt);
    let mtbf = 0;
    if (resolvedFailures.length >= 2) {
      const sorted = resolvedFailures
        .filter((f) => f.detectedAt)
        .map((f) => f.detectedAt!.getTime())
        .sort((a, b) => a - b);
      if (sorted.length >= 2) {
        let totalHoursBetween = 0;
        for (let i = 1; i < sorted.length; i++) {
          totalHoursBetween += (sorted[i] - sorted[i - 1]) / (1000 * 60 * 60);
        }
        mtbf = totalHoursBetween / (sorted.length - 1);
      }
    }

    // MTTR: Mean Time To Repair (hours)
    let mttr = 0;
    const failuresWithResolution = resolvedFailures.filter((f) => f.downtimeMinutes > 0);
    if (failuresWithResolution.length > 0) {
      mttr = failuresWithResolution.reduce((sum, f) => sum + f.downtimeMinutes, 0) / failuresWithResolution.length / 60;
    }

    // Availability: MTBF / (MTBF + MTTR) as percentage
    let availability = 100;
    if (mtbf > 0 || mttr > 0) {
      availability = (mtbf / (mtbf + mttr)) * 100;
    }

    // Monthly breakdown (last 12 months)
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const monthlyData: Record<string, { failures: number; downtimeMinutes: number }> = {};
    for (const f of failures) {
      if (f.detectedAt && f.detectedAt >= twelveMonthsAgo) {
        const monthKey = `${f.detectedAt.getFullYear()}-${String(f.detectedAt.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { failures: 0, downtimeMinutes: 0 };
        }
        monthlyData[monthKey].failures += 1;
        monthlyData[monthKey].downtimeMinutes += f.downtimeMinutes;
      }
    }
    const monthlyBreakdown = Object.entries(monthlyData)
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Open failures
    const openFailures = failures.filter((f) => !f.resolvedAt).length;

    // Average repair cost
    const failuresWithCost = failures.filter((f) => f.repairCost !== null && f.repairCost > 0);
    const avgRepairCost = failuresWithCost.length > 0
      ? failuresWithCost.reduce((sum, f) => sum + (f.repairCost ?? 0), 0) / failuresWithCost.length
      : 0;

    // Total repair cost
    const totalRepairCost = failures.reduce((sum, f) => sum + (f.repairCost ?? 0), 0);

    return NextResponse.json({
      success: true,
      data: {
        mtbf: Math.round(mtbf * 100) / 100,
        mttr: Math.round(mttr * 100) / 100,
        availability: Math.round(availability * 100) / 100,
        failureCount: failures.length,
        openFailures,
        totalDowntimeMinutes,
        totalDowntimeHours: Math.round(totalDowntimeMinutes / 60 * 100) / 100,
        totalRepairCost: Math.round(totalRepairCost * 100) / 100,
        avgRepairCost: Math.round(avgRepairCost * 100) / 100,
        monthlyBreakdown,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to compute reliability metrics';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
