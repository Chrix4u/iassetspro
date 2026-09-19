import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { canAccessFullInventory } from '@/lib/inventory-access';
import { getPlantScope, getPlantFilterWhere } from '@/lib/plant-scope';

/**
 * GET /api/inventory/kpi
 *
 * Inventory KPIs: stock value, turnover, category breakdown,
 * low stock count, movement summary.
 */
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!canAccessFullInventory(session)) {
      return NextResponse.json({ success: false, error: 'Inventory KPI access is restricted' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    const plantFilter = getPlantFilterWhere(plantScope);
    const pf = plantFilter;

    const [
      totalItems,
      categoryCounts,
      stockValue,
      lowStockCount,
      movementsThisMonth,
      movementsLastMonth,
      pendingRequests,
      pendingAdjustments,
      stockSummary,
    ] = await Promise.all([
      // Total active items
      db.inventoryItem.count({
        where: { isActive: true, ...pf },
      }),
      // Category breakdown
      db.inventoryItem.groupBy({
        by: ['category'],
        where: { isActive: true, ...pf },
        _count: { category: true },
      }),
      // Total stock value (currentStock * unitCost)
      db.inventoryItem.aggregate({
        where: { isActive: true, ...pf },
        _sum: { currentStock: true },
        _avg: { unitCost: true },
        _count: true,
      }),
      // Low stock items count
      db.inventoryItem.findMany({
        where: { isActive: true, ...pf },
        select: { id: true, currentStock: true, minStockLevel: true },
      }),
      // Stock movements this month
      db.stockMovement.count({
        where: {
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
      // Stock movements last month
      db.stockMovement.count({
        where: {
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1),
            lt: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
      // Pending inventory requests
      db.inventoryRequest.count({
        where: { status: { in: ['pending', 'partially_fulfilled'] } },
      }),
      // Pending adjustments
      db.inventoryAdjustment.count({
        where: { status: 'pending' },
      }),
      // Stock level summary
      db.inventoryItem.aggregate({
        where: { isActive: true, ...pf },
        _sum: { currentStock: true, minStockLevel: true, maxStockLevel: true },
      }),
    ]);

    // Calculate low stock (items where currentStock <= minStockLevel)
    const lowStock = lowStockCount.filter((i) => i.currentStock <= i.minStockLevel).length;

    // Category map
    const byCategory: Record<string, number> = {};
    categoryCounts.forEach((c) => { byCategory[c.category] = c._count.category; });

    // Total stock value approximation
    const totalStockQty = stockValue._sum.currentStock || 0;
    const avgUnitCost = stockValue._avg.unitCost || 0;
    const totalValue = Math.round(totalStockQty * avgUnitCost * 100) / 100;

    // Movement trend
    const movementTrend = movementsLastMonth > 0
      ? Math.round(((movementsThisMonth - movementsLastMonth) / movementsLastMonth) * 100)
      : 0;

    return NextResponse.json({
      success: true,
      data: {
        total: totalItems,
        byCategory,
        lowStock,
        totalValue,
        avgUnitCost: Math.round(avgUnitCost * 100) / 100,
        pendingRequests,
        pendingAdjustments,
        movements: {
          thisMonth: movementsThisMonth,
          lastMonth: movementsLastMonth,
          trendPercent: movementTrend,
        },
        stockSummary: {
          totalQuantity: stockValue._sum.currentStock || 0,
          totalMinLevels: stockSummary._sum.minStockLevel || 0,
          totalMaxCapacity: stockSummary._sum.maxStockLevel || 0,
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load inventory KPIs';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
