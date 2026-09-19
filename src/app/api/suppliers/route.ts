import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, hasAnyPermission, isAdmin } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!isAdmin(session) && !hasAnyPermission(session, ['vendors.view', 'vendors.create', 'vendors.update', 'vendors.manage', 'purchase_orders.create'])) {
      return NextResponse.json({ success: false, error: 'Insufficient supplier permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (status === 'active') where.isActive = true;
    if (status === 'inactive') where.isActive = false;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { code: { contains: search } },
        { contactPerson: { contains: search } },
        { email: { contains: search } },
      ];
    }

    const [suppliers, total, activeCount, onHoldCount] = await Promise.all([
      db.supplier.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        include: {
          createdBy: { select: { id: true, fullName: true } },
          _count: { select: { purchaseOrders: true, items: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.supplier.count(),
      db.supplier.count({ where: { isActive: true } }),
      db.supplier.count({ where: { isActive: false } }),
    ]);

    return NextResponse.json({
      success: true,
      data: suppliers,
      kpis: { total, active: activeCount, inactive: onHoldCount },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load suppliers';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'vendors.create') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { name, code, contactPerson, email, phone, address, city, country, website, rating } = body;

    if (!name || !code) {
      return NextResponse.json({ success: false, error: 'Name and code are required' }, { status: 400 });
    }

    const supplier = await db.supplier.create({
      data: {
        name,
        code,
        contactPerson: contactPerson || null,
        email: email || null,
        phone: phone || null,
        address: address || null,
        city: city || null,
        country: country || null,
        website: website || null,
        rating: rating ? parseInt(String(rating), 10) : null,
        createdById: session.userId,
      },
      include: { createdBy: { select: { id: true, fullName: true } } },
    });

    await db.auditLog.create({
      data: { userId: session.userId, action: 'create', entityType: 'supplier', entityId: supplier.id, newValues: JSON.stringify({ code, name }) },
    });

    return NextResponse.json({ success: true, data: supplier }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create supplier';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
