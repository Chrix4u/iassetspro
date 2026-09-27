import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasAnyPermission } from '@/lib/auth';
import { getPlantScope, getPlantFilterWhere } from '@/lib/plant-scope';

// GET /api/reports/repeat-failures
// Repeat failure analysis with pattern detection and recommended actions
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
    const minFailures = parseInt(searchParams.get('minFailures') || '3', 10);
    const timeWindowDays = parseInt(searchParams.get('window') || '90', 10);

    const plantScope = await getPlantScope(request, session);
    const plantFilter = getPlantFilterWhere(plantScope);

    const now = new Date();
    const windowStart = new Date(now.getTime() - timeWindowDays * 24 * 60 * 60 * 1000);

    const frFilter: Record<string, unknown> = {
      detectedAt: { gte: windowStart },
    };
    if (plantFilter && Object.keys(plantFilter).length > 0) {
      frFilter.asset = { ...plantFilter };
    }
    if (from) frFilter.detectedAt = { ...(frFilter.detectedAt as Record<string, unknown> || {}), gte: new Date(from + 'T00:00:00') };
    if (to) {
      const existing = frFilter.detectedAt as Record<string, unknown> || {};
      frFilter.detectedAt = { ...existing, lte: new Date(to + 'T23:59:59') };
    }

    // Fetch failure records with asset, component, work order data
    const failureRecords = await db.failureRecord.findMany({
      where: Object.keys(frFilter).length > 0 ? frFilter : undefined,
      include: {
        asset: { select: { id: true, name: true, assetTag: true, criticality: true } },
        component: { select: { id: true, name: true, componentCode: true, criticality: true, expectedLifeHours: true, operatingHours: true } },
        workOrder: { select: { id: true, woNumber: true, title: true, assignedTo: true } },
      },
      orderBy: { detectedAt: 'desc' },
    });

    // ========== ASSETS WITH N+ FAILURES ==========
    const assetFailures: Record<string, {
      assetId: string; assetName: string; assetTag: string; assetCriticality: string;
      failures: any[];
    }> = {};
    failureRecords.forEach(fr => {
      const key = fr.assetId || 'unknown';
      if (!assetFailures[key]) {
        assetFailures[key] = {
          assetId: key,
          assetName: fr.asset?.name || 'Unknown',
          assetTag: fr.asset?.assetTag || '',
          assetCriticality: fr.asset?.criticality || 'medium',
          failures: [],
        };
      }
      assetFailures[key].failures.push(fr);
    });

    const problematicAssets = Object.values(assetFailures)
      .filter(a => a.failures.length >= minFailures)
      .map(a => {
        const failureModes = [...new Set(a.failures.map(f => f.failureMode))];
        const totalDowntime = a.failures.reduce((s, f) => s + (f.downtimeMinutes || 0), 0);
        const totalCost = a.failures.reduce((s, f) => s + (f.repairCost || 0), 0);
        const firstDate = new Date(Math.min(...a.failures.map(f => new Date(f.detectedAt).getTime())));
        const lastDate = new Date(Math.max(...a.failures.map(f => new Date(f.detectedAt).getTime())));
        const daysBetween = Math.max(1, Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));
        const frequencyPerMonth = Math.round((a.failures.length / daysBetween) * 30 * 100) / 100;

        return {
          assetId: a.assetId,
          assetName: a.assetName,
          assetTag: a.assetTag,
          assetCriticality: a.assetCriticality,
          failureCount: a.failures.length,
          failureModes,
          totalDowntimeMinutes: totalDowntime,
          totalDowntimeHours: Math.round(totalDowntime / 60 * 100) / 100,
          totalRepairCost: Math.round(totalCost * 100) / 100,
          avgDowntimePerFailure: Math.round((totalDowntime / a.failures.length) * 100) / 100,
          frequencyPerMonth,
          firstFailureDate: firstDate.toISOString(),
          lastFailureDate: lastDate.toISOString(),
          daysBetween,
          recentFailures: a.failures.slice(0, 3).map(f => ({
            id: f.id,
            failureMode: f.failureMode,
            severity: f.failureSeverity,
            detectedAt: f.detectedAt.toISOString(),
            resolvedAt: f.resolvedAt?.toISOString() || null,
            rootCause: f.rootCause || null,
          })),
        };
      })
      .sort((a, b) => b.failureCount - a.failureCount);

    // ========== FAILURE PATTERN DETECTION ==========
    // Same failure mode on same asset
    const modePatterns: Record<string, { pattern: string; assetId: string; assetName: string; failureMode: string; count: number; failures: any[] }> = {};
    failureRecords.forEach(fr => {
      const assetKey = fr.assetId || 'unknown';
      const assetName = fr.asset?.name || 'Unknown';
      const mode = fr.failureMode || 'unknown';
      const patternKey = `${assetKey}::${mode}`;
      if (!modePatterns[patternKey]) {
        modePatterns[patternKey] = { pattern: `${assetName} - ${mode}`, assetId: assetKey, assetName, failureMode: mode, count: 0, failures: [] };
      }
      modePatterns[patternKey].count += 1;
      modePatterns[patternKey].failures.push(fr);
    });

    const failureModePatterns = Object.values(modePatterns)
      .filter(p => p.count >= minFailures)
      .map(p => ({
        assetId: p.assetId,
        assetName: p.assetName,
        failureMode: p.failureMode,
        count: p.count,
        totalDowntimeMinutes: p.failures.reduce((s, f) => s + (f.downtimeMinutes || 0), 0),
        totalCost: p.failures.reduce((s, f) => s + (f.repairCost || 0), 0),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Same component across different assets
    const componentPatterns: Record<string, { componentId: string; componentName: string; componentCode: string; assetIds: Set<string>; failureCount: number; totalCost: number }> = {};
    failureRecords.forEach(fr => {
      if (!fr.componentId) return;
      const key = fr.componentId;
      if (!componentPatterns[key]) {
        componentPatterns[key] = {
          componentId: key,
          componentName: fr.component?.name || 'Unknown',
          componentCode: fr.component?.componentCode || '',
          assetIds: new Set(),
          failureCount: 0,
          totalCost: 0,
        };
      }
      componentPatterns[key].assetIds.add(fr.assetId || 'unknown');
      componentPatterns[key].failureCount += 1;
      componentPatterns[key].totalCost += (fr.repairCost || 0);
    });

    const componentPatternsList = Object.values(componentPatterns)
      .filter(p => p.failureCount >= minFailures)
      .map(p => ({
        componentId: p.componentId,
        componentName: p.componentName,
        componentCode: p.componentCode,
        affectedAssetCount: p.assetIds.size,
        failureCount: p.failureCount,
        totalCost: Math.round(p.totalCost * 100) / 100,
      }))
      .sort((a, b) => b.failureCount - a.failureCount)
      .slice(0, 10);

    // ========== ROOT CAUSE FREQUENCY ==========
    const rootCauseMap: Record<string, { count: number; failureIds: string[] }> = {};
    failureRecords.forEach(fr => {
      const rc = fr.rootCause || 'Not documented';
      if (!rootCauseMap[rc]) rootCauseMap[rc] = { count: 0, failureIds: [] };
      rootCauseMap[rc].count += 1;
      rootCauseMap[rc].failureIds.push(fr.id);
    });

    const rootCauseFrequency = Object.entries(rootCauseMap)
      .map(([rootCause, data]) => ({
        rootCause: rootCause.length > 100 ? rootCause.substring(0, 100) + '...' : rootCause,
        count: data.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // ========== RECOMMENDED ACTIONS ==========
    const recommendedActions: Array<{ type: string; priority: string; assetId: string; assetName: string; action: string; reason: string }> = [];

    problematicAssets.forEach(asset => {
      // High failure frequency -> PM schedule review
      if (asset.frequencyPerMonth >= 2) {
        recommendedActions.push({
          type: 'pm_schedule_review',
          priority: asset.assetCriticality === 'critical' ? 'high' : 'medium',
          assetId: asset.assetId,
          assetName: asset.assetName,
          action: `Review and increase PM frequency for ${asset.assetName}`,
          reason: `Experiencing ${asset.frequencyPerMonth} failures/month (threshold: 2/month)`,
        });
      }

      // Same failure mode repeating -> component replacement
      if (asset.failureModes.length === 1 && asset.failureCount >= 3) {
        recommendedActions.push({
          type: 'component_replacement',
          priority: 'high',
          assetId: asset.assetId,
          assetName: asset.assetName,
          action: `Consider full component replacement for ${asset.assetName}`,
          reason: `${asset.failureCount} failures with same mode (${asset.failureModes[0]}), indicating recurring issue`,
        });
      }

      // High downtime -> root cause analysis
      if (asset.totalDowntimeHours >= 24) {
        recommendedActions.push({
          type: 'rca',
          priority: 'high',
          assetId: asset.assetId,
          assetName: asset.assetName,
          action: `Conduct thorough root cause analysis for ${asset.assetName}`,
          reason: `Accumulated ${asset.totalDowntimeHours}h downtime in the period`,
        });
      }

      // High repair cost -> replacement cost analysis
      if (asset.totalRepairCost >= 5000) {
        recommendedActions.push({
          type: 'replacement_analysis',
          priority: 'medium',
          assetId: asset.assetId,
          assetName: asset.assetName,
          action: `Perform replacement vs repair cost analysis for ${asset.assetName}`,
          reason: `Total repair cost of ${asset.totalRepairCost} may exceed replacement cost`,
        });
      }
    });

    // ========== SUMMARY ==========
    return NextResponse.json({
      success: true,
      data: {
        dateRange: {
          from: from || windowStart.toISOString(),
          to: to || now.toISOString(),
          windowDays: timeWindowDays,
        },
        summary: {
          totalFailureRecords: failureRecords.length,
          problematicAssetCount: problematicAssets.length,
          threshold: minFailures,
        },
        problematicAssets,
        failureModePatterns,
        componentPatterns: componentPatternsList,
        rootCauseFrequency,
        recommendedActions: recommendedActions.sort((a, b) => {
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          return (priorityOrder[a.priority as keyof typeof priorityOrder] || 2) - (priorityOrder[b.priority as keyof typeof priorityOrder] || 2);
        }),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate repeat failure analysis';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
