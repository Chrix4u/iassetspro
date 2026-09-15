import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasRole } from '@/lib/auth';
import { notifyUser } from '@/lib/notifications';
import { acceptToolTransfer, completeToolTransfer, ToolTransferConflictError, ToolTransferNotFoundError } from '@/services/toolTransfer.service';
import { getPlantScope, canAccessPlant } from '@/lib/plant-scope';

const VALID_CONDITIONS = ['new', 'good', 'fair', 'poor', 'damaged'];

// GET /api/repairs/tool-transfers/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const transfer = await db.toolTransferRequest.findUnique({
      where: { id },
      include: {
        tool: { select: { id: true, toolCode: true, name: true, status: true, category: true, location: true, condition: true, plantId: true } },
        fromUser: { select: { id: true, fullName: true, username: true, department: true } },
        toUser: { select: { id: true, fullName: true, username: true, department: true } },
        requestedBy: { select: { id: true, fullName: true } },
        storekeeperApprovedBy: { select: { id: true, fullName: true } },
      },
    });
    if (!transfer) return NextResponse.json({ success: false, error: 'Transfer request not found' }, { status: 404 });

    // Plant scope validation
    const plantScope = await getPlantScope(request, session);
    const recordPlantId = transfer.plantId || transfer.tool?.plantId;
    if (plantScope.denyAccess || !canAccessPlant(plantScope, recordPlantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: transfer });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load transfer request';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/repairs/tool-transfers/[id] — workflow actions
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const { action, notes, toolConditionAtTransfer } = body;

    const transfer = await db.toolTransferRequest.findUnique({
      where: { id },
      include: {
        tool: true,
        fromUser: { select: { id: true, fullName: true } },
        toUser: { select: { id: true, fullName: true } },
        requestedBy: { select: { id: true, fullName: true } },
      },
    });
    if (!transfer) return NextResponse.json({ success: false, error: 'Transfer request not found' }, { status: 404 });

    const plantScope = await getPlantScope(request, session);
    const recordPlantId = transfer.plantId || transfer.tool?.plantId;
    if (plantScope.denyAccess || !canAccessPlant(plantScope, recordPlantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const now = new Date();
    let updated: any;
    let warnings: string[] = [];

    switch (action) {
      case 'storekeeper_approve': {
        if (transfer.status !== 'pending') return NextResponse.json({ success: false, error: `Cannot approve: status is ${transfer.status}` }, { status: 400 });
        // Role check: only store-related roles or admin can approve transfers
        if (!isAdmin(session) &&
            !hasRole(session, 'store_keeper') &&
            !hasRole(session, 'inventory_manager') &&
            !hasRole(session, 'tools_shop_attendant')) {
          return NextResponse.json({ success: false, error: 'Only admin, store keeper, inventory manager, or tools shop attendant can approve tool transfers' }, { status: 403 });
        }

        // Validate and store tool condition at transfer
        const resolvedCondition = VALID_CONDITIONS.includes(toolConditionAtTransfer) ? toolConditionAtTransfer : null;
        if (resolvedCondition === 'poor') {
          warnings.push('Tool condition is "poor". Consider maintenance before transfer.');
        }

        if (transfer.tool?.assignedToId !== transfer.fromUserId) {
          return NextResponse.json({ success: false, error: 'Tool custodian changed before transfer approval' }, { status: 409 });
        }
        const approvalClaim = await db.toolTransferRequest.updateMany({
          where: { id, status: 'pending' },
          data: {
            status: 'awaiting_handover',
            storekeeperApprovedById: session.userId,
            storekeeperApprovedAt: now,
            toolConditionAtTransfer: resolvedCondition,
          },
        });
        if (approvalClaim.count !== 1) {
          return NextResponse.json({ success: false, error: 'Transfer approval was claimed concurrently' }, { status: 409 });
        }
        updated = await db.toolTransferRequest.findUnique({ where: { id } });

        // Notify both fromUser and toUser that handover needs to happen
        await notifyUser(transfer.fromUserId, 'tool_transfer_request', 'Tool Transfer Approved — Confirm Handover',
            `Transfer of "${transfer.tool?.name ?? 'Unknown Tool'}" to ${transfer.toUser?.fullName ?? 'Unknown'} has been approved. Please confirm you are handing over the tool.`,
            'tool_transfer_request', id, 'maintenance-tools');
        await notifyUser(transfer.toUserId, 'tool_transfer_request', 'Tool Transfer Approved — Confirm Receipt',
            `Transfer of "${transfer.tool?.name ?? 'Unknown Tool'}" from ${transfer.fromUser?.fullName ?? 'Unknown'} has been approved. Please confirm you have received the tool.`,
            'tool_transfer_request', id, 'maintenance-tools');
        break;
      }

      case 'storekeeper_reject': {
        if (transfer.status !== 'pending') return NextResponse.json({ success: false, error: `Cannot reject: status is ${transfer.status}` }, { status: 400 });
        // Role check: only store-related roles, admin, or the requester can reject/cancel
        if (!isAdmin(session) &&
            !hasRole(session, 'store_keeper') &&
            !hasRole(session, 'inventory_manager') &&
            !hasRole(session, 'tools_shop_attendant')) {
          if (transfer.requestedById !== session.userId) {
            return NextResponse.json({ success: false, error: 'You can only cancel your own transfer requests' }, { status: 403 });
          }
        }
        const rejectionReason = typeof notes === 'string' && notes.trim() ? notes.trim() : null;
        const rejectClaim = await db.toolTransferRequest.updateMany({
          where: { id, status: 'pending' },
          data: { status: 'rejected', storekeeperApprovedById: session.userId, storekeeperApprovedAt: now, rejectionReason },
        });
        if (rejectClaim.count !== 1) {
          return NextResponse.json({ success: false, error: 'Transfer rejection was claimed concurrently' }, { status: 409 });
        }
        updated = await db.toolTransferRequest.findUnique({ where: { id } });
        await notifyUser(transfer.requestedById, 'tool_transfer_request', 'Tool Transfer Rejected',
            `Transfer of "${transfer.tool?.name ?? 'Unknown Tool'}" was rejected by store keeper${rejectionReason ? `: ${rejectionReason}` : ''}`,
            'tool_transfer_request', id, 'maintenance-tools');
        // Also notify fromUser and toUser
        await notifyUser(transfer.fromUserId, 'tool_transfer_request', 'Tool Transfer Rejected',
            `Transfer of "${transfer.tool?.name ?? 'Unknown Tool'}" to ${transfer.toUser?.fullName ?? 'Unknown'} was rejected`,
            'tool_transfer_request', id, 'maintenance-tools');
        await notifyUser(transfer.toUserId, 'tool_transfer_request', 'Tool Transfer Rejected',
            `Transfer of "${transfer.tool?.name ?? 'Unknown Tool'}" from ${transfer.fromUser?.fullName ?? 'Unknown'} was rejected`,
            'tool_transfer_request', id, 'maintenance-tools');

        break;
      }

      case 'from_user_accept': {
        if (transfer.status !== 'awaiting_handover') return NextResponse.json({ success: false, error: `Cannot accept handover: status is ${transfer.status}` }, { status: 409 });
        if (session.userId !== transfer.fromUserId) {
          return NextResponse.json({ success: false, error: 'Only the current custodian can confirm physical handover' }, { status: 403 });
        }

        const result = await acceptToolTransfer(id, 'from');
        updated = result.transfer;
        await notifyUser(transfer.toUserId, 'tool_transfer_request', 'Tool Handover Confirmed by Sender',
          `${transfer.fromUser?.fullName ?? 'Unknown'} has confirmed handover of "${transfer.tool?.name ?? 'Unknown Tool'}".`,
          'tool_transfer_request', id, 'maintenance-tools');

        if (result.completedNow) {
          await notifyUser(transfer.fromUserId, 'tool_transfer_request', 'Tool Transfer Completed',
            `"${transfer.tool?.name ?? 'Unknown Tool'}" has been successfully transferred to ${transfer.toUser?.fullName ?? 'Unknown'}`,
            'tool_transfer_request', id, 'maintenance-tools');
          await notifyUser(transfer.toUserId, 'tool_transfer_request', 'Tool Transfer Completed',
            `"${transfer.tool?.name ?? 'Unknown Tool'}" has been successfully transferred to you`,
            'tool_transfer_request', id, 'maintenance-tools');
        }
        break;
      }

      case 'to_user_accept': {
        if (transfer.status !== 'awaiting_handover') return NextResponse.json({ success: false, error: `Cannot accept receipt: status is ${transfer.status}` }, { status: 409 });
        if (session.userId !== transfer.toUserId) {
          return NextResponse.json({ success: false, error: 'Only the receiving custodian can confirm physical receipt' }, { status: 403 });
        }

        const result = await acceptToolTransfer(id, 'to');
        updated = result.transfer;
        await notifyUser(transfer.fromUserId, 'tool_transfer_request', 'Tool Receipt Confirmed by Receiver',
          `${transfer.toUser?.fullName ?? 'Unknown'} has confirmed receipt of "${transfer.tool?.name ?? 'Unknown Tool'}".`,
          'tool_transfer_request', id, 'maintenance-tools');

        if (result.completedNow) {
          await notifyUser(transfer.fromUserId, 'tool_transfer_request', 'Tool Transfer Completed',
            `"${transfer.tool?.name ?? 'Unknown Tool'}" has been successfully transferred to ${transfer.toUser?.fullName ?? 'Unknown'}`,
            'tool_transfer_request', id, 'maintenance-tools');
          await notifyUser(transfer.toUserId, 'tool_transfer_request', 'Tool Transfer Completed',
            `"${transfer.tool?.name ?? 'Unknown Tool'}" has been successfully transferred to you`,
            'tool_transfer_request', id, 'maintenance-tools');
        }
        break;
      }

      case 'confirm_receipt': {
        if (transfer.status === 'transferred') {
          updated = transfer;
          break;
        }
        if (transfer.status !== 'awaiting_handover') return NextResponse.json({ success: false, error: `Cannot confirm receipt: status is ${transfer.status}` }, { status: 409 });
        if (!transfer.fromUserAcceptedAt || !transfer.toUserAcceptedAt) {
          return NextResponse.json({ success: false, error: 'Both parties must accept handover before confirming receipt' }, { status: 409 });
        }

        const result = await completeToolTransfer(id);
        updated = result.transfer;
        if (result.completedNow) {
          await notifyUser(transfer.fromUserId, 'tool_transfer_request', 'Tool Transfer Completed',
            `"${transfer.tool?.name ?? 'Unknown Tool'}" has been successfully transferred to ${transfer.toUser?.fullName ?? 'Unknown'}`,
            'tool_transfer_request', id, 'maintenance-tools');
          await notifyUser(transfer.toUserId, 'tool_transfer_request', 'Tool Transfer Completed',
            `"${transfer.tool?.name ?? 'Unknown Tool'}" has been successfully transferred to you from ${transfer.fromUser?.fullName ?? 'Unknown'}`,
            'tool_transfer_request', id, 'maintenance-tools');
        }
        break;
      }

      case 'cancel': {
        if (transfer.status !== 'pending') return NextResponse.json({ success: false, error: `Cannot cancel: status is ${transfer.status}` }, { status: 400 });
        // Ownership check: only requester or admin can cancel
        if (!isAdmin(session) &&
            !hasRole(session, 'maintenance_supervisor') &&
            !hasRole(session, 'maintenance_manager') &&
            !hasRole(session, 'plant_manager')) {
          if (transfer.requestedById !== session.userId) {
            return NextResponse.json({ success: false, error: 'You can only cancel your own transfer requests' }, { status: 403 });
          }
        }
        const cancelClaim = await db.toolTransferRequest.updateMany({
          where: { id, status: 'pending' },
          data: { status: 'rejected', rejectionReason: notes || 'Cancelled by requester' },
        });
        if (cancelClaim.count !== 1) {
          return NextResponse.json({ success: false, error: 'Transfer cancellation was claimed concurrently' }, { status: 409 });
        }
        updated = await db.toolTransferRequest.findUnique({ where: { id } });
        await notifyUser(transfer.fromUserId, 'tool_transfer_request', 'Tool Transfer Cancelled',
            `Transfer of "${transfer.tool?.name ?? 'Unknown Tool'}" has been cancelled`, 'tool_transfer_request', id, 'maintenance-tools');
        await notifyUser(transfer.toUserId, 'tool_transfer_request', 'Tool Transfer Cancelled',
            `Transfer of "${transfer.tool?.name ?? 'Unknown Tool'}" has been cancelled`, 'tool_transfer_request', id, 'maintenance-tools');

        break;
      }

      default:
        return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
    }

    await db.auditLog.create({
      data: { userId: session.userId, action: `tool_transfer_${action}`, entityType: 'tool_transfer_request', entityId: id, newValues: JSON.stringify({ action, status: updated?.status }) },
    });

    return NextResponse.json({ success: true, data: updated, warnings: warnings.length > 0 ? warnings : undefined });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to process action';
    if (error instanceof ToolTransferNotFoundError) {
      return NextResponse.json({ success: false, error: message }, { status: 404 });
    }
    if (error instanceof ToolTransferConflictError) {
      return NextResponse.json({ success: false, error: message }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
