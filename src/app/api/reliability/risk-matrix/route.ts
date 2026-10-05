import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantFilterWhere, getPlantScope } from '@/lib/plant-scope';

function computeRiskLevel(score: number): string {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  if (score >= 20) return 'low';
  return 'minimal';
}

function getRiskColor(level: string): string {
  switch (level) {
    case 'critical': return '#ef4444';
    case 'high': return '#f97316';
    case 'medium': return '#eab308';
    case 'low': return '#22c55e';
    case 'minimal': return '#3b82f6';
    default: return '#6b7280';
  }
}

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
    const plantId = searchParams.get('plantId');

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }
    if (plantId && !canAccessPlantStrict(plantScope, plantId)) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    // Assets use an `isActive` flag; lifecycle status values are operational,
    // standby, under_maintenance, decommissioned, and disposed. Apply the
    // canonical plant scope first, then narrow to an explicitly requested plant.
    const assetWhere: Record<string, unknown> = {
      ...getPlantFilterWhere(plantScope),
      isActive: true,
      status: { notIn: ['decommissioned', 'disposed'] },
    };
    if (plantId) assetWhere.plantId = plantId;

    const assets = await db.asset.findMany({
      where: assetWhere,
      select: {
        id: true,
        name: true,
        assetTag: true,
        criticality: true,
        status: true,
        plantId: true,
        digitalTwin: { select: { healthScore: true } },
      },
    });

    if (assets.length === 0) {
      return NextResponse.json({
        success: true,
        data: { matrix: [], summary: { total: 0, byLevel: {} } },
      });
    }

    // For each asset, compute risk score
    const matrix = await Promise.all(
      assets.map(async (asset) => {
        let riskScore = 0;

        // Factor 1: Health score inverse (higher health = lower risk) — 0-30 pts.
        // Asset itself has no healthScore; the live value belongs to DigitalTwin.
        const healthScore = asset.digitalTwin?.healthScore ?? 100;
        const healthRisk = Math.round((100 - healthScore) * 0.3);
        riskScore += healthRisk;

        // Factor 2: Criticality (critical=30, high=20, medium=10, low=5) — 0-30 pts
        const criticalityMap: Record<string, number> = {
          critical: 30,
          high: 20,
          medium: 10,
          low: 5,
        };
        riskScore += criticalityMap[asset.criticality] || 10;

        // Factor 3: Recent failure count (last 30 days) — 0-20 pts
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentFailures = await db.failureRecord.count({
          where: {
            assetId: asset.id,
            detectedAt: { gte: thirtyDaysAgo },
          },
        });
        riskScore += Math.min(20, recentFailures * 5);

        // Factor 4: Open work orders — 0-20 pts
        const openWOs = await db.workOrder.count({
          where: {
            assetId: asset.id,
            status: { in: ['open', 'in_progress', 'assigned'] },
          },
        });
        riskScore += Math.min(20, openWOs * 4);

        riskScore = Math.min(100, riskScore);
        const level = computeRiskLevel(riskScore);

        return {
          assetId: asset.id,
          assetName: asset.name,
          assetTag: asset.assetTag,
          criticality: asset.criticality,
          healthScore,
          riskScore,
          riskLevel: level,
          riskColor: getRiskColor(level),
          recentFailures,
          openWorkOrders: openWOs,
        };
      }),
    );

    // Sort by risk score descending
    matrix.sort((a, b) => b.riskScore - a.riskScore);

    // Summary by risk level
    const summary: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      minimal: 0,
    };
    for (const item of matrix) {
      summary[item.riskLevel] = (summary[item.riskLevel] || 0) + 1;
    }

    return NextResponse.json({
      success: true,
      data: {
        matrix,
        summary: {
          total: matrix.length,
          byLevel: summary,
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to compute risk matrix';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
