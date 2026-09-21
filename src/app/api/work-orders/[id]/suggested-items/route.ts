import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { canManageWorkOrder, canViewWorkOrder } from '@/services/workOrderAccess.service';
import { notifyUser } from '@/lib/notifications';

// GET /api/work-orders/[id]/suggested-items — Fetch suggested parts & tools
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const plantAuth = await authorizeWorkOrderPlant(request, session, id);
    if (!plantAuth.ok) return plantAuth.response;

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        suggestedParts: true,
        suggestedTools: true,
        plantId: true,
        assignedTo: true,
        teamLeaderId: true,
        assignedSupervisorId: true,
        plannerId: true,
        teamMembers: { select: { userId: true } },
        maintenanceRequest: { select: { requestedBy: true } },
        repairMaterialRequests: {
          where: { source: { in: ['planner_suggested', 'technician_from_planner_recommendation'] } },
          select: {
            id: true,
            itemName: true,
            quantityRequested: true,
            quantityApproved: true,
            quantityIssued: true,
            unit: true,
            status: true,
            itemId: true,
            item: { select: { itemCode: true, currentStock: true, unitCost: true } },
            source: true,
          },
        },
        repairToolRequests: {
          where: { source: 'planner_suggested' },
          select: {
            id: true,
            toolName: true,
            status: true,
            toolId: true,
            tool: { select: { toolCode: true, status: true } },
            items: { select: { toolId: true, quantityRequested: true } },
            source: true,
          },
        },
      },
    });

    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }
    if (!canViewWorkOrder(session, wo)) {
      return NextResponse.json({ success: false, error: 'Access denied — you are not part of this work order workflow' }, { status: 403 });
    }

    const storedSuggestedParts = JSON.parse(wo.suggestedParts || '[]') as Array<Record<string, unknown>>;
    const storedSuggestedTools = JSON.parse(wo.suggestedTools || '[]') as Array<Record<string, unknown>>;

    // Older MR→WO conversions created canonical planner requests without a JSON
    // suggestion snapshot (and, historically, materials were missing from the
    // canonical pipeline entirely). Derive a display snapshot from the
    // authoritative planner_suggested requests whenever the JSON projection is
    // absent so existing work orders remain visible after reconciliation.
    const suggestedParts = storedSuggestedParts.length > 0
      ? storedSuggestedParts
      : wo.repairMaterialRequests.map((mr) => ({
          id: mr.id,
          itemId: mr.itemId,
          itemName: mr.itemName,
          itemCode: mr.item?.itemCode || '',
          quantity: mr.quantityRequested,
          unit: mr.unit || 'each',
          notes: '',
        }));

    const suggestedTools = storedSuggestedTools.length > 0
      ? storedSuggestedTools
      : wo.repairToolRequests.map((tr) => ({
          id: tr.id,
          toolId: tr.toolId,
          toolName: tr.toolName,
          toolCode: tr.tool?.toolCode || '',
          quantity: tr.items.find((item) => item.toolId === tr.toolId)?.quantityRequested || 1,
          notes: '',
        }));

    const partsWithStatus = suggestedParts.map((p: Record<string, unknown>) => {
      const matReq = wo.repairMaterialRequests.find(
        (mr: { itemId: string | null }) => mr.itemId === p.itemId
      );
      return {
        ...p,
        pipelineId: matReq?.id || null,
        pipelineStatus: matReq?.status || 'suggested',
        quantityApproved: matReq?.quantityApproved || 0,
        quantityIssued: matReq?.quantityIssued || 0,
        currentStock: matReq?.item?.currentStock || 0,
        unitCost: matReq?.item?.unitCost || 0,
      };
    });

    const toolsWithStatus = suggestedTools.map((t: Record<string, unknown>) => {
      const toolReq = wo.repairToolRequests.find(
        (tr: { toolId: string | null }) => tr.toolId === t.toolId
      );
      return {
        ...t,
        pipelineId: toolReq?.id || null,
        pipelineStatus: toolReq?.status || 'suggested',
      };
    });

    return NextResponse.json({
      success: true,
      data: { suggestedParts: partsWithStatus, suggestedTools: toolsWithStatus },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch suggested items';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT /api/work-orders/[id]/suggested-items
// Planner recommendations are editable planning hints. Assigned execution staff
// decide what to use and explicitly submit the remaining recommendations into
// the normal supervisor/store approval pipeline.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const plantAuth = await authorizeWorkOrderPlant(request, session, id);
    if (!plantAuth.ok) return plantAuth.response;

    const body = await request.json();
    const action = typeof body.action === 'string' ? body.action : '';

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        woNumber: true,
        title: true,
        plantId: true,
        suggestedParts: true,
        suggestedTools: true,
        isLocked: true,
        status: true,
        assignedTo: true,
        teamLeaderId: true,
        assignedSupervisorId: true,
        plannerId: true,
        teamMembers: { select: { userId: true } },
      },
    });

    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }
    if (!wo.plantId) {
      return NextResponse.json({ success: false, error: 'Operational work order must have a plant' }, { status: 400 });
    }
    if (wo.isLocked || ['verified', 'closed', 'cancelled'].includes(wo.status)) {
      return NextResponse.json(
        { success: false, error: `Recommended resources cannot be changed while work order status is ${wo.status}` },
        { status: 409 },
      );
    }

    const isExecutionActor =
      wo.assignedTo === session.userId
      || wo.teamLeaderId === session.userId
      || wo.teamMembers.some((member) => member.userId === session.userId);
    const canManageRecommendations =
      (isAdmin(session) || hasPermission(session, 'work_orders.update'))
      && canManageWorkOrder(session, wo);
    const canAmendRecommendations = isExecutionActor || canManageRecommendations;

    const parseSuggestions = (value: string | null | undefined) => {
      try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed as Array<Record<string, unknown>> : [];
      } catch {
        return [] as Array<Record<string, unknown>>;
      }
    };

    const recommendationSources = ['planner_suggested', 'technician_from_planner_recommendation'];

    if (action === 'reject_item' || action === 'remove_recommendation') {
      if (!canAmendRecommendations) {
        return NextResponse.json(
          { success: false, error: 'Only assigned execution staff or accountable maintenance management can remove a recommendation' },
          { status: 403 },
        );
      }

      const { itemType, itemId } = body;
      if (!['part', 'tool'].includes(itemType) || typeof itemId !== 'string' || !itemId) {
        return NextResponse.json({ success: false, error: 'Valid itemType and itemId are required' }, { status: 400 });
      }

      const activeRequest = itemType === 'part'
        ? await db.repairMaterialRequest.findFirst({
            where: {
              workOrderId: id,
              itemId,
              source: { in: recommendationSources },
              status: { notIn: ['rejected', 'closed', 'fully_returned'] },
            },
            select: { id: true, status: true },
            orderBy: { createdAt: 'desc' },
          })
        : await db.repairToolRequest.findFirst({
            where: {
              workOrderId: id,
              toolId: itemId,
              source: { in: recommendationSources },
              status: { notIn: ['rejected', 'returned'] },
            },
            select: { id: true, status: true },
            orderBy: { createdAt: 'desc' },
          });

      if (activeRequest && activeRequest.status !== 'pending') {
        return NextResponse.json(
          { success: false, error: `This recommendation is already in the ${activeRequest.status.replace(/_/g, ' ')} approval/issue stage and can no longer be removed here` },
          { status: 409 },
        );
      }

      const parts = parseSuggestions(wo.suggestedParts);
      const tools = parseSuggestions(wo.suggestedTools);
      const removed = itemType === 'part'
        ? parts.find((part) => part.itemId === itemId)
        : tools.find((tool) => tool.toolId === itemId);

      await db.$transaction(async (tx) => {
        if (itemType === 'part') {
          await tx.workOrder.update({
            where: { id },
            data: { suggestedParts: JSON.stringify(parts.filter((part) => part.itemId !== itemId)) },
          });
          await tx.repairMaterialRequest.updateMany({
            where: {
              workOrderId: id,
              itemId,
              source: { in: recommendationSources },
              status: 'pending',
            },
            data: {
              status: 'rejected',
              notes: `Recommendation withdrawn by ${session.fullName}`,
            },
          });
          await tx.workOrderMaterial.deleteMany({
            where: { workOrderId: id, itemId, status: 'planned' },
          });
        } else {
          await tx.workOrder.update({
            where: { id },
            data: { suggestedTools: JSON.stringify(tools.filter((tool) => tool.toolId !== itemId)) },
          });
          await tx.repairToolRequest.updateMany({
            where: {
              workOrderId: id,
              toolId: itemId,
              source: { in: recommendationSources },
              status: 'pending',
            },
            data: {
              status: 'rejected',
              rejectionReason: `Recommendation withdrawn by ${session.fullName}`,
            },
          });
        }

        await tx.auditLog.create({
          data: {
            userId: session.userId,
            action: 'decline_planner_resource_recommendation',
            entityType: 'work_order',
            entityId: id,
            oldValues: JSON.stringify(removed || { itemType, itemId }),
            newValues: JSON.stringify({
              itemType,
              itemId,
              decision: 'removed',
              priorRequestId: activeRequest?.id || null,
            }),
          },
        });
      });

      return NextResponse.json({ success: true, message: 'Recommendation removed from this work order' });
    }

    if (action === 'update_quantity') {
      if (!canAmendRecommendations) {
        return NextResponse.json(
          { success: false, error: 'Only assigned execution staff or accountable maintenance management can amend recommended quantities' },
          { status: 403 },
        );
      }

      const { itemType, itemId } = body;
      const quantity = Number(body.quantity);
      if (!['part', 'tool'].includes(itemType) || typeof itemId !== 'string' || !itemId || !Number.isFinite(quantity) || quantity <= 0) {
        return NextResponse.json({ success: false, error: 'Valid itemType, itemId and positive quantity are required' }, { status: 400 });
      }

      const parts = parseSuggestions(wo.suggestedParts);
      const tools = parseSuggestions(wo.suggestedTools);

      await db.$transaction(async (tx) => {
        if (itemType === 'part') {
          await tx.workOrder.update({
            where: { id },
            data: {
              suggestedParts: JSON.stringify(parts.map((part) =>
                part.itemId === itemId ? { ...part, quantity, amendedById: session.userId, amendedAt: new Date().toISOString() } : part
              )),
            },
          });
          const plannedMaterials = await tx.workOrderMaterial.findMany({
            where: { workOrderId: id, itemId, status: 'planned' },
            select: { id: true, unitCost: true },
          });
          for (const material of plannedMaterials) {
            const unitCost = material.unitCost ?? 0;
            await tx.workOrderMaterial.update({
              where: { id: material.id },
              data: { quantity, totalCost: unitCost * quantity },
            });
          }

          const pendingRequests = await tx.repairMaterialRequest.findMany({
            where: {
              workOrderId: id,
              itemId,
              source: { in: recommendationSources },
              status: 'pending',
            },
            select: { id: true, unitCost: true },
          });
          for (const pendingRequest of pendingRequests) {
            const unitCost = pendingRequest.unitCost ?? 0;
            await tx.repairMaterialRequest.update({
              where: { id: pendingRequest.id },
              data: { quantityRequested: quantity, estimatedCost: unitCost * quantity },
            });
          }
        } else {
          await tx.workOrder.update({
            where: { id },
            data: {
              suggestedTools: JSON.stringify(tools.map((tool) =>
                tool.toolId === itemId ? { ...tool, quantity, amendedById: session.userId, amendedAt: new Date().toISOString() } : tool
              )),
            },
          });
          const pendingToolRequests = await tx.repairToolRequest.findMany({
            where: {
              workOrderId: id,
              toolId: itemId,
              source: { in: recommendationSources },
              status: 'pending',
            },
            select: { id: true },
          });
          if (pendingToolRequests.length > 0) {
            await tx.repairToolRequestItem.updateMany({
              where: {
                repairToolRequestId: { in: pendingToolRequests.map((row) => row.id) },
                toolId: itemId,
              },
              data: { quantityRequested: Math.max(1, Math.round(quantity)) },
            });
          }
        }

        await tx.auditLog.create({
          data: {
            userId: session.userId,
            action: 'amend_planner_resource_recommendation',
            entityType: 'work_order',
            entityId: id,
            newValues: JSON.stringify({ itemType, itemId, quantity }),
          },
        });
      });

      return NextResponse.json({ success: true, message: 'Recommended quantity updated' });
    }

    if (action === 'add_item') {
      if (!canAmendRecommendations) {
        return NextResponse.json(
          { success: false, error: 'Only assigned execution staff or accountable maintenance management can add a recommendation' },
          { status: 403 },
        );
      }

      const { itemType, item } = body;
      if (!['part', 'tool'].includes(itemType) || !item || typeof item !== 'object') {
        return NextResponse.json({ success: false, error: 'Valid itemType and item are required' }, { status: 400 });
      }

      if (itemType === 'part') {
        const itemId = typeof item.itemId === 'string' ? item.itemId : '';
        const quantity = Number(item.quantity ?? 1);
        if (!itemId || !Number.isFinite(quantity) || quantity <= 0) {
          return NextResponse.json({ success: false, error: 'A valid inventory item and quantity are required' }, { status: 400 });
        }
        const inventoryItem = await db.inventoryItem.findUnique({
          where: { id: itemId },
          select: { id: true, name: true, itemCode: true, unitOfMeasure: true, unitCost: true, plantId: true },
        });
        if (!inventoryItem || inventoryItem.plantId !== wo.plantId) {
          return NextResponse.json({ success: false, error: 'Inventory item is unavailable for this plant' }, { status: 400 });
        }

        const parts = parseSuggestions(wo.suggestedParts).filter((part) => part.itemId !== itemId);
        const recommendation = {
          id: crypto.randomUUID(),
          itemId: inventoryItem.id,
          itemName: inventoryItem.name,
          itemCode: inventoryItem.itemCode || '',
          quantity,
          unit: inventoryItem.unitOfMeasure || 'each',
          notes: typeof item.notes === 'string' ? item.notes : '',
          recommendedById: session.userId,
          recommendedAt: new Date().toISOString(),
          origin: isExecutionActor ? 'technician_added' : 'planning_added',
        };

        await db.$transaction(async (tx) => {
          await tx.workOrder.update({
            where: { id },
            data: { suggestedParts: JSON.stringify([...parts, recommendation]) },
          });
          await tx.workOrderMaterial.deleteMany({
            where: { workOrderId: id, itemId, status: 'planned' },
          });
          const unitCost = inventoryItem.unitCost ?? 0;
          await tx.workOrderMaterial.create({
            data: {
              workOrderId: id,
              itemId: inventoryItem.id,
              itemName: inventoryItem.name,
              quantity,
              unitCost,
              totalCost: unitCost * quantity,
              status: 'planned',
              requestedBy: session.userId,
            },
          });
          await tx.auditLog.create({
            data: {
              userId: session.userId,
              action: 'add_resource_recommendation',
              entityType: 'work_order',
              entityId: id,
              newValues: JSON.stringify({ itemType, recommendation }),
            },
          });
        });
      } else {
        const toolId = typeof item.toolId === 'string' ? item.toolId : '';
        const quantity = Number(item.quantity ?? 1);
        if (!toolId || !Number.isFinite(quantity) || quantity <= 0) {
          return NextResponse.json({ success: false, error: 'A valid tool and quantity are required' }, { status: 400 });
        }
        const tool = await db.tool.findUnique({
          where: { id: toolId },
          select: { id: true, name: true, toolCode: true, plantId: true },
        });
        if (!tool || (tool.plantId && tool.plantId !== wo.plantId)) {
          return NextResponse.json({ success: false, error: 'Tool is unavailable for this plant' }, { status: 400 });
        }

        const tools = parseSuggestions(wo.suggestedTools).filter((entry) => entry.toolId !== toolId);
        const recommendation = {
          id: crypto.randomUUID(),
          toolId: tool.id,
          toolName: tool.name,
          toolCode: tool.toolCode || '',
          quantity,
          notes: typeof item.notes === 'string' ? item.notes : '',
          recommendedById: session.userId,
          recommendedAt: new Date().toISOString(),
          origin: isExecutionActor ? 'technician_added' : 'planning_added',
        };
        await db.$transaction(async (tx) => {
          await tx.workOrder.update({
            where: { id },
            data: { suggestedTools: JSON.stringify([...tools, recommendation]) },
          });
          await tx.auditLog.create({
            data: {
              userId: session.userId,
              action: 'add_resource_recommendation',
              entityType: 'work_order',
              entityId: id,
              newValues: JSON.stringify({ itemType, recommendation }),
            },
          });
        });
      }

      return NextResponse.json({ success: true, message: 'Resource added to the recommendation set' });
    }

    if (action === 'submit_recommendations' || action === 'send_to_store') {
      // Execution requests must be attributable to the actual worker. Managers
      // may plan/amend recommendations, but they cannot submit requests under a
      // technician's identity.
      if (!isExecutionActor) {
        return NextResponse.json(
          { success: false, error: 'Only assigned execution staff can submit recommended resources for approval' },
          { status: 403 },
        );
      }

      const parts = parseSuggestions(wo.suggestedParts);
      const tools = parseSuggestions(wo.suggestedTools);
      if (parts.length > 0 && !hasPermission(session, 'repair_material_requests.create')) {
        return NextResponse.json({ success: false, error: 'Insufficient permission to request recommended materials' }, { status: 403 });
      }
      if (tools.length > 0 && !hasPermission(session, 'repair_tool_requests.create')) {
        return NextResponse.json({ success: false, error: 'Insufficient permission to request recommended tools' }, { status: 403 });
      }

      const existingMaterialRequests = await db.repairMaterialRequest.findMany({
        where: {
          workOrderId: id,
          source: { in: recommendationSources },
          status: { not: 'rejected' },
        },
        select: { itemId: true },
      });
      const existingToolRequests = await db.repairToolRequest.findMany({
        where: {
          workOrderId: id,
          source: { in: recommendationSources },
          status: { not: 'rejected' },
        },
        select: { toolId: true },
      });
      const requestedPartIds = new Set(existingMaterialRequests.map((row) => row.itemId).filter(Boolean));
      const requestedToolIds = new Set(existingToolRequests.map((row) => row.toolId).filter(Boolean));

      const partsToRequest = parts.filter((part) => typeof part.itemId === 'string' && !requestedPartIds.has(part.itemId as string));
      const toolsToRequest = tools.filter((tool) => typeof tool.toolId === 'string' && !requestedToolIds.has(tool.toolId as string));

      if (partsToRequest.length === 0 && toolsToRequest.length === 0) {
        return NextResponse.json({ success: true, data: { materialCount: 0, toolCount: 0 }, message: 'All recommendations have already been submitted' });
      }

      const created = await db.$transaction(async (tx) => {
        let materialCount = 0;
        let toolCount = 0;

        for (const part of partsToRequest) {
          const itemId = part.itemId as string;
          const quantity = Number(part.quantity ?? 1);
          const item = await tx.inventoryItem.findUnique({
            where: { id: itemId },
            select: { id: true, name: true, unitOfMeasure: true, unitCost: true, plantId: true },
          });
          if (!item || item.plantId !== wo.plantId || !Number.isFinite(quantity) || quantity <= 0) continue;

          const unitCost = item.unitCost ?? 0;
          await tx.repairMaterialRequest.create({
            data: {
              workOrderId: id,
              itemId: item.id,
              itemName: item.name,
              quantityRequested: quantity,
              quantityApproved: 0,
              quantityIssued: 0,
              quantityReturned: 0,
              unit: item.unitOfMeasure || 'each',
              unitCost,
              estimatedCost: unitCost * quantity,
              urgency: 'normal',
              reason: 'Technician accepted planner recommendation',
              notes: typeof part.notes === 'string' ? part.notes : null,
              plantId: wo.plantId,
              source: 'technician_from_planner_recommendation',
              status: 'pending',
              requestedById: session.userId,
            },
          });
          await tx.workOrderMaterial.updateMany({
            where: { workOrderId: id, itemId: item.id, status: 'planned' },
            data: { status: 'requested', requestedBy: session.userId, quantity },
          });
          materialCount += 1;
        }

        for (const recommendation of toolsToRequest) {
          const toolId = recommendation.toolId as string;
          const quantity = Number(recommendation.quantity ?? 1);
          const tool = await tx.tool.findUnique({
            where: { id: toolId },
            select: {
              id: true,
              name: true,
              toolCode: true,
              category: true,
              purchaseCost: true,
              plantId: true,
            },
          });
          if (!tool || (tool.plantId && tool.plantId !== wo.plantId) || !Number.isFinite(quantity) || quantity <= 0) continue;

          const toolRequest = await tx.repairToolRequest.create({
            data: {
              workOrderId: id,
              toolId: tool.id,
              toolName: tool.name,
              reason: 'Technician accepted planner recommendation',
              notes: typeof recommendation.notes === 'string' ? recommendation.notes : null,
              plantId: wo.plantId,
              source: 'technician_from_planner_recommendation',
              status: 'pending',
              urgency: 'normal',
              requestedById: session.userId,
            },
          });
          await tx.repairToolRequestItem.create({
            data: {
              repairToolRequestId: toolRequest.id,
              toolId: tool.id,
              toolName: tool.name,
              toolCode: tool.toolCode,
              category: tool.category,
              quantityRequested: Math.max(1, Math.round(quantity)),
              quantityIssued: 0,
              unitCost: tool.purchaseCost ?? undefined,
            },
          });
          toolCount += 1;
        }

        await tx.auditLog.create({
          data: {
            userId: session.userId,
            action: 'submit_planner_resource_recommendations',
            entityType: 'work_order',
            entityId: id,
            newValues: JSON.stringify({
              materialCount,
              toolCount,
              requestedById: session.userId,
            }),
          },
        });

        return { materialCount, toolCount };
      });

      const totalCount = created.materialCount + created.toolCount;
      if (totalCount > 0 && wo.assignedSupervisorId && wo.assignedSupervisorId !== session.userId) {
        await notifyUser(
          wo.assignedSupervisorId,
          'repair_resource_request',
          'Recommended Resources Submitted',
          `${session.fullName} submitted ${totalCount} planner-recommended resource(s) for WO ${wo.woNumber}`,
          'work_order',
          id,
          `wo-detail?id=${id}`,
        ).catch(() => {});
      }
      if (totalCount > 0 && wo.plannerId && wo.plannerId !== session.userId && wo.plannerId !== wo.assignedSupervisorId) {
        await notifyUser(
          wo.plannerId,
          'repair_resource_request',
          'Planner Recommendations Reviewed',
          `${session.fullName} submitted ${totalCount} recommended resource(s) for WO ${wo.woNumber}`,
          'work_order',
          id,
          `wo-detail?id=${id}`,
        ).catch(() => {});
      }

      return NextResponse.json({
        success: true,
        data: created,
        message: `${totalCount} recommended resource(s) submitted for approval`,
      });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update suggested items';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
