import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { normalizeCodeSegment, normalizeLocationCode, validateCodeSeparator } from '@/lib/functional-location/location-code';

const ALLOWED_PURPOSES = new Set(['functional_location', 'electrical', 'process', 'utilities', 'facilities', 'custom']);
const ALLOWED_CODE_MODES = new Set(['manual', 'generated', 'mixed']);

function canView(session: NonNullable<ReturnType<typeof getSession>>) {
  return isAdmin(session) || hasPermission(session, 'assets.hierarchy.view');
}

function canManage(session: NonNullable<ReturnType<typeof getSession>>) {
  return isAdmin(session) || hasPermission(session, 'assets.hierarchy.manage');
}

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!canView(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });

    const systems = await db.hierarchySystem.findMany({
      include: {
        levels: { orderBy: { order: 'asc' } },
        _count: { select: { functionalLocations: true } },
      },
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
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!canManage(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });

    const body = await request.json();
    const name = String(body.name || '').trim();
    const code = normalizeLocationCode(String(body.code || ''));
    const purpose = String(body.purpose || 'functional_location');
    const codeMode = String(body.codeMode || 'mixed');
    const codeSeparator = validateCodeSeparator(String(body.codeSeparator || '-'));
    const allowCodeOverride = body.allowCodeOverride !== false;
    const requestedPrimary = body.isPrimary === true;
    const isActive = body.isActive !== false;
    const rawLevels = Array.isArray(body.levels) ? body.levels : [];

    if (!name) return NextResponse.json({ success: false, error: 'Hierarchy name is required' }, { status: 400 });
    if (!ALLOWED_PURPOSES.has(purpose)) return NextResponse.json({ success: false, error: 'Unsupported hierarchy purpose' }, { status: 400 });
    if (!ALLOWED_CODE_MODES.has(codeMode)) return NextResponse.json({ success: false, error: 'Unsupported Location Code mode' }, { status: 400 });
    if (rawLevels.length === 0) return NextResponse.json({ success: false, error: 'At least one hierarchy level is required' }, { status: 400 });
    if (requestedPrimary && !isActive) {
      return NextResponse.json({ success: false, error: 'Primary hierarchy system must be active' }, { status: 400 });
    }

    const seenOrders = new Set<number>();
    const levels = rawLevels.map((level: Record<string, unknown>, index: number) => {
      const order = Number(level.order ?? index + 1);
      const label = String(level.label || '').trim();
      if (!Number.isInteger(order) || order < 1) throw new Error('Hierarchy level order must be a positive integer');
      if (seenOrders.has(order)) throw new Error('Hierarchy level order must be unique');
      seenOrders.add(order);
      if (!label) throw new Error('Hierarchy level label is required');
      const rawPrefix = String(level.codePrefix || '').trim();
      return {
        order,
        label,
        description: String(level.description || '').trim() || null,
        isRequired: level.isRequired !== false,
        allowAssetAssignment: level.allowAssetAssignment === true,
        codePrefix: rawPrefix ? normalizeCodeSegment(rawPrefix) : null,
        isActive: level.isActive !== false,
      };
    }).sort((a, b) => a.order - b.order);

    const hydrated = await db.$transaction(async (tx) => {
      const created = await tx.hierarchySystem.create({
        data: {
          name,
          code,
          purpose,
          description: String(body.description || '').trim() || null,
          isPrimary: false,
          isActive,
          codeMode,
          codeSeparator,
          allowCodeOverride,
          createdById: session.userId,
          levels: { create: levels },
        },
      });

      const activeSystemCount = await tx.hierarchySystem.count({ where: { isActive: true } });
      const shouldBePrimary = requestedPrimary || (created.isActive && activeSystemCount === 1);

      if (shouldBePrimary) {
        await tx.hierarchySystem.updateMany({
          where: { isPrimary: true, id: { not: created.id } },
          data: { isPrimary: false },
        });
        await tx.hierarchySystem.update({
          where: { id: created.id },
          data: { isPrimary: true },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'create',
          entityType: 'hierarchy_system',
          entityId: created.id,
          newValues: JSON.stringify({
            name,
            code,
            purpose,
            codeMode,
            codeSeparator,
            allowCodeOverride,
            isPrimary: shouldBePrimary,
            isActive,
            levels,
          }),
        },
      });

      return tx.hierarchySystem.findUnique({
        where: { id: created.id },
        include: { levels: { orderBy: { order: 'asc' } }, _count: { select: { functionalLocations: true } } },
      });
    });

    return NextResponse.json({ success: true, data: hydrated }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create hierarchy system';
    const conflict = typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
    return NextResponse.json({ success: false, error: conflict ? 'Hierarchy code already exists' : message }, { status: conflict ? 409 : 400 });
  }
}
