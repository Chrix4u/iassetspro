import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'digital_twin.view') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const { id } = await params;

    const twin = await db.digitalTwin.findUnique({
      where: { id },
      include: {
        asset: {
          select: {
            id: true,
            name: true,
            assetTag: true,
            status: true,
            condition: true,
            serialNumber: true,
            manufacturer: true,
            model: true,
            plantId: true,
          },
        },
        createdBy: { select: { id: true, fullName: true, username: true } },
      },
    });

    if (!twin) {
      return NextResponse.json({ success: false, error: 'Digital twin not found' }, { status: 404 });
    }
    if (!canAccessPlantStrict(plantScope, twin.asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    // Get IoT device readings for this asset only after plant authorization.
    const iotDevices = await db.iotDevice.findMany({
      where: { assetId: twin.assetId, isActive: true },
      include: {
        readings: { orderBy: { timestamp: 'desc' }, take: 10 },
        rules: { where: { isActive: true }, take: 1 },
      },
      take: 10,
    });

    return NextResponse.json({ success: true, data: { ...twin, iotDevices } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load digital twin';
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

    if (!hasPermission(session, 'digital_twin.manage') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await db.digitalTwin.findUnique({
      where: { id },
      include: { asset: { select: { plantId: true } } },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Digital twin not found' }, { status: 404 });
    }
    if (!canAccessPlantStrict(plantScope, existing.asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      'name', 'description', 'type', 'parameters', 'connections',
      'specification', 'healthScore', 'syncInterval', 'isActive',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'parameters' || field === 'connections' || field === 'specification') {
          updateData[field] = typeof body[field] === 'string' ? body[field] : JSON.stringify(body[field]);
        } else if (field === 'healthScore') {
          updateData[field] = body[field] !== null ? parseInt(String(body[field]), 10) : 0;
        } else {
          updateData[field] = body[field];
        }
      }
    }

    const updated = await db.digitalTwin.update({
      where: { id },
      data: updateData,
      include: {
        asset: { select: { id: true, name: true, assetTag: true, status: true, condition: true } },
        createdBy: { select: { id: true, fullName: true, username: true } },
      },
    });

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'update',
        entityType: 'digital_twin',
        entityId: id,
        oldValues: JSON.stringify({ name: existing.name, isActive: existing.isActive }),
        newValues: JSON.stringify(updateData),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update digital twin';
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

    if (!hasPermission(session, 'digital_twin.manage') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const { id } = await params;

    const existing = await db.digitalTwin.findUnique({
      where: { id },
      include: { asset: { select: { plantId: true } } },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Digital twin not found' }, { status: 404 });
    }
    if (!canAccessPlantStrict(plantScope, existing.asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    await db.digitalTwin.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'delete',
        entityType: 'digital_twin',
        entityId: id,
        oldValues: JSON.stringify({ name: existing.name, assetId: existing.assetId }),
        newValues: JSON.stringify({ deleted: true }),
      },
    });

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete digital twin';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
