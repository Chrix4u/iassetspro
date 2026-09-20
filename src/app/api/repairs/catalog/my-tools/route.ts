import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, getPlantFilterWhere } from '@/lib/plant-scope';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'repair_tool_transfers.create') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim();
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });

    const tools = await db.tool.findMany({
      where: {
        isActive: true,
        assignedToId: session.userId,
        ...getPlantFilterWhere(plantScope),
        ...(search ? {
          OR: [
            { name: { contains: search } },
            { toolCode: { contains: search } },
            { serialNumber: { contains: search } },
          ],
        } : {}),
      },
      select: {
        id: true,
        toolCode: true,
        name: true,
        category: true,
        condition: true,
        status: true,
        serialNumber: true,
      },
      orderBy: { name: 'asc' },
      take: 100,
    });

    return NextResponse.json({ success: true, data: tools });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load tools in your custody';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
