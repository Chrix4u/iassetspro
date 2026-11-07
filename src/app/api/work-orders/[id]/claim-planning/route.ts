import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission } from '@/lib/auth';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';

const PLANNER_ROLES = new Set(['planner', 'maintenance_planner']);

/**
 * Claim accountability for a legacy draft PM work order with no planner.
 *
 * Deliberately limited to an active planner with WRITE access to the work
 * order's exact plant. The normal review, resource, technician assignment,
 * supervisor verification and planner-close gates are not bypassed.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!session.roles.some((role) => PLANNER_ROLES.has(role))
      || !hasAnyPermission(session, ['work_orders.update'])) {
      return NextResponse.json(
        { success: false, error: 'An authorized maintenance planner is required' },
        { status: 403 },
      );
    }

    const { id } = await params;
    const plantAuth = await authorizeWorkOrderPlant(request, session, id);
    if (!plantAuth.ok) return plantAuth.response;
    const plantId = plantAuth.entity.plantId;
    if (!plantId) {
      return NextResponse.json(
        { success: false, error: 'Work order has no plant; maintenance management review required' },
        { status: 400 },
      );
    }

    // Validate the actor against current database membership, not merely the
    // possibly stale roles and plant access included in a login token.
    const eligible = await db.userPlant.findFirst({
      where: {
        userId: session.userId,
        plantId,
        accessLevel: { in: ['write', 'admin'] },
        user: {
          is: {
            status: 'active',
            userRoles: {
              some: { role: { slug: { in: ['planner', 'maintenance_planner'] } } },
            },
          },
        },
      },
      select: { id: true },
    });
    if (!eligible) {
      return NextResponse.json(
        { success: false, error: 'You must be an active planner with write access to this plant' },
        { status: 403 },
      );
    }

    const current = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true, woNumber: true, status: true, isLocked: true,
        plannerId: true, pmScheduleId: true, plantId: true,
      },
    });
    if (!current) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }
    if (!current.pmScheduleId || current.status !== 'draft' || current.isLocked || current.plantId !== plantId) {
      return NextResponse.json(
        { success: false, error: 'Only unlocked, unassigned draft PM work orders can be claimed' },
        { status: 409 },
      );
    }
    if (current.plannerId) {
      if (current.plannerId === session.userId) {
        return NextResponse.json({
          success: true, data: { id, woNumber: current.woNumber, plannerId: session.userId, status: 'draft', duplicate: true },
        });
      }
      return NextResponse.json(
        { success: false, error: 'Another planner already owns this work order' },
        { status: 409 },
      );
    }

    // Atomic compare-and-set: concurrent planners cannot both claim the same
    // order. The audit row and ownership change commit or roll back together.
    const claimed = await db.$transaction(async (tx) => {
      const change = await tx.workOrder.updateMany({
        where: {
          id, plantId, pmScheduleId: { not: null },
          status: 'draft', isLocked: false, plannerId: null,
        },
        data: { plannerId: session.userId },
      });
      if (change.count !== 1) return false;
      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'update',
          entityType: 'work_order',
          entityId: id,
          plantId,
          oldValues: JSON.stringify({ plannerId: null }),
          newValues: JSON.stringify({
            plannerId: session.userId,
            reason: 'authorized_plant_planner_claimed_legacy_pm_draft',
          }),
        },
      });
      return true;
    });
    if (!claimed) {
      const latest = await db.workOrder.findUnique({
        where: { id }, select: { woNumber: true, status: true, plannerId: true },
      });
      if (latest?.status === 'draft' && latest.plannerId === session.userId) {
        return NextResponse.json({
          success: true, data: { id, woNumber: latest.woNumber, plannerId: session.userId, status: 'draft', duplicate: true },
        });
      }
      return NextResponse.json(
        { success: false, error: 'Work order ownership changed; reload before proceeding' },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      data: { id, woNumber: current.woNumber, plannerId: session.userId, status: 'draft', duplicate: false },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Could not claim PM planning ownership';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
