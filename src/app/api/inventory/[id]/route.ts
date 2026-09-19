import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, hasAnyPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlant } from '@/lib/plant-scope';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!isAdmin(session) && !hasAnyPermission(session, [
      'inventory.view_all',
      'inventory.manage',
      'inventory.stock_in',
      'inventory.stock_out',
      'inventory_locations.view',
      'stock_transactions.view',
      'inventory_adjustments.view',
      'inventory_transfers.view',
      'material_requisitions.view',
      'vendors.view',
      'purchase_orders.view',
    ])) {
      return NextResponse.json({ success: false, error: 'Insufficient inventory permissions' }, { status: 403 });
    }

    const { id } = await params;
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const item = await db.inventoryItem.findUnique({
      where: { id },
      include: {
        plant: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, fullName: true, username: true } },
        stockMovements: {
          include: {
            performedBy: { select: { id: true, fullName: true, username: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!item) {
      return NextResponse.json(
        { success: false, error: 'Inventory item not found' },
        { status: 404 }
      );
    }
    if (!canAccessPlant(plantScope, item.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: item });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load inventory item';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'inventory.update') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await db.inventoryItem.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Inventory item not found' },
        { status: 404 }
      );
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      'name', 'description', 'category', 'unitOfMeasure', 'minStockLevel',
      'maxStockLevel', 'reorderQuantity', 'unitCost', 'supplier',
      'supplierPartNumber', 'location', 'binLocation', 'shelfLocation',
      'plantId', 'specification', 'imageUrls', 'isActive',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // Check item code uniqueness if changing
    if (body.itemCode && body.itemCode !== existing.itemCode) {
      const codeExists = await db.inventoryItem.findUnique({ where: { itemCode: body.itemCode } });
      if (codeExists) {
        return NextResponse.json(
          { success: false, error: 'Item code already exists' },
          { status: 400 }
        );
      }
      updateData.itemCode = body.itemCode;
    }

    const updated = await db.inventoryItem.update({
      where: { id },
      data: updateData,
      include: {
        plant: { select: { id: true, name: true, code: true } },
      },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'update',
        entityType: 'inventory_item',
        entityId: id,
        oldValues: JSON.stringify({ name: existing.name, itemCode: existing.itemCode }),
        newValues: JSON.stringify(updateData),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update inventory item';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'inventory.delete') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;

    const existing = await db.inventoryItem.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Inventory item not found' },
        { status: 404 }
      );
    }

    // Soft delete (isActive=false)
    const deactivated = await db.inventoryItem.update({
      where: { id },
      data: { isActive: false },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'delete',
        entityType: 'inventory_item',
        entityId: id,
        oldValues: JSON.stringify({ name: existing.name, itemCode: existing.itemCode, isActive: true }),
        newValues: JSON.stringify({ isActive: false }),
      },
    });

    return NextResponse.json({ success: true, data: deactivated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to deactivate inventory item';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
