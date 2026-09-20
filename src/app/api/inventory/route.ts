import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlant, getPlantFilterWhere } from '@/lib/plant-scope';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const lowStock = searchParams.get('lowStock');
    const search = searchParams.get('search');
    const searchPlantId = searchParams.get('plantId');
    const purpose = searchParams.get('purpose');
    const workOrderId = searchParams.get('workOrderId');

    const canViewInventory = isAdmin(session) || hasPermission(session, 'inventory.view');
    let repairLookupPlantId: string | null = null;

    if (!canViewInventory) {
      // Technicians may query a minimal inventory catalog only in the context
      // of a repair WO they are actively assigned to. This is NOT Inventory
      // module access and does not expose supplier/cost/management data.
      if (purpose !== 'repair_request' || !workOrderId) {
        return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
      }

      const wo = await db.workOrder.findFirst({
        where: {
          id: workOrderId,
          OR: [
            { assignedTo: session.userId },
            { teamLeaderId: session.userId },
            { teamMembers: { some: { userId: session.userId } } },
          ],
        },
        select: { id: true, plantId: true },
      });
      if (!wo?.plantId) {
        return NextResponse.json({ success: false, error: 'Repair work order access required' }, { status: 403 });
      }
      repairLookupPlantId = wo.plantId;
    }

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
    if (repairLookupPlantId) {
      if (!canAccessPlant(plantScope, repairLookupPlantId)) {
        return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
      }
      where.plantId = repairLookupPlantId;
    } else if (plantScope.isScoped && plantScope.plantId) {
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

    if (!canViewInventory) {
      return NextResponse.json({
        success: true,
        data: filteredItems.map((item) => ({
          id: item.id,
          itemCode: item.itemCode,
          name: item.name,
          category: item.category,
          currentStock: item.currentStock,
          unitOfMeasure: item.unitOfMeasure,
          plantId: item.plantId,
        })),
      });
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
