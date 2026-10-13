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

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!canView(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const systems = await db.hierarchySystem.findMany({
      include: { levels: { orderBy: { order: 'asc' } } },
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
    });

    return NextResponse.json({ success: true, data: systems });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load hierarchy systems';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!canManage(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json({ success: false, error: 'Hierarchy system name is required' }, { status: 400 });
    }

    let code: string;
    let codeSeparator: string;
    try {
      code = normalizeLocationCode(String(body.code || ''));
      codeSeparator = validateCodeSeparator(typeof body.codeSeparator === 'string' ? body.codeSeparator : '-');
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Invalid hierarchy code configuration' },
        { status: 400 },
      );
    }

    const purpose = typeof body.purpose === 'string' ? body.purpose : 'functional_location';
    if (!PURPOSES.has(purpose)) {
      return NextResponse.json({ success: false, error: 'Unsupported hierarchy purpose' }, { status: 400 });
    }

    const codeMode = (typeof body.codeMode === 'string' ? body.codeMode : 'mixed') as LocationCodeMode;
    if (!CODE_MODES.has(codeMode)) {
      return NextResponse.json({ success: false, error: 'Code mode must be manual, generated, or mixed' }, { status: 400 });
    }

    const requestPrimary = body.isPrimary === true;
    const isActive = body.isActive !== false;
    if (requestPrimary && !isActive) {
      return NextResponse.json(
        { success: false, error: 'An inactive hierarchy system cannot be primary' },
        { status: 400 },
      );
    }

    const system = await db.hierarchySystem.create({
      data: {
        name,
        code,
        purpose,
        description: typeof body.description === 'string' ? body.description.trim() || null : null,
        isPrimary: false,
        isActive,
        codeMode,
        codeSeparator,
        allowCodeOverride: body.allowCodeOverride !== false,
        createdById: session.userId,
      },
    });

    const result = requestPrimary
      ? await setPrimaryHierarchySystem(system.id, session.userId)
      : system;

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'create',
        entityType: 'hierarchy_system',
        entityId: system.id,
        newValues: JSON.stringify(result),
      },
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'Hierarchy system code already exists' }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : 'Failed to create hierarchy system';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
