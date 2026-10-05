import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission, isAdmin } from '@/lib/auth';
import { getPlantFilterWhere, getPlantScope } from '@/lib/plant-scope';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasAnyPermission(session, ['inventory.view_all', 'inventory.manage', 'inventory.update', 'inventory.stock_in', 'inventory.export']) && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    const itemPlantWhere = getPlantFilterWhere(plantScope);

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const condition = searchParams.get('condition');

    const where: Record<string, unknown> = Object.keys(itemPlantWhere).length > 0 ? { item: itemPlantWhere } : {};
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
      db.receivingRecord.count({ where: Object.keys(itemPlantWhere).length > 0 ? { item: itemPlantWhere } : undefined }),
      db.receivingRecord.count({ where: { ...(Object.keys(itemPlantWhere).length > 0 ? { item: itemPlantWhere } : {}), condition: 'good' } }),
      db.receivingRecord.count({ where: { ...(Object.keys(itemPlantWhere).length > 0 ? { item: itemPlantWhere } : {}), condition: 'damaged' } }),
      db.receivingRecord.count({ where: { ...(Object.keys(itemPlantWhere).length > 0 ? { item: itemPlantWhere } : {}), condition: 'defective' } }),
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
