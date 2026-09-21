import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasPermission, hasAnyPermission } from '@/lib/auth';
import { getPlantScope, applyPlantScope, canAccessPlant } from '@/lib/plant-scope';
import { notifyUser } from '@/lib/notifications';
import { createToolTransferRequest, ToolTransferConflictError, ToolTransferNotFoundError } from '@/services/toolTransfer.service';

// GET /api/repairs/tool-transfers
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasAnyPermission(session, ['repair_tool_transfers.view', 'repair_tool_transfers.view_all', 'repair_tool_transfers.view_own']) && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const toolId = searchParams.get('toolId');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const stats = searchParams.get('stats') === 'true';

    const where: Record<string, unknown> = {};

    // Apply plant scope filter
    if (session) {
      const plantScope = await getPlantScope(request, session);
      if (plantScope) {
        applyPlantScope(where, plantScope);
      }
    }

    if (status) where.status = status;
    if (toolId) where.toolId = toolId;

    // Search filter for tool name, user names
    if (search) {
      where.OR = [
        { tool: { name: { contains: search, mode: 'insensitive' } } },
        { tool: { toolCode: { contains: search, mode: 'insensitive' } } },
        { fromUser: { fullName: { contains: search, mode: 'insensitive' } } },
        { toUser: { fullName: { contains: search, mode: 'insensitive' } } },
        { requestedBy: { fullName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // Store keepers and admins see all; technicians see their own
    const canViewAll = hasAnyPermission(session, ['repair_tool_transfers.view', 'repair_tool_transfers.view_all']) || isAdmin(session);
    if (!canViewAll) {
      const userFilter = { OR: [{ fromUserId: session.userId }, { toUserId: session.userId }, { requestedById: session.userId }] };
      if (where.OR && search) {
        // Merge search OR with user filter
        where.AND = [{ OR: where.OR }, userFilter];
        delete where.OR;
      } else {
        where.OR = userFilter.OR;
      }
    }

    // Stats endpoint
    if (stats) {
      const statsWhere = Object.keys(where).length > 0 ? where : undefined;
      const [
        total, pending, storekeeperApproved, awaitingHandover, transferred, rejected,
      ] = await Promise.all([
        db.toolTransferRequest.count({ where: statsWhere }),
        db.toolTransferRequest.count({ where: { ...statsWhere, status: 'pending' } }),
        db.toolTransferRequest.count({ where: { ...statsWhere, status: 'storekeeper_approved' } }),
        db.toolTransferRequest.count({ where: { ...statsWhere, status: 'awaiting_handover' } }),
        db.toolTransferRequest.count({ where: { ...statsWhere, status: 'transferred' } }),
        db.toolTransferRequest.count({ where: { ...statsWhere, status: 'rejected' } }),
      ]);

      return NextResponse.json({
        success: true,
        data: {
          total,
          byStatus: {
            pending,
            storekeeper_approved: storekeeperApproved,
            awaiting_handover: awaitingHandover,
            transferred,
            rejected,
          },
        },
      });
    }

    const [transfers, total] = await Promise.all([
      db.toolTransferRequest.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        include: {
          tool: { select: { id: true, toolCode: true, name: true, status: true, category: true } },
          fromUser: { select: { id: true, fullName: true, username: true } },
          toUser: { select: { id: true, fullName: true, username: true } },
          requestedBy: { select: { id: true, fullName: true } },
          storekeeperApprovedBy: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.toolTransferRequest.count({
        where: Object.keys(where).length > 0 ? where : undefined,
      }),
    ]);

    return NextResponse.json({ success: true, data: transfers, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load tool transfers';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/repairs/tool-transfers
export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'repair_tool_transfers.create') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { toolId, fromUserId: proposedFromUserId, toUserId, reason, notes } = body;

    if (!toolId || !toUserId || !reason) {
      return NextResponse.json({ success: false, error: 'toolId, toUserId, and reason are required' }, { status: 400 });
    }

    const tool = await db.tool.findUnique({
      where: { id: toolId },
      select: {
        id: true,
        name: true,
        plantId: true,
        assignedToId: true,
        isActive: true,
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

    const effectiveFromUserId = tool.assignedToId;
    if (proposedFromUserId && proposedFromUserId !== effectiveFromUserId) {
      return NextResponse.json({
        success: false,
        error: 'Tool custody does not match the proposed transfer sender',
      }, { status: 409 });
    }
    if (!isAdmin(session) && effectiveFromUserId !== session.userId) {
      return NextResponse.json({
        success: false,
        error: 'Only the current tool custodian may initiate a transfer from their custody',
      }, { status: 403 });
    }
    if (effectiveFromUserId === toUserId) {
      return NextResponse.json({ success: false, error: 'Cannot transfer tool to the same person' }, { status: 400 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlant(plantScope, tool.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const recipient = await db.user.findUnique({
      where: { id: toUserId },
      select: {
        id: true,
        status: true,
        plantAccess: { where: { plantId: tool.plantId }, select: { id: true } },
        userRoles: {
          where: { role: { slug: 'maintenance_technician' } },
          select: { id: true },
        },
      },
    });
    if (!recipient || recipient.status !== 'active') {
      return NextResponse.json({ success: false, error: 'Receiving technician is not active' }, { status: 400 });
    }
    if (recipient.plantAccess.length === 0) {
      return NextResponse.json({ success: false, error: 'Receiving technician does not have access to the tool plant' }, { status: 403 });
    }
    if (recipient.userRoles.length === 0) {
      return NextResponse.json({ success: false, error: 'Receiving user must be a maintenance technician' }, { status: 400 });
    }

    const transfer = await createToolTransferRequest({
      toolId,
      fromUserId: effectiveFromUserId,
      toUserId,
      reason,
      notes,
      requestedById: session.userId,
    });

    // Notify only eligible store/tool attendants for the tool's plant.
    const storeKeepers = await db.user.findMany({
      where: {
        status: 'active',
        plantAccess: { some: { plantId: tool.plantId } },
        userRoles: {
          some: {
            OR: [
              { role: { slug: 'store_keeper' } },
              { role: { slug: 'tools_shop_attendant' } },
            ],
          },
        },
      },
      select: { id: true },
    });
    for (const sk of storeKeepers) {
      await notifyUser(
        sk.id, 'tool_transfer_request',
        'Tool Transfer Request',
        `${transfer.requestedBy.fullName} requested transfer of "${tool.name}" from ${transfer.fromUser.fullName} to ${transfer.toUser.fullName}`,
        'tool_transfer_request', transfer.id, 'maintenance-tools',
      );
    }

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'create',
        entityType: 'tool_transfer_request',
        entityId: transfer.id,
        newValues: JSON.stringify({
          toolId,
          fromUserId: effectiveFromUserId,
          toUserId,
          reason,
          plantId: tool.plantId,
        }),
      },
    });

    return NextResponse.json({ success: true, data: transfer }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create tool transfer request';
    if (error instanceof ToolTransferNotFoundError) {
      return NextResponse.json({ success: false, error: message }, { status: 404 });
    }
    if (error instanceof ToolTransferConflictError) {
      return NextResponse.json({ success: false, error: message }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
