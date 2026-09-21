import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlant } from '@/lib/plant-scope';

// GET /api/repairs/tool-transfers/candidates?toolId=...&search=...
// Returns only the current custodian plus eligible same-plant technician recipients.
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'repair_tool_transfers.create') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const toolId = searchParams.get('toolId')?.trim();
    const search = searchParams.get('search')?.trim() || '';

    if (!toolId) {
      return NextResponse.json({ success: false, error: 'toolId is required' }, { status: 400 });
    }

    const tool = await db.tool.findUnique({
      where: { id: toolId },
      select: {
        id: true,
        toolCode: true,
        name: true,
        isActive: true,
        status: true,
        plantId: true,
        assignedToId: true,
        assignedTo: {
          select: { id: true, fullName: true, username: true, staffId: true },
        },
      },
    });

    if (!tool || !tool.isActive) {
      return NextResponse.json({ success: false, error: 'Tool not found' }, { status: 404 });
    }
    if (!tool.plantId) {
      return NextResponse.json({ success: false, error: 'Tool must belong to a plant before transfer' }, { status: 400 });
    }
    if (!tool.assignedToId) {
      return NextResponse.json({ success: false, error: 'Tool is not currently assigned to a custodian' }, { status: 409 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlant(plantScope, tool.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    if (!isAdmin(session) && tool.assignedToId !== session.userId) {
      return NextResponse.json(
        { success: false, error: 'Only the current tool custodian may choose a transfer recipient' },
        { status: 403 },
      );
    }

    const candidates = await db.user.findMany({
      where: {
        id: { not: tool.assignedToId },
        status: 'active',
        plantAccess: { some: { plantId: tool.plantId } },
        userRoles: {
          some: {
            role: { slug: 'maintenance_technician' },
          },
        },
        ...(search
          ? {
              OR: [
                { fullName: { contains: search } },
                { username: { contains: search } },
                { staffId: { contains: search } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        fullName: true,
        username: true,
        staffId: true,
        department: true,
        primaryTrade: true,
      },
      orderBy: { fullName: 'asc' },
      take: 50,
    });

    return NextResponse.json({
      success: true,
      data: {
        tool: { id: tool.id, toolCode: tool.toolCode, name: tool.name },
        currentHolder: tool.assignedTo,
        candidates,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load transfer candidates';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
