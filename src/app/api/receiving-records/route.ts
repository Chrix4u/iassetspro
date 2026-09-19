import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission, isAdmin } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!isAdmin(session) && !hasAnyPermission(session, ['purchase_orders.view', 'purchase_orders.receive', 'purchase_orders.manage'])) {
      return NextResponse.json({ success: false, error: 'Insufficient receiving permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const condition = searchParams.get('condition');

    const where: Record<string, unknown> = {};
    if (condition && condition !== 'all') where.condition = condition;
    if (search) {
      where.OR = [
        { po: { poNumber: { contains: search } } },
        { po: { supplier: { name: { contains: search } } } },
        { item: { name: { contains: search } } },
        { item: { itemCode: { contains: search } } },
      ];
    }

    const [records, total, goodCount, pendingCount, rejectedCount] = await Promise.all([
      db.receivingRecord.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        include: {
          po: { select: { id: true, poNumber: true, supplier: { select: { id: true, name: true } } } },
          item: { select: { id: true, name: true, itemCode: true } },
          receivedBy: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.receivingRecord.count(),
      db.receivingRecord.count({ where: { condition: 'good' } }),
      db.receivingRecord.count({ where: { condition: 'damaged' } }),
      db.receivingRecord.count({ where: { condition: 'defective' } }),
    ]);

    return NextResponse.json({
      success: true,
      data: records,
      kpis: { total, good: goodCount, pending: pendingCount, rejected: rejectedCount },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load receiving records';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
