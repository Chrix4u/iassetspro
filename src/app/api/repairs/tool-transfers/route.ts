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
    const { toolId, fromUserId, toUserId, reason, notes } = body;

    if (!toolId || !fromUserId || !toUserId || !reason) {
      return NextResponse.json({ success: false, error: 'toolId, fromUserId, toUserId, and reason are required' }, { status: 400 });
    }

    if (fromUserId === toUserId) {
      return NextResponse.json({ success: false, error: 'Cannot transfer tool to the same person' }, { status: 400 });
    }
    if (!isAdmin(session) && fromUserId !== session.userId) {
      return NextResponse.json({
        success: false,
        error: 'Only the current custodian can initiate a tool transfer',
      }, { status: 403 });
    }

    const tool = await db.tool.findUnique({ where: { id: toolId } });
    if (!tool) return NextResponse.json({ success: false, error: 'Tool not found' }, { status: 404 });

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlant(plantScope, tool.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const transfer = await createToolTransferRequest({
      toolId,
      fromUserId,
      toUserId,
      reason,
      notes,
      requestedById: session.userId,
    });

    // Notify store keepers
    const storeKeepers = await db.user.findMany({ where: { userRoles: { some: { OR: [{ role: { slug: 'store_keeper' } }, { role: { slug: 'tools_shop_attendant' } }] } }, status: 'active' }, select: { id: true } });
    for (const sk of storeKeepers) {
      await notifyUser(
        sk.id, 'tool_transfer_request',
        'Tool Transfer Request',
        `${transfer.requestedBy.fullName} requested transfer of "${tool.name}" from ${transfer.fromUser.fullName} to ${transfer.toUser.fullName}`,
        'tool_transfer_request', transfer.id, 'maintenance-tools',
      );
    }

    await db.auditLog.create({
      data: { userId: session.userId, action: 'create', entityType: 'tool_transfer_request', entityId: transfer.id, newValues: JSON.stringify({ toolId, fromUserId, toUserId, reason }) },
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
