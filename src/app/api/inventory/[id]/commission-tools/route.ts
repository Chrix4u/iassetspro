import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission, hasRole, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';

const ALLOWED_ROLES = ['inventory_manager', 'store_keeper', 'tools_shop_attendant'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    const canCommission = isAdmin(session)
      || hasAnyPermission(session, ['inventory.stock_out', 'inventory.manage'])
      || ALLOWED_ROLES.some((role) => hasRole(session, role));
    if (!canCommission) {
      return NextResponse.json({ success: false, error: 'Only inventory/store/tool-shop roles can commission purchased tools' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    const quantity = Number(body.quantity);
    const toolCategory = typeof body.toolCategory === 'string' && body.toolCategory.trim() ? body.toolCategory.trim() : 'General';
    const condition = ['new', 'good', 'fair'].includes(body.condition) ? body.condition : 'new';

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json({ success: false, error: 'Commission quantity must be a positive whole number' }, { status: 400 });
    }

    const result = await db.$transaction(async (tx) => {
      // Preserve the canonical TL-NNNN contract under concurrent commissioning.
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('iassetspro:tool-code'))");

      const item = await tx.inventoryItem.findUnique({ where: { id } });
      if (!item) throw new Error('NOT_FOUND:Inventory item not found');
      if (!item.isActive) throw new Error('VALIDATION:Cannot commission an inactive inventory item');
      if (item.category !== 'tool') throw new Error('VALIDATION:Only inventory items in the Tool category can be commissioned');
      if (!canAccessPlantStrict(plantScope, item.plantId)) throw new Error('FORBIDDEN:Inventory item is outside your plant scope');
      if (item.currentStock < quantity) {
        throw new Error(`VALIDATION:Insufficient received tool stock. Available: ${item.currentStock}, requested: ${quantity}`);
      }

      const existingCodes = await tx.tool.findMany({ select: { toolCode: true } });
      let maxCode = 0;
      for (const row of existingCodes) {
        const match = /^TL-(\d+)$/.exec(row.toolCode);
        if (match) maxCode = Math.max(maxCode, Number.parseInt(match[1], 10) || 0);
      }
      const toolCode = `TL-${String(maxCode + 1).padStart(4, '0')}`;

      const newStock = item.currentStock - quantity;
      const stockClaim = await tx.inventoryItem.updateMany({
        where: { id, currentStock: item.currentStock, isActive: true },
        data: { currentStock: newStock },
      });
      if (stockClaim.count !== 1) throw new Error('CONFLICT:Inventory stock changed concurrently; refresh and retry');

      const tool = await tx.tool.create({
        data: {
          toolCode,
          name: item.name,
          description: item.description || `Commissioned from inventory item ${item.itemCode}`,
          category: toolCategory,
          status: 'available',
          condition,
          quantity,
          location: item.location || item.binLocation || null,
          plantId: item.plantId,
          purchaseDate: new Date(),
          purchaseCost: item.unitCost ?? null,
          currentValue: item.unitCost ?? null,
          createdById: session.userId,
        },
      });

      await tx.stockMovement.create({
        data: {
          itemId: id,
          type: 'out',
          quantity,
          previousStock: item.currentStock,
          newStock,
          reason: `Commissioned to Tool Registry as ${toolCode}`,
          referenceType: 'tool_commission',
          referenceId: tool.id,
          performedById: session.userId,
          notes: `Purchased tool stock converted to reusable company-tool custody`,
        },
      });

      await tx.toolTransaction.create({
        data: {
          toolId: tool.id,
          type: 'purchase_commission',
          notes: `Commissioned ${quantity}x from inventory ${item.itemCode}`,
          performedById: session.userId,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'commission_tools',
          entityType: 'inventory_item',
          entityId: id,
          oldValues: JSON.stringify({ currentStock: item.currentStock }),
          newValues: JSON.stringify({ currentStock: newStock, toolId: tool.id, toolCode, quantity }),
        },
      });

      return { tool, inventory: { id, itemCode: item.itemCode, previousStock: item.currentStock, currentStock: newStock } };
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error: unknown) {
    const raw = error instanceof Error ? error.message : 'Failed to commission purchased tools';
    if (raw.startsWith('NOT_FOUND:')) return NextResponse.json({ success: false, error: raw.slice(10) }, { status: 404 });
    if (raw.startsWith('FORBIDDEN:')) return NextResponse.json({ success: false, error: raw.slice(10) }, { status: 403 });
    if (raw.startsWith('VALIDATION:')) return NextResponse.json({ success: false, error: raw.slice(11) }, { status: 400 });
    if (raw.startsWith('CONFLICT:')) return NextResponse.json({ success: false, error: raw.slice(9) }, { status: 409 });
    return NextResponse.json({ success: false, error: raw }, { status: 500 });
  }
}
