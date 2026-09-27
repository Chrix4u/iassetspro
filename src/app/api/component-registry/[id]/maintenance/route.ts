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
    const { searchParams } = new URL(request.url);
    const maintenanceType = searchParams.get('maintenanceType');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const component = await db.componentRegistry.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!component) {
      return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
    }

    const where: Record<string, unknown> = { componentId: id };

    if (maintenanceType) {
      where.maintenanceType = maintenanceType;
    }
    if (startDate) {
      where.completedAt = { ...(where.completedAt as Record<string, unknown> || {}), gte: new Date(startDate) };
    }
    if (endDate) {
      where.completedAt = { ...(where.completedAt as Record<string, unknown> || {}), lte: new Date(endDate) };
    }

    const history = await db.componentMaintenanceHistory.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { completedAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: history });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load maintenance history';
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
    const {
      maintenanceType,
      description,
      findings,
      actionsTaken,
      partsUsed,
      cost,
      performedById,
      startedAt,
      completedAt,
      durationMinutes,
      nextDueDate,
    } = body;

    if (!maintenanceType) {
      return NextResponse.json({ success: false, error: 'maintenanceType is required' }, { status: 400 });
    }

    const component = await db.componentRegistry.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!component) {
      return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
    }

    // Validate performedById if provided
    if (performedById) {
      const user = await db.user.findUnique({ where: { id: performedById }, select: { id: true } });
      if (!user) {
        return NextResponse.json({ success: false, error: 'Performer user not found' }, { status: 404 });
      }
    }

    const record = await db.componentMaintenanceHistory.create({
      data: {
        componentId: id,
        maintenanceType,
        description: description || null,
        findings: findings || null,
        actionsTaken: actionsTaken || null,
        partsUsed: partsUsed ? JSON.stringify(partsUsed) : null,
        cost: cost !== undefined ? parseFloat(String(cost)) : null,
        performedById: performedById || null,
        startedAt: startedAt ? new Date(startedAt) : null,
        completedAt: completedAt ? new Date(completedAt) : new Date(),
        durationMinutes: durationMinutes !== undefined ? parseInt(String(durationMinutes), 10) : null,
        nextDueDate: nextDueDate ? new Date(nextDueDate) : null,
      },
    });

    await createAuditLog(
      session.userId,
      'component_maintenance_history',
      'create',
      record.id,
      {
        newValues: { componentId: id, maintenanceType, description },
      },
    );

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to record maintenance activity';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
