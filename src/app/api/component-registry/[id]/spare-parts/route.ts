import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getComponentPlantAccess } from '@/lib/component-plant-access';
import { createAuditLog } from '@/lib/audit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'digital_twin.view') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const componentAccess = await getComponentPlantAccess(request, session, id);
    if (!componentAccess.exists) {
      return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
    }
    if (!componentAccess.allowed) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const component = await db.componentRegistry.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!component) {
      return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
    }

    const spareParts = await db.componentSparePart.findMany({
      where: { componentId: id },
      include: {
        inventoryItem: {
          select: { id: true, itemCode: true, name: true, currentStock: true, unitOfMeasure: true, unitCost: true, location: true },
        },
      },
      orderBy: { sparePartName: 'asc' },
    });

    return NextResponse.json({ success: true, data: spareParts });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load spare parts';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'digital_twin.manage') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const componentAccess = await getComponentPlantAccess(request, session, id);
    if (!componentAccess.exists) {
      return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
    }
    if (!componentAccess.allowed) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }
    const body = await request.json();
    const { inventoryItemId, sparePartName, sparePartCode, quantityRequired, unitCost, leadTimeDays, criticality, notes } = body;

    if (!sparePartName) {
      return NextResponse.json({ success: false, error: 'sparePartName is required' }, { status: 400 });
    }

    const component = await db.componentRegistry.findUnique({ where: { id } });
    if (!component) {
      return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
    }

    // Validate inventoryItemId if provided
    if (inventoryItemId) {
      const item = await db.inventoryItem.findUnique({ where: { id: inventoryItemId } });
      if (!item) {
        return NextResponse.json({ success: false, error: 'Inventory item not found' }, { status: 404 });
      }
    }

    if (inventoryItemId) {
      const duplicate = await db.componentSparePart.findFirst({
        where: { componentId: id, inventoryItemId },
        select: { id: true },
      });
      if (duplicate) {
        return NextResponse.json(
          { success: false, error: 'This inventory item is already linked to the component' },
          { status: 409 },
        );
      }
    }

    const sparePart = await db.componentSparePart.create({
      data: {
        componentId: id,
        inventoryItemId,
        sparePartName,
        sparePartCode: sparePartCode || '',
        quantityRequired: quantityRequired ? parseInt(String(quantityRequired), 10) : 1,
        unitCost: unitCost ? parseFloat(String(unitCost)) : null,
        leadTimeDays: leadTimeDays ? parseInt(String(leadTimeDays), 10) : null,
        criticality: criticality || 'medium',
        notes,
      },
      include: {
        inventoryItem: { select: { id: true, itemCode: true, name: true, currentStock: true, unitOfMeasure: true } },
      },
    });

    await createAuditLog(
      session.userId,
      'component_spare_part',
      'create',
      sparePart.id,
      { newValues: { componentId: id, sparePartName, sparePartCode } },
    );

    return NextResponse.json({ success: true, data: sparePart }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to add spare part';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'digital_twin.manage') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id: componentId } = await params;
    const { searchParams } = new URL(request.url);
    const sparePartId = searchParams.get('sparePartId');
    if (!sparePartId) {
      return NextResponse.json({ success: false, error: 'sparePartId is required' }, { status: 400 });
    }

    const link = await db.componentSparePart.findFirst({
      where: { id: sparePartId, componentId },
    });
    if (!link) {
      return NextResponse.json({ success: false, error: 'Component spare-part link not found' }, { status: 404 });
    }

    await db.componentSparePart.delete({ where: { id: sparePartId } });
    await createAuditLog(
      session.userId,
      'component_spare_part',
      'delete',
      sparePartId,
      { oldValues: { componentId, inventoryItemId: link.inventoryItemId, sparePartCode: link.sparePartCode } },
    );

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to remove spare-part link';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

