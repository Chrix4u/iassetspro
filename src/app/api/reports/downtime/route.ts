import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasAnyPermission } from '@/lib/auth';
import { getPlantScope, getPlantFilterWhere } from '@/lib/plant-scope';
import { getAssetLiveLocationMap } from '@/lib/functional-location/live-location';
import { resolveFunctionalLocationReportScope } from '@/lib/functional-location/reporting';
import { getMaintenanceLocationSnapshot } from '@/lib/functional-location/maintenance-snapshot';

// GET /api/reports/downtime
// Detailed downtime analysis with MTBF, MTTR, availability, trending, top assets, cost impact
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
    const assetId = searchParams.get('assetId');
    const functionalLocationId = searchParams.get('functionalLocationId');
    const trendGrouping = searchParams.get('grouping') || 'weekly'; // daily, weekly, monthly

    const plantScope = await getPlantScope(request, session);
    const plantFilter = getPlantFilterWhere(plantScope);
    const locationScope = functionalLocationId
      ? await resolveFunctionalLocationReportScope(functionalLocationId)
      : null;

    const dtFilter: Record<string, unknown> = {};
    const downtimeWorkOrderFilter: Record<string, unknown> = { ...plantFilter };
    if (locationScope) downtimeWorkOrderFilter.AND = [locationScope.workOrderFilter];
    if (Object.keys(downtimeWorkOrderFilter).length > 0) {
      dtFilter.workOrder = downtimeWorkOrderFilter;
    }
    if (from) dtFilter.downtimeStart = { ...(dtFilter.downtimeStart as Record<string, unknown> || {}), gte: new Date(from + 'T00:00:00') };
    if (to) {
      const existing = dtFilter.downtimeStart as Record<string, unknown> || {};
      dtFilter.downtimeStart = { ...existing, lte: new Date(to + 'T23:59:59') };
    }
    if (assetId) dtFilter.assetId = assetId;

    // Fetch all downtime records
    const downtimeRecords = await db.workOrderDowntime.findMany({
      where: Object.keys(dtFilter).length > 0 ? dtFilter : undefined,
      include: {
        workOrder: {
          select: {
            id: true,
            woNumber: true,
            title: true,
            priority: true,
            status: true,
            functionalLocationIdSnapshot: true,
            functionalLocationSourceSnapshot: true,
            functionalLocationCodeSnapshot: true,
            functionalLocationPathSnapshot: true,
            functionalLocationPathCodeSnapshot: true,
          },
        },
      },
      orderBy: { downtimeStart: 'desc' },
    });

    // Fetch completed WOs for MTBF/MTTR calculation
    const woFilter: Record<string, unknown> = { ...plantFilter, status: { in: ['completed', 'verified', 'closed'] } };
    if (locationScope) woFilter.AND = [locationScope.workOrderFilter];
    if (from) woFilter.actualEnd = { ...(woFilter.actualEnd as Record<string, unknown> || {}), gte: new Date(from + 'T00:00:00') };
    if (to) {
      const existingEnd = woFilter.actualEnd as Record<string, unknown> || {};
      woFilter.actualEnd = { ...existingEnd, lte: new Date(to + 'T23:59:59') };
    }

    const completedWOs = await db.workOrder.findMany({
      where: Object.keys(woFilter).length > 0 ? woFilter : undefined,
      select: { id: true, actualStart: true, actualEnd: true, assetId: true, assetName: true, plantId: true },
    });

    const downtimeAssetIds = [...new Set(downtimeRecords.map((dt) => dt.assetId).filter((id): id is string => !!id))];
    const liveLocations = await getAssetLiveLocationMap(downtimeAssetIds);

    // ========== CORE METRICS ==========
    const totalEvents = downtimeRecords.length;
    const totalDowntimeMinutes = downtimeRecords.reduce((sum, dt) => sum + (dt.durationMinutes || 0), 0);
    const totalDowntimeHours = Math.round(totalDowntimeMinutes / 60 * 100) / 100;

    // MTTR: Mean Time To Repair = total downtime / number of repair events
    const mttrMinutes = totalEvents > 0 ? Math.round(totalDowntimeMinutes / totalEvents) : 0;
    const mttrHours = Math.round(mttrMinutes / 60 * 100) / 100;

    // MTBF: Mean Time Between Failures
    // Calculate from completed WOs: time between consecutive completions per asset
    const assetCompletionTimes: Record<string, Date[]> = {};
    completedWOs.forEach(wo => {
      if (wo.actualEnd) {
        const key = wo.assetId || wo.id;
        if (!assetCompletionTimes[key]) assetCompletionTimes[key] = [];
        assetCompletionTimes[key].push(new Date(wo.actualEnd));
      }
    });

    const mtbfIntervals: number[] = [];
    Object.values(assetCompletionTimes).forEach(dates => {
      dates.sort((a, b) => a.getTime() - b.getTime());
      for (let i = 1; i < dates.length; i++) {
        const hours = (dates[i].getTime() - dates[i - 1].getTime()) / (1000 * 60 * 60);
        if (hours > 0 && hours < 8760) mtbfIntervals.push(hours); // skip > 1 year gaps
      }
    });

    const mtbfHours = mtbfIntervals.length > 0
      ? Math.round((mtbfIntervals.reduce((a, b) => a + b, 0) / mtbfIntervals.length) * 100) / 100
      : 0;

    // Availability % = MTBF / (MTBF + MTTR) * 100
    const availabilityPercent = (mtbfHours + mttrHours) > 0
      ? Math.round((mtbfHours / (mtbfHours + mttrHours)) * 10000) / 100
      : 100;

    // ========== BREAKDOWN BY ASSET ==========
    const assetMap: Record<string, {
      assetId: string | null;
      assetName: string;
      functionalLocationCode: string | null;
      functionalLocationPath: string | null;
      functionalLocationPathCode: string | null;
      events: number;
      totalMinutes: number;
      plannedMinutes: number;
      unplannedMinutes: number;
      productionLoss: number;
    }> = {};
    downtimeRecords.forEach(dt => {
      const assetKey = dt.assetId || dt.assetName || 'Unknown';
      const name = dt.assetName || 'Unknown';
      const liveLocation = dt.assetId ? liveLocations.get(dt.assetId) ?? null : null;
      const maintenanceLocation = getMaintenanceLocationSnapshot(dt.workOrder, liveLocation);
      if (!assetMap[assetKey]) {
        assetMap[assetKey] = {
          assetId: dt.assetId || null,
          assetName: name,
          functionalLocationCode: maintenanceLocation?.locationCode ?? null,
          functionalLocationPath: maintenanceLocation?.path || null,
          functionalLocationPathCode: maintenanceLocation?.pathCode || maintenanceLocation?.path || null,
          events: 0,
          totalMinutes: 0,
          plannedMinutes: 0,
          unplannedMinutes: 0,
          productionLoss: 0,
        };
      }
      assetMap[assetKey].events += 1;
      assetMap[assetKey].totalMinutes += (dt.durationMinutes || 0);
      if (dt.category === 'planned') assetMap[assetKey].plannedMinutes += (dt.durationMinutes || 0);
      else assetMap[assetKey].unplannedMinutes += (dt.durationMinutes || 0);
      assetMap[assetKey].productionLoss += (dt.productionLoss || 0);
    });
    const breakdownByAsset = Object.values(assetMap)
      .map((data) => ({
        assetId: data.assetId,
        assetName: data.assetName,
        functionalLocationCode: data.functionalLocationCode,
        functionalLocationPath: data.functionalLocationPath,
        functionalLocationPathCode: data.functionalLocationPathCode,
        events: data.events,
        totalMinutes: data.totalMinutes,
        totalHours: Math.round(data.totalMinutes / 60 * 100) / 100,
        plannedHours: Math.round(data.plannedMinutes / 60 * 100) / 100,
        unplannedHours: Math.round(data.unplannedMinutes / 60 * 100) / 100,
        productionLoss: Math.round(data.productionLoss * 100) / 100,
      }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes);

    // ========== BREAKDOWN BY CATEGORY ==========
    const catMap: Record<string, { events: number; totalMinutes: number }> = {};
    downtimeRecords.forEach(dt => {
      const cat = dt.category || 'unplanned';
      if (!catMap[cat]) catMap[cat] = { events: 0, totalMinutes: 0 };
      catMap[cat].events += 1;
      catMap[cat].totalMinutes += (dt.durationMinutes || 0);
    });
    const breakdownByCategory = Object.entries(catMap).map(([category, data]) => ({
      category,
      events: data.events,
      totalMinutes: data.totalMinutes,
      totalHours: Math.round(data.totalMinutes / 60 * 100) / 100,
    }));

    // ========== BREAKDOWN BY REASON ==========
    const reasonMap: Record<string, { events: number; totalMinutes: number }> = {};
    downtimeRecords.forEach(dt => {
      const reason = dt.reason || 'Unknown';
      const key = reason.length > 50 ? reason.substring(0, 50) : reason;
      if (!reasonMap[key]) reasonMap[key] = { events: 0, totalMinutes: 0 };
      reasonMap[key].events += 1;
      reasonMap[key].totalMinutes += (dt.durationMinutes || 0);
    });
    const breakdownByReason = Object.entries(reasonMap)
      .map(([reason, data]) => ({ reason, events: data.events, totalMinutes: data.totalMinutes, totalHours: Math.round(data.totalMinutes / 60 * 100) / 100 }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes)
      .slice(0, 10);

    // ========== BREAKDOWN BY SHIFT ==========
    const shiftMap: Record<string, { events: number; totalMinutes: number }> = {};
    downtimeRecords.forEach(dt => {
      const hour = new Date(dt.downtimeStart).getHours();
      let shift: string;
      if (hour >= 6 && hour < 14) shift = 'Morning (6-14)';
      else if (hour >= 14 && hour < 22) shift = 'Afternoon (14-22)';
      else shift = 'Night (22-6)';
      if (!shiftMap[shift]) shiftMap[shift] = { events: 0, totalMinutes: 0 };
      shiftMap[shift].events += 1;
      shiftMap[shift].totalMinutes += (dt.durationMinutes || 0);
    });
    const breakdownByShift = Object.entries(shiftMap).map(([shift, data]) => ({
      shift,
      events: data.events,
      totalMinutes: data.totalMinutes,
      totalHours: Math.round(data.totalMinutes / 60 * 100) / 100,
    }));

    // ========== TRENDING ==========
    const trendMap: Record<string, number> = {};
    downtimeRecords.forEach(dt => {
      const d = new Date(dt.downtimeStart);
      let key: string;
      if (trendGrouping === 'daily') {
        key = d.toISOString().split('T')[0];
      } else if (trendGrouping === 'monthly') {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      } else {
        // weekly
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        key = weekStart.toISOString().split('T')[0];
      }
      trendMap[key] = (trendMap[key] || 0) + (dt.durationMinutes || 0);
    });
    const trending = Object.entries(trendMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, totalMinutes]) => ({
        period,
        totalMinutes,
        totalHours: Math.round(totalMinutes / 60 * 100) / 100,
      }));

    // ========== TOP 10 ASSETS BY DOWNTIME ==========
    const top10Assets = breakdownByAsset.slice(0, 10);

    // ========== COST IMPACT ==========
    const totalProductionLoss = Math.round(downtimeRecords.reduce((s, dt) => s + (dt.productionLoss || 0), 0) * 100) / 100;
    // Estimate: average production loss per downtime hour if not directly tracked
    const avgProdLossPerHour = totalDowntimeHours > 0 ? Math.round(totalProductionLoss / totalDowntimeHours * 100) / 100 : 0;
    // Related WO costs
    const relatedWOIds = [...new Set(downtimeRecords.map(dt => dt.workOrderId))];
    const woCosts = relatedWOIds.length > 0
      ? await db.workOrder.findMany({
          where: { id: { in: relatedWOIds } },
          select: { totalCost: true, laborCost: true, partsCost: true },
        })
      : [];
    const totalWOCost = Math.round(woCosts.reduce((s, wo) => s + (wo.totalCost || 0), 0) * 100) / 100;
    const estimatedTotalCost = Math.round((totalProductionLoss + totalWOCost) * 100) / 100;

    return NextResponse.json({
      success: true,
      data: {
        metrics: {
          totalDowntimeHours,
          totalDowntimeMinutes: Math.round(totalDowntimeMinutes),
          totalEvents,
          mtbfHours,
          mttrHours,
          mttrMinutes,
          availabilityPercent,
        },
        breakdownByAsset,
        breakdownByCategory,
        breakdownByReason,
        breakdownByShift,
        trending: {
          grouping: trendGrouping,
          data: trending,
        },
        top10Assets,
        costImpact: {
          totalProductionLoss,
          avgProductionLossPerHour: avgProdLossPerHour,
          relatedWOCost: totalWOCost,
          estimatedTotalImpact: estimatedTotalCost,
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate downtime report';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
