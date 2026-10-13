import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlant, getPlantScope } from '@/lib/plant-scope';
import { canMutateFunctionalLocationForScope } from '@/lib/functional-location/access';
import { normalizeLocationCode } from '@/lib/functional-location/location-code';

function canView(session: ReturnType<typeof getSession>): boolean {
  return !!session && (isAdmin(session) || hasPermission(session, 'assets.functional_locations.view'));
}

function canManage(session: ReturnType<typeof getSession>): boolean {
  return !!session && (isAdmin(session) || hasPermission(session, 'assets.functional_locations.manage'));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!canView(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });

    const { id } = await params;
    const location = await db.functionalLocation.findUnique({
      where: { id },
      include: {
        hierarchySystem: true,
        hierarchyLevel: true,
        parent: { select: { id: true, name: true, locationCode: true, plantId: true } },
        children: {
          select: {
            id: true,
            name: true,
            locationCode: true,
            hierarchyLevelId: true,
            plantId: true,
            depth: true,
            status: true,
          },
          orderBy: { name: 'asc' },
        },
        plant: { select: { id: true, name: true, code: true } },
      },
    });
    if (!location) return NextResponse.json({ success: false, error: 'Functional location not found' }, { status: 404 });
    if (!canAccessPlant(plantScope, location.plantId)) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: location });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load functional location';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!canManage(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });

    const { id } = await params;
    const existing = await db.functionalLocation.findUnique({
      where: { id },
      include: { hierarchySystem: true },
    });
    if (!existing) return NextResponse.json({ success: false, error: 'Functional location not found' }, { status: 404 });
    if (!canAccessPlant(plantScope, existing.plantId) || !canMutateFunctionalLocationForScope(plantScope, existing.plantId)) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const body = await request.json();
    if (body.parentId !== undefined || body.hierarchyLevelId !== undefined || body.plantId !== undefined) {
      return NextResponse.json(
        { success: false, error: 'Use the guarded move operation to change parent, hierarchy level, or plant context' },
        { status: 400 },
      );
    }

    const data: Prisma.FunctionalLocationUpdateInput = {};
    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return NextResponse.json({ success: false, error: 'Functional location name is required' }, { status: 400 });
      data.name = name;
    }
    if (body.description !== undefined) data.description = typeof body.description === 'string' ? body.description.trim() || null : null;
    if (body.status !== undefined) {
      if (!['active', 'inactive', 'retired'].includes(body.status)) {
        return NextResponse.json({ success: false, error: 'Status must be active, inactive, or retired' }, { status: 400 });
      }
      data.status = body.status;
    }
    if (body.locationCode !== undefined) {
      const manualCodeAllowed = existing.hierarchySystem.codeMode === 'manual'
        || (existing.hierarchySystem.codeMode === 'mixed' && existing.hierarchySystem.allowCodeOverride);
      if (!manualCodeAllowed) {
        return NextResponse.json(
          { success: false, error: 'This hierarchy system does not allow manual Location Code overrides' },
          { status: 400 },
        );
      }
      try {
        data.locationCode = normalizeLocationCode(String(body.locationCode));
      } catch (error) {
        return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Invalid Location Code' }, { status: 400 });
      }
    }

    const updated = await db.functionalLocation.update({ where: { id }, data });
    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'update',
        entityType: 'functional_location',
        entityId: id,
        oldValues: JSON.stringify(existing),
        newValues: JSON.stringify(updated),
        plantId: existing.plantId,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'That Location Code already exists in this hierarchy system' }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : 'Failed to update functional location';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!canManage(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });

    const { id } = await params;
    const existing = await db.functionalLocation.findUnique({
      where: { id },
      include: { _count: { select: { children: true } } },
    });
    if (!existing) return NextResponse.json({ success: false, error: 'Functional location not found' }, { status: 404 });
    if (!canMutateFunctionalLocationForScope(plantScope, existing.plantId)) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }
    if (existing._count.children > 0) {
      return NextResponse.json(
        { success: false, error: 'Functional locations with child nodes cannot be retired until their structure is moved or retired' },
        { status: 400 },
      );
    }

    const retired = await db.functionalLocation.update({ where: { id }, data: { status: 'retired' } });
    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'update',
        entityType: 'functional_location',
        entityId: id,
        oldValues: JSON.stringify(existing),
        newValues: JSON.stringify(retired),
        plantId: existing.plantId,
      },
    });

    return NextResponse.json({ success: true, data: retired });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to retire functional location';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
