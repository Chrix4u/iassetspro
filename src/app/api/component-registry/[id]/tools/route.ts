import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { getComponentPlantAccess } from '@/lib/component-plant-access';

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

    const tools = await db.componentToolRequirement.findMany({
      where: { componentId: id },
      include: {
        tool: {
          select: {
            id: true,
            name: true,
            toolCode: true,
            status: true,
            condition: true,
            location: true,
            quantity: true,
            plantId: true,
          },
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
    let resolvedToolName = typeof toolName === 'string' ? toolName.trim() : '';
    let resolvedToolCode = typeof toolCode === 'string' ? toolCode.trim() : '';

    const component = await db.componentRegistry.findUnique({
      where: { id },
      include: { asset: { select: { plantId: true } } },
    });
    if (!component) {
      return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
    }

    if (toolId) {
      const tool = await db.tool.findUnique({
        where: { id: toolId },
        select: { id: true, name: true, toolCode: true, plantId: true, isActive: true },
      });
      if (!tool || !tool.isActive) {
        return NextResponse.json({ success: false, error: 'Tool not found' }, { status: 404 });
      }
      if (component.asset?.plantId && tool.plantId !== component.asset.plantId) {
        return NextResponse.json({ success: false, error: 'Tool belongs to a different plant' }, { status: 400 });
      }

      const duplicate = await db.componentToolRequirement.findFirst({
        where: { componentId: id, toolId },
        select: { id: true },
      });
      if (duplicate) {
        return NextResponse.json({ success: false, error: 'This tool is already required by the component' }, { status: 409 });
      }

      resolvedToolName = tool.name;
      resolvedToolCode = tool.toolCode;
    }

    if (!resolvedToolName) {
      return NextResponse.json({ success: false, error: 'toolName is required' }, { status: 400 });
    }

    const normalizedQuantity = Number.parseInt(String(quantityRequired ?? 1), 10);
    const toolReq = await db.componentToolRequirement.create({
      data: {
        componentId: id,
        toolId: toolId || null,
        toolName: resolvedToolName,
        toolCode: resolvedToolCode,
        quantityRequired: Number.isFinite(normalizedQuantity) && normalizedQuantity > 0 ? normalizedQuantity : 1,
        taskType: taskType || 'general',
        notes: notes || null,
      },
      include: {
        tool: {
          select: {
            id: true,
            name: true,
            toolCode: true,
            status: true,
            condition: true,
            location: true,
            quantity: true,
            plantId: true,
          },
        },
      },
    });

    await createAuditLog(
      session.userId,
      'component_tool_requirement',
      'create',
      toolReq.id,
      { newValues: { componentId: id, toolId: toolId || null, toolName: resolvedToolName, toolCode: resolvedToolCode } },
    );

    return NextResponse.json({ success: true, data: toolReq }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to add tool requirement';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
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

    const { id: componentId } = await params;
    const componentAccess = await getComponentPlantAccess(request, session, componentId);
    if (!componentAccess.exists) {
      return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
    }
    if (!componentAccess.allowed) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const toolRequirementId = new URL(request.url).searchParams.get('toolRequirementId');
    if (!toolRequirementId) {
      return NextResponse.json({ success: false, error: 'toolRequirementId is required' }, { status: 400 });
    }

    const link = await db.componentToolRequirement.findFirst({
      where: { id: toolRequirementId, componentId },
      select: { id: true, toolId: true, toolName: true, toolCode: true },
    });
    if (!link) {
      return NextResponse.json({ success: false, error: 'Component tool requirement not found' }, { status: 404 });
    }

    await db.componentToolRequirement.delete({ where: { id: toolRequirementId } });
    await createAuditLog(
      session.userId,
      'component_tool_requirement',
      'delete',
      toolRequirementId,
      { oldValues: { componentId, toolId: link.toolId, toolName: link.toolName, toolCode: link.toolCode } },
    );

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to remove tool requirement';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
