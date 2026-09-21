import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasPermission } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { canManageWorkOrder, canViewWorkOrder } from '@/services/workOrderAccess.service';
import { getUnavailableOperationalModules } from '@/lib/module-access.server';

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

    if (!canViewWorkOrder(session, wo)) {
      return NextResponse.json(
        { success: false, error: 'Access denied — you are not part of this work order workflow' },
        { status: 403 },
      );
    }

    // Embedded cross-module data follows the same licensing contract as its
    // standalone workspace. Keep the WO visible, but redact unavailable domains.
    const unavailableModules = new Set(await getUnavailableOperationalModules([
      'repairs',
      'inventory',
      'tools',
      'pm_schedules',
      'assets',
      'maintenance_requests',
    ]));
    const repairsOperational = !unavailableModules.has('repairs');
    const inventoryResourcesOperational =
      repairsOperational && !unavailableModules.has('inventory');
    const toolResourcesOperational =
      repairsOperational && !unavailableModules.has('tools');

    if (!inventoryResourcesOperational) {
      (wo as Record<string, unknown>).materials = [];
      (wo as Record<string, unknown>).repairMaterialRequests = [];
    }
    if (!toolResourcesOperational) {
      (wo as Record<string, unknown>).repairToolRequests = [];
    }
    if (unavailableModules.has('pm_schedules')) {
      (wo as Record<string, unknown>).pmSchedule = null;
    }
    if (unavailableModules.has('assets')) {
      (wo as Record<string, unknown>).workOrderComponents = [];
      if (wo.maintenanceRequest) {
        (wo.maintenanceRequest as Record<string, unknown>).asset = null;
      }
    }
    if (unavailableModules.has('maintenance_requests')) {
      (wo as Record<string, unknown>).maintenanceRequest = null;
    }

    if (!wo.repairToolRequests) {
      (wo as Record<string, unknown>).repairToolRequests = [];
    }
    if (!wo.repairMaterialRequests) {
      (wo as Record<string, unknown>).repairMaterialRequests = [];
    }

    // A planner-selected material can exist durably in more than one
    // representation. The WO details response must never make it disappear
    // merely because the canonical RepairMaterialRequest projection is missing
    // on an older/partial conversion.
    const actualMaterialRequests = Array.isArray(wo.repairMaterialRequests)
      ? [...wo.repairMaterialRequests]
      : [];
    const representedItemIds = new Set(
      actualMaterialRequests
        .map((request) => request.itemId)
        .filter((itemId): itemId is string => Boolean(itemId)),
    );
    const projectedMaterialRequests: Array<Record<string, unknown>> = [];

    // 1) Recover planned WorkOrderMaterial rows.
    for (const material of wo.materials || []) {
      if (!material.itemId || representedItemIds.has(material.itemId) || material.status !== 'planned') continue;

      representedItemIds.add(material.itemId);
      projectedMaterialRequests.push({
        id: `planned:${material.id}`,
        workOrderId: wo.id,
        itemId: material.itemId,
        itemName: material.itemName || 'Planned material',
        quantityRequested: material.quantity || 1,
        quantityApproved: 0,
        quantityIssued: 0,
        quantityReturned: 0,
        unit: 'each',
        unitCost: material.unitCost || 0,
        estimatedCost: material.totalCost || 0,
        urgency: 'normal',
        reason: 'Planner-selected material',
        notes: 'Planned during maintenance-request conversion',
        plantId: wo.plantId,
        source: 'planner_suggested',
        status: 'planned',
        requestedById: material.requestedBy || null,
        requestedBy: material.requester || wo.planner || null,
        supervisorApprovedBy: null,
        storekeeperApprovedBy: null,
        issuedByUser: null,
        item: null,
        projectionOnly: true,
        createdAt: material.createdAt,
      });
    }

    // 2) Recover the JSON suggestion snapshot if neither canonical request nor
    // planned material row represented the item.
    try {
      const storedSuggestedParts = JSON.parse(wo.suggestedParts || '[]') as Array<Record<string, unknown>>;
      for (const suggestion of Array.isArray(storedSuggestedParts) ? storedSuggestedParts : []) {
        const itemId = typeof suggestion.itemId === 'string' ? suggestion.itemId : '';
        if (!itemId || representedItemIds.has(itemId)) continue;

        representedItemIds.add(itemId);
        const quantity = Number(suggestion.quantity ?? 1);
        const unitCost = Number(suggestion.unitCost ?? 0);
        projectedMaterialRequests.push({
          id: `planned:snapshot:${itemId}`,
          workOrderId: wo.id,
          itemId,
          itemName: typeof suggestion.itemName === 'string' ? suggestion.itemName : 'Planned material',
          quantityRequested: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
          quantityApproved: 0,
          quantityIssued: 0,
          quantityReturned: 0,
          unit: typeof suggestion.unit === 'string' && suggestion.unit ? suggestion.unit : 'each',
          unitCost: Number.isFinite(unitCost) ? unitCost : 0,
          estimatedCost: Number.isFinite(quantity) && Number.isFinite(unitCost) ? quantity * unitCost : 0,
          urgency: 'normal',
          reason: 'Planner-selected material',
          notes: typeof suggestion.notes === 'string' ? suggestion.notes : '',
          plantId: wo.plantId,
          source: 'planner_suggested',
          status: 'planned',
          requestedById: null,
          requestedBy: wo.planner || null,
          supervisorApprovedBy: null,
          storekeeperApprovedBy: null,
          issuedByUser: null,
          item: null,
          projectionOnly: true,
          createdAt: wo.createdAt,
        });
      }
    } catch {
      // Invalid legacy JSON must never hide canonical/planned material rows.
    }

    (wo as Record<string, unknown>).repairMaterialRequests = [
      ...actualMaterialRequests,
      ...projectedMaterialRequests,
    ];

    // Planner-selected tools need the same durability guarantee as materials.
    // Older/partial conversions may retain suggestedTools while the canonical
    // RepairToolRequest row is missing. Project those snapshot rows into the
    // WO detail response so every WO view can still render the planner choice.
    if (toolResourcesOperational) {
      const actualToolRequests = Array.isArray(wo.repairToolRequests)
        ? [...wo.repairToolRequests]
        : [];
      const representedToolIds = new Set<string>();

      for (const request of actualToolRequests) {
        if (request.toolId) representedToolIds.add(request.toolId);
        for (const item of Array.isArray(request.items) ? request.items : []) {
          if (item.toolId) representedToolIds.add(item.toolId);
        }
      }

      const projectedToolRequests: Array<Record<string, unknown>> = [];
      try {
        const storedSuggestedTools = JSON.parse(wo.suggestedTools || '[]') as Array<Record<string, unknown>>;
        for (const suggestion of Array.isArray(storedSuggestedTools) ? storedSuggestedTools : []) {
          const toolId = typeof suggestion.toolId === 'string' ? suggestion.toolId : '';
          if (!toolId || representedToolIds.has(toolId)) continue;

          representedToolIds.add(toolId);
          const toolName = typeof suggestion.toolName === 'string' && suggestion.toolName
            ? suggestion.toolName
            : 'Planned tool';
          const toolCode = typeof suggestion.toolCode === 'string' ? suggestion.toolCode : '';
          const quantityValue = Number(suggestion.quantity ?? 1);
          const quantity = Number.isFinite(quantityValue) && quantityValue > 0
            ? Math.max(1, Math.floor(quantityValue))
            : 1;
          const requestId = `planned:tool:snapshot:${toolId}`;

          projectedToolRequests.push({
            id: requestId,
            requestNumber: null,
            workOrderId: wo.id,
            toolId,
            toolName,
            reason: 'Planner-selected tool',
            notes: typeof suggestion.notes === 'string' ? suggestion.notes : '',
            plantId: wo.plantId,
            source: 'planner_suggested',
            status: 'planned',
            urgency: 'normal',
            requestedById: null,
            requestedBy: wo.planner || null,
            supervisorApprovedBy: null,
            storekeeperApprovedBy: null,
            issuedByUser: null,
            tool: {
              id: toolId,
              name: toolName,
              toolCode,
              category: null,
            },
            items: [{
              id: `${requestId}:item`,
              repairToolRequestId: requestId,
              toolId,
              toolName,
              toolCode,
              category: null,
              quantityRequested: quantity,
              quantityApproved: null,
              quantityIssued: 0,
              quantityReturned: 0,
              quantityTransferred: 0,
              unitCost: null,
              availabilityStatus: null,
              issueNotes: null,
              conditionAtIssue: null,
              conditionAtReturn: null,
              pendingReturnQty: null,
              pendingReturnCondition: null,
              pendingReturnNotes: null,
              tool: {
                id: toolId,
                name: toolName,
                toolCode,
                category: null,
              },
              projectionOnly: true,
            }],
            projectionOnly: true,
            createdAt: wo.createdAt,
            updatedAt: wo.updatedAt,
          });
        }
      } catch {
        // Invalid legacy JSON must never hide canonical tool-request rows.
      }

      (wo as Record<string, unknown>).repairToolRequests = [
        ...actualToolRequests,
        ...projectedToolRequests,
      ];
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

    if (!canManageWorkOrder(session, existing)) {
      return NextResponse.json(
        { success: false, error: 'Access denied — generic work-order edits are limited to the assigned supervisor/planner or maintenance management' },
        { status: 403 },
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

    const assignmentOwnedFields = [
      'assignedTo', 'teamLeaderId', 'assignedSupervisorId', 'assignmentType', 'teamMembers',
    ];
    for (const field of assignmentOwnedFields) {
      if (body[field] !== undefined) {
        return NextResponse.json(
          { success: false, error: `Field '${field}' is assignment-owned. Use /api/work-orders/${id}/assign so authorization, roster replacement and concurrency controls are enforced.` },
          { status: 400 },
        );
      }
    }

    if (body.departmentId !== undefined) {
      return NextResponse.json(
        { success: false, error: `Field 'departmentId' is planning-owned. Use /api/work-orders/${id}/plan so plant/department validation is enforced.` },
        { status: 400 },
      );
    }

    const updateData: Record<string, unknown> = {};
    const immutableCostFields = [
      'totalCost', 'laborCost', 'partsCost', 'contractorCost',
      'laborRateApplied', 'laborCurrency', 'plantId',
    ];

    const allowedFields = [
      'title', 'description', 'type', 'priority',
      'assetId', 'assetName',
      'estimatedHours', 'plannedStart', 'plannedEnd',
      'failureDescription', 'causeDescription', 'actionDescription',
      'tradeActivity', 'technicalDescription', 'safetyNotes', 'ppeRequired',
      'notes',
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

    type PlannedPart = {
      id: string;
      itemId: string;
      itemName: string;
      itemCode: string;
      quantity: number;
      unit: string;
      unitCost: number;
      notes: string;
      recommendedById?: string;
      recommendedAt?: string;
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
          recommendedById: session.userId,
          recommendedAt: new Date().toISOString(),
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
      recommendedById?: string;
      recommendedAt?: string;
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
          recommendedById: session.userId,
          recommendedAt: new Date().toISOString(),
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

    if (resolvedParts) {
      await db.$transaction(async (tx) => {
        // Planner edits update recommendations only. Existing technician/store
        // pipeline requests are never created, replaced, or deleted here.
        // Retire only legacy #51 auto-generated planner/pending rows for items
        // the planner explicitly removed so they cannot reconstruct themselves
        // as recommendations on the next details fetch.
        const desiredPartIds = resolvedParts.map((part) => part.itemId);
        await tx.repairMaterialRequest.updateMany({
          where: {
            workOrderId: id,
            source: 'planner_suggested',
            status: 'pending',
            ...(desiredPartIds.length > 0 ? { itemId: { notIn: desiredPartIds } } : {}),
          },
          data: {
            status: 'rejected',
            notes: 'Removed from planner recommendations before technician submission',
          },
        });

        await tx.workOrderMaterial.deleteMany({
          where: { workOrderId: id, status: 'planned' },
        });
        for (const part of resolvedParts) {
          await tx.workOrderMaterial.create({
            data: {
              workOrderId: id,
              itemId: part.itemId,
              itemName: part.itemName,
              quantity: part.quantity,
              unitCost: part.unitCost,
              totalCost: part.unitCost * part.quantity,
              status: 'planned',
              requestedBy: session.userId,
            },
          });
        }
        await tx.workOrder.update({
          where: { id },
          data: { suggestedParts: JSON.stringify(resolvedParts) },
        });
      });
    }

    if (resolvedTools) {
      const desiredToolIds = resolvedTools.map((tool) => tool.toolId);
      await db.$transaction(async (tx) => {
        await tx.repairToolRequest.updateMany({
          where: {
            workOrderId: id,
            source: 'planner_suggested',
            status: 'pending',
            ...(desiredToolIds.length > 0 ? { toolId: { notIn: desiredToolIds } } : {}),
          },
          data: {
            status: 'rejected',
            rejectionReason: 'Removed from planner recommendations before technician submission',
          },
        });
        await tx.workOrder.update({
          where: { id },
          data: { suggestedTools: JSON.stringify(resolvedTools) },
        });
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
