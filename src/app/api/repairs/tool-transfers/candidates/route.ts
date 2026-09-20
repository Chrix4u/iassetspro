import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlant } from '@/lib/plant-scope';

// GET /api/repairs/tool-transfers/candidates?toolId=...
// Return only users who are valid recipients for this exact tool transfer.
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
        plantId: true,
        assignedToId: true,
        status: true,
      },
    });
    if (!tool) {
      return NextResponse.json({ success: false, error: 'Tool not found' }, { status: 404 });
    }
    if (!tool.plantId) {
      return NextResponse.json(
        { success: false, error: 'Tool must belong to a plant before it can be transferred' },
        { status: 400 },
      );
    }
    if (!tool.assignedToId) {
      return NextResponse.json(
        { success: false, error: 'Tool is not currently assigned to a custodian' },
        { status: 409 },
      );
    }

    // A technician may only discover recipients for a tool currently in their
    // custody. Admin can inspect candidates, but may not impersonate either
    // party during the physical handover/receipt workflow.
    if (!isAdmin(session) && tool.assignedToId !== session.userId) {
      return NextResponse.json(
        { success: false, error: 'Only the current tool custodian may select a transfer recipient' },
        { status: 403 },
      );
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlant(plantScope, tool.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
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
                { staffId: { contains: search } },
                { username: { contains: search } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        fullName: true,
        staffId: true,
        username: true,
        department: true,
        primaryTrade: true,
      },
      orderBy: { fullName: 'asc' },
      take: 50,
    });

    return NextResponse.json({
      success: true,
      data: candidates.map((candidate) => ({
        id: candidate.id,
        fullName: candidate.fullName,
        staffId: candidate.staffId,
        username: candidate.username,
        department: candidate.department,
        trade: candidate.primaryTrade,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load transfer recipients';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
