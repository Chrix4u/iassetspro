import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin, hasAnyPermission } from '@/lib/auth';
import { getPlantScope, getPlantFilterWhere } from '@/lib/plant-scope';
import { generateReportPDF } from '@/lib/generate-report-pdf';

// GET /api/work-orders/reports
// Comprehensive WO reports: downtime, response time, breakdowns, man hours, materials, failure rate, stoppages
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    // Permission gate: require reports.view, work_orders.dashboard, or admin
    if (!hasAnyPermission(session, ['reports.view', 'reports.export', 'work_orders.dashboard', 'analytics.view']) && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions: reports.view required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const department = searchParams.get('department');
    const trade = searchParams.get('trade');
    const priority = searchParams.get('priority');
    const format = searchParams.get('format');
    const moduleFilter = searchParams.get('moduleFilter') || 'all';

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    const plantFilter = getPlantFilterWhere(plantScope);

    // Date filter
    const dateFilter: Record<string, unknown> = {};
    if (from) dateFilter.gte = new Date(from + 'T00:00:00');
    if (to) dateFilter.lte = new Date(to + 'T23:59:59');

    const woWhere: Record<string, unknown> = {
      ...plantFilter,
      status: { notIn: ['draft', 'cancelled'] },
    };
    if (Object.keys(dateFilter).length > 0) woWhere.createdAt = dateFilter;
    if (department) woWhere.departmentId = department;
    if (trade) woWhere.tradeActivity = trade;
    if (priority) woWhere.priority = priority;
    if (moduleFilter === 'repairs') woWhere.type = { in: ['corrective', 'emergency'] };
    if (moduleFilter === 'pm') woWhere.type = { in: ['preventive'] };

    // Fetch all relevant WOs with relations
    const workOrders = await db.workOrder.findMany({
      where: Object.keys(woWhere).length > 0 ? woWhere : undefined,
      include: {
        assignee: { select: { id: true, fullName: true, department: true } },
        teamLeader: { select: { id: true, fullName: true } },
        materials: true,
        timeLogs: true,
        workOrderDowntimes: true,
        repairCompletion: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
        taskExecutions: true,
        failureRecords: true,
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

    // Fetch component registry data for component-level cost analysis
    const woIds = workOrders.map(wo => wo.id);
    const woComponents = woIds.length > 0 ? await db.workOrderComponent.findMany({
      where: { workOrderId: { in: woIds } },
      include: {
        componentRegistry: {
          include: { asset: { select: { name: true, assetTag: true } } },
        },
      },
    }) : [];
    // Build component cost aggregation
    const componentCostMap = new Map<string, {
      componentId: string;
      componentCode: string;
      componentName: string;
      componentType: string;
      criticality: string;
      assetName: string;
      assetTag: string;
      woCount: number;
      totalCost: number;
      laborCost: number;
      partsCost: number;
      contractorCost: number;
      lastRepairDate: Date | null;
      failureCount: number;
    }>();
    const woMap = new Map(workOrders.map(wo => [wo.id, wo]));
    for (const woc of woComponents) {
      const comp = woc.componentRegistry;
      if (!comp) continue;
      const key = comp.id;
      const wo = woMap.get(woc.workOrderId);
      if (!wo) continue;
      const existing = componentCostMap.get(key);
      const woTotalCost = (wo.laborCost || 0) + (wo.partsCost || 0) + (wo.contractorCost || 0);
      const isFailure = ['emergency', 'corrective'].includes(wo.type || '');
      if (existing) {
        existing.woCount++;
        existing.totalCost += woTotalCost;
        existing.laborCost += wo.laborCost || 0;
        existing.partsCost += wo.partsCost || 0;
        existing.contractorCost += wo.contractorCost || 0;
        if (isFailure) existing.failureCount++;
        if (wo.actualEnd && (!existing.lastRepairDate || wo.actualEnd > existing.lastRepairDate)) {
          existing.lastRepairDate = wo.actualEnd;
        }
      } else {
        componentCostMap.set(key, {
          componentId: comp.id,
          componentCode: comp.componentCode || '',
          componentName: comp.name || 'Unknown',
          componentType: comp.componentType || 'component',
          criticality: comp.criticality || 'low',
          assetName: comp.asset?.name || wo.assetName || 'Unknown',
          assetTag: comp.asset?.assetTag || '',
          woCount: 1,
          totalCost: woTotalCost,
          laborCost: wo.laborCost || 0,
          partsCost: wo.partsCost || 0,
          contractorCost: wo.contractorCost || 0,
          lastRepairDate: wo.actualEnd ?? null,
          failureCount: isFailure ? 1 : 0,
        });
      }
    }
    const componentCosts = Array.from(componentCostMap.values())
      .map(c => ({
        ...c,
        totalCost: Math.round(c.totalCost * 100) / 100,
        laborCost: Math.round(c.laborCost * 100) / 100,
        partsCost: Math.round(c.partsCost * 100) / 100,
        contractorCost: Math.round(c.contractorCost * 100) / 100,
        avgCostPerWO: c.woCount > 0 ? Math.round((c.totalCost / c.woCount) * 100) / 100 : 0,
        lastRepairDate: c.lastRepairDate?.toISOString() || null,
      }))
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 20);

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

    const total = workOrders.length;
    const closedWOs = workOrders.filter(wo => wo.status === 'closed');
    const completedWOs = workOrders.filter(wo => ['completed', 'verified', 'closed'].includes(wo.status));
    const breakdownWOs = workOrders.filter(wo => ['emergency', 'corrective'].includes(wo.type));

    // ========== 1. SUMMARY KPIs ==========
    const summary = {
      totalWOs: total,
      completedWOs: completedWOs.length,
      closedWOs: closedWOs.length,
      completionRate: total > 0 ? Math.round((completedWOs.length / total) * 10000) / 100 : 0,
      breakdownCount: breakdownWOs.length,
      breakdownRate: total > 0 ? Math.round((breakdownWOs.length / total) * 10000) / 100 : 0,
    };

    // ========== 2. DOWNTIME (per trade) ==========
    const downtimeByTrade: Record<string, { totalMinutes: number; events: number; productionLoss: number }> = {};
    for (const wo of workOrders) {
      const dtEvents = wo.workOrderDowntimes || [];
      const trade = wo.tradeActivity || 'Unassigned';
      for (const dt of dtEvents) {
        if (!downtimeByTrade[trade]) downtimeByTrade[trade] = { totalMinutes: 0, events: 0, productionLoss: 0 };
        downtimeByTrade[trade].totalMinutes += dt.durationMinutes;
        downtimeByTrade[trade].events++;
        downtimeByTrade[trade].productionLoss += dt.productionLoss || 0;
      }
    }
    const totalDowntimeMinutes = Object.values(downtimeByTrade).reduce((s, d) => s + d.totalMinutes, 0);
    const totalDowntimeEvents = Object.values(downtimeByTrade).reduce((s, d) => s + d.events, 0);
    const totalProductionLoss = Object.values(downtimeByTrade).reduce((s, d) => s + d.productionLoss, 0);

    const downtimeByTradeArray = Object.entries(downtimeByTrade)
      .map(([tradeName, data]) => ({
        trade: tradeName,
        totalHours: Math.round((data.totalMinutes / 60) * 100) / 100,
        totalMinutes: data.totalMinutes,
        events: data.events,
        productionLoss: data.productionLoss,
      }))
      .sort((a, b) => b.totalHours - a.totalHours);

    // Downtime by month
    const downtimeByMonth: Record<string, { minutes: number; events: number }> = {};
    for (const wo of workOrders) {
      for (const dt of (wo.workOrderDowntimes || [])) {
        const month = dt.downtimeStart?.toISOString().slice(0, 7) || 'unknown';
        if (!downtimeByMonth[month]) downtimeByMonth[month] = { minutes: 0, events: 0 };
        downtimeByMonth[month].minutes += dt.durationMinutes;
        downtimeByMonth[month].events++;
      }
    }
    const downtimeByMonthArray = Object.entries(downtimeByMonth)
      .map(([month, data]) => ({
        month,
        totalHours: Math.round((data.minutes / 60) * 100) / 100,
        events: data.events,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Downtime by category
    const downtimeByCategory: Record<string, { minutes: number; events: number }> = {};
    for (const wo of workOrders) {
      for (const dt of (wo.workOrderDowntimes || [])) {
        const cat = dt.category || 'unplanned';
        if (!downtimeByCategory[cat]) downtimeByCategory[cat] = { minutes: 0, events: 0 };
        downtimeByCategory[cat].minutes += dt.durationMinutes;
        downtimeByCategory[cat].events++;
      }
    }
    const downtimeByCategoryArray = Object.entries(downtimeByCategory)
      .map(([category, data]) => ({
        category,
        totalHours: Math.round((data.minutes / 60) * 100) / 100,
        events: data.events,
      }))
      .sort((a, b) => b.totalHours - a.totalHours);

    // ========== 3. RESPONSE TIME ==========
    // Response time = time from WO creation to first status that indicates work started (in_progress)
    const responseTimes: { hours: number; priority: string; type: string; trade: string; woId: string }[] = [];
    for (const wo of workOrders) {
      const history = wo.statusHistory || [];
      if (history.length === 0) continue;

      // Find the transition to 'in_progress' (or 'assigned' as fallback)
      const startEntry = history.find(h => h.toStatus === 'in_progress')
        || history.find(h => h.toStatus === 'assigned');

      if (startEntry && wo.createdAt) {
        const hours = (startEntry.createdAt.getTime() - wo.createdAt.getTime()) / (1000 * 60 * 60);
        if (hours >= 0 && hours < 10000) { // sanity check
          responseTimes.push({
            hours: Math.round(hours * 100) / 100,
            priority: wo.priority,
            type: wo.type,
            trade: wo.tradeActivity || 'Unassigned',
            woId: wo.id,
          });
        }
      }
    }

    const avgResponseTime = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((s, r) => s + r.hours, 0) / responseTimes.length * 100) / 100
      : 0;

    // Response time by priority
    const responseByPriority: Record<string, number[]> = {};
    for (const r of responseTimes) {
      if (!responseByPriority[r.priority]) responseByPriority[r.priority] = [];
      responseByPriority[r.priority].push(r.hours);
    }
    const responseByPriorityArray = Object.entries(responseByPriority)
      .map(([p, hours]) => ({
        priority: p,
        avgHours: Math.round(hours.reduce((s, h) => s + h, 0) / hours.length * 100) / 100,
        minHours: Math.round(Math.min(...hours) * 100) / 100,
        maxHours: Math.round(Math.max(...hours) * 100) / 100,
        count: hours.length,
      }))
      .sort((a, b) => a.avgHours - b.avgHours);

    // Response time by trade
    const responseByTrade: Record<string, number[]> = {};
    for (const r of responseTimes) {
      if (!responseByTrade[r.trade]) responseByTrade[r.trade] = [];
      responseByTrade[r.trade].push(r.hours);
    }
    const responseByTradeArray = Object.entries(responseByTrade)
      .map(([t, hours]) => ({
        trade: t,
        avgHours: Math.round(hours.reduce((s, h) => s + h, 0) / hours.length * 100) / 100,
        count: hours.length,
      }))
      .sort((a, b) => a.avgHours - b.avgHours);

    // ========== 4. BREAKDOWNS ==========
    // Breakdown by type
    const breakdownByType: Record<string, number> = {};
    for (const wo of breakdownWOs) {
      const t = wo.type || 'unknown';
      breakdownByType[t] = (breakdownByType[t] || 0) + 1;
    }
    const breakdownByTypeArray = Object.entries(breakdownByType)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    // Breakdown by trade
    const breakdownByTrade: Record<string, number> = {};
    for (const wo of breakdownWOs) {
      const t = wo.tradeActivity || 'Unassigned';
      breakdownByTrade[t] = (breakdownByTrade[t] || 0) + 1;
    }
    const breakdownByTradeArray = Object.entries(breakdownByTrade)
      .map(([trade, count]) => ({ trade, count }))
      .sort((a, b) => b.count - a.count);

    // Breakdown by month
    const breakdownByMonth: Record<string, number> = {};
    for (const wo of breakdownWOs) {
      const month = wo.createdAt.toISOString().slice(0, 7);
      breakdownByMonth[month] = (breakdownByMonth[month] || 0) + 1;
    }
    const breakdownByMonthArray = Object.entries(breakdownByMonth)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Breakdown by priority
    const breakdownByPriority: Record<string, number> = {};
    for (const wo of breakdownWOs) {
      const p = wo.priority || 'medium';
      breakdownByPriority[p] = (breakdownByPriority[p] || 0) + 1;
    }
    const breakdownByPriorityArray = Object.entries(breakdownByPriority)
      .map(([priority, count]) => ({ priority, count }))
      .sort((a, b) => b.count - a.count);

    // ========== 5. MAN HOURS ==========
    // From timeLogs and repairCompletion
    const manHoursByTrade: Record<string, { totalHours: number; woCount: number }> = {};
    const manHoursByTechnician: Record<string, { name: string; totalHours: number; woCount: number }> = {};
    let grandTotalManHours = 0;

    for (const wo of workOrders) {
      const trade = wo.tradeActivity || 'Unassigned';

      // Get hours from timeLogs (primary), actualHours (fallback), repairCompletion (override)
      let woHours = 0;
      for (const tl of (wo.timeLogs || [])) {
        if (tl.duration && tl.duration > 0) {
          woHours += tl.duration;
        }
      }
      // Fallback to WO's actualHours when no time logs exist
      if (woHours === 0 && wo.actualHours && wo.actualHours > 0) {
        woHours = wo.actualHours;
      }
      // Override with repairCompletion if higher (supervisor-verified hours)
      if (wo.repairCompletion && wo.repairCompletion.totalLaborHours > woHours) {
        woHours = wo.repairCompletion.totalLaborHours;
      }

      grandTotalManHours += woHours;

      // By trade
      if (!manHoursByTrade[trade]) manHoursByTrade[trade] = { totalHours: 0, woCount: 0 };
      manHoursByTrade[trade].totalHours += woHours;
      manHoursByTrade[trade].woCount++;

      // By technician
      const techId = wo.assignedTo || 'unassigned';
      const techName = wo.assignee?.fullName || 'Unassigned';
      if (!manHoursByTechnician[techId]) {
        manHoursByTechnician[techId] = { name: techName, totalHours: 0, woCount: 0 };
      }
      manHoursByTechnician[techId].totalHours += woHours;
      manHoursByTechnician[techId].woCount++;
    }

    const manHoursByTradeArray = Object.entries(manHoursByTrade)
      .map(([trade, data]) => ({
        trade,
        totalHours: Math.round(data.totalHours * 100) / 100,
        woCount: data.woCount,
        avgHoursPerWO: data.woCount > 0 ? Math.round((data.totalHours / data.woCount) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.totalHours - a.totalHours);

    const manHoursByTechnicianArray = Object.values(manHoursByTechnician)
      .map(data => ({
        ...data,
        totalHours: Math.round(data.totalHours * 100) / 100,
        avgHoursPerWO: data.woCount > 0 ? Math.round((data.totalHours / data.woCount) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.totalHours - a.totalHours);

    // Man hours by month
    const manHoursByMonth: Record<string, number> = {};
    for (const wo of workOrders) {
      const month = wo.createdAt.toISOString().slice(0, 7);
      let woHours = 0;
      for (const tl of (wo.timeLogs || [])) {
        if (tl.duration && tl.duration > 0) woHours += tl.duration;
      }
      if (woHours === 0 && wo.actualHours && wo.actualHours > 0) {
        woHours = wo.actualHours;
      }
      if (wo.repairCompletion && wo.repairCompletion.totalLaborHours > woHours) {
        woHours = wo.repairCompletion.totalLaborHours;
      }
      manHoursByMonth[month] = (manHoursByMonth[month] || 0) + woHours;
    }
    const manHoursByMonthArray = Object.entries(manHoursByMonth)
      .map(([month, totalHours]) => ({
        month,
        totalHours: Math.round(totalHours * 100) / 100,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Man hours by activity type
    const manHoursByActivity: Record<string, number> = {};
    for (const wo of workOrders) {
      for (const tl of (wo.timeLogs || [])) {
        const act = tl.activityType || 'maintenance';
        manHoursByActivity[act] = (manHoursByActivity[act] || 0) + (tl.duration || 0);
      }
    }
    const manHoursByActivityArray = Object.entries(manHoursByActivity)
      .map(([activity, totalHours]) => ({
        activity,
        totalHours: Math.round(totalHours * 100) / 100,
      }))
      .sort((a, b) => b.totalHours - a.totalHours);

    // ========== 6. MATERIAL QUANTITY AND COST ==========
    let totalMaterialCost = 0;
    let totalMaterialQty = 0;
    const materialsByCategory: Record<string, { qty: number; cost: number; woCount: number }> = {};
    const topMaterials: Record<string, { name: string; qty: number; cost: number; woCount: Set<string> }> = {};

    for (const wo of workOrders) {
      for (const mat of (wo.materials || [])) {
        const qty = mat.quantity || 0;
        const cost = mat.totalCost || (mat.unitCost && mat.quantity ? mat.unitCost * mat.quantity : 0);
        totalMaterialQty += qty;
        totalMaterialCost += cost;

        // By WO type
        const woType = wo.type || 'other';
        if (!materialsByCategory[woType]) materialsByCategory[woType] = { qty: 0, cost: 0, woCount: 0 };
        materialsByCategory[woType].qty += qty;
        materialsByCategory[woType].cost += cost;
        materialsByCategory[woType].woCount++;

        // Top items
        const itemName = mat.itemName || mat.itemId || 'Unknown Item';
        if (!topMaterials[itemName]) topMaterials[itemName] = { name: itemName, qty: 0, cost: 0, woCount: new Set() };
        topMaterials[itemName].qty += qty;
        topMaterials[itemName].cost += cost;
        topMaterials[itemName].woCount.add(wo.id);
      }
    }

    const materialsByCategoryArray = Object.entries(materialsByCategory)
      .map(([type, data]) => ({
        type,
        totalQty: Math.round(data.qty * 100) / 100,
        totalCost: Math.round(data.cost * 100) / 100,
        woCount: data.woCount,
      }))
      .sort((a, b) => b.totalCost - a.totalCost);

    const topMaterialsArray = Object.values(topMaterials)
      .map(data => ({
        name: data.name,
        ...getItemDetails(data.name),
        totalQty: Math.round(data.qty * 100) / 100,
        totalCost: Math.round(data.cost * 100) / 100,
        woCount: data.woCount.size,
      }))
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 20);

    // Material cost by month
    const materialCostByMonth: Record<string, number> = {};
    for (const wo of workOrders) {
      const month = wo.createdAt.toISOString().slice(0, 7);
      let woMatCost = 0;
      for (const mat of (wo.materials || [])) {
        woMatCost += mat.totalCost || (mat.unitCost && mat.quantity ? mat.unitCost * mat.quantity : 0);
      }
      materialCostByMonth[month] = (materialCostByMonth[month] || 0) + woMatCost;
    }
    const materialCostByMonthArray = Object.entries(materialCostByMonth)
      .map(([month, totalCost]) => ({
        month,
        totalCost: Math.round(totalCost * 100) / 100,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // ========== 7. FAILURE RATE ==========
    // Failure rate per asset: (failure WOs / total WOs for that asset) * 100
    const assetWOs: Record<string, { name: string; total: number; failures: number }> = {};
    for (const wo of workOrders) {
      const assetId = wo.assetId || 'unassigned';
      const assetName = wo.assetName || 'Unknown Asset';
      if (!assetWOs[assetId]) assetWOs[assetId] = { name: assetName, total: 0, failures: 0 };
      assetWOs[assetId].total++;
      if (['emergency', 'corrective'].includes(wo.type)) {
        assetWOs[assetId].failures++;
      }
    }

    const failureRateByAsset = Object.entries(assetWOs)
      .filter(([, data]) => data.total >= 2) // Only assets with 2+ WOs
      .map(([assetId, data]) => {
        const asset = assetId !== 'unassigned' ? assetMap.get(assetId) : null;
        return {
          assetId: assetId !== 'unassigned' ? assetId : null,
          assetName: data.name,
          manufacturer: asset?.manufacturer || null,
          model: asset?.model || null,
          serialNumber: asset?.serialNumber || null,
          category: asset?.category?.name || null,
          criticality: asset?.criticality || null,
          condition: asset?.condition || null,
          location: asset?.location || null,
          building: asset?.building || null,
          area: asset?.area || null,
          totalWOs: data.total,
          failures: data.failures,
          failureRate: Math.round((data.failures / data.total) * 10000) / 100,
        };
      })
      .sort((a, b) => b.failureRate - a.failureRate)
      .slice(0, 20);

    // Failure rate by type
    const failureRateByType: Record<string, { total: number; failures: number }> = {};
    for (const wo of workOrders) {
      const t = wo.type || 'other';
      if (!failureRateByType[t]) failureRateByType[t] = { total: 0, failures: 0 };
      failureRateByType[t].total++;
      if (['emergency', 'corrective'].includes(wo.type)) {
        failureRateByType[t].failures++;
      }
    }
    const failureRateByTypeArray = Object.entries(failureRateByType)
      .map(([type, data]) => ({
        type,
        total: data.total,
        failures: data.failures,
        failureRate: data.total > 0 ? Math.round((data.failures / data.total) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.failureRate - a.failureRate);

    // MTBF (Mean Time Between Failures) per asset
    const mtbfByAsset = Object.entries(assetWOs)
      .filter(([, data]) => data.failures >= 2)
      .map(([assetId, data]) => {
        // Calculate operating period from first to last WO
        const assetWOList = workOrders.filter(wo => wo.assetId === assetId);
        if (assetWOList.length < 2) return null;
        const firstDate = assetWOList[assetWOList.length - 1].createdAt;
        const lastDate = assetWOList[0].createdAt;
        const operatingDays = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);
        const mtbfDays = data.failures > 0 ? operatingDays / data.failures : 0;
        const asset = assetId !== 'unassigned' ? assetMap.get(assetId) : null;
        return {
          assetId: assetId !== 'unassigned' ? assetId : null,
          assetName: data.name,
          manufacturer: asset?.manufacturer || null,
          model: asset?.model || null,
          serialNumber: asset?.serialNumber || null,
          category: asset?.category?.name || null,
          criticality: asset?.criticality || null,
          condition: asset?.condition || null,
          location: asset?.location || null,
          building: asset?.building || null,
          area: asset?.area || null,
          mtbfDays: Math.round(mtbfDays * 10) / 10,
          mtbfHours: Math.round(mtbfDays * 24 * 10) / 10,
          failureCount: data.failures,
          operatingDays: Math.round(operatingDays),
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a as any).mtbfDays - (b as any).mtbfDays) as any[];

    // Rework rate (repeat failures)
    const reworkWOs = workOrders.filter(wo => wo.repairCompletion && wo.repairCompletion.reworkCount > 0);
    const reworkRate = total > 0 ? Math.round((reworkWOs.length / total) * 10000) / 100 : 0;

    // ========== 8. STOPPAGES ==========
    const totalStoppages = totalDowntimeEvents;
    const stoppagesByTrade = downtimeByTradeArray.map(d => ({
      trade: d.trade,
      count: d.events,
      totalHours: d.totalHours,
    }));

    // Stoppages by impact level
    const stoppagesByImpact: Record<string, { count: number; minutes: number }> = {};
    for (const wo of workOrders) {
      for (const dt of (wo.workOrderDowntimes || [])) {
        const impact = dt.impactLevel || 'medium';
        if (!stoppagesByImpact[impact]) stoppagesByImpact[impact] = { count: 0, minutes: 0 };
        stoppagesByImpact[impact].count++;
        stoppagesByImpact[impact].minutes += dt.durationMinutes;
      }
    }
    const stoppagesByImpactArray = Object.entries(stoppagesByImpact)
      .map(([impact, data]) => ({
        impact,
        count: data.count,
        totalHours: Math.round((data.minutes / 60) * 100) / 100,
      }))
      .sort((a, b) => b.count - a.count);

    // Stoppages by reason
    const stoppagesByReason: Record<string, number> = {};
    for (const wo of workOrders) {
      for (const dt of (wo.workOrderDowntimes || [])) {
        const reason = dt.reason || 'Unassigned';
        stoppagesByReason[reason] = (stoppagesByReason[reason] || 0) + 1;
      }
    }
    const stoppagesByReasonArray = Object.entries(stoppagesByReason)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // ========== 9. COST ANALYSIS ==========
    let grandTotalCost = 0;
    let grandLaborCost = 0;
    let grandPartsCost = 0;
    let grandContractorCost = 0;

    for (const wo of workOrders) {
      grandTotalCost += wo.totalCost || 0;
      grandLaborCost += wo.laborCost || 0;
      grandPartsCost += wo.partsCost || 0;
      grandContractorCost += wo.contractorCost || 0;
    }

    // Cost by trade
    const costByTrade: Record<string, { labor: number; parts: number; contractor: number; total: number }> = {};
    for (const wo of workOrders) {
      const t = wo.tradeActivity || 'Unassigned';
      if (!costByTrade[t]) costByTrade[t] = { labor: 0, parts: 0, contractor: 0, total: 0 };
      costByTrade[t].labor += wo.laborCost || 0;
      costByTrade[t].parts += wo.partsCost || 0;
      costByTrade[t].contractor += wo.contractorCost || 0;
      costByTrade[t].total += wo.totalCost || 0;
    }
    const costByTradeArray = Object.entries(costByTrade)
      .map(([trade, data]) => ({
        trade,
        laborCost: Math.round(data.labor * 100) / 100,
        partsCost: Math.round(data.parts * 100) / 100,
        contractorCost: Math.round(data.contractor * 100) / 100,
        totalCost: Math.round(data.total * 100) / 100,
      }))
      .sort((a, b) => b.totalCost - a.totalCost);

    // Cost by month
    const costByMonth: Record<string, { labor: number; parts: number; contractor: number; total: number }> = {};
    for (const wo of workOrders) {
      const month = wo.createdAt.toISOString().slice(0, 7);
      if (!costByMonth[month]) costByMonth[month] = { labor: 0, parts: 0, contractor: 0, total: 0 };
      costByMonth[month].labor += wo.laborCost || 0;
      costByMonth[month].parts += wo.partsCost || 0;
      costByMonth[month].contractor += wo.contractorCost || 0;
      costByMonth[month].total += wo.totalCost || 0;
    }
    const costByMonthArray = Object.entries(costByMonth)
      .map(([month, data]) => ({
        month,
        laborCost: Math.round(data.labor * 100) / 100,
        partsCost: Math.round(data.parts * 100) / 100,
        contractorCost: Math.round(data.contractor * 100) / 100,
        totalCost: Math.round(data.total * 100) / 100,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // ========== 10. WO TYPE DISTRIBUTION ==========
    const woByType: Record<string, number> = {};
    const woByStatus: Record<string, number> = {};
    const woByPriority: Record<string, number> = {};
    const woByTrade: Record<string, number> = {};

    for (const wo of workOrders) {
      woByType[wo.type || 'other'] = (woByType[wo.type || 'other'] || 0) + 1;
      woByStatus[wo.status] = (woByStatus[wo.status] || 0) + 1;
      woByPriority[wo.priority || 'medium'] = (woByPriority[wo.priority || 'medium'] || 0) + 1;
      woByTrade[wo.tradeActivity || 'Unassigned'] = (woByTrade[wo.tradeActivity || 'Unassigned'] || 0) + 1;
    }

    // ========== 11. TOP ASSETS ==========
    const topAssetMap: Record<string, { assetId: string; assetName: string; woCount: number; totalCost: number; downtimeMinutes: number }> = {};
    for (const wo of workOrders) {
      const key = wo.assetId || 'unassigned';
      const name = wo.assetName || 'Unassigned';
      if (!topAssetMap[key]) topAssetMap[key] = { assetId: wo.assetId || '', assetName: name, woCount: 0, totalCost: 0, downtimeMinutes: 0 };
      topAssetMap[key].woCount++;
      topAssetMap[key].totalCost += wo.totalCost || 0;
      (wo.workOrderDowntimes || []).forEach(dt => {
        topAssetMap[key].downtimeMinutes += dt.durationMinutes || 0;
      });
    }
    const topAssets = Object.values(topAssetMap)
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

    // ========== 12. WORK ORDERS BY ASSET ==========
    const woByAssetGroupMap: Record<string, { assetId: string; assetName: string; workOrders: any[]; woCount: number; completedCount: number; totalCost: number; totalDowntimeMinutes: number }> = {};
    for (const wo of workOrders) {
      const key = wo.assetId || 'unassigned';
      const name = wo.assetName || 'Unassigned';
      if (!woByAssetGroupMap[key]) woByAssetGroupMap[key] = { assetId: wo.assetId || '', assetName: name, workOrders: [], woCount: 0, completedCount: 0, totalCost: 0, totalDowntimeMinutes: 0 };
      const group = woByAssetGroupMap[key];
      group.woCount++;
      group.totalCost += wo.totalCost || 0;
      if (['completed', 'verified', 'closed'].includes(wo.status)) group.completedCount++;
      const dtMinutes = (wo.workOrderDowntimes || []).reduce((s, dt) => s + (dt.durationMinutes || 0), 0);
      group.totalDowntimeMinutes += dtMinutes;
      group.workOrders.push({
        id: wo.id,
        woNumber: wo.woNumber || '',
        title: wo.title || '',
        type: wo.type || '',
        priority: wo.priority || '',
        status: wo.status || '',
        assigneeName: wo.assignee?.fullName || null,
        estimatedHours: wo.estimatedHours,
        actualHours: wo.actualHours,
        totalCost: wo.totalCost || 0,
        createdAt: wo.createdAt.toISOString(),
        downtimeMinutes: dtMinutes,
      });
    }
    const workOrdersByAsset = Object.values(woByAssetGroupMap)
      .sort((a, b) => b.woCount - a.woCount)
      .slice(0, 20)
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
        };
      });

    // ========== 13. STOPPAGES BY ASSET ==========
    const stoppageByAssetMap: Record<string, { assetName: string; assetId: string; count: number; totalMinutes: number }> = {};
    for (const wo of workOrders) {
      for (const dt of (wo.workOrderDowntimes || [])) {
        const key = wo.assetId || 'unassigned';
        const name = wo.assetName || 'Unknown';
        if (!stoppageByAssetMap[key]) stoppageByAssetMap[key] = { assetName: name, assetId: wo.assetId || '', count: 0, totalMinutes: 0 };
        stoppageByAssetMap[key].count++;
        stoppageByAssetMap[key].totalMinutes += dt.durationMinutes || 0;
      }
    }
    const stoppageDataByAsset = Object.entries(stoppageByAssetMap)
      .map(([assetId, data]) => {
        const asset = assetId !== 'unassigned' ? assetMap.get(assetId) : null;
        return {
          assetId: assetId !== 'unassigned' ? assetId : null,
          assetName: data.assetName,
          manufacturer: asset?.manufacturer || null,
          model: asset?.model || null,
          serialNumber: asset?.serialNumber || null,
          category: asset?.category?.name || null,
          criticality: asset?.criticality || null,
          condition: asset?.condition || null,
          location: asset?.location || null,
          building: asset?.building || null,
          area: asset?.area || null,
          count: data.count,
          totalMinutes: data.totalMinutes,
          totalHours: Math.round((data.totalMinutes / 60) * 100) / 100,
        };
      })
      .sort((a, b) => b.totalMinutes - a.totalMinutes)
      .slice(0, 10);

    // ========== 14. ASSETS WITH FULL DETAILS ==========
    const assetsWithDetails = assets.map(a => ({
      id: a.id,
      name: a.name,
      assetTag: a.assetTag,
      serialNumber: a.serialNumber || null,
      manufacturer: a.manufacturer || null,
      model: a.model || null,
      yearManufactured: a.yearManufactured || null,
      condition: a.condition,
      status: a.status,
      criticality: a.criticality,
      location: a.location || null,
      building: a.building || null,
      floor: a.floor || null,
      area: a.area || null,
      category: a.category?.name || null,
      purchaseCost: a.purchaseCost || null,
      currentValue: a.currentValue || null,
      warrantyExpiry: a.warrantyExpiry?.toISOString() || null,
      expectedLifeYears: a.expectedLifeYears || null,
    }));

    // ========== BUILD RESPONSE DATA ==========
    const jsonData = {
      success: true,
      data: {
        // 1. Summary
        summary: {
          ...summary,
          avgResponseTime,
          totalManHours: Math.round(grandTotalManHours * 100) / 100,
          totalMaterialCost: Math.round(totalMaterialCost * 100) / 100,
          totalMaterialQty: Math.round(totalMaterialQty * 100) / 100,
          totalDowntimeHours: Math.round((totalDowntimeMinutes / 60) * 100) / 100,
          totalDowntimeEvents,
          totalStoppages,
          totalProductionLoss: Math.round(totalProductionLoss * 100) / 100,
          reworkRate,
          reworkWOs: reworkWOs.length,
        },

        // 2. Downtime
        downtime: {
          byTrade: downtimeByTradeArray,
          byMonth: downtimeByMonthArray,
          byCategory: downtimeByCategoryArray,
        },

        // 3. Response Time
        responseTime: {
          overall: { avgHours: avgResponseTime, sampleSize: responseTimes.length },
          byPriority: responseByPriorityArray,
          byTrade: responseByTradeArray,
        },

        // 4. Breakdowns
        breakdowns: {
          total: breakdownWOs.length,
          byType: breakdownByTypeArray,
          byTrade: breakdownByTradeArray,
          byMonth: breakdownByMonthArray,
          byPriority: breakdownByPriorityArray,
        },

        // 5. Man Hours
        manHours: {
          grandTotal: Math.round(grandTotalManHours * 100) / 100,
          byTrade: manHoursByTradeArray,
          byTechnician: manHoursByTechnicianArray,
          byMonth: manHoursByMonthArray,
          byActivity: manHoursByActivityArray,
        },

        // 6. Materials
        materials: {
          totalCost: Math.round(totalMaterialCost * 100) / 100,
          totalQty: Math.round(totalMaterialQty * 100) / 100,
          byType: materialsByCategoryArray,
          topItems: topMaterialsArray,
          costByMonth: materialCostByMonthArray,
        },

        // 7. Failure Rate
        failureRate: {
          byAsset: failureRateByAsset,
          byType: failureRateByTypeArray,
          mtbf: mtbfByAsset,
          reworkRate,
          reworkWOs: reworkWOs.length,
        },

        // 8. Stoppages
        stoppages: {
          total: totalStoppages,
          byTrade: stoppagesByTrade,
          byImpact: stoppagesByImpactArray,
          byReason: stoppagesByReasonArray,
          byAsset: stoppageDataByAsset,
        },

        // 9. Cost Analysis
        cost: {
          grandTotal: Math.round(grandTotalCost * 100) / 100,
          grandLabor: Math.round(grandLaborCost * 100) / 100,
          grandParts: Math.round(grandPartsCost * 100) / 100,
          grandContractor: Math.round(grandContractorCost * 100) / 100,
          byTrade: costByTradeArray,
          byMonth: costByMonthArray,
        },

        // 10. Distributions
        distribution: {
          byType: Object.entries(woByType).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
          byStatus: Object.entries(woByStatus).map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
          byPriority: Object.entries(woByPriority).map(([priority, count]) => ({ priority, count })).sort((a, b) => b.count - a.count),
          byTrade: Object.entries(woByTrade).map(([trade, count]) => ({ trade, count })).sort((a, b) => b.count - a.count),
        },

        // 11. Asset Intelligence
        topAssets,
        workOrdersByAsset,
        assetsWithDetails,

        // 12. Component-Level Cost Analysis
        componentCosts,
      },
    };

    // ========== PDF FORMAT ==========
    if (format === 'pdf') {
      const pdfBuffer = await generateReportPDF({
        title: 'Work Order Analytics Report',
        subtitle: 'Comprehensive WO Performance Analysis',
        generatedBy: session.fullName || session.userId,
        generatedAt: new Date(),
        filters: { from: from || 'All time', to: to || 'Present', ...(department && { department }), ...(trade && { trade }), ...(priority && { priority }) },
        sections: [
          { title: 'Key Performance Indicators', type: 'summary-cards', data: [
            { label: 'Total WOs', value: jsonData.data.summary.totalWOs },
            { label: 'Completion Rate', value: `${jsonData.data.summary.completionRate}%` },
            { label: 'Breakdown Rate', value: `${jsonData.data.summary.breakdownRate}%` },
            { label: 'Avg Response Time', value: `${jsonData.data.summary.avgResponseTime}h` },
            { label: 'Total Man Hours', value: jsonData.data.summary.totalManHours },
            { label: 'Total Material Cost', value: `$${jsonData.data.summary.totalMaterialCost.toLocaleString()}` },
            { label: 'Total Downtime', value: `${jsonData.data.summary.totalDowntimeHours}h` },
            { label: 'Rework Rate', value: `${jsonData.data.summary.reworkRate}%` },
          ]},
          { title: 'Work Order Distribution by Type', type: 'table', data: {
            headers: ['Type', 'Count'],
            rows: jsonData.data.distribution.byType.map(d => [d.type, String(d.count)]),
          }},
          { title: 'Downtime by Trade', type: 'table', data: {
            headers: ['Trade', 'Hours', 'Events', 'Production Loss'],
            rows: jsonData.data.downtime.byTrade.map(d => [d.trade, String(d.totalHours), String(d.events), String(d.productionLoss)]),
          }},
          { title: 'Response Time by Priority', type: 'table', data: {
            headers: ['Priority', 'Avg Hours', 'Min Hours', 'Max Hours', 'Count'],
            rows: jsonData.data.responseTime.byPriority.map(d => [d.priority, String(d.avgHours), String(d.minHours), String(d.maxHours), String(d.count)]),
          }},
          { title: 'Man Hours by Technician', type: 'table', data: {
            headers: ['Technician', 'Total Hours', 'WO Count', 'Avg Hours/WO'],
            rows: jsonData.data.manHours.byTechnician.slice(0, 15).map(d => [d.name, String(d.totalHours), String(d.woCount), String(d.avgHoursPerWO)]),
          }},
          { title: 'Cost Summary', type: 'summary-cards', data: [
            { label: 'Total Cost', value: `$${jsonData.data.cost.grandTotal.toLocaleString()}` },
            { label: 'Labor Cost', value: `$${jsonData.data.cost.grandLabor.toLocaleString()}` },
            { label: 'Parts Cost', value: `$${jsonData.data.cost.grandParts.toLocaleString()}` },
            { label: 'Contractor Cost', value: `$${jsonData.data.cost.grandContractor.toLocaleString()}` },
          ]},
          { title: 'Top Materials by Cost', type: 'table', data: {
            headers: ['Item', 'Qty', 'Cost', 'WO Count'],
            rows: jsonData.data.materials.topItems.slice(0, 15).map(d => [d.name, String(d.totalQty), `$${d.totalCost.toLocaleString()}`, String(d.woCount)]),
          }},
          { title: 'Failure Rate by Asset', type: 'table', data: {
            headers: ['Asset', 'Total WOs', 'Failures', 'Failure Rate'],
            rows: jsonData.data.failureRate.byAsset.slice(0, 15).map(d => [d.assetName, String(d.totalWOs), String(d.failures), `${d.failureRate}%`]),
          }},
        ],
      });
      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="work-order-report.pdf"',
        },
      });
    }

    return NextResponse.json(jsonData);
  } catch (error) {
    console.error('[WO Reports] Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to generate reports' }, { status: 500 });
  }
}