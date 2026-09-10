import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasAnyPermission } from '@/lib/auth';
import { getPlantScope, getPlantFilterWhere } from '@/lib/plant-scope';
import { Prisma } from '@prisma/client';

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
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const departmentId = searchParams.get('departmentId');
    const plantId = searchParams.get('plantId');
    const moduleFilter = searchParams.get('moduleFilter') || 'all';

    // Resolve plant scope
    const plantScope = await getPlantScope(request, session);
    const plantFilter = getPlantFilterWhere(plantScope);

    // Build base date filter
    const dateFilter: Record<string, unknown> = {};
    if (startDate) dateFilter.gte = new Date(startDate + 'T00:00:00');
    if (endDate) dateFilter.lte = new Date(endDate + 'T23:59:59');

    // Combine all filters
    const baseFilter: Record<string, unknown> = { ...plantFilter };
    if (Object.keys(dateFilter).length > 0) baseFilter.createdAt = dateFilter;
    if (departmentId) baseFilter.departmentId = departmentId;
    if (plantId && !plantScope.isScoped) baseFilter.plantId = plantId;
    if (moduleFilter === 'repairs') {
      (baseFilter as Record<string, unknown>).type = { in: ['corrective', 'emergency'] };
    } else if (moduleFilter === 'pm') {
      (baseFilter as Record<string, unknown>).type = 'preventive';
    }

    const hasFilter = Object.keys(baseFilter).length > 0;

    // Fetch all WOs with related data for the date range
    const workOrders = await db.workOrder.findMany({
      where: hasFilter ? baseFilter : undefined,
      include: {
        assignee: { select: { id: true, fullName: true } },
        teamLeader: { select: { id: true, fullName: true } },
        materials: true,
        teamMembers: { include: { user: { select: { id: true, fullName: true } } } },
        timeLogs: true,
        workOrderDowntimes: true,
        repairCompletion: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Fetch enriched asset data for all referenced assets
    const assetIds = [...new Set(workOrders.map(wo => wo.assetId).filter((id): id is string => !!id))];
    const assets = assetIds.length > 0 ? await db.asset.findMany({
      where: { id: { in: assetIds } },
      include: { category: { select: { name: true } } },
    }) : [];
    const assetMap = new Map(assets.map(a => [a.id, a]));

    // Fetch enriched inventory item data for all referenced materials
    const itemIds = [...new Set(workOrders.flatMap(wo =>
      (wo.materials || []).map(m => m.itemId).filter((id): id is string => !!id)
    ))];
    const inventoryItems = itemIds.length > 0 ? await db.inventoryItem.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, itemCode: true, name: true, unitOfMeasure: true, supplier: true, supplierPartNumber: true, binLocation: true, shelfLocation: true, specification: true, currentStock: true },
    }) : [];
    const itemMap = new Map(inventoryItems.map(i => [i.id, i]));

    // Helper: get enriched asset details from a work order
    function getAssetDetails(wo: { assetId?: string | null; assetName?: string | null }) {
      const asset = wo.assetId ? assetMap.get(wo.assetId) : null;
      return {
        assetId: wo.assetId || null,
        assetName: wo.assetName || asset?.name || 'Unassigned',
        assetTag: asset?.assetTag || null,
        manufacturer: asset?.manufacturer || null,
        model: asset?.model || null,
        serialNumber: asset?.serialNumber || null,
        category: asset?.category?.name || null,
        criticality: asset?.criticality || null,
        condition: asset?.condition || null,
        location: asset?.location || null,
        building: asset?.building || null,
        floor: asset?.floor || null,
        area: asset?.area || null,
        purchaseCost: asset?.purchaseCost || null,
        currentValue: asset?.currentValue || null,
      };
    }

    // Build itemName -> first itemId mapping for material enrichment
    const itemNameToItemId: Record<string, string> = {};
    for (const wo of workOrders) {
      for (const mat of (wo.materials || [])) {
        if (mat.itemId && mat.itemName && !itemNameToItemId[mat.itemName]) {
          itemNameToItemId[mat.itemName] = mat.itemId;
        }
      }
    }

    // Helper: get enriched inventory item details
    function getItemDetails(itemName: string) {
      const itemId = itemNameToItemId[itemName];
      const item = itemId ? itemMap.get(itemId) : null;
      return {
        itemCode: item?.itemCode || null,
        unitOfMeasure: item?.unitOfMeasure || null,
        supplier: item?.supplier || null,
        supplierPartNumber: item?.supplierPartNumber || null,
        binLocation: item?.binLocation || null,
        shelfLocation: item?.shelfLocation || null,
        specification: item?.specification || null,
        currentStock: item?.currentStock || null,
      };
    }

    // Fetch all MRs for the date range (strip WO-specific type filter since MR has no type field)
    const mrFilter: Record<string, unknown> = { ...plantFilter };
    if (Object.keys(dateFilter).length > 0) mrFilter.createdAt = dateFilter;
    if (departmentId) mrFilter.departmentId = departmentId;
    if (plantId && !plantScope.isScoped) mrFilter.plantId = plantId;
    const mrs = await db.maintenanceRequest.findMany({
      where: Object.keys(mrFilter).length > 0 ? mrFilter : undefined,
      include: {
        requester: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // ========== SUMMARY ==========
    const totalWOs = workOrders.length;
    const totalMRs = mrs.length;
    const completedWOs = workOrders.filter(wo => wo.status === 'completed' || wo.status === 'closed').length;
    const completionRate = totalWOs > 0 ? Math.round((completedWOs / totalWOs) * 100) : 0;

    const completedWithActuals = workOrders.filter(
      wo => (wo.status === 'completed' || wo.status === 'closed') && wo.actualStart && wo.actualEnd
    );
    const avgCompletionHours = completedWithActuals.length > 0
      ? completedWithActuals.reduce((sum, wo) => {
          const hours = (new Date(wo.actualEnd!).getTime() - new Date(wo.actualStart!).getTime()) / (1000 * 60 * 60);
          return sum + hours;
        }, 0) / completedWithActuals.length
      : 0;

    const totalCost = workOrders.reduce((sum, wo) => sum + (wo.totalCost || 0), 0);
    const avgCostPerWO = totalWOs > 0 ? totalCost / totalWOs : 0;

    const now = new Date();
    const overdueWOs = workOrders.filter(
      wo => wo.plannedEnd && new Date(wo.plannedEnd) < now && !['completed', 'closed', 'cancelled'].includes(wo.status)
    ).length;

    // SLA compliance: WOs completed within estimated hours (or plannedEnd)
    const slaCompliant = workOrders.filter(wo => {
      if (!['completed', 'closed'].includes(wo.status)) return false;
      if (!wo.plannedEnd || !wo.actualEnd) return false;
      return new Date(wo.actualEnd) <= new Date(wo.plannedEnd);
    }).length;
    const completedAndClosed = workOrders.filter(wo => wo.status === 'completed' || wo.status === 'closed').length;
    const slaComplianceRate = completedAndClosed > 0 ? Math.round((slaCompliant / completedAndClosed) * 100) : 100;
    const slaBreachedWOs = completedAndClosed - slaCompliant;

    const openWOs = workOrders.filter(wo => !['completed', 'closed', 'cancelled'].includes(wo.status)).length;
    const pendingMRs = mrs.filter(mr => mr.status === 'pending' || mr.status === 'in_progress').length;
    const convertedMRs = mrs.filter(mr => mr.status === 'converted').length;
    const mrConversionRate = totalMRs > 0 ? Math.round((convertedMRs / totalMRs) * 100) : 0;

    // ========== WO BY TYPE ==========
    const typeMap: Record<string, number> = {};
    workOrders.forEach(wo => { typeMap[wo.type] = (typeMap[wo.type] || 0) + 1; });
    const woByType = Object.entries(typeMap).map(([type, count]) => ({ type, count }));

    // ========== WO BY PRIORITY ==========
    const priorityMap: Record<string, number> = {};
    workOrders.forEach(wo => { priorityMap[wo.priority] = (priorityMap[wo.priority] || 0) + 1; });
    const woByPriority = Object.entries(priorityMap).map(([priority, count]) => ({ priority, count }));

    // ========== WO BY STATUS ==========
    const statusMap: Record<string, number> = {};
    workOrders.forEach(wo => { statusMap[wo.status] = (statusMap[wo.status] || 0) + 1; });
    const woByStatus = Object.entries(statusMap).map(([status, count]) => ({ status, count }));

    // ========== WO BY MONTH ==========
    const monthMap: Record<string, { count: number; completedCount: number }> = {};
    workOrders.forEach(wo => {
      const d = new Date(wo.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap[key]) monthMap[key] = { count: 0, completedCount: 0 };
      monthMap[key].count += 1;
      if (wo.status === 'completed' || wo.status === 'closed') monthMap[key].completedCount += 1;
    });
    const woByMonth = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, count: data.count, completedCount: data.completedCount }));

    // ========== TECHNICIAN PRODUCTIVITY ==========
    const techMap: Record<string, { userId: string; userName: string; assignedCount: number; completedCount: number; totalHours: number; woCount: number }> = {};
    workOrders.forEach(wo => {
      if (wo.assignee) {
        const uid = wo.assignee.id;
        if (!techMap[uid]) techMap[uid] = { userId: uid, userName: wo.assignee.fullName, assignedCount: 0, completedCount: 0, totalHours: 0, woCount: 0 };
        techMap[uid].assignedCount += 1;
        techMap[uid].woCount += 1;
        if (wo.status === 'completed' || wo.status === 'closed') techMap[uid].completedCount += 1;
        techMap[uid].totalHours += (wo.actualHours || 0);
      }
    });
    const technicianProductivity = Object.values(techMap).map(t => ({
      ...t,
      avgHoursPerWO: t.woCount > 0 ? Math.round((t.totalHours / t.woCount) * 100) / 100 : 0,
    })).sort((a, b) => b.completedCount - a.completedCount);

    // ========== MATERIAL CONSUMPTION ==========
    const matMap: Record<string, { itemName: string; totalQuantity: number; totalCost: number; woCount: Set<string> }> = {};
    workOrders.forEach(wo => {
      wo.materials.forEach(mat => {
        if (!mat.itemName) return;
        const key = mat.itemName;
        if (!matMap[key]) matMap[key] = { itemName: key, totalQuantity: 0, totalCost: 0, woCount: new Set() };
        matMap[key].totalQuantity += (mat.quantity || 0);
        matMap[key].totalCost += (mat.totalCost || (mat.unitCost != null && mat.quantity ? mat.unitCost * mat.quantity : 0));
        matMap[key].woCount.add(wo.id);
      });
    });
    const materialConsumption = Object.values(matMap)
      .map(m => ({
        itemName: m.itemName,
        ...getItemDetails(m.itemName),
        totalQuantity: Math.round(m.totalQuantity * 100) / 100,
        totalCost: Math.round(m.totalCost * 100) / 100,
        woCount: m.woCount.size,
      }))
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 20);

    // ========== DOWNTIME ANALYSIS ==========
    const allDowntimes = workOrders.flatMap(wo =>
      (wo.workOrderDowntimes || []).map(dt => ({
        ...dt,
        workOrderId: wo.id,
      }))
    );

    const totalDowntimeEvents = allDowntimes.length;
    const totalDowntimeMinutes = allDowntimes.reduce((sum, dt) => sum + (dt.durationMinutes || 0), 0);
    const avgDowntimeDuration = totalDowntimeEvents > 0 ? Math.round(totalDowntimeMinutes / totalDowntimeEvents) : 0;

    const dtCategoryMap: Record<string, { count: number; totalMinutes: number }> = {};
    allDowntimes.forEach(dt => {
      const cat = dt.category || 'unplanned';
      if (!dtCategoryMap[cat]) dtCategoryMap[cat] = { count: 0, totalMinutes: 0 };
      dtCategoryMap[cat].count += 1;
      dtCategoryMap[cat].totalMinutes += (dt.durationMinutes || 0);
    });
    const downtimeByCategory = Object.entries(dtCategoryMap).map(([category, data]) => ({
      category,
      count: data.count,
      totalMinutes: data.totalMinutes,
    }));

    const dtImpactMap: Record<string, number> = {};
    allDowntimes.forEach(dt => {
      const imp = dt.impactLevel || 'medium';
      dtImpactMap[imp] = (dtImpactMap[imp] || 0) + 1;
    });
    const downtimeByImpactLevel = Object.entries(dtImpactMap).map(([impactLevel, count]) => ({
      impactLevel,
      count,
    }));

    // ========== REPAIR COMPLETION ==========
    const completions = workOrders
      .map(wo => wo.repairCompletion)
      .filter((rc): rc is NonNullable<typeof rc> => rc !== null);

    const totalCompleted = completions.length;
    const totalReworkCount = completions.reduce((sum, rc) => sum + (rc.reworkCount || 0), 0);
    const reworkRate = totalCompleted > 0 ? Math.round((completions.filter(rc => (rc.reworkCount || 0) > 0).length / totalCompleted) * 100) : 0;

    const supReviewTimes = completions
      .filter(rc => rc.supervisorApprovedAt && rc.createdAt)
      .map(rc => (new Date(rc.supervisorApprovedAt!).getTime() - new Date(rc.createdAt).getTime()) / (1000 * 60 * 60));
    const avgSupervisorReviewHours = supReviewTimes.length > 0
      ? Math.round((supReviewTimes.reduce((a, b) => a + b, 0) / supReviewTimes.length) * 100) / 100
      : 0;

    const closureTimes = completions
      .filter(rc => rc.plannerClosedAt && rc.createdAt)
      .map(rc => (new Date(rc.plannerClosedAt!).getTime() - new Date(rc.createdAt).getTime()) / (1000 * 60 * 60));
    const avgClosureTimeHours = closureTimes.length > 0
      ? Math.round((closureTimes.reduce((a, b) => a + b, 0) / closureTimes.length) * 100) / 100
      : 0;

    // ========== TOP ASSETS ==========
    const assetGroupMap: Record<string, { assetId: string; assetName: string; woCount: number; downtimeMinutes: number; totalCost: number }> = {};
    workOrders.forEach(wo => {
      const key = wo.assetId || 'unassigned';
      const name = wo.assetName || 'Unassigned';
      if (!assetGroupMap[key]) assetGroupMap[key] = { assetId: wo.assetId || '', assetName: name, woCount: 0, downtimeMinutes: 0, totalCost: 0 };
      assetGroupMap[key].woCount += 1;
      assetGroupMap[key].totalCost += (wo.totalCost || 0);
      (wo.workOrderDowntimes || []).forEach(dt => {
        assetGroupMap[key].downtimeMinutes += (dt.durationMinutes || 0);
      });
    });
    const topAssets = Object.values(assetGroupMap)
      .sort((a, b) => b.woCount - a.woCount)
      .slice(0, 10)
      .map(a => {
        const asset = a.assetId ? assetMap.get(a.assetId) : null;
        return {
          ...a,
          assetTag: asset?.assetTag || null,
          manufacturer: asset?.manufacturer || null,
          model: asset?.model || null,
          serialNumber: asset?.serialNumber || null,
          category: asset?.category?.name || null,
          criticality: asset?.criticality || null,
          condition: asset?.condition || null,
          location: asset?.location || null,
          building: asset?.building || null,
          area: asset?.area || null,
        };
      });

    // ========== WORK ORDERS BY ASSET ==========
    const assetWoMap: Record<string, {
      assetId: string;
      assetName: string;
      workOrders: {
        id: string;
        woNumber: string;
        title: string;
        type: string;
        priority: string;
        status: string;
        assigneeName: string | null;
        teamLeaderName: string | null;
        estimatedHours: number | null;
        actualHours: number | null;
        materialCost: number;
        laborCost: number;
        totalCost: number;
        createdAt: string;
        completedDate: string | null;
        plannedEnd: string | null;
        downtimeMinutes: number;
      }[];
      woCount: number;
      completedCount: number;
      totalCost: number;
      totalDowntimeMinutes: number;
      totalActualHours: number;
    }> = {};

    workOrders.forEach(wo => {
      const key = wo.assetId || 'unassigned';
      const name = wo.assetName || 'Unassigned';
      if (!assetWoMap[key]) {
        assetWoMap[key] = {
          assetId: wo.assetId || '',
          assetName: name,
          workOrders: [],
          woCount: 0,
          completedCount: 0,
          totalCost: 0,
          totalDowntimeMinutes: 0,
          totalActualHours: 0,
        };
      }
      const group = assetWoMap[key];
      group.woCount += 1;
      group.totalCost += (wo.totalCost || 0);
      group.totalActualHours += (wo.actualHours || 0);
      if (wo.status === 'completed' || wo.status === 'closed') group.completedCount += 1;
      (wo.workOrderDowntimes || []).forEach(dt => {
        group.totalDowntimeMinutes += (dt.durationMinutes || 0);
      });
      group.workOrders.push({
        id: wo.id,
        woNumber: wo.woNumber || '',
        title: wo.title || '',
        type: wo.type || '',
        priority: wo.priority || '',
        status: wo.status || '',
        assigneeName: wo.assignee?.fullName || null,
        teamLeaderName: wo.teamLeader?.fullName || null,
        estimatedHours: wo.estimatedHours,
        actualHours: wo.actualHours,
        materialCost: wo.partsCost || 0,
        laborCost: wo.laborCost || 0,
        totalCost: wo.totalCost || 0,
        createdAt: wo.createdAt.toISOString(),
        completedDate: wo.actualEnd?.toISOString() || null,
        plannedEnd: wo.plannedEnd?.toISOString() || null,
        downtimeMinutes: (wo.workOrderDowntimes || []).reduce((sum, dt) => sum + (dt.durationMinutes || 0), 0),
      });
    });

    const workOrdersByAsset = Object.values(assetWoMap)
      .sort((a, b) => b.woCount - a.woCount)
      .map(a => {
        const asset = a.assetId ? assetMap.get(a.assetId) : null;
        return {
          ...a,
          assetTag: asset?.assetTag || null,
          manufacturer: asset?.manufacturer || null,
          model: asset?.model || null,
          serialNumber: asset?.serialNumber || null,
          category: asset?.category?.name || null,
          criticality: asset?.criticality || null,
          condition: asset?.condition || null,
          location: asset?.location || null,
          building: asset?.building || null,
          area: asset?.area || null,
          completionRate: a.woCount > 0 ? Math.round((a.completedCount / a.woCount) * 100) : 0,
          avgCostPerWO: a.woCount > 0 ? Math.round((a.totalCost / a.woCount) * 100) / 100 : 0,
        };
      });

    // ========== RECENT WORK ORDERS ==========
    const recentWorkOrders = workOrders.slice(0, 200).map(wo => ({
      id: wo.id,
      woNumber: wo.woNumber,
      title: wo.title,
      type: wo.type,
      priority: wo.priority,
      status: wo.status,
      ...getAssetDetails(wo),
      assigneeName: wo.assignee?.fullName || null,
      teamLeaderName: wo.teamLeader?.fullName || null,
      estimatedHours: wo.estimatedHours,
      actualHours: wo.actualHours,
      materialCost: wo.partsCost,
      laborCost: wo.laborCost,
      totalCost: wo.totalCost,
      createdAt: wo.createdAt.toISOString(),
      completedDate: wo.actualEnd?.toISOString() || null,
      plannedEnd: wo.plannedEnd?.toISOString() || null,
      departmentId: wo.departmentId,
      plantId: wo.plantId,
    }));

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalMRs,
          totalWOs,
          completedWOs,
          completionRate,
          avgCompletionHours: Math.round(avgCompletionHours * 100) / 100,
          avgCostPerWO: Math.round(avgCostPerWO * 100) / 100,
          totalCost: Math.round(totalCost * 100) / 100,
          overdueWOs,
          slaBreachedWOs,
          slaComplianceRate,
          openWOs,
          pendingMRs,
          mrConversionRate,
        },
        woByType,
        woByPriority,
        woByStatus,
        woByMonth,
        technicianProductivity,
        materialConsumption,
        downtimeAnalysis: {
          totalEvents: totalDowntimeEvents,
          totalMinutes: Math.round(totalDowntimeMinutes),
          avgDurationMinutes: avgDowntimeDuration,
          byCategory: downtimeByCategory,
          byImpactLevel: downtimeByImpactLevel,
        },
        repairCompletion: {
          totalCompleted,
          avgReworkCount: totalCompleted > 0 ? Math.round((totalReworkCount / totalCompleted) * 100) / 100 : 0,
          reworkRate,
          avgSupervisorReviewTimeHours: avgSupervisorReviewHours,
          avgClosureTimeHours: avgClosureTimeHours,
        },
        topAssets,
        workOrdersByAsset,
        recentWorkOrders,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load maintenance report data';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
