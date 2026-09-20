import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { canManageWorkOrder, canViewWorkOrder } from '@/services/workOrderAccess.service';

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
        materials: {
          where: { status: 'planned' },
          select: {
            id: true,
            itemId: true,
            itemName: true,
            quantity: true,
            unitCost: true,
            status: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        assignedTo: true,
        teamLeaderId: true,
        assignedSupervisorId: true,
        plannerId: true,
        teamMembers: { select: { userId: true } },
        maintenanceRequest: { select: { requestedBy: true } },
        repairMaterialRequests: {
          where: { source: 'planner_suggested' },
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
            items: {
              select: {
                toolId: true,
                toolName: true,
                toolCode: true,
                quantityRequested: true,
              },
            },
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

    const parseSuggestionArray = (value: string | null | undefined): Array<Record<string, unknown>> => {
      try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };

    let suggestedParts = parseSuggestionArray(wo.suggestedParts);
    let suggestedTools = parseSuggestionArray(wo.suggestedTools);

    // Backward compatibility for WOs converted before planner materials/tools
    // were persisted into suggestedParts/suggestedTools. WorkOrderMaterial and
    // planner-suggested tool requests are authoritative evidence that the
    // planner selected the resource during conversion.
    if (suggestedParts.length === 0 && wo.materials.length > 0) {
      const itemIds = wo.materials
        .map((material) => material.itemId)
        .filter((itemId): itemId is string => Boolean(itemId));
      const inventoryItems = itemIds.length > 0
        ? await db.inventoryItem.findMany({
            where: { id: { in: itemIds } },
            select: {
              id: true,
              itemCode: true,
              unitOfMeasure: true,
            },
          })
        : [];
      const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]));

      suggestedParts = wo.materials
        .filter((material) => Boolean(material.itemId))
        .map((material) => {
          const item = material.itemId ? inventoryById.get(material.itemId) : undefined;
          return {
            id: material.id,
            itemId: material.itemId,
            itemName: material.itemName || 'Planned material',
            itemCode: item?.itemCode || '',
            quantity: material.quantity ?? 1,
            unit: item?.unitOfMeasure || 'each',
            notes: '',
          };
        });
    }

    if (suggestedTools.length === 0 && wo.repairToolRequests.length > 0) {
      suggestedTools = wo.repairToolRequests.flatMap((request) => {
        if (request.items.length > 0) {
          return request.items.map((item) => ({
            id: `${request.id}:${item.toolId}`,
            toolId: item.toolId,
            toolName: item.toolName,
            toolCode: item.toolCode || '',
            quantity: item.quantityRequested || 1,
            notes: '',
          }));
        }
        return request.toolId
          ? [{
              id: request.id,
              toolId: request.toolId,
              toolName: request.toolName,
              toolCode: request.tool?.toolCode || '',
              quantity: 1,
              notes: '',
            }]
          : [];
      });
    }

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

// PUT /api/work-orders/[id]/suggested-items — Planner/supervisor management only
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(session, 'work_orders.update') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const plantAuth = await authorizeWorkOrderPlant(request, session, id);
    if (!plantAuth.ok) return plantAuth.response;

    const body = await request.json();
    const { action } = body;

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        plantId: true,
        suggestedParts: true,
        suggestedTools: true,
        isLocked: true,
        status: true,
        assignedSupervisorId: true,
        plannerId: true,
      },
    });

    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }
    if (!wo.plantId) {
      return NextResponse.json({ success: false, error: 'Operational work order must have a plant' }, { status: 400 });
    }
    if (!canManageWorkOrder(session, wo)) {
      return NextResponse.json({ success: false, error: 'Only the assigned supervisor/planner or maintenance management can change suggested resources' }, { status: 403 });
    }
    if (wo.isLocked || ['verified', 'closed', 'cancelled'].includes(wo.status)) {
      return NextResponse.json({ success: false, error: `Suggested resources cannot be changed while work order status is ${wo.status}` }, { status: 409 });
    }

    if (action === 'reject_item') {
      const { itemType, itemId } = body;
      if (!['part', 'tool'].includes(itemType) || typeof itemId !== 'string' || !itemId) {
        return NextResponse.json({ success: false, error: 'Valid itemType and itemId are required' }, { status: 400 });
      }

      await db.$transaction(async (tx) => {
        if (itemType === 'part') {
          const parts = JSON.parse(wo.suggestedParts || '[]') as Array<Record<string, unknown>>;
          await tx.workOrder.update({
            where: { id },
            data: { suggestedParts: JSON.stringify(parts.filter((p) => p.itemId !== itemId)) },
          });
          await tx.repairMaterialRequest.updateMany({
            where: { workOrderId: id, itemId, source: 'planner_suggested', status: 'pending' },
            data: { status: 'rejected', notes: `Rejected by ${session.fullName}` },
          });
        } else {
          const tools = JSON.parse(wo.suggestedTools || '[]') as Array<Record<string, unknown>>;
          await tx.workOrder.update({
            where: { id },
            data: { suggestedTools: JSON.stringify(tools.filter((t) => t.toolId !== itemId)) },
          });
          await tx.repairToolRequest.updateMany({
            where: { workOrderId: id, toolId: itemId, source: 'planner_suggested', status: 'pending' },
            data: { status: 'rejected', rejectionReason: `Rejected by ${session.fullName}` },
          });
        }
        await tx.auditLog.create({
          data: {
            userId: session.userId,
            action: 'reject_suggested_item',
            entityType: 'work_order',
            entityId: id,
            newValues: JSON.stringify({ itemType, itemId, action: 'rejected' }),
          },
        });
      });

      return NextResponse.json({ success: true, message: 'Item rejected' });
    }

    if (action === 'add_item') {
      const { itemType, item } = body;
      if (!['part', 'tool'].includes(itemType) || !item || typeof item !== 'object') {
        return NextResponse.json({ success: false, error: 'Valid itemType and item are required' }, { status: 400 });
      }

      if (itemType === 'part') {
        const itemId = typeof item.itemId === 'string' ? item.itemId : '';
        if (!itemId) return NextResponse.json({ success: false, error: 'item.itemId is required' }, { status: 400 });
        const inventoryItem = await db.inventoryItem.findUnique({
          where: { id: itemId },
          select: { id: true, name: true, itemCode: true, unitOfMeasure: true, unitCost: true, plantId: true },
        });
        if (!inventoryItem) return NextResponse.json({ success: false, error: 'Inventory item not found' }, { status: 400 });
        if (inventoryItem.plantId !== wo.plantId) {
          return NextResponse.json({ success: false, error: 'Inventory item belongs to a different plant' }, { status: 400 });
        }
        const quantity = Number(item.quantity ?? 1);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          return NextResponse.json({ success: false, error: 'Quantity must be greater than zero' }, { status: 400 });
        }
        const parts = JSON.parse(wo.suggestedParts || '[]') as Array<Record<string, unknown>>;
        const newPart = {
          id: crypto.randomUUID(), itemId: inventoryItem.id, itemName: inventoryItem.name,
          itemCode: inventoryItem.itemCode || '', quantity,
          unit: inventoryItem.unitOfMeasure || 'each', notes: typeof item.notes === 'string' ? item.notes : '',
        };
        parts.push(newPart);
        await db.$transaction(async (tx) => {
          await tx.workOrder.update({ where: { id }, data: { suggestedParts: JSON.stringify(parts) } });
          await tx.repairMaterialRequest.create({
            data: {
              workOrderId: id, itemId: inventoryItem.id, itemName: inventoryItem.name,
              quantityRequested: quantity, unit: inventoryItem.unitOfMeasure || 'each',
              unitCost: inventoryItem.unitCost ?? 0,
              estimatedCost: (inventoryItem.unitCost ?? 0) * quantity,
              reason: newPart.notes || `Added by ${session.fullName}`,
              plantId: wo.plantId, source: 'planner_suggested', status: 'pending', requestedById: session.userId,
            },
          });
          await tx.auditLog.create({
            data: { userId: session.userId, action: 'add_suggested_item', entityType: 'work_order', entityId: id, newValues: JSON.stringify({ itemType, itemId, quantity }) },
          });
        });
      } else {
        const toolId = typeof item.toolId === 'string' ? item.toolId : '';
        if (!toolId) return NextResponse.json({ success: false, error: 'item.toolId is required' }, { status: 400 });
        const tool = await db.tool.findUnique({
          where: { id: toolId },
          select: { id: true, name: true, toolCode: true, plantId: true },
        });
        if (!tool) return NextResponse.json({ success: false, error: 'Tool not found' }, { status: 400 });
        if (tool.plantId && tool.plantId !== wo.plantId) {
          return NextResponse.json({ success: false, error: 'Tool belongs to a different plant' }, { status: 400 });
        }
        const quantity = Number(item.quantity ?? 1);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          return NextResponse.json({ success: false, error: 'Quantity must be greater than zero' }, { status: 400 });
        }
        const tools = JSON.parse(wo.suggestedTools || '[]') as Array<Record<string, unknown>>;
        const newTool = {
          id: crypto.randomUUID(), toolId: tool.id, toolName: tool.name,
          toolCode: tool.toolCode || '', quantity, notes: typeof item.notes === 'string' ? item.notes : '',
        };
        tools.push(newTool);
        await db.$transaction(async (tx) => {
          await tx.workOrder.update({ where: { id }, data: { suggestedTools: JSON.stringify(tools) } });
          await tx.repairToolRequest.create({
            data: {
              workOrderId: id, toolId: tool.id, toolName: tool.name,
              reason: newTool.notes || `Added by ${session.fullName}`,
              plantId: wo.plantId, source: 'planner_suggested', status: 'pending', urgency: 'normal', requestedById: session.userId,
            },
          });
          await tx.auditLog.create({
            data: { userId: session.userId, action: 'add_suggested_item', entityType: 'work_order', entityId: id, newValues: JSON.stringify({ itemType, toolId, quantity }) },
          });
        });
      }
      return NextResponse.json({ success: true, message: 'Item added' });
    }

    if (action === 'update_quantity') {
      const { itemType, itemId } = body;
      const quantity = Number(body.quantity);
      if (!['part', 'tool'].includes(itemType) || typeof itemId !== 'string' || !itemId || !Number.isFinite(quantity) || quantity <= 0) {
        return NextResponse.json({ success: false, error: 'Valid itemType, itemId and positive quantity are required' }, { status: 400 });
      }

      await db.$transaction(async (tx) => {
        if (itemType === 'part') {
          const parts = JSON.parse(wo.suggestedParts || '[]') as Array<Record<string, unknown>>;
          await tx.workOrder.update({
            where: { id },
            data: { suggestedParts: JSON.stringify(parts.map((p) => p.itemId === itemId ? { ...p, quantity } : p)) },
          });
          await tx.repairMaterialRequest.updateMany({
            where: { workOrderId: id, itemId, source: 'planner_suggested', status: 'pending' },
            data: { quantityRequested: quantity },
          });
        } else {
          const tools = JSON.parse(wo.suggestedTools || '[]') as Array<Record<string, unknown>>;
          await tx.workOrder.update({
            where: { id },
            data: { suggestedTools: JSON.stringify(tools.map((t) => t.toolId === itemId ? { ...t, quantity } : t)) },
          });
        }
        await tx.auditLog.create({
          data: { userId: session.userId, action: 'update_suggested_item_qty', entityType: 'work_order', entityId: id, newValues: JSON.stringify({ itemType, itemId, quantity }) },
        });
      });

      return NextResponse.json({ success: true, message: 'Quantity updated' });
    }

    if (action === 'send_to_store') {
      const pendingMatReqs = await db.repairMaterialRequest.findMany({
        where: { workOrderId: id, source: 'planner_suggested', status: 'pending' },
      });
      const pendingToolReqs = await db.repairToolRequest.findMany({
        where: { workOrderId: id, source: 'planner_suggested', status: 'pending' },
      });

      const storekeepers = await db.user.findMany({
        where: {
          userRoles: { some: { role: { slug: { in: ['storekeeper', 'admin'] } } } },
          plantAccess: { some: { plantId: wo.plantId } },
        },
        select: { id: true, fullName: true },
      });

      const totalCount = pendingMatReqs.length + pendingToolReqs.length;
      if (totalCount === 0) {
        return NextResponse.json({ success: true, message: 'No pending items to send' });
      }

      await db.$transaction(async (tx) => {
        for (const sk of storekeepers) {
          await tx.notification.create({
            data: {
              userId: sk.id,
              type: 'material_request',
              title: 'Material/Tool Request Ready for Review',
              message: `${pendingMatReqs.length} material(s) and ${pendingToolReqs.length} tool(s) from WO need your review.`,
              actionUrl: 'maintenance?tab=repairs-material-requests',
              isRead: false,
            },
          });
        }
        await tx.auditLog.create({
          data: {
            userId: session.userId,
            action: 'send_suggested_to_store',
            entityType: 'work_order',
            entityId: id,
            newValues: JSON.stringify({ materialCount: pendingMatReqs.length, toolCount: pendingToolReqs.length, notifiedStorekeepers: storekeepers.length }),
          },
        });
      });

      return NextResponse.json({ success: true, message: `${totalCount} item(s) sent to store. ${storekeepers.length} storekeeper(s) notified.` });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update suggested items';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
