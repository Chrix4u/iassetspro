import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { normalizeLocationCode, validateCodeSeparator, type LocationCodeMode } from '@/lib/functional-location/location-code';
import { setPrimaryHierarchySystem } from '@/lib/functional-location/service';

const PURPOSES = new Set(['functional_location', 'electrical', 'process', 'utilities', 'facilities', 'custom']);
const CODE_MODES = new Set<LocationCodeMode>(['manual', 'generated', 'mixed']);

function canView(session: ReturnType<typeof getSession>): boolean {
  return !!session && (isAdmin(session) || hasPermission(session, 'assets.hierarchy.view'));
}

function canManage(session: ReturnType<typeof getSession>): boolean {
  return !!session && (isAdmin(session) || hasPermission(session, 'assets.hierarchy.manage'));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!canView(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const system = await db.hierarchySystem.findUnique({
      where: { id },
      include: {
        levels: { orderBy: { order: 'asc' } },
        _count: { select: { functionalLocations: true } },
      },
    });
    if (!system) {
      return NextResponse.json({ success: false, error: 'Hierarchy system not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: system });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load hierarchy system';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!canManage(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const existing = await db.hierarchySystem.findUnique({
      where: { id },
      include: { _count: { select: { functionalLocations: true } } },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Hierarchy system not found' }, { status: 404 });
    }

    const body = await request.json();
    if (existing.isPrimary && body.isPrimary === false) {
      return NextResponse.json(
        { success: false, error: 'Select another hierarchy system as primary instead of clearing the current primary' },
        { status: 400 },
      );
    }
    if (existing.isPrimary && body.isActive === false) {
      return NextResponse.json(
        { success: false, error: 'The primary hierarchy system cannot be deactivated until another active system is made primary' },
        { status: 400 },
      );
    }

    const data: Prisma.HierarchySystemUpdateInput = {};
    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return NextResponse.json({ success: false, error: 'Hierarchy system name is required' }, { status: 400 });
      data.name = name;
    }
    if (body.code !== undefined) {
      try {
        data.code = normalizeLocationCode(String(body.code));
      } catch (error) {
        return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Invalid hierarchy code' }, { status: 400 });
      }
    }
    if (body.purpose !== undefined) {
      if (typeof body.purpose !== 'string' || !PURPOSES.has(body.purpose)) {
        return NextResponse.json({ success: false, error: 'Unsupported hierarchy purpose' }, { status: 400 });
      }
      data.purpose = body.purpose;
    }
    if (body.codeMode !== undefined) {
      if (typeof body.codeMode !== 'string' || !CODE_MODES.has(body.codeMode as LocationCodeMode)) {
        return NextResponse.json({ success: false, error: 'Code mode must be manual, generated, or mixed' }, { status: 400 });
      }
      data.codeMode = body.codeMode;
    }
    if (body.codeSeparator !== undefined) {
      try {
        data.codeSeparator = validateCodeSeparator(String(body.codeSeparator));
      } catch (error) {
        return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Invalid code separator' }, { status: 400 });
      }
    }
    if (body.description !== undefined) data.description = typeof body.description === 'string' ? body.description.trim() || null : null;
    if (body.allowCodeOverride !== undefined) data.allowCodeOverride = body.allowCodeOverride === true;
    if (body.isActive !== undefined) data.isActive = body.isActive === true;

    const updated = await db.hierarchySystem.update({ where: { id }, data });
    const result = body.isPrimary === true && !updated.isPrimary
      ? await setPrimaryHierarchySystem(id, session.userId)
      : updated;

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'update',
        entityType: 'hierarchy_system',
        entityId: id,
        oldValues: JSON.stringify(existing),
        newValues: JSON.stringify({
          ...result,
          codeRuleNote: existing._count.functionalLocations > 0
            ? 'Existing Location Codes were preserved; new code rules apply only to future explicit code changes/creates.'
            : undefined,
        }),
      },
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'Hierarchy system code already exists' }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : 'Failed to update hierarchy system';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
