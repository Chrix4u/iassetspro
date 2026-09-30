import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'reports.view') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const url = new URL(request.url);
    const fromDate = url.searchParams.get('from');
    const toDate = url.searchParams.get('to');
    const moduleFilter = url.searchParams.get('moduleFilter') || 'all';

    // Build optional date filters
    const dateFilter: Record<string, any> = {};
    if (fromDate || toDate) {
      dateFilter.createdAt = {};
      if (fromDate) dateFilter.createdAt.gte = new Date(fromDate + 'T00:00:00');
      if (toDate) dateFilter.createdAt.lte = new Date(toDate + 'T23:59:59');
    }

    // ── 1. Fetch Asset with category ──────────────────────────────────────
    const asset = await db.asset.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, code: true } },
      },
    });

    if (!asset) {
      return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });
    }

    // ── 2. Fetch all Work Orders for this asset ───────────────────────────
    const woWhere: Record<string, any> = {
      assetId: id,
      ...(Object.keys(dateFilter).length > 0 ? dateFilter : {}),
    };
    if (moduleFilter === 'repairs') {
      woWhere.type = { in: ['breakdown', 'corrective', 'emergency'] };
    } else if (moduleFilter === 'pm') {
      woWhere.type = 'preventive';
    }
    const workOrders = await db.workOrder.findMany({
      where: woWhere,
      include: {
        assignee: { select: { id: true, fullName: true, username: true } },
        teamLeader: { select: { id: true, fullName: true, username: true } },
        materials: { select: { id: true, itemId: true, itemName: true, quantity: true, unitCost: true, totalCost: true, status: true } },
        workOrderDowntimes: { select: { id: true, durationMinutes: true, category: true, impactLevel: true, downtimeStart: true, downtimeEnd: true, reason: true } },
        repairCompletion: { select: { id: true, createdAt: true, findings: true, rootCause: true, correctiveAction: true, supervisorStatus: true, totalDowntimeMinutes: true, totalLaborHours: true, totalMaterialCost: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // ── 3. Fetch all Failure Records for this asset ──────────────────────
    const failureRecords = await db.failureRecord.findMany({
      where: {
        assetId: id,
        ...(Object.keys(dateFilter).length > 0 ? { detectedAt: dateFilter.createdAt } : {}),
      },
      include: {
        component: { select: { id: true, name: true, componentCode: true } },
        workOrder: { select: { id: true, woNumber: true } },
      },
      orderBy: { detectedAt: 'desc' },
    });

    // ── 4. Batch-fetch InventoryItems for all materials ───────────────────
    const allItemIds = new Set<string>();
    for (const wo of workOrders) {
      for (const mat of wo.materials) {
        if (mat.itemId) allItemIds.add(mat.itemId);
      }
    }
    const inventoryMap = new Map<string, any>();
    if (allItemIds.size > 0) {
      const items = await db.inventoryItem.findMany({
        where: { id: { in: [...allItemIds] } },
        select: { id: true, itemCode: true, unitOfMeasure: true, supplier: true, binLocation: true, specification: true },
      });
      for (const item of items) {
        inventoryMap.set(item.id, item);
      }
    }

    // ── 5. Compute summary statistics ────────────────────────────────────
    const totalWOs = workOrders.length;
    const completedWOs = workOrders.filter(wo => ['completed', 'verified', 'closed'].includes(wo.status)).length;
    const completionRate = totalWOs > 0 ? Math.round((completedWOs / totalWOs) * 100) : 0;

    let totalCost = 0;
    let laborCost = 0;
    let partsCost = 0;
    let contractorCost = 0;
    let totalActualHours = 0;
    let totalDowntimeMinutes = 0;

    const conditionHistory: { date: string; condition: string }[] = [];

    for (const wo of workOrders) {
      totalCost += wo.totalCost || 0;
      laborCost += wo.laborCost || 0;
      partsCost += wo.partsCost || 0;
      contractorCost += wo.contractorCost || 0;
      totalActualHours += wo.actualHours || 0;

      // Sum downtime from workOrderDowntimes
      for (const dt of wo.workOrderDowntimes) {
        totalDowntimeMinutes += dt.durationMinutes || 0;
      }

      // Build condition history from completed repair completions
      if (wo.repairCompletion && wo.actualEnd) {
        const rc = wo.repairCompletion;
        let cond = 'fair';
        if (rc.supervisorStatus === 'approved') cond = 'good';
        else if (rc.supervisorStatus === 'rework_requested') cond = 'poor';
        conditionHistory.push({
          date: wo.actualEnd.toISOString(),
          condition: cond,
        });
      }
    }
    conditionHistory.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // MTBF (Mean Time Between Failures) in days
    const totalFailures = failureRecords.length;
    let mtbfDays = 0;
    if (totalFailures >= 2) {
      const sortedDates = failureRecords
        .map(f => f.detectedAt.getTime())
        .filter(d => d > 0)
        .sort((a, b) => a - b);
      if (sortedDates.length >= 2) {
        const spanMs = sortedDates[sortedDates.length - 1] - sortedDates[0];
        const spanDays = spanMs / (1000 * 60 * 60 * 24);
        mtbfDays = Math.round(spanDays / (sortedDates.length - 1) * 10) / 10;
      }
    }

    const avgCostPerWO = totalWOs > 0 ? Math.round((totalCost / totalWOs) * 100) / 100 : 0;

    const firstWODate = workOrders.length > 0
      ? workOrders[workOrders.length - 1].createdAt?.toISOString() ?? null
      : null;
    const lastWODate = workOrders.length > 0
      ? workOrders[0].createdAt?.toISOString() ?? null
      : null;

    // ── 6. Build enriched work orders array ──────────────────────────────
    const enrichedWOs = workOrders.map(wo => {
      const woDowntime = (wo.workOrderDowntimes || []).reduce((sum: number, dt: any) => sum + (dt.durationMinutes || 0), 0);
      return {
        id: wo.id,
        woNumber: wo.woNumber,
        title: wo.title,
        type: wo.type,
        priority: wo.priority,
        status: wo.status,
        totalCost: wo.totalCost || 0,
        laborCost: wo.laborCost || 0,
        partsCost: wo.partsCost || 0,
        contractorCost: wo.contractorCost || 0,
        actualHours: wo.actualHours || 0,
        plannedStart: wo.plannedStart?.toISOString() ?? null,
        actualStart: wo.actualStart?.toISOString() ?? null,
        actualEnd: wo.actualEnd?.toISOString() ?? null,
        createdAt: wo.createdAt.toISOString(),
        tradeActivity: wo.tradeActivity || null,
        failureDescription: wo.failureDescription || null,
        causeDescription: wo.causeDescription || null,
        actionDescription: wo.actionDescription || null,
        assigneeName: wo.assignee?.fullName || null,
        teamLeaderName: wo.teamLeader?.fullName || null,
        materialCount: wo.materials?.length || 0,
        downtimeMinutes: woDowntime,
      };
    });

    // ── 7. Build enriched failure records array ──────────────────────────
    const enrichedFailures = failureRecords.map(fr => ({
      id: fr.id,
      failureCode: fr.failureCode || null,
      failureMode: fr.failureMode,
      failureCause: fr.failureCause || null,
      failureSeverity: fr.failureSeverity,
      symptoms: fr.symptoms || null,
      detectedAt: fr.detectedAt.toISOString(),
      resolvedAt: fr.resolvedAt?.toISOString() ?? null,
      downtimeMinutes: fr.downtimeMinutes || 0,
      repairCost: fr.repairCost || 0,
      rootCause: fr.rootCause || null,
      correctiveAction: fr.correctiveAction || null,
      woNumber: fr.workOrder?.woNumber || null,
      componentName: fr.component?.name || null,
    }));

    // ── 8. Compute parts consumed aggregation ────────────────────────────
    const partsMap = new Map<string, any>();
    for (const wo of workOrders) {
      const woDate = wo.createdAt.toISOString();
      for (const mat of wo.materials) {
        const key = mat.itemName || 'Unknown';
        const inv = mat.itemId ? inventoryMap.get(mat.itemId) : null;
        if (!partsMap.has(key)) {
          partsMap.set(key, {
            itemName: key,
            itemCode: inv?.itemCode || null,
            totalQuantity: 0,
            totalCost: 0,
            woCount: 0,
            lastUsedDate: woDate,
            supplier: inv?.supplier || null,
          });
        }
        const entry = partsMap.get(key)!;
        entry.totalQuantity += mat.quantity || 0;
        entry.totalCost += mat.totalCost || 0;
        entry.woCount += 1;
        if (woDate > entry.lastUsedDate) entry.lastUsedDate = woDate;
      }
    }
    const partsConsumed = [...partsMap.values()]
      .sort((a, b) => b.totalCost - a.totalCost);

    // ── 9. Cost by type ──────────────────────────────────────────────────
    const typeMap = new Map<string, { count: number; totalCost: number }>();
    for (const wo of workOrders) {
      const t = wo.type || 'unknown';
      if (!typeMap.has(t)) typeMap.set(t, { count: 0, totalCost: 0 });
      const entry = typeMap.get(t)!;
      entry.count += 1;
      entry.totalCost += wo.totalCost || 0;
    }
    const costByType = [...typeMap.values()].sort((a, b) => b.totalCost - a.totalCost);

    // ── 10. Cost by month ────────────────────────────────────────────────
    const monthMap = new Map<string, { totalCost: number; laborCost: number; partsCost: number; contractorCost: number }>();
    for (const wo of workOrders) {
      const d = new Date(wo.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap.has(key)) monthMap.set(key, { totalCost: 0, laborCost: 0, partsCost: 0, contractorCost: 0 });
      const entry = monthMap.get(key)!;
      entry.totalCost += wo.totalCost || 0;
      entry.laborCost += wo.laborCost || 0;
      entry.partsCost += wo.partsCost || 0;
      entry.contractorCost += wo.contractorCost || 0;
    }
    const costByMonth = [...monthMap.entries()]
      .map(([month, costs]) => ({ month, ...costs }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // ── 11. Cost by trade ────────────────────────────────────────────────
    const tradeMap = new Map<string, { count: number; totalCost: number; totalHours: number }>();
    for (const wo of workOrders) {
      const t = wo.tradeActivity || 'unassigned';
      if (!tradeMap.has(t)) tradeMap.set(t, { count: 0, totalCost: 0, totalHours: 0 });
      const entry = tradeMap.get(t)!;
      entry.count += 1;
      entry.totalCost += wo.totalCost || 0;
      entry.totalHours += wo.actualHours || 0;
    }
    const costByTrade = [...tradeMap.values()].sort((a, b) => b.totalCost - a.totalCost);

    // ── 12. Downtime by category ─────────────────────────────────────────
    const dtCatMap = new Map<string, { count: number; totalMinutes: number }>();
    for (const wo of workOrders) {
      for (const dt of wo.workOrderDowntimes) {
        const cat = dt.category || 'unplanned';
        if (!dtCatMap.has(cat)) dtCatMap.set(cat, { count: 0, totalMinutes: 0 });
        const entry = dtCatMap.get(cat)!;
        entry.count += 1;
        entry.totalMinutes += dt.durationMinutes || 0;
      }
    }
    const downtimeByCategory = [...dtCatMap.values()].sort((a, b) => b.totalMinutes - a.totalMinutes);

    // ── 13. TCO (Total Cost of Ownership) ───────────────────────────────
    const purchaseCost = asset.purchaseCost ?? null;
    const currentValue = asset.currentValue ?? null;
    const totalMaintenanceCost = totalCost;

    let maintenanceCostRatio = 0;
    if (purchaseCost && purchaseCost > 0) {
      maintenanceCostRatio = Math.round((totalMaintenanceCost / purchaseCost) * 10000) / 100;
    }

    // Asset age in years
    const assetAge = asset.yearManufactured
      ? new Date().getFullYear() - asset.yearManufactured
      : null;
    const expectedLifeYears = asset.expectedLifeYears ?? null;

    let annualMaintenanceCost = 0;
    if (assetAge && assetAge > 0) {
      annualMaintenanceCost = Math.round((totalMaintenanceCost / assetAge) * 100) / 100;
    }

    let remainingLife: number | null = null;
    if (assetAge !== null && expectedLifeYears !== null && expectedLifeYears > 0) {
      remainingLife = Math.max(0, expectedLifeYears - assetAge);
    }

    // ── 14. Assemble response ────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      data: {
        asset: {
          id: asset.id,
          name: asset.name,
          assetTag: asset.assetTag,
          serialNumber: asset.serialNumber,
          manufacturer: asset.manufacturer,
          model: asset.model,
          yearManufactured: asset.yearManufactured,
          condition: asset.condition,
          status: asset.status,
          criticality: asset.criticality,
          location: asset.location,
          building: asset.building,
          floor: asset.floor,
          area: asset.area,
          categoryId: asset.categoryId,
          categoryName: asset.category?.name || null,
          purchaseCost: asset.purchaseCost,
          currentValue: asset.currentValue,
          warrantyExpiry: asset.warrantyExpiry?.toISOString() ?? null,
          expectedLifeYears: asset.expectedLifeYears,
          specification: asset.specification,
        },
        summary: {
          totalWOs,
          completedWOs,
          completionRate,
          totalCost: Math.round(totalCost * 100) / 100,
          laborCost: Math.round(laborCost * 100) / 100,
          partsCost: Math.round(partsCost * 100) / 100,
          contractorCost: Math.round(contractorCost * 100) / 100,
          totalDowntimeMinutes,
          totalActualHours: Math.round(totalActualHours * 100) / 100,
          totalFailures,
          mtbfDays,
          avgCostPerWO,
          firstWODate,
          lastWODate,
          conditionHistory,
        },
        workOrders: enrichedWOs,
        failureRecords: enrichedFailures,
        partsConsumed: partsConsumed.map(p => ({
          ...p,
          totalQuantity: Math.round(p.totalQuantity * 100) / 100,
          totalCost: Math.round(p.totalCost * 100) / 100,
        })),
        costByType: costByType.map(c => ({
          ...c,
          totalCost: Math.round(c.totalCost * 100) / 100,
        })),
        costByMonth: costByMonth.map(c => ({
          month: c.month,
          totalCost: Math.round(c.totalCost * 100) / 100,
          laborCost: Math.round(c.laborCost * 100) / 100,
          partsCost: Math.round(c.partsCost * 100) / 100,
          contractorCost: Math.round(c.contractorCost * 100) / 100,
        })),
        costByTrade: costByTrade.map(c => ({
          ...c,
          totalCost: Math.round(c.totalCost * 100) / 100,
          totalHours: Math.round(c.totalHours * 100) / 100,
        })),
        downtimeByCategory,
        tco: {
          purchaseCost,
          totalMaintenanceCost: Math.round(totalMaintenanceCost * 100) / 100,
          currentValue,
          maintenanceCostRatio,
          annualMaintenanceCost,
          remainingLife,
        },
      },
    });
  } catch (error: any) {
    console.error('[API /assets/[id]/history] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}