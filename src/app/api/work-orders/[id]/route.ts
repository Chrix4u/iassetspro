import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasPermission } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const { id } = await params;

    const baseInclude = {
      assignee: { select: { id: true, fullName: true, username: true, department: true } },
      teamLeader: { select: { id: true, fullName: true, username: true } },
      assignedSupervisor: { select: { id: true, fullName: true, username: true } },
      assigner: { select: { id: true, fullName: true, username: true } },
      planner: { select: { id: true, fullName: true, username: true } },
      locker: { select: { id: true, fullName: true, username: true } },
      maintenanceRequest: {
        select: {
          id: true,
          requestNumber: true,
          title: true,
          description: true,
          category: true,
          machineDownStatus: true,
          location: true,
          createdAt: true,
          requester: { select: { id: true, fullName: true, username: true } },
          asset: { select: { id: true, name: true, assetTag: true, serialNumber: true } },
        },
      },
      pmSchedule: { select: { id: true, title: true, frequencyType: true, frequencyValue: true } },
      teamMembers: {
        include: { user: { select: { id: true, fullName: true, username: true } } },
        orderBy: { assignedAt: 'asc' as const },
      },
      timeLogs: {
        include: {
          user: { select: { id: true, fullName: true, username: true } },
          loggedBy: { select: { id: true, fullName: true } },
        },
        orderBy: { timestamp: 'desc' as const },
      },
      materials: {
        include: {
          requester: { select: { id: true, fullName: true } },
          approver: { select: { id: true, fullName: true } },
          issuer: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' as const },
      },
      comments: {
        include: { user: { select: { id: true, fullName: true, username: true } } },
        orderBy: { createdAt: 'desc' as const },
      },
      repairToolRequests: {
        include: {
          tool: { select: { id: true, name: true, toolCode: true, category: true } },
          requestedBy: { select: { id: true, fullName: true } },
          supervisorApprovedBy: { select: { id: true, fullName: true } },
          storekeeperApprovedBy: { select: { id: true, fullName: true } },
          issuedByUser: { select: { id: true, fullName: true } },
          items: {
            include: { tool: { select: { id: true, name: true, toolCode: true, category: true } } },
          },
        },
        orderBy: { createdAt: 'desc' as const },
      },
      repairMaterialRequests: {
        include: {
          item: { select: { id: true, name: true, itemCode: true, category: true } },
          requestedBy: { select: { id: true, fullName: true } },
          supervisorApprovedBy: { select: { id: true, fullName: true } },
          storekeeperApprovedBy: { select: { id: true, fullName: true } },
          issuedByUser: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' as const },
      },
      workOrderComponents: {
        include: {
          componentRegistry: {
            select: { id: true, name: true, componentCode: true, componentType: true, criticality: true, healthScore: true, lifecycleStatus: true },
          },
        },
        orderBy: { createdAt: 'asc' as const },
      },
    } as const;

    const woWithRequests = await db.workOrder.findUnique({
      where: { id },
      include: {
        ...baseInclude,
        teamMemberRequests: {
          include: {
            requestedByUser: { select: { id: true, fullName: true, username: true } },
            requestedUser: { select: { id: true, fullName: true, username: true } },
            reviewedByUser: { select: { id: true, fullName: true, username: true } },
          },
          orderBy: { createdAt: 'desc' as const },
        },
      },
    }).catch(() => null);

    const fallbackWo = woWithRequests
      ? null
      : await db.workOrder.findUnique({
          where: { id },
          include: baseInclude,
        });

    const wo = woWithRequests ?? (fallbackWo ? { ...fallbackWo, teamMemberRequests: [] } : null);

    if (!wo) {
      return NextResponse.json(
        { success: false, error: 'Work order not found' },
        { status: 404 }
      );
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, wo.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const hasViewAll = hasPermission(session, 'work_orders.view') || hasPermission(session, 'work_orders.view_all') || isAdmin(session);
    if (!hasViewAll) {
      const isAssignee = wo.assignedTo === session.userId;
      const isTeamMember = wo.teamMembers?.some((m: { userId: string }) => m.userId === session.userId);
      const isRequester = wo.maintenanceRequest?.requester?.id === session.userId;
      if (!isAssignee && !isTeamMember && !isRequester) {
        return NextResponse.json({ success: false, error: 'Access denied — you can only view work orders assigned to you' }, { status: 403 });
      }
    }

    if (!wo.repairToolRequests) {
      (wo as Record<string, unknown>).repairToolRequests = [];
    }
    if (!wo.repairMaterialRequests) {
      (wo as Record<string, unknown>).repairMaterialRequests = [];
    }
    if (!wo.workOrderComponents) {
      (wo as Record<string, unknown>).workOrderComponents = [];
    }

    return NextResponse.json({ success: true, data: wo });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load work order';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'work_orders.update') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions to update work orders' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const plantAuth = await authorizeWorkOrderPlant(request, session, id);
    if (!plantAuth.ok) return plantAuth.response;

    const existing = await db.workOrder.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Work order not found' },
        { status: 404 }
      );
    }

    if (existing.isLocked) {
      return NextResponse.json(
        { success: false, error: 'Work order is permanently locked. No modifications are allowed after planner closure.' },
        { status: 400 }
      );
    }

    if (existing.status === 'verified' || existing.status === 'closed') {
      return NextResponse.json(
        { success: false, error: 'Work order has been reviewed and cannot be edited. Status: ' + existing.status + '. Contact supervisor or planner if changes are needed.' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    const immutableCostFields = [
      'totalCost', 'laborCost', 'partsCost', 'contractorCost',
      'laborRateApplied', 'laborCurrency', 'plantId',
    ];

    const allowedFields = [
      'title', 'description', 'type', 'priority',
      'assetId', 'assetName', 'departmentId',
      'estimatedHours', 'plannedStart', 'plannedEnd',
      'failureDescription', 'causeDescription', 'actionDescription',
      'tradeActivity', 'technicalDescription', 'safetyNotes', 'ppeRequired',
      'notes', 'assignedTo', 'teamLeaderId',
      'assignmentType', 'assignedSupervisorId',
    ];

    for (const field of immutableCostFields) {
      if (body[field] !== undefined) {
        return NextResponse.json(
          { success: false, error: `Field '${field}' is not client-editable` },
          { status: 400 },
        );
      }
    }

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'plannedStart' || field === 'plannedEnd') {
          updateData[field] = body[field] ? new Date(body[field]) : null;
        } else {
          updateData[field] = body[field];
        }
      }
    }

    if (body.deliveryDateRequired !== undefined) {
      updateData['plannedEnd'] = body.deliveryDateRequired ? new Date(body.deliveryDateRequired) : null;
    }

    if (body.assetId !== undefined && body.assetId !== existing.assetId) {
      if (body.assetId !== null) {
        const asset = await db.asset.findUnique({
          where: { id: body.assetId },
          select: { id: true, plantId: true },
        });
        if (!asset) {
          return NextResponse.json({ success: false, error: `Asset ${body.assetId} not found` }, { status: 400 });
        }
        if (!existing.plantId || asset.plantId !== existing.plantId) {
          return NextResponse.json(
            { success: false, error: 'Cannot assign an asset from a different plant' },
            { status: 400 },
          );
        }
      }
    }

    const assignmentFields = ['assignedTo', 'teamLeaderId', 'assignedSupervisorId'] as const;
    const usersToValidate = new Set<string>();
    for (const field of assignmentFields) {
      if (body[field] !== undefined && body[field] !== null && body[field] !== existing[field]) {
        usersToValidate.add(body[field] as string);
      }
    }
    if (body.teamMembers && Array.isArray(body.teamMembers)) {
      for (const m of body.teamMembers) {
        if (m.userId) usersToValidate.add(m.userId);
      }
    }
    if (usersToValidate.size > 0) {
      if (!existing.plantId) {
        return NextResponse.json({ success: false, error: 'Operational work order must have a plant before assigning users' }, { status: 400 });
      }
      const plantAccess = await db.userPlant.findMany({
        where: {
          userId: { in: Array.from(usersToValidate) },
          plantId: existing.plantId,
        },
        select: { userId: true },
      });
      const usersWithAccess = new Set(plantAccess.map(p => p.userId));
      for (const userId of usersToValidate) {
        if (!usersWithAccess.has(userId)) {
          return NextResponse.json(
            { success: false, error: `User ${userId} does not have access to plant ${existing.plantId} — cannot be assigned` },
            { status: 400 },
          );
        }
      }
    }

    type PlannedPart = {
      id: string;
      itemId: string;
      itemName: string;
      itemCode: string;
      quantity: number;
      unit: string;
      unitCost: number;
      notes: string;
    };
    const resolvedParts: PlannedPart[] | null = Array.isArray(body.requiredParts) ? [] : null;
    if (resolvedParts) {
      if (!existing.plantId) {
        return NextResponse.json({ success: false, error: 'Operational work order must have a plant before planning materials' }, { status: 400 });
      }
      for (const rawPart of body.requiredParts) {
        const itemId = typeof rawPart === 'string' ? rawPart : rawPart?.itemId;
        if (!itemId || typeof itemId !== 'string') {
          return NextResponse.json({ success: false, error: 'Each required part must reference a valid inventory itemId' }, { status: 400 });
        }
        const invItem = await db.inventoryItem.findUnique({
          where: { id: itemId },
          select: { id: true, name: true, itemCode: true, unitOfMeasure: true, unitCost: true, plantId: true },
        });
        if (!invItem) {
          return NextResponse.json({ success: false, error: `Inventory item ${itemId} not found` }, { status: 400 });
        }
        if (invItem.plantId !== existing.plantId) {
          return NextResponse.json({ success: false, error: `Inventory item ${itemId} belongs to a different plant` }, { status: 400 });
        }
        const requestedQuantity = typeof rawPart === 'object' ? Number(rawPart.quantity ?? 1) : 1;
        if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
          return NextResponse.json({ success: false, error: `Invalid quantity for inventory item ${itemId}` }, { status: 400 });
        }
        resolvedParts.push({
          id: crypto.randomUUID(),
          itemId: invItem.id,
          itemName: invItem.name,
          itemCode: invItem.itemCode || '',
          quantity: requestedQuantity,
          unit: invItem.unitOfMeasure || 'each',
          unitCost: invItem.unitCost ?? 0,
          notes: typeof rawPart === 'object' && typeof rawPart.notes === 'string' ? rawPart.notes : '',
        });
      }
    }

    type PlannedTool = {
      id: string;
      toolId: string;
      toolName: string;
      toolCode: string;
      quantity: number;
      notes: string;
    };
    const resolvedTools: PlannedTool[] | null = Array.isArray(body.requiredTools) ? [] : null;
    if (resolvedTools) {
      if (!existing.plantId) {
        return NextResponse.json({ success: false, error: 'Operational work order must have a plant before planning tools' }, { status: 400 });
      }
      for (const rawTool of body.requiredTools) {
        const toolId = typeof rawTool === 'string' ? rawTool : rawTool?.toolId;
        if (!toolId || typeof toolId !== 'string') {
          return NextResponse.json({ success: false, error: 'Each required tool must reference a valid toolId' }, { status: 400 });
        }
        const toolRec = await db.tool.findUnique({
          where: { id: toolId },
          select: { id: true, name: true, toolCode: true, plantId: true },
        });
        if (!toolRec) {
          return NextResponse.json({ success: false, error: `Tool ${toolId} not found` }, { status: 400 });
        }
        if (toolRec.plantId && toolRec.plantId !== existing.plantId) {
          return NextResponse.json({ success: false, error: `Tool ${toolId} belongs to a different plant` }, { status: 400 });
        }
        const requestedQuantity = typeof rawTool === 'object' ? Number(rawTool.quantity ?? 1) : 1;
        if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
          return NextResponse.json({ success: false, error: `Invalid quantity for tool ${toolId}` }, { status: 400 });
        }
        resolvedTools.push({
          id: crypto.randomUUID(),
          toolId: toolRec.id,
          toolName: toolRec.name,
          toolCode: toolRec.toolCode || '',
          quantity: requestedQuantity,
          notes: typeof rawTool === 'object' && typeof rawTool.notes === 'string' ? rawTool.notes : '',
        });
      }
    }

    const updated = await db.workOrder.update({
      where: { id },
      data: updateData,
      include: {
        assignee: { select: { id: true, fullName: true } },
        teamLeader: { select: { id: true, fullName: true } },
        assignedSupervisor: { select: { id: true, fullName: true } },
        assigner: { select: { id: true, fullName: true } },
        planner: { select: { id: true, fullName: true } },
        maintenanceRequest: { select: { id: true, requestNumber: true, title: true } },
        teamMembers: {
          include: { user: { select: { id: true, fullName: true } } },
          orderBy: { assignedAt: 'asc' },
        },
        materials: {
          include: {
            requester: { select: { id: true, fullName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        teamMemberRequests: {
          include: {
            requestedByUser: { select: { id: true, fullName: true, username: true } },
            requestedUser: { select: { id: true, fullName: true, username: true } },
            reviewedByUser: { select: { id: true, fullName: true, username: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (body.teamMembers && Array.isArray(body.teamMembers)) {
      const now = new Date();
      const teamMemberData = body.teamMembers.map((member: { userId: string; role: string }) => ({
        workOrderId: id,
        userId: member.userId,
        role: member.role,
        accessLevel: member.role === 'team_leader' ? 'full' : 'execution',
        assignedAt: now,
      }));

      await db.$transaction([
        db.workOrderTeamMember.deleteMany({ where: { workOrderId: id } }),
        ...(teamMemberData.length > 0
          ? [db.workOrderTeamMember.createMany({ data: teamMemberData })]
          : []),
      ]);

      updated.teamMembers = await db.workOrderTeamMember.findMany({
        where: { workOrderId: id },
        include: { user: { select: { id: true, fullName: true } } },
        orderBy: { assignedAt: 'asc' },
      });
    }

    if (resolvedParts) {
      await db.$transaction(async (tx) => {
        await tx.repairMaterialRequest.deleteMany({
          where: { workOrderId: id, source: 'planner_suggested', status: 'pending' },
        });
        for (const part of resolvedParts) {
          await tx.repairMaterialRequest.create({
            data: {
              workOrderId: id,
              itemId: part.itemId,
              itemName: part.itemName,
              quantityRequested: part.quantity,
              unit: part.unit,
              unitCost: part.unitCost,
              estimatedCost: part.unitCost * part.quantity,
              reason: 'Planner suggested material (updated)',
              plantId: existing.plantId,
              source: 'planner_suggested',
              status: 'pending',
              requestedById: session.userId,
            },
          });
        }
        await tx.workOrder.update({ where: { id }, data: { suggestedParts: JSON.stringify(resolvedParts) } });
      });
    }

    if (resolvedTools) {
      await db.$transaction(async (tx) => {
        await tx.repairToolRequest.deleteMany({
          where: { workOrderId: id, source: 'planner_suggested', status: 'pending' },
        });
        for (const tool of resolvedTools) {
          await tx.repairToolRequest.create({
            data: {
              workOrderId: id,
              toolId: tool.toolId,
              toolName: tool.toolName,
              reason: 'Planner suggested tool (updated)',
              plantId: existing.plantId,
              source: 'planner_suggested',
              status: 'pending',
              urgency: 'normal',
              requestedById: session.userId,
            },
          });
        }
        await tx.workOrder.update({ where: { id }, data: { suggestedTools: JSON.stringify(resolvedTools) } });
      });
    }

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'update',
        entityType: 'work_order',
        entityId: id,
        oldValues: JSON.stringify({ title: existing.title, priority: existing.priority }),
        newValues: JSON.stringify(updateData),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update work order';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
