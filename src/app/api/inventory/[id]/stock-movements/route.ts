import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasAnyPermission(session, ['inventory.view_all', 'inventory.manage', 'inventory.stock_in', 'inventory.stock_out', 'inventory.update']) && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const item = await db.inventoryItem.findUnique({ where: { id }, select: { id: true, plantId: true } });
    if (!item) return NextResponse.json({ success: false, error: 'Inventory item not found' }, { status: 404 });

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, item.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const movements = await db.stockMovement.findMany({
      where: { itemId: id },
      include: { performedBy: { select: { id: true, fullName: true, username: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ success: true, data: movements });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load stock movements';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const type = typeof body.type === 'string' ? body.type : '';
    const quantity = Number(body.quantity);
    const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null;
    const referenceType = typeof body.referenceType === 'string' ? body.referenceType : null;
    const referenceId = typeof body.referenceId === 'string' ? body.referenceId : null;
    const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;

    const validTypes = ['in', 'out', 'adjustment', 'transfer'];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ success: false, error: `Invalid type. Must be one of: ${validTypes.join(', ')}` }, { status: 400 });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ success: false, error: 'Quantity must be a positive number' }, { status: 400 });
    }

    const requiredPermissions = type === 'in'
      ? ['inventory.stock_in', 'inventory.manage']
      : type === 'adjustment'
        ? ['inventory.manage']
        : ['inventory.stock_out', 'inventory.manage'];
    if (!hasAnyPermission(session, requiredPermissions) && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions for this stock movement' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });

    const result = await db.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findUnique({ where: { id } });
      if (!item) throw new Error('NOT_FOUND:Inventory item not found');
      if (!item.isActive) throw new Error('VALIDATION:Cannot move stock for inactive item');
      if (!canAccessPlantStrict(plantScope, item.plantId)) throw new Error('FORBIDDEN:Inventory item is outside your plant scope');

      const previousStock = item.currentStock;
      const newStock = type === 'in'
        ? previousStock + quantity
        : type === 'adjustment'
          ? quantity
          : previousStock - quantity;
      if (newStock < 0) {
        throw new Error(`VALIDATION:Insufficient stock. Current: ${previousStock}, attempted removal: ${quantity}`);
      }

      const claim = await tx.inventoryItem.updateMany({
        where: { id, currentStock: previousStock, isActive: true },
        data: { currentStock: newStock },
      });
      if (claim.count !== 1) throw new Error('CONFLICT:Inventory stock changed concurrently; refresh and retry');

      const movement = await tx.stockMovement.create({
        data: {
          itemId: id,
          type,
          quantity,
          previousStock,
          newStock,
          reason,
          referenceType,
          referenceId,
          performedById: session.userId,
          notes,
        },
        include: { performedBy: { select: { id: true, fullName: true, username: true } } },
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'create',
          entityType: 'stock_movement',
          entityId: movement.id,
          newValues: JSON.stringify({ itemId: id, type, quantity, previousStock, newStock }),
        },
      });
      return movement;
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error: unknown) {
    const raw = error instanceof Error ? error.message : 'Failed to create stock movement';
    if (raw.startsWith('NOT_FOUND:')) return NextResponse.json({ success: false, error: raw.slice(10) }, { status: 404 });
    if (raw.startsWith('FORBIDDEN:')) return NextResponse.json({ success: false, error: raw.slice(10) }, { status: 403 });
    if (raw.startsWith('VALIDATION:')) return NextResponse.json({ success: false, error: raw.slice(11) }, { status: 400 });
    if (raw.startsWith('CONFLICT:')) return NextResponse.json({ success: false, error: raw.slice(9) }, { status: 409 });
    return NextResponse.json({ success: false, error: raw }, { status: 500 });
  }
}
