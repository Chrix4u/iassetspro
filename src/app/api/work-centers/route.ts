import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';

// Helper: generate work center code WC-NNNN
async function generateWCCode(): Promise<string> {
  const latest = await db.workCenter.findFirst({
    orderBy: { code: 'desc' },
    select: { code: true },
  });

  let nextNum = 1;
  if (latest) {
    const parts = latest.code.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) nextNum = lastNum + 1;
  }

  return `WC-${String(nextNum).padStart(4, '0')}`;
}

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    // Production scheduling/order screens need read-only work center choices.
    if (!isAdmin(session) && !hasPermission(session, 'work_centers.view') && !hasPermission(session, 'production.view')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const type = searchParams.get('type');
    const search = searchParams.get('search')?.trim().slice(0, 150);
    const requestedPage = Number(searchParams.get('page') || 1);
    const requestedLimit = Number(searchParams.get('limit') || 50);
    // A malformed or huge page/limit must not cause a DB error or an unbounded query.
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 1000) : 50;

    const where: Record<string, unknown> = { isActive: true };

    if (status) where.status = status;
    if (type) where.type = type;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { code: { contains: search } },
        { location: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const [workCenters, total] = await Promise.all([
      db.workCenter.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.workCenter.count({
        where,
      }),
    ]);

    // KPI counts
    const [totalCount, activeCount, idleCount, maintenanceCount] = await Promise.all([
      db.workCenter.count({ where: { isActive: true } }),
      db.workCenter.count({ where: { isActive: true, status: 'active' } }),
      db.workCenter.count({ where: { isActive: true, status: 'inactive' } }),
      db.workCenter.count({ where: { isActive: true, status: 'maintenance' } }),
    ]);

    return NextResponse.json({
      success: true,
      data: workCenters,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      kpis: {
        total: totalCount,
        active: activeCount,
        idle: idleCount,
        maintenance: maintenanceCount,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load work centers';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'work_centers.create') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const {
      name,
      description,
      type,
      status,
      location,
      capacity,
      capacityUnit,
    } = body;

    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ success: false, error: 'Work center name is required' }, { status: 400 });
    }
    if (name.trim().length > 200) {
      return NextResponse.json({ success: false, error: 'Work center name is too long' }, { status: 400 });
    }
    if (!['production', 'assembly', 'packaging', 'testing'].includes(type)) {
      return NextResponse.json({ success: false, error: 'Invalid work center type' }, { status: 400 });
    }
    if (status !== undefined && !['active', 'inactive', 'maintenance'].includes(status)) {
      return NextResponse.json({ success: false, error: 'Invalid work center status' }, { status: 400 });
    }

    const numericCapacity = capacity == null || capacity === '' ? null : Number(capacity);
    if (numericCapacity !== null && (!Number.isInteger(numericCapacity) || numericCapacity < 0)) {
      return NextResponse.json({ success: false, error: 'Capacity must be a nonnegative whole number' }, { status: 400 });
    }

    const code = await generateWCCode();

    const workCenter = await db.workCenter.create({
      data: {
        code,
        name: name.trim(),
        description: typeof description === 'string' ? description.trim() || null : null,
        type,
        status: status || 'active',
        location: typeof location === 'string' ? location.trim() || null : null,
        capacity: numericCapacity,
        capacityUnit: typeof capacityUnit === 'string' && capacityUnit.trim() ? capacityUnit.trim() : 'units/hour',
        createdById: session.userId,
      },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'create',
        entityType: 'work_center',
        entityId: workCenter.id,
        newValues: JSON.stringify({ code, name, type }),
      },
    });

    return NextResponse.json({ success: true, data: workCenter }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create work center';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
