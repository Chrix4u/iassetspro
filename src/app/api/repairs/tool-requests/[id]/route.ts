import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getRequestSession, isAdmin, hasRole } from '@/lib/auth';
import { RESOURCE_STORE_ROLE_SLUGS, canReviewResourceRequestAsSupervisor, isResourceStoreActor } from '@/lib/resource-request-approval';
import { notifyUser } from '@/lib/notifications';
import { getPlantScope, canAccessPlant } from '@/lib/plant-scope';
import { authorizeToolRequestPlant } from '@/lib/plant-auth-helpers';
import { atomicIssueTools, atomicConfirmToolReturn, submitToolReturn, ToolOperationConflictError } from '@/services/toolOperations.service';


// GET /api/repairs/tool-requests/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequestSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const toolReq = await db.repairToolRequest.findUnique({
      where: { id },
      include: {
        requestedBy: { select: { id: true, fullName: true, username: true } },
        supervisorApprovedBy: { select: { id: true, fullName: true } },
        storekeeperApprovedBy: { select: { id: true, fullName: true } },
        issuedByUser: { select: { id: true, fullName: true } },
        returnedByUser: { select: { id: true, fullName: true } },
        workOrder: { select: { id: true, woNumber: true, title: true, status: true, assignedSupervisorId: true, plannerId: true, assignedSupervisor: { select: { id: true, fullName: true } } } },
        tool: { select: { id: true, toolCode: true, name: true, status: true, category: true, location: true, condition: true, quantity: true } },
        items: {
          include: {
            tool: { select: { id: true, toolCode: true, name: true, status: true, category: true, condition: true, quantity: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!toolReq) return NextResponse.json({ success: false, error: 'Tool request not found' }, { status: 404 });

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlant(plantScope, toolReq.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const overdueThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const isOverdue = toolReq.status === 'pending' && toolReq.createdAt < overdueThreshold;

    const result: any = { ...toolReq, isOverdue };
    if (toolReq.items.length === 0 && toolReq.toolId) {
      result._virtualItem = {
        toolId: toolReq.toolId,
        toolName: toolReq.toolName,
        quantityRequested: 1,
        quantityApproved: undefined,
        quantityIssued: toolReq.status === 'issued' ? 1 : 0,
        quantityReturned: toolReq.status === 'returned' ? 1 : 0,
        tool: toolReq.tool,
      };
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load tool request';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/repairs/tool-requests/[id] — workflow actions
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequestSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const plantAuth = await authorizeToolRequestPlant(request, session, id);
    if (!plantAuth.ok) return plantAuth.response;

    const body = await request.json();
    const { action, notes, toolConditionAtReturn, issuedItems, returnedItems } = body;

    const toolReq = await db.repairToolRequest.findUnique({
      where: { id },
      include: {
        workOrder: { select: { id: true, woNumber: true, title: true, assignedSupervisorId: true, plannerId: true } },
        requestedBy: { select: { id: true, fullName: true } },
        tool: true,
        items: { include: { tool: true } },
      },
    });
    if (!toolReq) return NextResponse.json({ success: false, error: 'Tool request not found' }, { status: 404 });

    const isStoreActor = isResourceStoreActor(session, 'repair_tool_requests.update');

    if (action === 'supervisor_approve' || action === 'supervisor_reject') {
      if (!canReviewResourceRequestAsSupervisor(session, toolReq.workOrder.assignedSupervisorId, 'repair_tool_requests.update')) {
        return NextResponse.json({
          success: false,
          error: 'Only the assigned work-order supervisor may review this tool request. Maintenance manager, plant manager, or admin may override for escalation.',
        }, { status: 403 });
      }
    }
    if (action === 'storekeeper_approve' || action === 'storekeeper_reject') {
      if (!isStoreActor) {
        return NextResponse.json({ success: false, error: 'Only admin, store keeper, inventory manager, or tools shop attendant can store-approve tool requests' }, { status: 403 });
      }
    }
    if (action === 'issue') {
      if (!isStoreActor) {
        return NextResponse.json({ success: false, error: "Only admin, store keeper, inventory manager, or tools shop attendant can perform 'issue' on tool requests" }, { status: 403 });
      }
    }
    if (action === 'return') {
      if (!isAdmin(session) && toolReq.requestedById !== session.userId) {
        return NextResponse.json({
          success: false,
          error: 'Only the technician/custodian who received this tool request may submit its return',
        }, { status: 403 });
      }
    }

    const now = new Date();
    let updated: any;
    const warnings: string[] = [];

    switch (action) {
      case 'supervisor_approve': {
        if (toolReq.status !== 'pending') return NextResponse.json({ success: false, error: `Cannot approve: status is ${toolReq.status}` }, { status: 400 });
        if (toolReq.items.length > 0) {
          for (const item of toolReq.items) {
            let approveQty = item.quantityRequested;
            if (item.toolId && item.tool) approveQty = Math.min(item.quantityRequested, item.tool.quantity);
            await db.repairToolRequestItem.update({ where: { id: item.id }, data: { quantityApproved: approveQty } });
            if (item.toolId && item.tool && item.tool.quantity < item.quantityRequested) warnings.push(`"${item.toolName}": only ${item.tool.quantity} of ${item.quantityRequested} requested can be approved (limited stock)`);
          }
        } else if (toolReq.toolId && toolReq.tool) {
          if (toolReq.tool.status !== 'available') return NextResponse.json({ success: false, error: `Tool "${toolReq.tool.name}" is not available (status: ${toolReq.tool.status}). Cannot approve.` }, { status: 400 });
          await db.repairToolRequest.update({ where: { id }, data: { toolConditionAtIssue: toolReq.tool.condition } });
        }
        const claim = await db.repairToolRequest.updateMany({ where: { id, status: 'pending' }, data: { status: 'supervisor_approved', supervisorApprovedById: session.userId, supervisorApprovedAt: now } });
        if (claim.count !== 1) throw new ToolOperationConflictError('Supervisor approval was claimed concurrently');
        updated = await db.repairToolRequest.findUnique({ where: { id } });
        const storeKeepers = toolReq.plantId
          ? await db.user.findMany({
              where: {
                status: 'active',
                plantAccess: { some: { plantId: toolReq.plantId } },
                userRoles: {
                  some: {
                    role: { slug: { in: [...RESOURCE_STORE_ROLE_SLUGS] } },
                  },
                },
              },
              select: { id: true },
            })
          : [];
        const itemCount = toolReq.items.length > 0 ? toolReq.items.length : 1;
        const toolLabel = toolReq.items.length > 0 ? `${itemCount} tool${itemCount > 1 ? 's' : ''}` : `"${toolReq.toolName}"`;
        for (const sk of storeKeepers) await notifyUser(sk.id, 'repair_tool_request', 'Tool Request Awaiting Store Approval', `${toolLabel} approved by supervisor for WO ${toolReq.workOrder.woNumber}${toolReq.urgency !== 'normal' ? ` [${toolReq.urgency.toUpperCase()}]` : ''}`, 'repair_tool_request', id, `tool-requests?id=${id}`);
        await notifyUser(toolReq.requestedById, 'repair_tool_request', 'Tool Request Approved', `Your request for ${toolLabel} was approved by supervisor`, 'repair_tool_request', id, `tool-requests?id=${id}`);
        break;
      }

      case 'supervisor_reject': {
        if (toolReq.status !== 'pending') return NextResponse.json({ success: false, error: `Cannot reject: status is ${toolReq.status}` }, { status: 400 });
        const rejectionReason = typeof notes === 'string' && notes.trim() ? notes.trim() : null;
        const claim = await db.repairToolRequest.updateMany({ where: { id, status: 'pending' }, data: { status: 'rejected', supervisorApprovedById: session.userId, supervisorApprovedAt: now, rejectionReason } });
        if (claim.count !== 1) throw new ToolOperationConflictError('Supervisor rejection was claimed concurrently');
        updated = await db.repairToolRequest.findUnique({ where: { id } });
        await notifyUser(toolReq.requestedById, 'repair_tool_request', 'Tool Request Rejected', `Your request for "${toolReq.toolName}" was rejected by supervisor${rejectionReason ? `: ${rejectionReason}` : ''}`, 'repair_tool_request', id, `tool-requests?id=${id}`);
        break;
      }

      case 'storekeeper_approve': {
        if (toolReq.status !== 'supervisor_approved') return NextResponse.json({ success: false, error: `Cannot approve: status is ${toolReq.status}` }, { status: 400 });
        if (toolReq.items.length > 0) {
          for (const item of toolReq.items) {
            if (item.toolId && item.tool) {
              const refreshTool = await db.tool.findUnique({ where: { id: item.toolId } });
              if (!refreshTool) {
                warnings.push(`Tool "${item.toolName}" not found in inventory`);
                await db.repairToolRequestItem.update({ where: { id: item.id }, data: { availabilityStatus: 'unavailable' } });
                continue;
              }
              let newStatus = 'available';
              if (refreshTool.quantity <= 0) { newStatus = 'unavailable'; warnings.push(`"${item.toolName}" is out of stock`); }
              else if (refreshTool.quantity < (item.quantityApproved ?? item.quantityRequested)) { newStatus = 'limited'; warnings.push(`"${item.toolName}": only ${refreshTool.quantity} available (requested: ${item.quantityApproved ?? item.quantityRequested})`); }
              await db.repairToolRequestItem.update({ where: { id: item.id }, data: { availabilityStatus: newStatus } });
            }
          }
        } else if (toolReq.toolId && toolReq.tool) {
          if (toolReq.tool.status !== 'available') return NextResponse.json({ success: false, error: `Tool "${toolReq.tool.name}" is no longer available (status: ${toolReq.tool.status})` }, { status: 400 });
        }
        const claim = await db.repairToolRequest.updateMany({ where: { id, status: 'supervisor_approved' }, data: { status: 'storekeeper_approved', storekeeperApprovedById: session.userId, storekeeperApprovedAt: now } });
        if (claim.count !== 1) throw new ToolOperationConflictError('Store approval was claimed concurrently');
        updated = await db.repairToolRequest.findUnique({ where: { id } });
        const itemCount = toolReq.items.length > 0 ? toolReq.items.length : 1;
        await notifyUser(toolReq.requestedById, 'repair_tool_request', 'Tool Ready for Pickup', `${itemCount} tool${itemCount > 1 ? 's' : ''} approved and ready for issuance`, 'repair_tool_request', id, `tool-requests?id=${id}`);
        break;
      }

      case 'storekeeper_reject': {
        if (toolReq.status !== 'supervisor_approved') return NextResponse.json({ success: false, error: `Cannot reject: status is ${toolReq.status}` }, { status: 400 });
        const rejectionReason = typeof notes === 'string' && notes.trim() ? notes.trim() : null;
        const claim = await db.repairToolRequest.updateMany({ where: { id, status: 'supervisor_approved' }, data: { status: 'rejected', storekeeperApprovedById: session.userId, storekeeperApprovedAt: now, rejectionReason } });
        if (claim.count !== 1) throw new ToolOperationConflictError('Store rejection was claimed concurrently');
        updated = await db.repairToolRequest.findUnique({ where: { id } });
        await notifyUser(toolReq.requestedById, 'repair_tool_request', 'Tool Request Rejected by Store', `"${toolReq.toolName}" was rejected by store keeper${rejectionReason ? `: ${rejectionReason}` : ''}`, 'repair_tool_request', id, `tool-requests?id=${id}`);
        break;
      }

      case 'issue': {
        const issueResult = await atomicIssueTools(id, session, issuedItems || []);
        if (!issueResult.success) return NextResponse.json({ success: false, error: issueResult.error }, { status: issueResult.conflict ? 409 : 400 });
        updated = issueResult.updatedRequest;
        if (issueResult.warnings) warnings.push(...issueResult.warnings);
        if (updated?.status === 'issued') {
          await notifyUser(toolReq.requestedById, 'repair_tool_request', 'Tool Issued', `${toolReq.items.length > 0 ? `${toolReq.items.length} tool${toolReq.items.length > 1 ? 's' : ''}` : `"${toolReq.toolName}"`} has been issued to you for WO ${toolReq.workOrder.woNumber}`, 'repair_tool_request', id, `tool-requests?id=${id}`);
          if (toolReq.workOrder.plannerId && toolReq.workOrder.plannerId !== toolReq.requestedById) await notifyUser(toolReq.workOrder.plannerId, 'repair_tool_request', 'Tool Issued for WO', `${toolReq.items.length > 0 ? 'Tools' : `"${toolReq.toolName}"`} issued to ${toolReq.requestedBy.fullName} for WO ${toolReq.workOrder.woNumber}`, 'repair_tool_request', id, 'maintenance-work-orders');
        }
        break;
      }

      case 'return': {
        const submitResult = await submitToolReturn(id, session, returnedItems || [], toolConditionAtReturn);
        if (!submitResult.success) {
          return NextResponse.json(
            { success: false, error: submitResult.error },
            { status: submitResult.conflict ? 409 : 400 },
          );
        }
        updated = submitResult.updatedRequest;
        if (submitResult.warnings) warnings.push(...submitResult.warnings);

        const storeKeepers = toolReq.plantId
          ? await db.user.findMany({
              where: {
                status: 'active',
                plantAccess: { some: { plantId: toolReq.plantId } },
                userRoles: {
                  some: {
                    role: { slug: { in: [...RESOURCE_STORE_ROLE_SLUGS] } },
                  },
                },
              },
              select: { id: true },
            })
          : [];
        const itemCount = toolReq.items.length > 0 ? toolReq.items.length : 1;
        for (const sk of storeKeepers) {
          await notifyUser(sk.id, 'repair_tool_request', 'Tool Return Pending Confirmation', `${toolReq.requestedBy.fullName} submitted return of ${itemCount} tool${itemCount > 1 ? 's' : ''} for WO ${toolReq.workOrder.woNumber}. Please inspect and confirm.`, 'repair_tool_request', id, `tool-requests?id=${id}`);
        }
        break;
      }

      case 'storekeeper_confirm_return': {
        if (!isStoreActor) return NextResponse.json({ success: false, error: 'Only admin, store keeper, inventory manager, or tools shop attendant can confirm returns' }, { status: 403 });
        const returnResult = await atomicConfirmToolReturn(id, session);
        if (!returnResult.success) return NextResponse.json({ success: false, error: returnResult.error }, { status: returnResult.conflict ? 409 : 400 });
        updated = returnResult.updatedRequest;
        if (returnResult.warnings) warnings.push(...returnResult.warnings);
        await notifyUser(toolReq.requestedById, 'repair_tool_request', 'Tool Return Confirmed', `Your return of tools for WO ${toolReq.workOrder.woNumber} has been confirmed by store keeper.`, 'repair_tool_request', id, `tool-requests?id=${id}`);
        if (returnResult.allReturned && toolReq.workOrder.plannerId && toolReq.workOrder.plannerId !== toolReq.requestedById) await notifyUser(toolReq.workOrder.plannerId, 'repair_tool_request', 'Tool Returned from WO', `${toolReq.items.length > 0 ? 'Tools' : `"${toolReq.toolName}"`} returned by ${toolReq.requestedBy.fullName} from WO ${toolReq.workOrder.woNumber}`, 'repair_tool_request', id, 'maintenance-work-orders');
        break;
      }

      case 'storekeeper_reject_return': {
        if (!isStoreActor) {
          return NextResponse.json({ success: false, error: 'Only admin, store keeper, inventory manager, or tools shop attendant can reject returns' }, { status: 403 });
        }
        const rejectionReason = typeof notes === 'string' && notes.trim() ? notes.trim() : null;
        updated = await db.$transaction(async (tx) => {
          const claim = await tx.repairToolRequest.updateMany({
            where: { id, status: 'pending_return' },
            data: { status: 'issued', rejectionReason: rejectionReason || 'Return rejected by store keeper' },
          });
          if (claim.count !== 1) {
            throw new ToolOperationConflictError('Tool return was already confirmed or rejected concurrently');
          }
          await tx.repairToolRequestItem.updateMany({
            where: { repairToolRequestId: id, pendingReturnQty: { gt: 0 } },
            data: { pendingReturnQty: 0, pendingReturnCondition: null, pendingReturnNotes: null },
          });
          return tx.repairToolRequest.findUnique({ where: { id } });
        });
        await notifyUser(toolReq.requestedById, 'repair_tool_request', 'Tool Return Rejected', `Your return of tools for WO ${toolReq.workOrder.woNumber} was rejected by store keeper${rejectionReason ? `: ${rejectionReason}` : ''}. Please resubmit.`, 'repair_tool_request', id, `tool-requests?id=${id}`);
        break;
      }

      default:
        return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
    }

    await db.auditLog.create({ data: { userId: session.userId, action: `tool_request_${action}`, entityType: 'repair_tool_request', entityId: id, newValues: JSON.stringify({ action, status: updated?.status }) } });
    return NextResponse.json({ success: true, data: updated, warnings: warnings.length > 0 ? warnings : undefined });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to process action';
    if (error instanceof ToolOperationConflictError) {
      return NextResponse.json({ success: false, error: message }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT /api/repairs/tool-requests/[id]
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequestSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const plantAuth = await authorizeToolRequestPlant(request, session, id);
    if (!plantAuth.ok) return plantAuth.response;
    const requestPlantId = plantAuth.entity.workOrder?.plantId ?? null;

    const body = await request.json();
    const { toolName, urgency, reason, notes, items } = body;

    const toolReq = await db.repairToolRequest.findUnique({ where: { id }, include: { items: true } });
    if (!toolReq) return NextResponse.json({ success: false, error: 'Tool request not found' }, { status: 404 });
    if (toolReq.status !== 'pending') return NextResponse.json({ success: false, error: 'Cannot edit: request is no longer pending' }, { status: 400 });
    if (toolReq.requestedById !== session.userId && !isAdmin(session) && !hasRole(session, 'maintenance_supervisor') && !hasRole(session, 'maintenance_manager') && !hasRole(session, 'plant_manager')) return NextResponse.json({ success: false, error: 'You can only edit your own requests' }, { status: 403 });

    const VALID_URGENCIES = ['low', 'normal', 'high', 'critical'];
    const resolvedUrgency = VALID_URGENCIES.includes(urgency) ? urgency : toolReq.urgency;

    if (Array.isArray(items) && items.length > 0) {
      const warnings: string[] = [];
      const newItems: Array<{ toolId: string | null; toolName: string; toolCode: string | null; category: string | null; quantityRequested: number; unitCost: number | null; availabilityStatus: string }> = [];

      for (const item of items) {
        const qty = Math.max(1, parseInt(item.quantityRequested, 10) || 1);
        const itemToolId = item.toolId || null;
        const itemToolName = item.toolName?.trim();
        if (!itemToolName) continue;

        let toolCode: string | null = item.toolCode || null;
        let category: string | null = item.category || null;
        let unitCost: number | null = null;
        let availabilityStatus = 'available';

        if (itemToolId) {
          const tool = await db.tool.findUnique({ where: { id: itemToolId } });
          if (!tool) return NextResponse.json({ success: false, error: `Tool ${itemToolId} not found` }, { status: 400 });
          if (requestPlantId && tool.plantId !== requestPlantId) return NextResponse.json({ success: false, error: `Tool ${itemToolId} belongs to a different plant` }, { status: 400 });
          toolCode = tool.toolCode;
          category = tool.category;
          unitCost = tool.currentValue ?? tool.purchaseCost ?? null;
          if (tool.quantity < qty) { availabilityStatus = 'limited'; warnings.push(`Tool "${tool.name}": requested ${qty} but only ${tool.quantity} available`); }
          if (tool.quantity <= 0) availabilityStatus = 'unavailable';
        }

        newItems.push({ toolId: itemToolId, toolName: itemToolName, toolCode, category, quantityRequested: qty, unitCost, availabilityStatus });
      }

      if (newItems.length === 0) return NextResponse.json({ success: false, error: 'At least one tool item is required' }, { status: 400 });

      // Validate everything before deleting old items so a bad replacement cannot destroy the request.
      await db.repairToolRequestItem.deleteMany({ where: { repairToolRequestId: id } });
      const primaryToolName = newItems[0].toolName;
      const updated = await db.repairToolRequest.update({
        where: { id },
        data: {
          toolName: primaryToolName,
          urgency: resolvedUrgency,
          reason: reason ?? toolReq.reason,
          notes: notes !== undefined ? (notes || null) : toolReq.notes,
          items: { create: newItems.map(item => ({ ...item })) },
        },
        include: {
          requestedBy: { select: { id: true, fullName: true, username: true } },
          supervisorApprovedBy: { select: { id: true, fullName: true } },
          storekeeperApprovedBy: { select: { id: true, fullName: true } },
          issuedByUser: { select: { id: true, fullName: true } },
          returnedByUser: { select: { id: true, fullName: true } },
          workOrder: { select: { id: true, woNumber: true, title: true, status: true } },
          tool: { select: { id: true, toolCode: true, name: true, status: true, category: true, condition: true, quantity: true } },
          items: { include: { tool: { select: { id: true, toolCode: true, name: true, status: true, category: true, condition: true, quantity: true } } }, orderBy: { createdAt: 'asc' } },
        },
      });
      await db.auditLog.create({ data: { userId: session.userId, action: 'tool_request_update', entityType: 'repair_tool_request', entityId: id, newValues: JSON.stringify({ itemCount: newItems.length, urgency, reason }) } });
      return NextResponse.json({ success: true, data: updated, warnings: warnings.length > 0 ? warnings : undefined });
    }

    const changed = await db.repairToolRequest.updateMany({
      where: { id, status: 'pending' },
      data: { toolName: toolName ?? toolReq.toolName, urgency: resolvedUrgency, reason: reason ?? toolReq.reason, notes: notes !== undefined ? (notes || null) : toolReq.notes },
    });
    if (changed.count !== 1) return NextResponse.json({ success: false, error: 'Tool request changed concurrently' }, { status: 409 });
    const updated = await db.repairToolRequest.findUnique({
      where: { id },
      include: {
        requestedBy: { select: { id: true, fullName: true, username: true } },
        supervisorApprovedBy: { select: { id: true, fullName: true } },
        storekeeperApprovedBy: { select: { id: true, fullName: true } },
        issuedByUser: { select: { id: true, fullName: true } },
        returnedByUser: { select: { id: true, fullName: true } },
        workOrder: { select: { id: true, woNumber: true, title: true, status: true } },
        tool: { select: { id: true, toolCode: true, name: true, status: true, category: true, condition: true, quantity: true } },
        items: { include: { tool: { select: { id: true, toolCode: true, name: true, status: true, category: true, condition: true, quantity: true } } }, orderBy: { createdAt: 'asc' } },
      },
    });
    await db.auditLog.create({ data: { userId: session.userId, action: 'tool_request_update', entityType: 'repair_tool_request', entityId: id, newValues: JSON.stringify({ toolName, urgency, reason }) } });
    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update tool request';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE /api/repairs/tool-requests/[id]
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequestSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const plantAuth = await authorizeToolRequestPlant(request, session, id);
    if (!plantAuth.ok) return plantAuth.response;

    const toolReq = await db.repairToolRequest.findUnique({ where: { id }, include: { tool: true, items: true } });
    if (!toolReq) return NextResponse.json({ success: false, error: 'Tool request not found' }, { status: 404 });
    if (toolReq.status !== 'pending') return NextResponse.json({ success: false, error: 'Cannot delete: request is no longer pending' }, { status: 400 });
    if (toolReq.requestedById !== session.userId && !isAdmin(session) && !hasRole(session, 'maintenance_supervisor') && !hasRole(session, 'maintenance_manager') && !hasRole(session, 'plant_manager')) return NextResponse.json({ success: false, error: 'You can only cancel your own requests' }, { status: 403 });

    const deleted = await db.repairToolRequest.deleteMany({ where: { id, status: 'pending' } });
    if (deleted.count !== 1) return NextResponse.json({ success: false, error: 'Tool request changed concurrently and can no longer be cancelled' }, { status: 409 });
    await db.auditLog.create({ data: { userId: session.userId, action: 'delete', entityType: 'repair_tool_request', entityId: id, newValues: JSON.stringify({ toolName: toolReq.toolName, workOrderId: toolReq.workOrderId }) } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete tool request';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
