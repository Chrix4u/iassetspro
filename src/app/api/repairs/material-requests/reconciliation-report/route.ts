import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasPermission } from '@/lib/auth';
import { getPlantScope, applyPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';

// GET /api/repairs/material-requests/reconciliation-report
// Generates a material reconciliation report with summary stats and detail list
// Supports filtering by date range, plant, item
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'work_orders.dashboard') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const plantId = searchParams.get('plantId');
    const itemName = searchParams.get('itemName');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const where: Record<string, unknown> = {};
    if (plantId) {
      const conflictsWithSelectedPlant = Boolean(
        plantScope.isScoped && plantScope.plantId && plantScope.plantId !== plantId,
      );
      if (conflictsWithSelectedPlant || !canAccessPlantStrict(plantScope, plantId)) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
      }
      where.plantId = plantId;
    } else {
      applyPlantScope(where, plantScope);
    }

    if (itemName) where.itemName = { contains: itemName };

    const dateFilter: Record<string, unknown> = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);
    if (Object.keys(dateFilter).length > 0) where.issuedAt = dateFilter;

    where.status = { in: ['issued', 'picking', 'closed', 'partially_returned', 'fully_returned'] };

    const queryWhere = Object.keys(where).length > 0 ? where : undefined;
    const [records, total] = await Promise.all([
      db.repairMaterialRequest.findMany({
        where: queryWhere,
        include: {
          requestedBy: { select: { id: true, fullName: true, username: true } },
          issuedByUser: { select: { id: true, fullName: true } },
          workOrder: {
            select: { id: true, woNumber: true, title: true, status: true },
          },
          item: { select: { id: true, itemCode: true, name: true, unitOfMeasure: true } },
        },
        orderBy: { issuedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.repairMaterialRequest.count({ where: queryWhere }),
    ]);

    const details = records.map((r) => {
      const issuedQty = r.quantityIssued || r.quantityApproved || 0;
      const consumedQty = r.consumedQty ?? 0;
      const wastedQty = r.wastedQty ?? 0;
      const returnedQty = Math.max(0, issuedQty - consumedQty - wastedQty);
      const reconciliationRate = issuedQty > 0 ? (consumedQty / issuedQty) * 100 : null;
      const wasteRate = issuedQty > 0 ? (wastedQty / issuedQty) * 100 : null;
      const isReconciled = r.consumedQty !== null;

      return {
        id: r.id,
        itemName: r.itemName,
        itemCode: r.item?.itemCode,
        woNumber: r.workOrder?.woNumber,
        woTitle: r.workOrder?.title,
        status: r.status,
        issuedQty,
        consumedQty,
        wastedQty,
        returnedQty,
        reconciliationRate: reconciliationRate !== null ? Number(reconciliationRate.toFixed(1)) : null,
        wasteRate: wasteRate !== null ? Number(wasteRate.toFixed(1)) : null,
        isReconciled,
        unit: r.unit,
        unitCost: r.unitCost,
        totalCost: issuedQty * (r.unitCost || 0),
        consumedCost: consumedQty * (r.unitCost || 0),
        wastedCost: wastedQty * (r.unitCost || 0),
        requestedBy: r.requestedBy?.fullName,
        issuedBy: r.issuedByUser?.fullName,
        pickedBy: r.pickedBy,
        pickedAt: r.pickedAt,
        issuedAt: r.issuedAt,
        plantId: r.plantId,
      };
    });

    // Use the exact same authorized filter for summary/aggregation so the report
    // cannot expose counts or costs outside the caller's plant scope.
    const summaryQueryWhere = queryWhere;
    const allRecords = await db.repairMaterialRequest.findMany({
      where: summaryQueryWhere,
      select: {
        quantityRequested: true,
        quantityApproved: true,
        quantityIssued: true,
        consumedQty: true,
        wastedQty: true,
        unitCost: true,
        status: true,
        unit: true,
      },
    });

    let totalRequested = 0;
    let totalIssued = 0;
    let totalConsumed = 0;
    let totalWasted = 0;
    let totalReturned = 0;
    let totalCost = 0;
    let totalConsumedCost = 0;
    let totalWastedCost = 0;
    let reconciledCount = 0;
    let pendingReconciliationCount = 0;

    for (const r of allRecords) {
      const issued = r.quantityIssued || r.quantityApproved || 0;
      const consumed = r.consumedQty ?? 0;
      const wasted = r.wastedQty ?? 0;
      const returned = Math.max(0, issued - consumed - wasted);
      const cost = r.unitCost || 0;

      totalRequested += r.quantityRequested || 0;
      totalIssued += issued;
      totalConsumed += consumed;
      totalWasted += wasted;
      totalReturned += returned;
      totalCost += issued * cost;
      totalConsumedCost += consumed * cost;
      totalWastedCost += wasted * cost;

      if (r.consumedQty !== null) reconciledCount++;
      else pendingReconciliationCount++;
    }

    const totalRecords = allRecords.length;
    const overallReconciliationRate = totalIssued > 0 ? (totalConsumed / totalIssued) * 100 : 0;
    const overallWasteRate = totalIssued > 0 ? (totalWasted / totalIssued) * 100 : 0;
    const completionRate = totalRecords > 0 ? (reconciledCount / totalRecords) * 100 : 0;

    const itemBreakdown = await db.repairMaterialRequest.groupBy({
      by: ['itemName'],
      where: summaryQueryWhere,
      _sum: {
        quantityRequested: true,
        quantityIssued: true,
        consumedQty: true,
        wastedQty: true,
      },
      _count: { id: true },
      orderBy: { _sum: { wastedQty: 'desc' } },
      take: 20,
    });

    const itemSummary = itemBreakdown.map((item) => {
      const issued = item._sum.quantityIssued || 0;
      const consumed = item._sum.consumedQty || 0;
      const wasted = item._sum.wastedQty || 0;
      return {
        itemName: item.itemName,
        totalRequests: item._count.id,
        totalIssued: issued,
        totalConsumed: consumed,
        totalWasted: wasted,
        wasteRate: issued > 0 ? Number(((wasted / issued) * 100).toFixed(1)) : 0,
      };
    });

    const summary = {
      totalRecords,
      reconciledCount,
      pendingReconciliationCount,
      completionRate: Number(completionRate.toFixed(1)),
      totalRequested,
      totalIssued,
      totalConsumed,
      totalWasted,
      totalReturned,
      overallReconciliationRate: Number(overallReconciliationRate.toFixed(1)),
      overallWasteRate: Number(overallWasteRate.toFixed(1)),
      totalCost: Number(totalCost.toFixed(2)),
      totalConsumedCost: Number(totalConsumedCost.toFixed(2)),
      totalWastedCost: Number(totalWastedCost.toFixed(2)),
      savingsFromReturns: Number((totalReturned * (totalCost / (totalIssued || 1))).toFixed(2)),
    };

    return NextResponse.json({
      success: true,
      data: {
        summary,
        itemBreakdown: itemSummary,
        details,
      },
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate reconciliation report';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
