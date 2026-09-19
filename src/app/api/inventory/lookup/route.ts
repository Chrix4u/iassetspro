import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlant, getPlantFilterWhere } from '@/lib/plant-scope';

/**
 * Lightweight inventory lookup for work-order/material request workflows.
 *
 * This endpoint intentionally exposes only selection-safe fields. It is not
 * a substitute for the Inventory module and does not grant technicians full
 * inventory browsing, costing, supplier, bin/location, or stock-management data.
 */
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const canLookup = isAdmin(session) || hasAnyPermission(session, [
      'repair_material_requests.create',
      'repair_material_requests.view',
      'repair_material_requests.view_all',
      'repair_material_requests.view_own',
      'inventory.view_all',
      'inventory.manage',
      'inventory.stock_in',
      'inventory.stock_out',
    ]);
    if (!canLookup) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions for inventory lookup' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim() || '';
    const searchPlantId = searchParams.get('plantId');

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const where: Record<string, unknown> = { isActive: true };
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { itemCode: { contains: search } },
      ];
    }

    if (plantScope.isScoped && plantScope.plantId) {
      where.plantId = plantScope.plantId;
    } else if (searchPlantId) {
      if (!canAccessPlant(plantScope, searchPlantId)) {
        return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
      }
      where.plantId = searchPlantId;
    } else {
      Object.assign(where, getPlantFilterWhere(plantScope));
    }

    const items = await db.inventoryItem.findMany({
      where,
      select: {
        id: true,
        itemCode: true,
        name: true,
        category: true,
        currentStock: true,
        unitOfMeasure: true,
        plantId: true,
      },
      orderBy: { name: 'asc' },
      take: 500,
    });

    return NextResponse.json({ success: true, data: items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load inventory lookup';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
