import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { normalizeCodeSegment } from '@/lib/functional-location/location-code';

function canView(session: ReturnType<typeof getSession>): boolean {
  return !!session && (isAdmin(session) || hasPermission(session, 'assets.hierarchy.view'));
}

function canManage(session: ReturnType<typeof getSession>): boolean {
  return !!session && (isAdmin(session) || hasPermission(session, 'assets.hierarchy.manage'));
}

function parseOrder(value: unknown): number | null {
  const order = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(order) && order > 0 ? order : null;
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
    const system = await db.hierarchySystem.findUnique({ where: { id }, select: { id: true } });
    if (!system) return NextResponse.json({ success: false, error: 'Hierarchy system not found' }, { status: 404 });

    const levels = await db.hierarchyLevel.findMany({
      where: { hierarchySystemId: id },
      include: { _count: { select: { functionalLocations: true } } },
      orderBy: { order: 'asc' },
    });
    return NextResponse.json({ success: true, data: levels });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load hierarchy levels';
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
    const system = await db.hierarchySystem.findUnique({ where: { id } });
    if (!system) return NextResponse.json({ success: false, error: 'Hierarchy system not found' }, { status: 404 });
    if (!system.isActive) return NextResponse.json({ success: false, error: 'Cannot add levels to an inactive hierarchy system' }, { status: 400 });

    const body = await request.json();
    const label = typeof body.label === 'string' ? body.label.trim() : '';
    const order = parseOrder(body.order);
    if (!label || !order) {
      return NextResponse.json({ success: false, error: 'Level label and a positive integer order are required' }, { status: 400 });
    }

    let codePrefix: string | null = null;
    if (typeof body.codePrefix === 'string' && body.codePrefix.trim()) {
      try {
        codePrefix = normalizeCodeSegment(body.codePrefix);
      } catch (error) {
        return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Invalid code prefix' }, { status: 400 });
      }
    }

    const level = await db.hierarchyLevel.create({
      data: {
        hierarchySystemId: id,
        order,
        label,
        description: typeof body.description === 'string' ? body.description.trim() || null : null,
        isRequired: body.isRequired !== false,
        allowAssetAssignment: body.allowAssetAssignment === true,
        codePrefix,
        isActive: body.isActive !== false,
      },
    });

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'create',
        entityType: 'hierarchy_level',
        entityId: level.id,
        newValues: JSON.stringify(level),
      },
    });

    return NextResponse.json({ success: true, data: level }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'A hierarchy level already uses that order in this system' }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : 'Failed to create hierarchy level';
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

    const { id: hierarchySystemId } = await params;
    const body = await request.json();
    const levelId = typeof body.id === 'string' ? body.id : '';
    if (!levelId) return NextResponse.json({ success: false, error: 'Level id is required' }, { status: 400 });

    const existing = await db.hierarchyLevel.findUnique({
      where: { id: levelId },
      include: { _count: { select: { functionalLocations: true } } },
    });
    if (!existing || existing.hierarchySystemId !== hierarchySystemId) {
      return NextResponse.json({ success: false, error: 'Hierarchy level not found' }, { status: 404 });
    }

    const systemLocationCount = await db.functionalLocation.count({ where: { hierarchySystemId } });
    const data: Prisma.HierarchyLevelUpdateInput = {};

    if (body.order !== undefined) {
      const order = parseOrder(body.order);
      if (!order) return NextResponse.json({ success: false, error: 'Level order must be a positive integer' }, { status: 400 });
      if (order !== existing.order && systemLocationCount > 0) {
        return NextResponse.json(
          { success: false, error: 'Level order cannot be changed after functional locations exist; create a migration plan instead' },
          { status: 400 },
        );
      }
      data.order = order;
    }

    if (body.isActive === false && existing._count.functionalLocations > 0) {
      return NextResponse.json(
        { success: false, error: 'A hierarchy level with functional locations cannot be deactivated' },
        { status: 400 },
      );
    }

    if (body.label !== undefined) {
      const label = typeof body.label === 'string' ? body.label.trim() : '';
      if (!label) return NextResponse.json({ success: false, error: 'Level label is required' }, { status: 400 });
      data.label = label;
    }
    if (body.description !== undefined) data.description = typeof body.description === 'string' ? body.description.trim() || null : null;
    if (body.isRequired !== undefined) data.isRequired = body.isRequired === true;
    if (body.allowAssetAssignment !== undefined) data.allowAssetAssignment = body.allowAssetAssignment === true;
    if (body.isActive !== undefined) data.isActive = body.isActive === true;
    if (body.codePrefix !== undefined) {
      if (body.codePrefix === null || body.codePrefix === '') {
        data.codePrefix = null;
      } else {
        try {
          data.codePrefix = normalizeCodeSegment(String(body.codePrefix));
        } catch (error) {
          return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Invalid code prefix' }, { status: 400 });
        }
      }
    }

    const updated = await db.hierarchyLevel.update({ where: { id: levelId }, data });
    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'update',
        entityType: 'hierarchy_level',
        entityId: levelId,
        oldValues: JSON.stringify(existing),
        newValues: JSON.stringify(updated),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'A hierarchy level already uses that order in this system' }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : 'Failed to update hierarchy level';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
