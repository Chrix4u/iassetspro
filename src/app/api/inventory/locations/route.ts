import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, hasAnyPermission, isAdmin } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!isAdmin(session) && !hasAnyPermission(session, ['inventory_locations.view', 'inventory_locations.create', 'inventory_locations.update'])) {
      return NextResponse.json({ success: false, error: 'Insufficient inventory location permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const type = searchParams.get('type');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (status === 'active') where.isActive = true;
    if (status === 'inactive') where.isActive = false;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { code: { contains: search } },
        { address: { contains: search } },
      ];
    }

    const [locations, total, activeCount] = await Promise.all([
      db.inventoryLocation.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        include: {
          createdBy: { select: { id: true, fullName: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.inventoryLocation.count(),
      db.inventoryLocation.count({ where: { isActive: true } }),
    ]);

    return NextResponse.json({
      success: true,
      data: locations,
      kpis: { total, active: activeCount, inactive: total - activeCount },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load locations';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'inventory_locations.create') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { name, code, type, address } = body;

    if (!name || !code) {
      return NextResponse.json({ success: false, error: 'Name and code are required' }, { status: 400 });
    }

    const location = await db.inventoryLocation.create({
      data: {
        name,
        code,
        type: type || 'warehouse',
        address: address || null,
        createdById: session.userId,
      },
      include: { createdBy: { select: { id: true, fullName: true } } },
    });

    await db.auditLog.create({
      data: { userId: session.userId, action: 'create', entityType: 'inventory_location', entityId: location.id, newValues: JSON.stringify({ code, name }) },
    });

    return NextResponse.json({ success: true, data: location }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create location';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
