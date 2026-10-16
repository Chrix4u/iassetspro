import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasAnyPermission } from '@/lib/auth';
import { getPlantScope, getPlantFilterWhere } from '@/lib/plant-scope';
import { getAssetIdsInFunctionalLocationSubtree, getAssetLiveLocationMap } from '@/lib/functional-location/live-location';

// ============================================================================
// HELPERS
// ============================================================================

const PLANNED_MINS_PER_WEEK = 10080; // 7 days × 24 hrs × 60 min

const REPAIR_WO_TYPES = ['corrective', 'breakdown', 'emergency'];
const BREAKDOWN_WO_TYPES = ['breakdown', 'emergency'];

interface ISOWeekInfo {
  year: number;
  week: number;
  label: string;
}

/**
 * Get ISO week number (1-53) for a Date.
 * Uses the Thursday-based ISO 8601 algorithm.
 */
function getISOWeek(date: Date): ISOWeekInfo {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

  // Calculate the Monday of that ISO week for labeling
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const mondayOffset = 1 - dayOfWeek;
  const weekMonday = new Date(Date.UTC(d.getUTCFullYear(), 0, 1 + (weekNo - 1) * 7 + mondayOffset - 1));
  const weekSunday = new Date(weekMonday);
  weekSunday.setUTCDate(weekSunday.getUTCDate() + 6);

  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const label = `Wk ${weekNo} (${MONTH_NAMES[weekMonday.getUTCMonth()]} ${weekMonday.getUTCDate()}-${MONTH_NAMES[weekSunday.getUTCMonth()]} ${weekSunday.getUTCDate()})`;

  return { year: d.getUTCFullYear(), week: weekNo, label };
}

/**
 * Round to given decimal places.
 */
function r(value: number, decimals = 2): number {
  return Math.round(value * 10 ** decimals) / 10 ** decimals;
}

/**
 * Build a cumulative Pareto array sorted by metric descending.
 */
function buildPareto<T extends Record<string, unknown>>(
  items: T[],
  metricKey: string,
  labelKey: string
): Array<Record<string, unknown>> {
  if (items.length === 0) return [];

  const sorted = [...items].sort(
    (a, b) => Number((b as Record<string, unknown>)[metricKey]) - Number((a as Record<string, unknown>)[metricKey])
  );

  const total = sorted.reduce((sum, item) => sum + Number((item as Record<string, unknown>)[metricKey]), 0);
  if (total === 0) return sorted.map((item) => ({ ...item, cumulativePct: 0 }));

  let cumulative = 0;
  return sorted.map((item) => {
    const val = Number((item as Record<string, unknown>)[metricKey]);
    cumulative += val;
    return {
      ...item,
      cumulativePct: r((cumulative / total) * 100, 1),
    };
  });
}

// ============================================================================
// PER-MACHINE WEEKLY DATA INTERFACES
// ============================================================================

interface MachineWeekData {
  week: number;
  plannedMins: number;
  stoppagesMins: number;
  repairDowntimeMins: number;
  breakdowns: number;
  actualAvailability: number;
  pctDowntime: number;
  efficiency: number;
  weightedEfficiency: number;
  mttr: number;
  mtbf: number;
  failureRate: number;
}

interface MachineData {
  assetId: string;
  assetName: string;
  assetTag: string;
  manufacturer: string | null;
  model: string | null;
  category: string;
  criticality: string;
  mfgYear: number | null;
  installYear: number | null;
  machineLife: number | null;
  functionalLocationCode: string | null;
  functionalLocationPath: string | null;
  functionalLocationPathCode: string | null;
  weekly: MachineWeekData[];
  totals: {
    plannedMins: number;
    stoppagesMins: number;
    repairDowntimeMins: number;
    breakdowns: number;
    actualAvailability: number;
    avgEfficiency: number;
    avgMTTR: number;
    avgMTBF: number;
    avgFailureRate: number;
  };
}

// ============================================================================
// GET /api/reports/machine-availability
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasAnyPermission(session, ['reports.view', 'reports.export', 'analytics.view']) && !isAdmin(session)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions: reports.view required' },
        { status: 403 }
      );
    }

    // ── Query params ──────────────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');
    const weekParam = searchParams.get('week');
    const plantIdParam = searchParams.get('plantId');
    const criticalityParam = searchParams.get('criticality');
    const functionalLocationId = searchParams.get('functionalLocationId');

    const targetYear = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    const targetWeek = weekParam ? parseInt(weekParam, 10) : null;

    // ── Plant scoping ─────────────────────────────────────────────────────
    const plantScope = await getPlantScope(request, session);
    let plantFilterWhere = getPlantFilterWhere(plantScope);

    // If caller explicitly passed plantId param and plant scope is not active, use the param
    if (!plantScope.isScoped && plantIdParam) {
      plantFilterWhere = { plantId: plantIdParam };
    }

    // ── Fetch assets ──────────────────────────────────────────────────────
    const assetWhere: Record<string, unknown> = {
      status: { in: ['operational', 'standby', 'under_maintenance'] },
      ...plantFilterWhere,
    };
    if (criticalityParam) {
      assetWhere.criticality = criticalityParam;
    }
    if (functionalLocationId) {
      assetWhere.id = { in: await getAssetIdsInFunctionalLocationSubtree(functionalLocationId) };
    }

    const assets = await db.asset.findMany({
      where: Object.keys(assetWhere).length > 0 ? assetWhere : undefined,
      include: { category: true },
      orderBy: { name: 'asc' },
    });

    if (assets.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          year: targetYear,
          weeklyKPIs: [],
          machines: [],
          pareto: {
            failurePareto: [],
            nbdPareto: [],
            dtPareto: [],
            mttrPareto: [],
          },
          weeklyTrends: {
            downtime: [],
            breakdowns: [],
            mttr: [],
            mtbf: [],
            availability: [],
            failureRate: [],
          },
          targets: {
            efficiency: 97,
            mttr: 140,
            mtbf: 4119,
            failureRate: 2.8,
            repairDowntimeWeekly: 216,
            breakdownsWeekly: 2,
          },
        },
      });
    }

    const liveLocations = await getAssetLiveLocationMap(assets.map((asset) => asset.id));

    // Build asset lookup map
    const assetMap = new Map<string, (typeof assets)[0]>();
    for (const a of assets) {
      assetMap.set(a.id, a);
    }

    // ── Date range for the year ───────────────────────────────────────────
    const yearStart = new Date(Date.UTC(targetYear, 0, 1));
    const yearEnd = new Date(Date.UTC(targetYear, 11, 31, 23, 59, 59));

    // ── Fetch work orders for the year ────────────────────────────────────
    const woWhere: Record<string, unknown> = {
      createdAt: { gte: yearStart, lte: yearEnd },
      status: { notIn: ['cancelled', 'draft'] },
      assetId: { in: assets.map((a) => a.id) },
    };
    if (Object.keys(plantFilterWhere).length > 0) {
      woWhere.plantId = (plantFilterWhere as { plantId: string }).plantId;
    }

    const workOrders = await db.workOrder.findMany({
      where: Object.keys(woWhere).length > 0 ? woWhere : undefined,
      include: {
        workOrderDowntimes: true,
      },
    });

    // ── Fetch all downtimes directly (also include those not linked to WO type) ──
    // We also need downtimes that may have been logged against assets in the year
    // regardless of WO type, since stoppages include all categories
    const allDowntimes = await db.workOrderDowntime.findMany({
      where: {
        createdAt: { gte: yearStart, lte: yearEnd },
        assetId: { in: assets.map((a) => a.id) },
      },
      include: {
        workOrder: {
          select: { type: true, status: true, assetId: true, createdAt: true },
        },
      },
    });

    // ── Group data by asset × ISO week ────────────────────────────────────

    // Map: assetId → week number → aggregated data
    interface WeekAggregate {
      repairDowntimeMins: number;
      totalDowntimeMins: number;
      breakdowns: number;
    }

    const machineWeekMap = new Map<string, Map<number, WeekAggregate>>();

    // Initialize all asset-weeks
    for (const asset of assets) {
      const weekMap = new Map<number, WeekAggregate>();
      machineWeekMap.set(asset.id, weekMap);
    }

    // Process work orders for breakdown counts
    for (const wo of workOrders) {
      if (!wo.assetId || !wo.createdAt) continue;
      const isoWeek = getISOWeek(wo.createdAt);
      if (isoWeek.year !== targetYear) continue;

      const weekMap = machineWeekMap.get(wo.assetId);
      if (!weekMap) continue;

      let agg = weekMap.get(isoWeek.week);
      if (!agg) {
        agg = { repairDowntimeMins: 0, totalDowntimeMins: 0, breakdowns: 0 };
        weekMap.set(isoWeek.week, agg);
      }

      // Count breakdowns for breakdown/emergency WO types
      if (BREAKDOWN_WO_TYPES.includes(wo.type)) {
        agg.breakdowns += 1;
      }
    }

    // Process downtimes for minutes
    for (const dt of allDowntimes) {
      if (!dt.assetId) continue;

      // Determine which week this downtime falls in
      const dtDate = dt.downtimeStart;
      const isoWeek = getISOWeek(dtDate);
      if (isoWeek.year !== targetYear) continue;

      const weekMap = machineWeekMap.get(dt.assetId);
      if (!weekMap) continue;

      let agg = weekMap.get(isoWeek.week);
      if (!agg) {
        agg = { repairDowntimeMins: 0, totalDowntimeMins: 0, breakdowns: 0 };
        weekMap.set(isoWeek.week, agg);
      }

      const duration = dt.durationMinutes || 0;

      // All downtime counts as stoppages
      agg.totalDowntimeMins += duration;

      // Only repair-type downtime (from corrective/breakdown/emergency WOs or unplanned category)
      const woType = dt.workOrder?.type;
      const isRepairWO = woType ? REPAIR_WO_TYPES.includes(woType) : false;
      const isBreakdownCategory = dt.category === 'breakdown' || dt.category === 'unplanned';

      if (isRepairWO || isBreakdownCategory) {
        agg.repairDowntimeMins += duration;
      }
    }

    // ── Build machine data ────────────────────────────────────────────────
    const machinesData: MachineData[] = [];
    const allWeekNumbers = new Set<number>();

    for (const asset of assets) {
      const weekMap = machineWeekMap.get(asset.id)!;

      // Determine which weeks to include
      let weeksToInclude: number[];
      if (targetWeek !== null) {
        weeksToInclude = [targetWeek];
      } else {
        // Include all weeks that have data
        weeksToInclude = Array.from(weekMap.keys()).sort((a, b) => a - b);

        // Also include the current week if we're in the target year
        const now = new Date();
        if (now.getFullYear() === targetYear) {
          const currentISO = getISOWeek(now);
          if (!weeksToInclude.includes(currentISO.week)) {
            weeksToInclude.push(currentISO.week);
          }
        }
      }

      weeksToInclude.sort((a, b) => a - b);

      const weekly: MachineWeekData[] = [];
      let totalPlanned = 0;
      let totalStoppages = 0;
      let totalRepairDT = 0;
      let totalBD = 0;
      let totalActualAvail = 0;
      const efficiencyValues: number[] = [];
      const mttrValues: number[] = [];
      const mtbfValues: number[] = [];
      const failureRateValues: number[] = [];

      for (const wk of weeksToInclude) {
        const agg = weekMap.get(wk) || { repairDowntimeMins: 0, totalDowntimeMins: 0, breakdowns: 0 };
        allWeekNumbers.add(wk);

        const plannedMins = PLANNED_MINS_PER_WEEK;
        const repairDowntimeMins = agg.repairDowntimeMins;
        const stoppagesMins = agg.totalDowntimeMins;
        const breakdowns = agg.breakdowns;
        const actualAvailability = plannedMins - repairDowntimeMins;
        const pctDowntime = plannedMins > 0 ? (repairDowntimeMins / plannedMins) * 100 : 0;
        const efficiency = plannedMins > 0 ? (actualAvailability / plannedMins) * 100 : 100;
        const weightedEfficiency = plannedMins * efficiency;
        const mttr = breakdowns > 0 ? repairDowntimeMins / breakdowns : 0;
        const mtbf = breakdowns > 0 ? actualAvailability / breakdowns : 0;
        const failureRate = 100 - efficiency;

        weekly.push({
          week: wk,
          plannedMins,
          stoppagesMins: r(stoppagesMins, 1),
          repairDowntimeMins: r(repairDowntimeMins, 1),
          breakdowns,
          actualAvailability: r(actualAvailability, 1),
          pctDowntime: r(pctDowntime, 2),
          efficiency: r(efficiency, 2),
          weightedEfficiency: r(weightedEfficiency, 2),
          mttr: r(mttr, 1),
          mtbf: r(mtbf, 1),
          failureRate: r(Math.max(0, failureRate), 2),
        });

        totalPlanned += plannedMins;
        totalStoppages += stoppagesMins;
        totalRepairDT += repairDowntimeMins;
        totalBD += breakdowns;
        totalActualAvail += actualAvailability;
        efficiencyValues.push(efficiency);
        if (breakdowns > 0) {
          mttrValues.push(mttr);
          mtbfValues.push(mtbf);
        }
        failureRateValues.push(Math.max(0, failureRate));
      }

      // Calculate install year
      const installYear = asset.installedDate ? asset.installedDate.getFullYear() : null;
      const currentYear = new Date().getFullYear();
      const machineLife = installYear ? currentYear - installYear : null;

      // Averages for totals
      const weeksWithData = weekly.length || 1;
      const avgEfficiency =
        efficiencyValues.length > 0
          ? efficiencyValues.reduce((s, v) => s + v, 0) / efficiencyValues.length
          : 100;
      const avgMTTR =
        mttrValues.length > 0
          ? totalRepairDT / totalBD
          : 0;
      const avgMTBF =
        totalBD > 0
          ? (totalPlanned - totalRepairDT) / totalBD
          : 0;
      const avgFailureRate =
        failureRateValues.length > 0
          ? failureRateValues.reduce((s, v) => s + v, 0) / failureRateValues.length
          : 0;

      const liveLocation = liveLocations.get(asset.id) ?? null;
      machinesData.push({
        assetId: asset.id,
        assetName: asset.name,
        assetTag: asset.assetTag,
        manufacturer: asset.manufacturer,
        model: asset.model,
        category: asset.category?.name || 'Unknown',
        criticality: asset.criticality,
        mfgYear: asset.yearManufactured,
        installYear,
        machineLife,
        functionalLocationCode: liveLocation?.locationCode ?? null,
        functionalLocationPath: liveLocation?.path ?? null,
        functionalLocationPathCode: liveLocation?.pathCode ?? liveLocation?.path ?? null,
        weekly,
        totals: {
          plannedMins: totalPlanned,
          stoppagesMins: r(totalStoppages, 1),
          repairDowntimeMins: r(totalRepairDT, 1),
          breakdowns: totalBD,
          actualAvailability: r(totalActualAvail, 1),
          avgEfficiency: r(avgEfficiency, 2),
          avgMTTR: r(avgMTTR, 1),
          avgMTBF: r(avgMTBF, 1),
          avgFailureRate: r(avgFailureRate, 2),
        },
      });
    }

    // ── Weekly KPIs ───────────────────────────────────────────────────────
    const sortedWeeks = Array.from(allWeekNumbers).sort((a, b) => a - b);

    const weeklyKPIs = sortedWeeks.map((wk) => {
      let totalMachines = 0;
      let availableMachines = 0;
      let efficientMachines = 0;
      let totalWeightedEff = 0;
      let totalPlannedMins = 0;
      let totalRepairMins = 0;
      let totalBreakdowns = 0;
      let totalMTTR = 0;
      let mttrCount = 0;
      let totalMTBF = 0;
      let mtbfCount = 0;
      let totalAvailability = 0;

      for (const machine of machinesData) {
        const weekData = machine.weekly.find((w) => w.week === wk);
        if (!weekData) continue;

        totalMachines++;
        availableMachines++;
        if (weekData.efficiency >= 97) efficientMachines++;

        totalWeightedEff += weekData.weightedEfficiency;
        totalPlannedMins += weekData.plannedMins;
        totalRepairMins += weekData.repairDowntimeMins;
        totalBreakdowns += weekData.breakdowns;
        totalAvailability += weekData.actualAvailability;

        if (weekData.breakdowns > 0) {
          totalMTTR += weekData.mttr;
          mttrCount++;
          totalMTBF += weekData.mtbf;
          mtbfCount++;
        }
      }

      const isoInfo = getISOWeekForWeekNumber(targetYear, wk);

      return {
        week: wk,
        weekLabel: isoInfo.label,
        totalMachines,
        availableMachines,
        efficientMachines,
        weightedAvgEfficiency: totalPlannedMins > 0 ? r((totalWeightedEff / totalPlannedMins), 2) : 100,
        totalPlannedMins,
        totalRepairMins: r(totalRepairMins, 1),
        totalBreakdowns,
        avgMTTR: mttrCount > 0 ? r(totalMTTR / mttrCount, 1) : 0,
        avgMTBF: mtbfCount > 0 ? r(totalMTBF / mtbfCount, 1) : 0,
        avgAvailability: totalMachines > 0 ? r((totalAvailability / totalMachines) / PLANNED_MINS_PER_WEEK * 100, 2) : 100,
      };
    });

    // ── Pareto Analysis ───────────────────────────────────────────────────

    // Failure Rate Pareto: sort by avgFailureRate descending
    const failurePareto = buildPareto(
      machinesData.map((m) => ({ assetName: m.assetName, avgFailureRate: m.totals.avgFailureRate })),
      'avgFailureRate',
      'assetName'
    );

    // NBD (Number of Breakdowns) Pareto
    const nbdPareto = buildPareto(
      machinesData.map((m) => ({ assetName: m.assetName, totalBreakdowns: m.totals.breakdowns })),
      'totalBreakdowns',
      'assetName'
    );

    // Downtime Pareto
    const dtPareto = buildPareto(
      machinesData.map((m) => ({ assetName: m.assetName, totalRepairMins: m.totals.repairDowntimeMins })),
      'totalRepairMins',
      'assetName'
    );

    // MTTR Pareto
    const mttrPareto = buildPareto(
      machinesData
        .filter((m) => m.totals.breakdowns > 0)
        .map((m) => ({ assetName: m.assetName, avgMTTR: m.totals.avgMTTR })),
      'avgMTTR',
      'assetName'
    );

    // ── Weekly Trends ─────────────────────────────────────────────────────
    const weeklyTrends = {
      downtime: sortedWeeks.map((wk) => {
        const kpi = weeklyKPIs.find((k) => k.week === wk);
        return {
          week: wk,
          totalMins: kpi?.totalRepairMins ?? 0,
          avgPerMachine: kpi && kpi.totalMachines > 0 ? r((kpi.totalRepairMins as number) / kpi.totalMachines, 1) : 0,
        };
      }),
      breakdowns: sortedWeeks.map((wk) => {
        const kpi = weeklyKPIs.find((k) => k.week === wk);
        return { week: wk, count: kpi?.totalBreakdowns ?? 0 };
      }),
      mttr: sortedWeeks.map((wk) => {
        const kpi = weeklyKPIs.find((k) => k.week === wk);
        return { week: wk, avg: kpi?.avgMTTR ?? 0 };
      }),
      mtbf: sortedWeeks.map((wk) => {
        const kpi = weeklyKPIs.find((k) => k.week === wk);
        return { week: wk, avg: kpi?.avgMTBF ?? 0 };
      }),
      availability: sortedWeeks.map((wk) => {
        const kpi = weeklyKPIs.find((k) => k.week === wk);
        return { week: wk, avg: kpi?.avgAvailability ?? 100 };
      }),
      failureRate: sortedWeeks.map((wk) => {
        const kpi = weeklyKPIs.find((k) => k.week === wk);
        const avg = kpi ? 100 - (kpi.avgAvailability as number) : 0;
        return { week: wk, avg: r(avg, 2) };
      }),
    };

    // ── Response ──────────────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      data: {
        year: targetYear,
        weeklyKPIs,
        machines: machinesData,
        pareto: {
          failurePareto,
          nbdPareto,
          dtPareto,
          mttrPareto,
        },
        weeklyTrends,
        targets: {
          efficiency: 97,
          mttr: 140,
          mtbf: 4119,
          failureRate: 2.8,
          repairDowntimeWeekly: 216,
          breakdownsWeekly: 2,
        },
      },
    });
  } catch (error) {
    console.error('[machine-availability] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate machine availability report',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// UTILITY: ISO week label generator from year + week number
// ============================================================================

function getISOWeekForWeekNumber(year: number, week: number): ISOWeekInfo {
  // Find the first Thursday of the year (determines ISO week 1)
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const mondayOfWk1 = new Date(Date.UTC(year, 0, 4 - (dayOfWeek - 1)));

  // Monday of the target week
  const targetMonday = new Date(mondayOfWk1);
  targetMonday.setUTCDate(targetMonday.getUTCDate() + (week - 1) * 7);

  const targetSunday = new Date(targetMonday);
  targetSunday.setUTCDate(targetSunday.getUTCDate() + 6);

  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const label = `Wk ${week} (${MONTH_NAMES[targetMonday.getUTCMonth()]} ${targetMonday.getUTCDate()}-${MONTH_NAMES[targetSunday.getUTCMonth()]} ${targetSunday.getUTCDate()})`;

  return { year, week, label };
}