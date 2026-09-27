import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getComponentPlantAccess } from '@/lib/component-plant-access';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'digital_twin.view') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const componentAccess = await getComponentPlantAccess(request, session, id);
    if (!componentAccess.exists) {
      return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
    }
    if (!componentAccess.allowed) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const component = await db.componentRegistry.findUnique({
      where: { id },
      include: {
        asset: { select: { id: true } },
      },
    });

    if (!component) {
      return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
    }

    // Factor 1: Recent failures (weight 30%)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const recentFailures = await db.failureRecord.findMany({
      where: {
        componentId: id,
        detectedAt: { gte: ninetyDaysAgo },
      },
    });
    const criticalRecentFailures = recentFailures.filter(
      (f) => f.failureSeverity === 'critical' || f.failureSeverity === 'high',
    ).length;
    // Score: 0 failures = 100, each failure reduces score
    const failureScore = Math.max(0, 100 - (recentFailures.length * 15) - (criticalRecentFailures * 10));

    // Factor 2: Operating hours vs expected life (weight 25%)
    let lifeScore = 100;
    if (component.expectedLifeHours && component.expectedLifeHours > 0) {
      const lifeUsedPercent = (component.operatingHours / component.expectedLifeHours) * 100;
      if (lifeUsedPercent > 90) {
        lifeScore = 10;
      } else if (lifeUsedPercent > 75) {
        lifeScore = 30;
      } else if (lifeUsedPercent > 50) {
        lifeScore = 60;
      } else if (lifeUsedPercent > 25) {
        lifeScore = 80;
      }
    }

    // Factor 3: Days since last inspection (weight 20%)
    let inspectionScore = 100;
    if (component.lastInspection) {
      const daysSinceInspection = Math.floor(
        (Date.now() - component.lastInspection.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysSinceInspection > 365) {
        inspectionScore = 10;
      } else if (daysSinceInspection > 180) {
        inspectionScore = 30;
      } else if (daysSinceInspection > 90) {
        inspectionScore = 50;
      } else if (daysSinceInspection > 30) {
        inspectionScore = 80;
      }
    } else if (component.lifecycleStatus === 'operational') {
      // No inspection record - penalize
      inspectionScore = 40;
    }

    // Factor 4: IoT health data (weight 25%)
    let iotScore = 100;
    if (component.assetId) {
      const activeIotAlerts = await db.iotAlert.count({
        where: {
          device: { assetId: component.assetId },
          status: { in: ['active'] },
          severity: { in: ['warning', 'critical'] },
        },
      });

      if (activeIotAlerts >= 5) {
        iotScore = 10;
      } else if (activeIotAlerts >= 3) {
        iotScore = 30;
      } else if (activeIotAlerts >= 1) {
        iotScore = 60;
      }
    }

    // Weighted composite score
    const healthScore = Math.round(
      (failureScore * 0.30) +
      (lifeScore * 0.25) +
      (inspectionScore * 0.20) +
      (iotScore * 0.25),
    );

    const clampedScore = Math.max(0, Math.min(100, healthScore));

    // Generate recommendations based on factors
    const recommendations: string[] = [];

    if (failureScore < 50) {
      recommendations.push('High recent failure rate — consider root cause analysis and preventive maintenance schedule review');
    }
    if (criticalRecentFailures > 0) {
      recommendations.push(`${criticalRecentFailures} critical/high severity failure(s) in the last 90 days — immediate investigation recommended`);
    }
    if (lifeScore < 40) {
      recommendations.push('Component approaching or exceeding expected life — plan for replacement or major overhaul');
    }
    if (inspectionScore < 40) {
      recommendations.push('Inspection overdue — schedule maintenance inspection immediately');
    }
    if (iotScore < 40) {
      recommendations.push('Active IoT alerts detected — review sensor data and address anomalies');
    }
    if (clampedScore >= 80) {
      recommendations.push('Component health is good — maintain current maintenance schedule');
    }

    return NextResponse.json({
      success: true,
      data: {
        componentId: id,
        componentCode: component.componentCode,
        componentName: component.name,
        healthScore: clampedScore,
        factors: {
          failure: { score: failureScore, weight: 0.30, recentFailureCount: recentFailures.length, criticalFailures: criticalRecentFailures },
          lifecycle: { score: lifeScore, weight: 0.25, operatingHours: component.operatingHours, expectedLifeHours: component.expectedLifeHours },
          inspection: { score: inspectionScore, weight: 0.20, lastInspection: component.lastInspection, nextInspectionDue: component.nextInspectionDue },
          iot: { score: iotScore, weight: 0.25 },
        },
        recommendations,
        computedAt: new Date().toISOString(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to compute health score';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
