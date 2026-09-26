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

    const component = await db.componentRegistry.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!component) {
      return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
    }

    const tools = await db.componentToolRequirement.findMany({
      where: { componentId: id },
      include: {
        tool: {
          select: { id: true, name: true, toolCode: true, status: true, condition: true, location: true },
        },
      },
      orderBy: { toolName: 'asc' },
    });

    return NextResponse.json({ success: true, data: tools });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load tool requirements';
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
    const { toolId, toolName, toolCode, quantityRequired, taskType, notes } = body;

    if (!toolName) {
      return NextResponse.json({ success: false, error: 'toolName is required' }, { status: 400 });
    }

    const component = await db.componentRegistry.findUnique({ where: { id } });
    if (!component) {
      return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
    }

    // Validate toolId if provided
    if (toolId) {
      const tool = await db.tool.findUnique({ where: { id: toolId } });
      if (!tool) {
        return NextResponse.json({ success: false, error: 'Tool not found' }, { status: 404 });
      }
    }

    const toolReq = await db.componentToolRequirement.create({
      data: {
        componentId: id,
        toolId,
        toolName,
        toolCode: toolCode || '',
        quantityRequired: quantityRequired ? parseInt(String(quantityRequired), 10) : 1,
        taskType: taskType || 'general',
        notes,
      },
      include: {
        tool: { select: { id: true, name: true, toolCode: true, status: true } },
      },
    });

    await createAuditLog(
      session.userId,
      'component_tool_requirement',
      'create',
      toolReq.id,
      { newValues: { componentId: id, toolName, toolCode } },
    );

    return NextResponse.json({ success: true, data: toolReq }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to add tool requirement';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
