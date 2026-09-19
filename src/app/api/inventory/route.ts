import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessFullInventory } from '@/lib/inventory-access';
import { getPlantScope, canAccessPlant, getPlantFilterWhere } from '@/lib/plant-scope';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!canAccessFullInventory(session)) {
      return NextResponse.json({
        success: false,
        error: 'Full inventory access is restricted to authorized inventory/store users',
      }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const lowStock = searchParams.get('lowStock');
    const search = searchParams.get('search');
    const searchPlantId = searchParams.get('plantId');

    // Resolve plant scope (validates X-Plant-ID against user's plant access)
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const where: Record<string, unknown> = { isActive: true };

    if (category) where.category = category;
    if (lowStock === 'true') {
      // Items where currentStock <= minStockLevel
      // In-memory filter handles the comparison (Prisma can't compare two columns)
    }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { itemCode: { contains: search } },
        { description: { contains: search } },
        { supplier: { contains: search } },
      ];
    }

    // Apply plant scoping fail-closed.
    // - An explicit, validated X-Plant-ID remains authoritative.
    // - A plantId query is allowed only when the actor can access that plant.
    // - Without either, regular users are restricted to their assigned plants.
    // - System-wide users remain unrestricted unless they explicitly request a plant.
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
      include: {
        plant: { select: { id: true, name: true, code: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Post-filter for lowStock (compare currentStock <= minStockLevel)
    let filteredItems = items;
    if (lowStock === 'true') {
      filteredItems = items.filter(item => item.currentStock <= item.minStockLevel);
    }

    return NextResponse.json({ success: true, data: filteredItems });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load inventory items';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'inventory.create') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const {
      itemCode,
      name,
      description,
      category,
      unitOfMeasure,
      currentStock,
      minStockLevel,
      maxStockLevel,
      reorderQuantity,
      unitCost,
      supplier,
      supplierPartNumber,
      location,
      binLocation,
      shelfLocation,
      plantId,
      specification,
      imageUrls,
    } = body;

    if (!name || !itemCode) {
      return NextResponse.json(
        { success: false, error: 'Name and item code are required' },
        { status: 400 }
      );
    }

    if (!plantId) {
      return NextResponse.json(
        { success: false, error: 'Plant is required' },
        { status: 400 }
      );
    }

    // Check item code uniqueness
    const existing = await db.inventoryItem.findUnique({ where: { itemCode } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Item code already exists' },
        { status: 400 }
      );
    }

    // Validate plant exists
    const plantExists = await db.plant.findUnique({ where: { id: plantId } });
    if (!plantExists) {
      return NextResponse.json({ success: false, error: 'Plant not found' }, { status: 400 });
    }

    const item = await db.inventoryItem.create({
      data: {
        itemCode,
        name,
        description: description || null,
        category: category || 'other',
        unitOfMeasure: unitOfMeasure || 'each',
        currentStock: currentStock || 0,
        minStockLevel: minStockLevel || 0,
        maxStockLevel: maxStockLevel || null,
        reorderQuantity: reorderQuantity || null,
        unitCost: unitCost || null,
        supplier: supplier || null,
        supplierPartNumber: supplierPartNumber || null,
        location: location || null,
        binLocation: binLocation || null,
        shelfLocation: shelfLocation || null,
        plantId,
        specification: specification || '',
        imageUrls: imageUrls || '[]',
        createdById: session.userId,
      },
      include: {
        plant: { select: { id: true, name: true, code: true } },
      },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'create',
        entityType: 'inventory_item',
        entityId: item.id,
        newValues: JSON.stringify({ itemCode, name, category, plantId }),
      },
    });

    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create inventory item';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
