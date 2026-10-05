import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { authorizeAssetPlant, authorizeDigitalTwinPlant } from '@/lib/plant-auth-helpers';

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
    const twinId = searchParams.get('twinId');
    const assetId = searchParams.get('assetId');

    if (!twinId && !assetId) {
      return NextResponse.json(
        { success: false, error: 'Either twinId or assetId is required' },
        { status: 400 },
      );
    }

    const plantAuth = twinId
      ? await authorizeDigitalTwinPlant(request, session, twinId)
      : await authorizeAssetPlant(request, session, assetId!);
    if (!plantAuth.ok) return plantAuth.response;

    // Get components
    const componentWhere: Record<string, unknown> = {};
    if (twinId) {
      componentWhere.twinId = twinId;
    } else if (assetId) {
      componentWhere.assetId = assetId;
    }

    const components = await db.componentRegistry.findMany({
      where: componentWhere,
      select: {
        id: true,
        componentCode: true,
        name: true,
        criticality: true,
        healthScore: true,
        operatingHours: true,
        expectedLifeHours: true,
        assetId: true,
      },
    });

    if (components.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Score each component
    const ranked = await Promise.all(
      components.map(async (comp) => {
        let score = 0;

        // Factor 1: Criticality level (0-40 pts)
        const criticalityScores: Record<string, number> = {
          critical: 40,
          high: 30,
          medium: 20,
          low: 10,
        };
        score += criticalityScores[comp.criticality] || 20;

        // Factor 2: Failure frequency (0-25 pts)
        const failureCount = await db.failureRecord.count({
          where: { componentId: comp.id },
        });
        score += Math.min(25, failureCount * 3);

        // Factor 3: Downtime impact (0-20 pts)
        const failures = await db.failureRecord.findMany({
          where: { componentId: comp.id },
          select: { downtimeMinutes: true },
        });
        const totalDowntime = failures.reduce((sum, f) => sum + f.downtimeMinutes, 0);
        const downtimeHours = totalDowntime / 60;
        // Max 20 pts at 100+ hours downtime
        score += Math.min(20, Math.round(downtimeHours * 0.5));

        // Factor 4: Health score inverse (0-10 pts)
        score += Math.round((100 - (comp.healthScore ?? 100)) / 10);

        // Factor 5: IoT alert count (0-5 pts)
        let iotAlertCount = 0;
        if (comp.assetId) {
          iotAlertCount = await db.iotAlert.count({
            where: {
              device: { assetId: comp.assetId },
              status: { in: ['active', 'acknowledged'] },
            },
          });
        }
        score += Math.min(5, iotAlertCount);

        return {
          componentId: comp.id,
          componentCode: comp.componentCode,
          componentName: comp.name,
          criticality: comp.criticality,
          healthScore: comp.healthScore,
          operatingHours: comp.operatingHours,
          expectedLifeHours: comp.expectedLifeHours,
          failureCount,
          totalDowntimeMinutes: totalDowntime,
          totalDowntimeHours: Math.round(downtimeHours * 100) / 100,
          iotAlertCount,
          criticalityScore: score,
        };
      }),
    );

    // Sort by score descending (highest criticality first)
    ranked.sort((a, b) => b.criticalityScore - a.criticalityScore);

    return NextResponse.json({ success: true, data: ranked });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to compute criticality ranking';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
