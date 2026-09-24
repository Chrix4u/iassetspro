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
        statusHistory: { orderBy: { createdAt: 'asc' } },
        repairMaterialRequests: true,
        repairToolRequests: true,
        teamMemberRequests: true,
        sparePartReturns: true,
        damagedToolReports: true,
        shiftHandovers: true,
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

    // ========== BACKLOG & AGING ==========
    const terminalStatuses = new Set(['completed', 'verified', 'closed', 'cancelled']);
    const openWorkOrders = workOrders.filter(wo => !terminalStatuses.has(wo.status));
    const MS_PER_HOUR = 1000 * 60 * 60;
    const MS_PER_DAY = MS_PER_HOUR * 24;
    const round2 = (value: number) => Math.round(value * 100) / 100;
    const hoursBetween = (from: Date | string | null | undefined, toDate: Date | string | null | undefined) => {
      if (!from || !toDate) return null;
      const diff = (new Date(toDate).getTime() - new Date(from).getTime()) / MS_PER_HOUR;
      return Number.isFinite(diff) && diff >= 0 ? diff : null;
    };
    const daysOpen = (createdAt: Date) => Math.max(0, (now.getTime() - createdAt.getTime()) / MS_PER_DAY);
    const openAges = openWorkOrders.map(wo => daysOpen(wo.createdAt));
    const backlogBuckets = [
      { bucket: '0-1 days', min: 0, max: 2 },
      { bucket: '2-3 days', min: 2, max: 4 },
      { bucket: '4-7 days', min: 4, max: 8 },
      { bucket: '8-14 days', min: 8, max: 15 },
      { bucket: '15-30 days', min: 15, max: 31 },
      { bucket: '31+ days', min: 31, max: Number.POSITIVE_INFINITY },
    ].map(range => ({
      bucket: range.bucket,
      count: openAges.filter(age => age >= range.min && age < range.max).length,
    }));
    const backlogAging = {
      totalOpen: openWorkOrders.length,
      overdueOpen: openWorkOrders.filter(wo => wo.plannedEnd && wo.plannedEnd < now).length,
      avgOpenAgeDays: openAges.length ? round2(openAges.reduce((sum, value) => sum + value, 0) / openAges.length) : 0,
      oldestOpenDays: openAges.length ? round2(Math.max(...openAges)) : 0,
      buckets: backlogBuckets,
    };

    // ========== RESPONSE, SLA & CLOSURE LATENCY ==========
    const responseHours = workOrders
      .map(wo => hoursBetween(wo.createdAt, wo.actualStart))
      .filter((value): value is number => value !== null);
    const closureLagHours = workOrders
      .map(wo => hoursBetween(wo.actualEnd, wo.repairCompletion?.plannerClosedAt))
      .filter((value): value is number => value !== null);
    const emergencyResponseHours = workOrders
      .filter(wo => wo.type === 'emergency')
      .map(wo => hoursBetween(wo.createdAt, wo.actualStart))
      .filter((value): value is number => value !== null);
    const responseAndSla = {
      avgResponseHours: responseHours.length ? round2(responseHours.reduce((a, b) => a + b, 0) / responseHours.length) : 0,
      avgEmergencyResponseHours: emergencyResponseHours.length ? round2(emergencyResponseHours.reduce((a, b) => a + b, 0) / emergencyResponseHours.length) : 0,
      avgPlannerClosureLagHours: closureLagHours.length ? round2(closureLagHours.reduce((a, b) => a + b, 0) / closureLagHours.length) : 0,
      slaComplianceRate,
      slaBreachedWOs,
      overdueOpen: backlogAging.overdueOpen,
    };

    // ========== MONTHLY OPERATIONAL TREND ==========
    const monthlyTrendMap: Record<string, {
      opened: number;
      completed: number;
      closed: number;
      emergency: number;
      totalCost: number;
      downtimeMinutes: number;
      productionLoss: number;
    }> = {};
    for (const wo of workOrders) {
      const key = wo.createdAt.toISOString().slice(0, 7);
      if (!monthlyTrendMap[key]) {
        monthlyTrendMap[key] = { opened: 0, completed: 0, closed: 0, emergency: 0, totalCost: 0, downtimeMinutes: 0, productionLoss: 0 };
      }
      const row = monthlyTrendMap[key];
      row.opened += 1;
      if (['completed', 'verified', 'closed'].includes(wo.status)) row.completed += 1;
      if (wo.status === 'closed') row.closed += 1;
      if (wo.type === 'emergency') row.emergency += 1;
      row.totalCost += wo.totalCost || 0;
      for (const downtime of wo.workOrderDowntimes || []) {
        row.downtimeMinutes += downtime.durationMinutes || 0;
        row.productionLoss += downtime.productionLoss || 0;
      }
    }
    const monthlyOperationalTrends = Object.entries(monthlyTrendMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, row]) => ({
        month,
        ...row,
        totalCost: round2(row.totalCost),
        downtimeMinutes: round2(row.downtimeMinutes),
        productionLoss: round2(row.productionLoss),
      }));

    // ========== ASSET RELIABILITY / REPEAT FAILURES ==========
    const failureOrders = workOrders.filter(wo => ['corrective', 'emergency'].includes(wo.type));
    const reliabilityMap = new Map<string, {
      assetId: string;
      assetName: string;
      failures: typeof failureOrders;
    }>();
    for (const wo of failureOrders) {
      const key = wo.assetId || 'unassigned';
      const existing = reliabilityMap.get(key) || { assetId: wo.assetId || '', assetName: wo.assetName || 'Unassigned', failures: [] };
      existing.failures.push(wo);
      reliabilityMap.set(key, existing);
    }
    const assetReliability = Array.from(reliabilityMap.values()).map(group => {
      const sorted = [...group.failures].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const intervals: number[] = [];
      for (let index = 1; index < sorted.length; index++) {
        intervals.push((sorted[index].createdAt.getTime() - sorted[index - 1].createdAt.getTime()) / MS_PER_DAY);
      }
      const repairHours = sorted.map(wo => {
        const exact = hoursBetween(wo.actualStart, wo.actualEnd);
        return exact ?? wo.actualHours ?? wo.repairCompletion?.totalLaborHours ?? 0;
      });
      const downtimeMinutes = sorted.reduce(
        (sum, wo) => sum + (wo.workOrderDowntimes || []).reduce((inner, dt) => inner + (dt.durationMinutes || 0), 0),
        0,
      );
      const productionLoss = sorted.reduce(
        (sum, wo) => sum + (wo.workOrderDowntimes || []).reduce((inner, dt) => inner + (dt.productionLoss || 0), 0),
        0,
      );
      const totalCost = sorted.reduce((sum, wo) => sum + (wo.totalCost || 0), 0);
      const asset = group.assetId ? assetMap.get(group.assetId) : null;
      return {
        assetId: group.assetId,
        assetName: group.assetName,
        assetTag: asset?.assetTag || null,
        criticality: asset?.criticality || null,
        failureCount: sorted.length,
        repeatFailure: sorted.length > 1,
        mtbfDays: intervals.length ? round2(intervals.reduce((a, b) => a + b, 0) / intervals.length) : null,
        mttrHours: repairHours.length ? round2(repairHours.reduce((a, b) => a + b, 0) / repairHours.length) : 0,
        downtimeMinutes: round2(downtimeMinutes),
        productionLoss: round2(productionLoss),
        totalCost: round2(totalCost),
        lastFailureAt: sorted.at(-1)?.createdAt.toISOString() || null,
      };
    }).sort((a, b) => b.failureCount - a.failureCount || b.downtimeMinutes - a.downtimeMinutes);

    // ========== COST / ECONOMIC IMPACT ==========
    const totalLaborCost = workOrders.reduce((sum, wo) => sum + (wo.laborCost || 0), 0);
    const totalMaterialCost = workOrders.reduce((sum, wo) => sum + (wo.partsCost || wo.repairCompletion?.totalMaterialCost || 0), 0);
    const totalToolUsageCost = workOrders.reduce((sum, wo) => sum + (wo.repairCompletion?.totalToolCost || 0), 0);
    const downtimeProductionLoss = allDowntimes.reduce((sum, dt) => sum + (dt.productionLoss || 0), 0);
    const sparePartRefurbishmentCost = workOrders.reduce(
      (sum, wo) => sum + (wo.sparePartReturns || []).reduce((inner, ret) => inner + (ret.actualRefurbCost || 0), 0),
      0,
    );
    const damagedToolRepairCost = workOrders.reduce(
      (sum, wo) => sum + (wo.damagedToolReports || []).reduce((inner, report) => inner + (report.actualRepairCost || 0), 0),
      0,
    );
    const costAnalysis = {
      recordedMaintenanceCost: round2(totalCost),
      laborCost: round2(totalLaborCost),
      materialCost: round2(totalMaterialCost),
      toolUsageCost: round2(totalToolUsageCost),
      damagedToolRepairCost: round2(damagedToolRepairCost),
      sparePartRefurbishmentCost: round2(sparePartRefurbishmentCost),
      downtimeProductionLoss: round2(downtimeProductionLoss),
      trackedEconomicImpact: round2(totalCost + damagedToolRepairCost + sparePartRefurbishmentCost + downtimeProductionLoss),
      avgRecordedCostPerWo: totalWOs ? round2(totalCost / totalWOs) : 0,
    };

    // ========== RESOURCE, ASSISTANCE & HANDOVER FLOW ==========
    const materialRequests = workOrders.flatMap(wo => wo.repairMaterialRequests || []);
    const toolRequests = workOrders.flatMap(wo => wo.repairToolRequests || []);
    const assistanceRequests = workOrders.flatMap(wo => wo.teamMemberRequests || []);
    const handovers = workOrders.flatMap(wo => wo.shiftHandovers || []);
    const materialIssueHours = materialRequests
      .map(row => hoursBetween(row.createdAt, row.issuedAt))
      .filter((value): value is number => value !== null);
    const toolIssueHours = toolRequests
      .map(row => hoursBetween(row.createdAt, row.issuedAt))
      .filter((value): value is number => value !== null);
    const assistanceReviewHours = assistanceRequests
      .map(row => hoursBetween(row.createdAt, row.reviewedAt))
      .filter((value): value is number => value !== null);
    const pendingMaterialStatuses = new Set(['pending', 'supervisor_approved', 'storekeeper_approved', 'store_approved', 'picking']);
    const pendingToolStatuses = new Set(['pending', 'supervisor_approved', 'storekeeper_approved']);
    const materialWasteCost = materialRequests.reduce((sum, row) => sum + ((row.wastedQty || 0) * (row.unitCost || 0)), 0);
    const materialReturnValue = materialRequests.reduce((sum, row) => sum + ((row.quantityReturned || row.declaredReturnQty || 0) * (row.unitCost || 0)), 0);
    const resourceFlow = {
      materials: {
        totalRequests: materialRequests.length,
        pendingRequests: materialRequests.filter(row => pendingMaterialStatuses.has(row.status)).length,
        issuedRequests: materialRequests.filter(row => (row.quantityIssued || 0) > 0).length,
        pendingReconciliation: materialRequests.filter(row => (row.quantityIssued || 0) > 0 && row.consumedQty === null).length,
        avgIssueHours: materialIssueHours.length ? round2(materialIssueHours.reduce((a, b) => a + b, 0) / materialIssueHours.length) : 0,
        wasteCost: round2(materialWasteCost),
        returnValue: round2(materialReturnValue),
      },
      tools: {
        totalRequests: toolRequests.length,
        pendingRequests: toolRequests.filter(row => pendingToolStatuses.has(row.status)).length,
        issuedRequests: toolRequests.filter(row => Boolean(row.issuedAt)).length,
        outstandingCustody: toolRequests.filter(row => Boolean(row.issuedAt) && !row.returnConfirmedAt && row.status !== 'returned').length,
        returnedRequests: toolRequests.filter(row => Boolean(row.returnConfirmedAt) || row.status === 'returned').length,
        avgIssueHours: toolIssueHours.length ? round2(toolIssueHours.reduce((a, b) => a + b, 0) / toolIssueHours.length) : 0,
      },
      assistance: {
        totalRequests: assistanceRequests.length,
        pending: assistanceRequests.filter(row => row.status === 'pending').length,
        approved: assistanceRequests.filter(row => row.status === 'approved').length,
        rejected: assistanceRequests.filter(row => row.status === 'rejected').length,
        cancelled: assistanceRequests.filter(row => row.status === 'cancelled').length,
        avgReviewHours: assistanceReviewHours.length ? round2(assistanceReviewHours.reduce((a, b) => a + b, 0) / assistanceReviewHours.length) : 0,
      },
      handovers: {
        total: handovers.length,
        pending: handovers.filter(row => row.status === 'pending').length,
        confirmed: handovers.filter(row => row.status === 'confirmed').length,
      },
    };

    // ========== RETURNS & DAMAGED TOOLS ==========
    const sparePartReturns = workOrders.flatMap(wo => wo.sparePartReturns || []);
    const damagedToolReports = workOrders.flatMap(wo => wo.damagedToolReports || []);
    const returnsAndDamage = {
      spareParts: {
        totalReturns: sparePartReturns.length,
        pending: sparePartReturns.filter(row => ['pending', 'inspected', 'refurbishing', 'refurbished'].includes(row.status)).length,
        returnedToStore: sparePartReturns.filter(row => row.status === 'returned_to_store').length,
        disposed: sparePartReturns.filter(row => row.status === 'disposed').length,
        refurbishmentNeeded: sparePartReturns.filter(row => row.refurbishmentNeeded).length,
        refurbishmentCost: round2(sparePartReturns.reduce((sum, row) => sum + (row.actualRefurbCost || 0), 0)),
      },
      damagedTools: {
        totalReports: damagedToolReports.length,
        openReports: damagedToolReports.filter(row => !['repaired', 'written_off', 'replaced'].includes(row.status)).length,
        repaired: damagedToolReports.filter(row => row.status === 'repaired').length,
        writtenOff: damagedToolReports.filter(row => row.status === 'written_off').length,
        criticalDamage: damagedToolReports.filter(row => row.damageSeverity === 'critical').length,
        repairCost: round2(damagedToolReports.reduce((sum, row) => sum + (row.actualRepairCost || 0), 0)),
      },
    };

    // ========== CLOSURE QUALITY / RCA COMPLIANCE ==========
    const completionEligible = workOrders.filter(wo => ['completed', 'verified', 'closed'].includes(wo.status));
    const closureRows = completionEligible.map(wo => {
      const completion = wo.repairCompletion;
      const requiresRca = ['corrective', 'emergency', 'predictive'].includes(wo.type);
      const rcaComplete = !requiresRca || Boolean(
        completion?.rootCause?.trim() &&
        completion?.correctiveAction?.trim()
      );
      const supervisorApproved = completion?.supervisorStatus === 'approved' && Boolean(completion.supervisorApprovedAt);
      const plannerClosed = wo.status !== 'closed' || (completion?.plannerStatus === 'closed' && Boolean(completion.plannerClosedAt));
      return {
        workOrderId: wo.id,
        woNumber: wo.woNumber,
        status: wo.status,
        requiresRca,
        rcaComplete,
        supervisorApproved,
        plannerClosed,
        reworkCount: completion?.reworkCount || 0,
        compliant: rcaComplete && supervisorApproved && plannerClosed,
      };
    });
    const closureCompliance = {
      eligibleWOs: closureRows.length,
      compliantWOs: closureRows.filter(row => row.compliant).length,
      complianceRate: closureRows.length ? round2((closureRows.filter(row => row.compliant).length / closureRows.length) * 100) : 100,
      missingRca: closureRows.filter(row => row.requiresRca && !row.rcaComplete).length,
      awaitingSupervisorApproval: closureRows.filter(row => !row.supervisorApproved).length,
      awaitingPlannerClosure: closureRows.filter(row => row.status === 'closed' && !row.plannerClosed).length,
      reworkWOs: closureRows.filter(row => row.reworkCount > 0).length,
      totalReworkInstances: closureRows.reduce((sum, row) => sum + row.reworkCount, 0),
    };

    // ========== MANAGEMENT EXCEPTION WATCHLIST ==========
    const exceptionWatchlist = openWorkOrders.map(wo => {
      const pendingMaterials = (wo.repairMaterialRequests || []).filter(row => pendingMaterialStatuses.has(row.status)).length;
      const outstandingTools = (wo.repairToolRequests || []).filter(row => Boolean(row.issuedAt) && !row.returnConfirmedAt && row.status !== 'returned').length;
      const pendingAssistance = (wo.teamMemberRequests || []).filter(row => row.status === 'pending').length;
      const pendingHandovers = (wo.shiftHandovers || []).filter(row => row.status === 'pending').length;
      const downtimeMinutes = (wo.workOrderDowntimes || []).reduce((sum, row) => sum + (row.durationMinutes || 0), 0);
      const reasons: string[] = [];
      if (wo.plannedEnd && wo.plannedEnd < now) reasons.push('Overdue');
      if (['critical', 'emergency'].includes(wo.priority)) reasons.push('Critical priority');
      if (wo.type === 'emergency') reasons.push('Emergency repair');
      if (pendingMaterials > 0) reasons.push(`${pendingMaterials} material request(s) pending`);
      if (outstandingTools > 0) reasons.push(`${outstandingTools} tool(s) in custody`);
      if (pendingAssistance > 0) reasons.push(`${pendingAssistance} assistance request(s) pending`);
      if (pendingHandovers > 0) reasons.push(`${pendingHandovers} handover(s) pending`);
      if (downtimeMinutes >= 240) reasons.push('High downtime');
      const age = round2(daysOpen(wo.createdAt));
      const riskLevel = reasons.includes('Overdue') && (wo.priority === 'critical' || wo.type === 'emergency')
        ? 'critical'
        : reasons.length >= 3 || age >= 15
          ? 'high'
          : reasons.length >= 1
            ? 'medium'
            : 'low';
      return {
        id: wo.id,
        woNumber: wo.woNumber,
        title: wo.title,
        assetName: wo.assetName || 'Unassigned',
        priority: wo.priority,
        status: wo.status,
        ageDays: age,
        plannedEnd: wo.plannedEnd?.toISOString() || null,
        pendingMaterials,
        outstandingTools,
        pendingAssistance,
        pendingHandovers,
        downtimeMinutes: round2(downtimeMinutes),
        riskLevel,
        reasons,
      };
    }).filter(row => row.reasons.length > 0)
      .sort((a, b) => {
        const rank: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 };
        return (rank[b.riskLevel] - rank[a.riskLevel]) || (b.ageDays - a.ageDays);
      })
      .slice(0, 100);

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
        backlogAging,
        responseAndSla,
        monthlyOperationalTrends,
        assetReliability,
        costAnalysis,
        resourceFlow,
        returnsAndDamage,
        closureCompliance,
        exceptionWatchlist,
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
