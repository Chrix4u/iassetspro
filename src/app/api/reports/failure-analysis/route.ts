import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasAnyPermission } from '@/lib/auth';
import { getPlantScope, getPlantFilterWhere } from '@/lib/plant-scope';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasAnyPermission(session, ['reports.view', 'reports.export', 'analytics.view']) && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions: reports.view required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const moduleFilter = searchParams.get('moduleFilter') || 'all';

    // Resolve plant scope
    const plantScope = await getPlantScope(request, session);
    const plantFilter = getPlantFilterWhere(plantScope, 'plantId');

    // Build where clause for FailureRecord
    const dateFilter: Record<string, unknown> = {};
    if (from) dateFilter.gte = new Date(from + 'T00:00:00');
    if (to) dateFilter.lte = new Date(to + 'T23:59:59');

    const where: Record<string, unknown> = {};
    if (Object.keys(dateFilter).length > 0) where.detectedAt = dateFilter;
    if (Object.keys(plantFilter).length > 0) {
      (where as Record<string, unknown>).asset = plantFilter;
    }

    // Fetch failure records with relations
    const failureRecords = await db.failureRecord.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        asset: { select: { id: true, name: true, assetTag: true, manufacturer: true, model: true, plantId: true, criticality: true, location: true, building: true, area: true, categoryId: true, status: true, createdAt: true } },
        component: { select: { id: true, name: true, componentCode: true } },
        workOrder: { select: { id: true, woNumber: true, type: true, status: true, assetId: true, assetName: true, tradeActivity: true, totalCost: true, laborCost: true, partsCost: true, repairCompletion: { select: { rootCause: true, correctiveAction: true, reworkCount: true } } } },
      },
      orderBy: { detectedAt: 'desc' },
    });

    // Batch fetch asset categories
    const assetIds = [...new Set(failureRecords.map(fr => fr.assetId).filter((id): id is string => !!id))];
    const assets = assetIds.length > 0 ? await db.asset.findMany({
      where: { id: { in: assetIds } },
      include: { category: { select: { name: true } } },
    }) : [];
    const assetCategoryMap = new Map(assets.map(a => [a.id, a.category?.name || 'Uncategorized']));

    // Fetch WOs with repairCompletion for additional RCA data (WOs that completed in date range)
    const woWhere: Record<string, unknown> = { status: { in: ['completed', 'verified', 'closed'] } };
    if (from || to) {
      const woDateFilter: Record<string, unknown> = {};
      if (from) woDateFilter.gte = new Date(from + 'T00:00:00');
      if (to) woDateFilter.lte = new Date(to + 'T23:59:59');
      (woWhere as Record<string, unknown>).actualEnd = woDateFilter;
    }
    if (Object.keys(plantFilter).length > 0) {
      Object.assign(woWhere, plantFilter);
    }
    if (moduleFilter === 'repairs') {
      (woWhere as Record<string, unknown>).type = { in: ['breakdown', 'corrective', 'emergency'] };
    } else if (moduleFilter === 'pm') {
      (woWhere as Record<string, unknown>).type = 'preventive';
    }

    const completedWOs = await db.workOrder.findMany({
      where: woWhere,
      select: { id: true, assetId: true, assetName: true, totalCost: true, repairCompletion: { select: { rootCause: true, correctiveAction: true, reworkCount: true } } },
    });

    // ── Compute summary ──────────────────────────────────────────────────
    const totalFailures = failureRecords.length;
    const totalDowntimeMinutes = failureRecords.reduce((s, fr) => s + (fr.downtimeMinutes || 0), 0);
    const totalRepairCost = failureRecords.reduce((s, fr) => s + (fr.repairCost || 0), 0);
    const avgDowntimePerFailure = totalFailures > 0 ? Math.round(totalDowntimeMinutes / totalFailures) : 0;

    // Most common failure mode
    const modeCount: Record<string, number> = {};
    failureRecords.forEach(fr => { modeCount[fr.failureMode] = (modeCount[fr.failureMode] || 0) + 1; });
    const mostCommonMode = Object.entries(modeCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    // Most common root cause (from failureRecord.rootCause and repairCompletion.rootCause)
    const causeCount: Record<string, number> = {};
    failureRecords.forEach(fr => {
      const rc = fr.rootCause || fr.workOrder?.repairCompletion?.rootCause || 'Unknown';
      causeCount[rc] = (causeCount[rc] || 0) + 1;
    });
    const mostCommonCause = Object.entries(causeCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    // ── By Failure Mode ──────────────────────────────────────────────────
    const byModeMap: Record<string, { count: number; totalDowntimeMinutes: number; totalRepairCost: number; severities: Record<string, number> }> = {};
    failureRecords.forEach(fr => {
      const mode = fr.failureMode;
      if (!byModeMap[mode]) byModeMap[mode] = { count: 0, totalDowntimeMinutes: 0, totalRepairCost: 0, severities: {} };
      byModeMap[mode].count += 1;
      byModeMap[mode].totalDowntimeMinutes += fr.downtimeMinutes || 0;
      byModeMap[mode].totalRepairCost += fr.repairCost || 0;
      byModeMap[mode].severities[fr.failureSeverity] = (byModeMap[mode].severities[fr.failureSeverity] || 0) + 1;
    });
    const byFailureMode = Object.entries(byModeMap)
      .map(([mode, d]) => ({
        mode,
        count: d.count,
        totalDowntimeMinutes: d.totalDowntimeMinutes,
        totalRepairCost: Math.round(d.totalRepairCost * 100) / 100,
        avgDowntime: d.count > 0 ? Math.round(d.totalDowntimeMinutes / d.count) : 0,
        severityDistribution: {
          critical: d.severities.critical || 0,
          high: d.severities.high || 0,
          medium: d.severities.medium || 0,
          low: d.severities.low || 0,
        },
      }))
      .sort((a, b) => b.count - a.count);

    // ── By Root Cause ────────────────────────────────────────────────────
    const byCauseMap: Record<string, { count: number; totalDowntimeMinutes: number; totalRepairCost: number; actions: Set<string> }> = {};
    failureRecords.forEach(fr => {
      const cause = fr.rootCause || fr.workOrder?.repairCompletion?.rootCause || 'Unknown';
      if (!byCauseMap[cause]) byCauseMap[cause] = { count: 0, totalDowntimeMinutes: 0, totalRepairCost: 0, actions: new Set() };
      byCauseMap[cause].count += 1;
      byCauseMap[cause].totalDowntimeMinutes += fr.downtimeMinutes || 0;
      byCauseMap[cause].totalRepairCost += fr.repairCost || 0;
      const action = fr.correctiveAction || fr.workOrder?.repairCompletion?.correctiveAction || '';
      if (action) byCauseMap[cause].actions.add(action);
    });
    const byRootCause = Object.entries(byCauseMap)
      .map(([cause, d]) => ({
        cause,
        count: d.count,
        totalDowntimeMinutes: d.totalDowntimeMinutes,
        totalRepairCost: Math.round(d.totalRepairCost * 100) / 100,
        correctiveActions: [...d.actions],
      }))
      .sort((a, b) => b.count - a.count);

    // ── By Severity ──────────────────────────────────────────────────────
    const bySeverityMap: Record<string, { count: number; totalDowntimeMinutes: number; totalRepairCost: number }> = {};
    failureRecords.forEach(fr => {
      const sev = fr.failureSeverity;
      if (!bySeverityMap[sev]) bySeverityMap[sev] = { count: 0, totalDowntimeMinutes: 0, totalRepairCost: 0 };
      bySeverityMap[sev].count += 1;
      bySeverityMap[sev].totalDowntimeMinutes += fr.downtimeMinutes || 0;
      bySeverityMap[sev].totalRepairCost += fr.repairCost || 0;
    });
    const severityOrder = ['critical', 'high', 'medium', 'low'];
    const bySeverity = severityOrder
      .filter(s => bySeverityMap[s])
      .map(severity => ({ severity, ...bySeverityMap[severity], totalRepairCost: Math.round(bySeverityMap[severity].totalRepairCost * 100) / 100 }));

    // ── By Asset ─────────────────────────────────────────────────────────
    const byAssetMap: Record<string, { assetId: string; assetName: string; assetTag: string; manufacturer: string; model: string; category: string; criticality: string; location: string; failures: { downtime: number; cost: number; mode: string; cause: string; detectedAt: Date }[] }> = {};
    failureRecords.forEach(fr => {
      const aId = fr.assetId || '';
      if (!aId) return;
      const a = fr.asset;
      const key = aId;
      if (!byAssetMap[key]) {
        byAssetMap[key] = {
          assetId: aId,
          assetName: a?.name || 'Unknown',
          assetTag: a?.assetTag || '',
          manufacturer: a?.manufacturer || '',
          model: a?.model || '',
          category: assetCategoryMap.get(aId) || '',
          criticality: a?.criticality || 'medium',
          location: a?.location ? `${a.location}${a.building ? ` / ${a.building}` : ''}` : '',
          failures: [],
        };
      }
      const cause = fr.rootCause || fr.workOrder?.repairCompletion?.rootCause || 'Unknown';
      byAssetMap[key].failures.push({
        downtime: fr.downtimeMinutes || 0,
        cost: fr.repairCost || 0,
        mode: fr.failureMode,
        cause,
        detectedAt: fr.detectedAt,
      });
    });

    const byAsset = Object.values(byAssetMap).map(a => {
      const failureCount = a.failures.length;
      const totalDowntimeMinutes = a.failures.reduce((s, f) => s + f.downtime, 0);
      const totalRepairCost = a.failures.reduce((s, f) => s + f.cost, 0);

      // Dominant mode
      const modeMap: Record<string, number> = {};
      const causeMap: Record<string, number> = {};
      a.failures.forEach(f => { modeMap[f.mode] = (modeMap[f.mode] || 0) + 1; causeMap[f.cause] = (causeMap[f.cause] || 0) + 1; });
      const dominantMode = Object.entries(modeMap).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
      const dominantCause = Object.entries(causeMap).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

      // MTBF: days between first and last failure / (failure count - 1)
      const sorted = a.failures.map(f => f.detectedAt.getTime()).sort((a, b) => a - b);
      let mtbfDays = 0;
      if (sorted.length >= 2) {
        const spanDays = (sorted[sorted.length - 1] - sorted[0]) / (1000 * 60 * 60 * 24);
        mtbfDays = Math.round(spanDays / (sorted.length - 1));
      }

      return {
        assetId: a.assetId,
        assetName: a.assetName,
        assetTag: a.assetTag,
        manufacturer: a.manufacturer,
        model: a.model,
        category: a.category,
        criticality: a.criticality,
        location: a.location,
        failureCount,
        totalDowntimeMinutes,
        totalRepairCost: Math.round(totalRepairCost * 100) / 100,
        dominantMode,
        dominantCause,
        mtbfDays,
      };
    }).sort((a, b) => b.failureCount - a.failureCount);

    // ── By Component ─────────────────────────────────────────────────────
    const byComponentMap: Record<string, { componentName: string; componentCode: string; assetName: string; failures: { cost: number; mode: string }[] }> = {};
    failureRecords.forEach(fr => {
      const c = fr.component;
      const key = fr.componentId;
      if (!byComponentMap[key]) {
        byComponentMap[key] = {
          componentName: c?.name || 'Unknown',
          componentCode: c?.componentCode || '',
          assetName: fr.asset?.name || 'Unknown',
          failures: [],
        };
      }
      byComponentMap[key].failures.push({ cost: fr.repairCost || 0, mode: fr.failureMode });
    });
    const byComponent = Object.values(byComponentMap).map(c => {
      const failureCount = c.failures.length;
      const totalRepairCost = c.failures.reduce((s, f) => s + f.cost, 0);
      const modeMap: Record<string, number> = {};
      c.failures.forEach(f => { modeMap[f.mode] = (modeMap[f.mode] || 0) + 1; });
      const mostCommonMode = Object.entries(modeMap).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
      return { componentName: c.componentName, componentCode: c.componentCode, assetName: c.assetName, failureCount, totalRepairCost: Math.round(totalRepairCost * 100) / 100, mostCommonMode };
    }).sort((a, b) => b.failureCount - a.failureCount);

    // ── Monthly Trend ────────────────────────────────────────────────────
    const monthlyMap: Record<string, { failureCount: number; downtimeMinutes: number; repairCost: number }> = {};
    failureRecords.forEach(fr => {
      const month = fr.detectedAt.toISOString().slice(0, 7); // YYYY-MM
      if (!monthlyMap[month]) monthlyMap[month] = { failureCount: 0, downtimeMinutes: 0, repairCost: 0 };
      monthlyMap[month].failureCount += 1;
      monthlyMap[month].downtimeMinutes += fr.downtimeMinutes || 0;
      monthlyMap[month].repairCost += fr.repairCost || 0;
    });
    const monthlyTrend = Object.entries(monthlyMap)
      .map(([month, d]) => ({ month, failureCount: d.failureCount, downtimeMinutes: d.downtimeMinutes, repairCost: Math.round(d.repairCost * 100) / 100 }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // ── Pareto: Failure Modes ────────────────────────────────────────────
    const paretoModesSorted = [...byFailureMode].sort((a, b) => b.count - a.count);
    const totalModes = paretoModesSorted.reduce((s, m) => s + m.count, 0);
    let cumPercent = 0;
    const paretoModes = paretoModesSorted.map(m => {
      cumPercent += totalModes > 0 ? (m.count / totalModes) * 100 : 0;
      return { mode: m.mode, count: m.count, cumulativePercent: Math.round(cumPercent * 10) / 10 };
    });

    // ── Pareto: Root Causes ──────────────────────────────────────────────
    const paretoCausesSorted = [...byRootCause].sort((a, b) => b.count - a.count);
    const totalCauses = paretoCausesSorted.reduce((s, c) => s + c.count, 0);
    cumPercent = 0;
    const paretoCauses = paretoCausesSorted.map(c => {
      cumPercent += totalCauses > 0 ? (c.count / totalCauses) * 100 : 0;
      return { cause: c.cause, count: c.count, cumulativePercent: Math.round(cumPercent * 10) / 10 };
    });

    // ── Rework Analysis ──────────────────────────────────────────────────
    const totalCompleted = completedWOs.length;
    let reworkCount = 0;
    const reworkByAssetMap: Record<string, { assetName: string; reworkCount: number; totalCost: number }> = {};
    completedWOs.forEach(wo => {
      const rc = wo.repairCompletion?.reworkCount || 0;
      if (rc > 0) {
        reworkCount += rc;
        const aId = wo.assetId || '';
        const aName = wo.assetName || 'Unknown';
        if (!reworkByAssetMap[aId]) reworkByAssetMap[aId] = { assetName: aName, reworkCount: 0, totalCost: 0 };
        reworkByAssetMap[aId].reworkCount += rc;
        reworkByAssetMap[aId].totalCost += wo.totalCost || 0;
      }
    });
    const reworkByAsset = Object.values(reworkByAssetMap).map(a => ({
      assetName: a.assetName,
      reworkCount: a.reworkCount,
      totalCost: Math.round(a.totalCost * 100) / 100,
    })).sort((a, b) => b.reworkCount - a.reworkCount);

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalFailures,
          totalDowntimeMinutes,
          totalRepairCost: Math.round(totalRepairCost * 100) / 100,
          avgDowntimePerFailure,
          mostCommonMode,
          mostCommonCause,
        },
        byFailureMode,
        byRootCause,
        bySeverity,
        byAsset,
        byComponent,
        monthlyTrend,
        paretoModes,
        paretoCauses,
        reworkAnalysis: {
          totalCompleted,
          reworkCount,
          reworkRate: totalCompleted > 0 ? Math.round((reworkCount / totalCompleted) * 1000) / 10 : 0,
          reworkByAsset,
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}