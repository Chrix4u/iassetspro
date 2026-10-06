import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getPlantScope, getPlantFilterWhere, canAccessPlant } from '@/lib/plant-scope';

// Safely check if a Prisma model exists (handles stale cached client)
function hasModel(client: any, model: string): boolean {
  return client && typeof client[model] === 'object' && client[model] !== null;
}

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }
    const plantFilter = getPlantFilterWhere(plantScope);

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30';

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));
    startDate.setHours(0, 0, 0, 0);

    // Run queries individually with safe model access — ALL queries use plantFilter
    const pf = Object.keys(plantFilter).length > 0 ? plantFilter : undefined;

    const mttrData = hasModel(db, 'workOrder')
      ? await db.workOrder.aggregate({ where: { ...pf, status: 'completed', actualHours: { gt: 0 } }, _avg: { actualHours: true } }).catch(() => ({ _avg: { actualHours: 0 } }))
      : { _avg: { actualHours: 0 } };

    const totalCompletedWOs = hasModel(db, 'workOrder')
      ? await db.workOrder.count({ where: { ...pf, status: 'completed' } }).catch(() => 0)
      : 0;

    const pmSchedulesTotal = hasModel(db, 'pmSchedule')
      ? await db.pmSchedule.count({ where: { asset: { ...pf }, isActive: true } }).catch(() => 0)
      : 0;

    const pmOverdue = hasModel(db, 'pmSchedule')
      ? await db.pmSchedule.count({ where: { asset: { ...pf }, isActive: true, frequencyType: { notIn: ['meter_based', 'custom_hours'] }, nextDueDate: { lte: new Date() } } }).catch(() => 0)
      : 0;

    const woByStatus = hasModel(db, 'workOrder')
      ? await db.workOrder.groupBy({ by: ['status'], _count: { status: true }, where: pf }).catch(() => [])
      : [];

    const woByType = hasModel(db, 'workOrder')
      ? await db.workOrder.groupBy({ by: ['type'], _count: { type: true }, where: pf }).catch(() => [])
      : [];

    const assetByCondition = hasModel(db, 'asset')
      ? await db.asset.groupBy({ by: ['condition'], _count: { condition: true }, where: { ...pf, isActive: true } }).catch(() => [])
      : [];

    const assetByStatus = hasModel(db, 'asset')
      ? await db.asset.groupBy({ by: ['status'], _count: { status: true }, where: { ...pf, isActive: true } }).catch(() => [])
      : [];

    const topAssets = hasModel(db, 'workOrder')
      ? await db.workOrder.groupBy({
          by: ['assetName'],
          where: { ...pf, assetName: { not: null } },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 8,
        }).catch(() => [])
      : [];

    const woByPriority = hasModel(db, 'workOrder')
      ? await db.workOrder.groupBy({ by: ['priority'], _count: { priority: true }, where: pf }).catch(() => [])
      : [];

    const mrByCategory = hasModel(db, 'maintenanceRequest')
      ? await db.maintenanceRequest.groupBy({
          by: ['category'],
          where: { ...pf, category: { not: null } },
          _count: { category: true },
        }).catch(() => [])
      : [];

    const totalCost = hasModel(db, 'workOrder')
      ? await db.workOrder.aggregate({
          _sum: { totalCost: true, laborCost: true, partsCost: true, contractorCost: true },
          where: { ...pf, createdAt: { gte: startDate } },
        }).catch(() => ({ _sum: { totalCost: 0, laborCost: 0, partsCost: 0, contractorCost: 0 } }))
      : { _sum: { totalCost: 0, laborCost: 0, partsCost: 0, contractorCost: 0 } };

    // Merge plant filter into raw SQL where clause if scoped (for inventory value KPI)
    const plantSqlFilter = plantScope.isScoped && plantScope.plantId
      ? Prisma.sql` AND plantId = ${plantScope.plantId}`
      : Prisma.sql``;

    const inventoryValueRaw = hasModel(db, 'inventoryItem')
      ? await db.$queryRaw<{ value: number | bigint }[]>(
          Prisma.sql`SELECT COALESCE(SUM(currentStock * unitCost), 0) AS value FROM inventory_items WHERE isActive = true${plantSqlFilter}`
        )
          .then((rows: any) => Number(rows?.[0]?.value ?? 0))
          .catch(() => 0)
      : 0;
    const inventoryValue = inventoryValueRaw;

    const lowStockCount = hasModel(db, 'inventoryItem')
      ? await db.inventoryItem.count({
          where: { ...pf, isActive: true, currentStock: { lte: db.inventoryItem.fields.minStockLevel } },
        }).catch(() => 0)
      : 0;

    // MTBF — Mean Time Between Failures (real computation).
    // Count breakdown/failure work orders in the period (corrective or emergency type)
    // then divide the period (hours) by that count.
    const failureCountInPeriod = hasModel(db, 'workOrder')
      ? await db.workOrder.count({
          where: { ...pf, type: { in: ['corrective', 'emergency'] }, createdAt: { gte: startDate } },
        }).catch(() => 0)
      : 0;
    const periodHours = parseInt(period) * 24;
    const mtbf = failureCountInPeriod > 0 ? Math.round(periodHours / failureCountInPeriod) : 0;

    // Get daily trend
    const recentWOs = hasModel(db, 'workOrder')
      ? await db.workOrder.findMany({
          where: { ...pf, createdAt: { gte: startDate } },
          select: { createdAt: true, status: true },
          orderBy: { createdAt: 'asc' },
        }).catch(() => [])
      : [];

    const dailyMap: Record<string, { created: number; completed: number }> = {};
    for (const wo of recentWOs) {
      const day = wo.createdAt.toISOString().split('T')[0];
      if (!dailyMap[day]) dailyMap[day] = { created: 0, completed: 0 };
      dailyMap[day].created++;
      if (wo.status === 'completed') dailyMap[day].completed++;
    }
    const dailyTrend = Object.entries(dailyMap).map(([date, vals]) => ({
      date,
      created: vals.created,
      completed: vals.completed,
    }));

    // Calculate KPIs
    const mttr = mttrData?._avg?.actualHours || 0;
    const totalAssets = (assetByStatus || []).reduce((sum: number, s: any) => sum + (s._count?.status || 0), 0);
    const operational = (assetByStatus || []).find((s: any) => s.status === 'operational')?._count?.status || 0;
    const underMaint = (assetByStatus || []).find((s: any) => s.status === 'under_maintenance')?._count?.status || 0;
    const standby = (assetByStatus || []).find((s: any) => s.status === 'standby')?._count?.status || 0;
    const assetUtilization = totalAssets > 0 ? Math.round((operational / totalAssets) * 100) : 0;
    const pmOnTime = Math.max(0, pmSchedulesTotal - pmOverdue);
    const pmComplianceRate = pmSchedulesTotal > 0 ? Math.round((pmOnTime / pmSchedulesTotal) * 100) : 100;

    // SLA
    const completedWOs = hasModel(db, 'workOrder')
      ? await db.workOrder.findMany({
          where: { ...pf, status: 'completed', plannedEnd: { not: null }, actualEnd: { not: null } },
          select: { actualEnd: true, plannedEnd: true },
        }).catch(() => [])
      : [];
    const totalWithSLA = completedWOs.length;
    const withinSLA = completedWOs.filter((wo: any) => wo.actualEnd && wo.plannedEnd && new Date(wo.actualEnd) <= new Date(wo.plannedEnd)).length;
    const slaRate = totalWithSLA > 0 ? Math.round((withinSLA / totalWithSLA) * 100) : 100;

    // Build chart data
    const woStatusData = (woByStatus || []).map((s: any) => ({
      status: (s.status || '').replace(/_/g, ' '),
      count: s._count?.status || 0,
    }));
    const woTypeData = (woByType || []).map((t: any) => ({
      type: t.type || '',
      count: t._count?.type || 0,
    }));
    const assetConditionData = (assetByCondition || []).map((c: any) => ({
      condition: c.condition || '',
      count: c._count?.condition || 0,
    }));
    const topMaintainedAssets = (topAssets || []).map((a: any) => ({
      name: a.assetName || 'Unknown',
      count: a._count?.id || 0,
    }));
    const priorityData = (woByPriority || []).map((p: any) => ({
      priority: p.priority || '',
      count: p._count?.priority || 0,
    }));
    const categoryData = (mrByCategory || []).map((c: any) => ({
      category: c.category || 'Other',
      count: c._count?.category || 0,
    }));

    return NextResponse.json({
      success: true,
      data: {
        kpis: {
          mttr: Math.round(mttr * 10) / 10,
          mtbf,
          assetUtilization,
          pmCompliance: pmComplianceRate,
          slaCompliance: slaRate,
          totalAssets,
          operationalAssets: operational,
          underMaintenance: underMaint,
          standbyAssets: standby,
          totalCompletedWOs,
        },
        costs: {
          totalMaintenanceCost: Number(totalCost?._sum?.totalCost || 0),
          totalLaborCost: Number(totalCost?._sum?.laborCost || 0),
          totalPartsCost: Number(totalCost?._sum?.partsCost || 0),
          totalContractorCost: Number(totalCost?._sum?.contractorCost || 0),
          inventoryValue: Number(inventoryValue || 0),
          lowStockItems: lowStockCount,
          overduePMs: pmOverdue,
        },
        charts: {
          woStatus: woStatusData,
          woType: woTypeData,
          woPriority: priorityData,
          assetCondition: assetConditionData,
          dailyTrend,
          topMaintainedAssets,
          mrCategories: categoryData,
        },
        period,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load analytics';
    console.error('Analytics API error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
