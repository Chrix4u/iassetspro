import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantFilterWhere, getPlantScope } from '@/lib/plant-scope';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const plantId = searchParams.get('plantId');
    const includeChildren = searchParams.get('includeChildren') === 'true';

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const where: Record<string, unknown> = { ...getPlantFilterWhere(plantScope) };

    if (plantId) {
      // A query parameter may narrow the caller's allowed plant set, but it may
      // never widen or override an explicitly selected X-Plant-ID context.
      if (
        (plantScope.isScoped && plantScope.plantId !== plantId) ||
        !canAccessPlantStrict(plantScope, plantId)
      ) {
        return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
      }
      where.plantId = plantId;
    }

    const departments = await db.department.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        supervisor: { select: { id: true, fullName: true, username: true } },
        parent: { select: { id: true, name: true, code: true } },
        plant: { select: { id: true, name: true, code: true } },
        ...(includeChildren ? {
          children: {
            include: {
              supervisor: { select: { id: true, fullName: true, username: true } },
              parent: { select: { id: true, name: true, code: true } },
            },
          },
        } : { _count: { select: { children: true } } }),
      },
      orderBy: [{ plantId: 'asc' }, { name: 'asc' }],
    });

    return NextResponse.json({ success: true, data: departments });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load departments';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session || !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { name, code, plantId, parentId, supervisorId } = body;

    if (!name || !code || !plantId) {
      return NextResponse.json(
        { success: false, error: 'Name, code, and plantId are required' },
        { status: 400 }
      );
    }

    // Verify plant exists
    const plant = await db.plant.findUnique({ where: { id: plantId } });
    if (!plant) {
      return NextResponse.json(
        { success: false, error: 'Plant not found' },
        { status: 400 }
      );
    }

    // Verify parent department exists if provided
    if (parentId) {
      const parent = await db.department.findUnique({ where: { id: parentId } });
      if (!parent) {
        return NextResponse.json(
          { success: false, error: 'Parent department not found' },
          { status: 400 }
        );
      }
    }

    // Verify supervisor exists if provided
    if (supervisorId) {
      const supervisor = await db.user.findUnique({ where: { id: supervisorId } });
      if (!supervisor) {
        return NextResponse.json(
          { success: false, error: 'Supervisor user not found' },
          { status: 400 }
        );
      }
    }

    const department = await db.department.create({
      data: {
        name,
        code,
        plantId,
        parentId: parentId || null,
        supervisorId: supervisorId || null,
      },
      include: {
        supervisor: { select: { id: true, fullName: true, username: true } },
        parent: { select: { id: true, name: true, code: true } },
        plant: { select: { id: true, name: true, code: true } },
      },
    });

    return NextResponse.json({ success: true, data: department }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create department';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
