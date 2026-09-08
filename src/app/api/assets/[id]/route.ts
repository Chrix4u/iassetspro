import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
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

    const { id } = await params;

    const asset = await db.asset.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, code: true } },
        plant: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true, code: true } },
        parent: { select: { id: true, name: true, assetTag: true, status: true } },
        children: {
          select: { id: true, name: true, assetTag: true, status: true, condition: true, category: { select: { id: true, name: true } } },
          orderBy: { name: 'asc' },
        },
        assignedTo: { select: { id: true, fullName: true, username: true } },
        createdBy: { select: { id: true, fullName: true, username: true } },
        pmSchedules: {
          where: { isActive: true },
          orderBy: { nextDueDate: 'asc' },
        },
        digitalTwin: { select: { id: true, name: true, type: true, healthScore: true, isActive: true, lastSynced: true, syncInterval: true } },
        iotDevices: { select: { id: true, name: true, type: true, parameter: true, unit: true, status: true, lastSeen: true } },
      },
    });

    if (!asset) {
      return NextResponse.json(
        { success: false, error: 'Asset not found' },
        { status: 404 }
      );
    }

    // IDOR protection: ensure user has access to this asset's plant
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlant(plantScope, asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    // Also fetch related maintenance requests and work orders by assetId
    const [maintenanceRequests, workOrders] = await Promise.all([
      db.maintenanceRequest.findMany({
        where: { assetId: id },
        select: { id: true, requestNumber: true, title: true, status: true, priority: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      db.workOrder.findMany({
        where: { assetId: id },
        select: { id: true, woNumber: true, title: true, status: true, type: true, priority: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        ...asset,
        maintenanceRequests,
        workOrders,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load asset';
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
    if (!hasPermission(session, 'assets.update') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await db.asset.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Asset not found' },
        { status: 404 }
      );
    }

    // Apply the same plant authorization used by GET so update permissions do
    // not become a cross-plant IDOR bypass.
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlant(plantScope, existing.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    if (body.plantId !== undefined && body.plantId && !canAccessPlant(plantScope, body.plantId)) {
      return NextResponse.json({ success: false, error: 'Destination plant access denied' }, { status: 403 });
    }

    if (body.parentId) {
      const parent = await db.asset.findUnique({ where: { id: body.parentId }, select: { plantId: true } });
      if (!parent || !canAccessPlant(plantScope, parent.plantId)) {
        return NextResponse.json({ success: false, error: 'Parent asset not found or access denied' }, { status: 403 });
      }
    }

    // Build update data — Prisma .update() uses scalar FK fields (not connect syntax)
    const updateData: Record<string, unknown> = {};
    const scalarFields = [
      'name', 'description', 'serialNumber', 'manufacturer', 'model',
      'condition', 'status', 'criticality', 'location',
      'building', 'floor', 'area', 'imageUrl',
      'drawingsUrl', 'manualUrl', 'specification', 'isActive',
    ];
    // FK scalar fields — empty string must become null to avoid FK constraint violation
    const fkFields = ['categoryId', 'plantId', 'departmentId', 'assignedToId', 'parentId'];
    const dateFields = ['purchaseDate', 'warrantyExpiry', 'installedDate'];
    const numberFields = ['yearManufactured', 'purchaseCost', 'expectedLifeYears', 'currentValue', 'depreciationRate'];

    for (const field of scalarFields) {
      if (body[field] !== undefined) updateData[field] = body[field];
    }
    for (const field of fkFields) {
      if (body[field] !== undefined) updateData[field] = body[field] || null;
    }
    for (const field of dateFields) {
      if (body[field] !== undefined) updateData[field] = body[field] ? new Date(body[field]) : null;
    }
    for (const field of numberFields) {
      if (body[field] !== undefined) updateData[field] = body[field] !== null && body[field] !== '' ? Number(body[field]) : null;
    }

    // Prevent self-parent
    if (body.parentId === id) {
      return NextResponse.json(
        { success: false, error: 'Asset cannot be its own parent' },
        { status: 400 }
      );
    }

    const updated = await db.asset.update({
      where: { id },
      data: updateData,
      include: {
        category: { select: { id: true, name: true, code: true } },
        plant: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true, code: true } },
        assignedTo: { select: { id: true, fullName: true, username: true } },
      },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'update',
        entityType: 'asset',
        entityId: id,
        oldValues: JSON.stringify({ name: existing.name, status: existing.status }),
        newValues: JSON.stringify(updateData),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update asset';
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

    if (!hasPermission(session, 'assets.delete') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;

    const existing = await db.asset.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Asset not found' },
        { status: 404 }
      );
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlant(plantScope, existing.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    // Soft delete (isActive=false)
    const deactivated = await db.asset.update({
      where: { id },
      data: { isActive: false },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'delete',
        entityType: 'asset',
        entityId: id,
        oldValues: JSON.stringify({ assetTag: existing.assetTag, isActive: existing.isActive }),
        newValues: JSON.stringify({ isActive: false }),
      },
    });

    return NextResponse.json({ success: true, data: deactivated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to deactivate asset';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
