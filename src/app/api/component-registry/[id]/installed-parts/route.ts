import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlant, getPlantScope } from '@/lib/plant-scope';

function canView(session: ReturnType<typeof getSession>) {
  if (!session) return false;
  return isAdmin(session)
    || hasPermission(session, 'digital_twin.view')
    || hasPermission(session, 'work_orders.view')
    || hasPermission(session, 'work_orders.view_own');
}

function canManage(session: ReturnType<typeof getSession>) {
  if (!session) return false;
  return isAdmin(session)
    || hasPermission(session, 'digital_twin.manage')
    || hasPermission(session, 'work_orders.update')
    || hasPermission(session, 'work_orders.start')
    || hasPermission(session, 'work_orders.complete');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!canView(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });

    const { id } = await params;
    const component = await db.componentRegistry.findUnique({
      where: { id },
      select: { id: true, asset: { select: { plantId: true } } },
    });
    if (!component) return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });

    const plantScope = await getPlantScope(request, session);
    if (!canAccessPlant(plantScope, component.asset?.plantId)) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const rows = await db.installedSparePart.findMany({
      where: { componentId: id },
      orderBy: [{ status: 'asc' }, { installedAt: 'desc' }],
      include: {
        inventoryItem: { select: { id: true, itemCode: true, name: true, unitOfMeasure: true, currentStock: true } },
        materialRequest: { select: { id: true, workOrderId: true, itemName: true, quantityIssued: true, quantityReturned: true, consumedQty: true, status: true } },
        workOrder: { select: { id: true, woNumber: true, title: true, status: true } },
        installedBy: { select: { id: true, fullName: true, username: true } },
        removedBy: { select: { id: true, fullName: true, username: true } },
      },
    });

    return NextResponse.json({ success: true, data: rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load installed spare parts';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!canManage(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    let {
      inventoryItemId,
      materialRequestId,
      workOrderId,
      partName,
      partCode,
      serialNumber,
      lotNumber,
      quantity,
      sourceType,
      notes,
    } = body;

    const parsedQuantity = Number(quantity ?? 1);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      return NextResponse.json({ success: false, error: 'quantity must be greater than zero' }, { status: 400 });
    }

    const component = await db.componentRegistry.findUnique({
      where: { id },
      select: { id: true, assetId: true, componentCode: true, name: true, asset: { select: { plantId: true } } },
    });
    if (!component) return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });

    const plantScope = await getPlantScope(request, session);
    if (!canAccessPlant(plantScope, component.asset?.plantId)) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    let materialRequest: {
      id: string;
      workOrderId: string;
      componentRegistryId: string | null;
      itemId: string | null;
      itemName: string;
      quantityIssued: number;
      quantityReturned: number;
      consumedQty: number | null;
      status: string;
    } | null = null;

    if (materialRequestId) {
      materialRequest = await db.repairMaterialRequest.findUnique({
        where: { id: String(materialRequestId) },
        select: {
          id: true,
          workOrderId: true,
          componentRegistryId: true,
          itemId: true,
          itemName: true,
          quantityIssued: true,
          quantityReturned: true,
          consumedQty: true,
          status: true,
        },
      });
      if (!materialRequest) {
        return NextResponse.json({ success: false, error: 'Material request not found' }, { status: 404 });
      }
      if (!['issued', 'returned', 'closed'].includes(materialRequest.status)) {
        return NextResponse.json({ success: false, error: 'Material must be issued before it can be installed' }, { status: 409 });
      }
      if (materialRequest.componentRegistryId && materialRequest.componentRegistryId !== id) {
        return NextResponse.json({ success: false, error: 'Material request belongs to a different component' }, { status: 400 });
      }
      if (inventoryItemId && materialRequest.itemId && inventoryItemId !== materialRequest.itemId) {
        return NextResponse.json({ success: false, error: 'Inventory item does not match the material request' }, { status: 400 });
      }
      if (workOrderId && workOrderId !== materialRequest.workOrderId) {
        return NextResponse.json({ success: false, error: 'Work order does not match the material request' }, { status: 400 });
      }

      inventoryItemId = inventoryItemId || materialRequest.itemId || null;
      workOrderId = workOrderId || materialRequest.workOrderId;
      partName = String(partName || materialRequest.itemName || '').trim();
      sourceType = 'material_request';

      const authoritativeQty = materialRequest.consumedQty
        ?? Math.max(0, materialRequest.quantityIssued - materialRequest.quantityReturned);
      const aggregate = await db.installedSparePart.aggregate({
        where: { materialRequestId: materialRequest.id },
        _sum: { quantity: true },
      });
      const alreadyTracked = aggregate._sum.quantity ?? 0;
      if (parsedQuantity > authoritativeQty - alreadyTracked + 1e-9) {
        return NextResponse.json(
          {
            success: false,
            error: 'Installed quantity exceeds the issued/consumed quantity available from this material request',
            data: { authoritativeQty, alreadyTracked, remainingQty: Math.max(0, authoritativeQty - alreadyTracked) },
          },
          { status: 409 },
        );
      }
    }

    let inventoryItem: { id: string; itemCode: string; name: string } | null = null;
    if (inventoryItemId) {
      inventoryItem = await db.inventoryItem.findUnique({
        where: { id: String(inventoryItemId) },
        select: { id: true, itemCode: true, name: true },
      });
      if (!inventoryItem) return NextResponse.json({ success: false, error: 'Inventory item not found' }, { status: 404 });
      partName = String(partName || inventoryItem.name).trim();
      partCode = String(partCode || inventoryItem.itemCode).trim();
    }

    partName = String(partName || '').trim();
    if (!partName) return NextResponse.json({ success: false, error: 'partName is required' }, { status: 400 });

    const normalizedSource = materialRequest ? 'material_request' : String(sourceType || 'manual');
    if (!['material_request', 'commissioning', 'manual'].includes(normalizedSource)) {
      return NextResponse.json({ success: false, error: 'Invalid sourceType' }, { status: 400 });
    }

    if (serialNumber) {
      const duplicate = await db.installedSparePart.findUnique({ where: { serialNumber: String(serialNumber).trim() } });
      if (duplicate) return NextResponse.json({ success: false, error: 'Serial number is already tracked' }, { status: 409 });
    }

    if (workOrderId) {
      const workOrder = await db.workOrder.findUnique({ where: { id: String(workOrderId) }, select: { id: true, assetId: true } });
      if (!workOrder) return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
      if (component.assetId && workOrder.assetId && component.assetId !== workOrder.assetId) {
        return NextResponse.json({ success: false, error: 'Work order belongs to a different asset' }, { status: 400 });
      }
    }

    const record = await db.installedSparePart.create({
      data: {
        componentId: id,
        inventoryItemId: inventoryItemId ? String(inventoryItemId) : null,
        materialRequestId: materialRequestId ? String(materialRequestId) : null,
        workOrderId: workOrderId ? String(workOrderId) : null,
        partName,
        partCode: partCode ? String(partCode).trim() : null,
        serialNumber: serialNumber ? String(serialNumber).trim() : null,
        lotNumber: lotNumber ? String(lotNumber).trim() : null,
        quantity: parsedQuantity,
        sourceType: normalizedSource,
        status: 'installed',
        installedById: session.userId,
        notes: notes ? String(notes).trim() : null,
      },
      include: {
        inventoryItem: { select: { id: true, itemCode: true, name: true, unitOfMeasure: true } },
        workOrder: { select: { id: true, woNumber: true, title: true } },
      },
    });

    await createAuditLog(session.userId, 'installed_spare_parts', 'create', record.id, {
      newValues: {
        componentId: id,
        inventoryItemId: record.inventoryItemId,
        materialRequestId: record.materialRequestId,
        workOrderId: record.workOrderId,
        partName: record.partName,
        partCode: record.partCode,
        serialNumber: record.serialNumber,
        quantity: record.quantity,
        sourceType: record.sourceType,
      },
    });

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to record installed spare part';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
