import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { handoverUserHasEffectivePermission, initiateCanonicalHandover } from '@/services/workOrderHandoverInitiation.service';
import { resumeConfirmedHandover } from '@/services/repairHandoverResume.service';
import type { SessionContext } from '@/services/workExecution.service';
import { canInitiateWorkOrderHandoverForActor, canViewWorkOrder } from '@/services/workOrderAccess.service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        plantId: true,
        status: true,
        assignedTo: true,
        teamLeaderId: true,
        assignedSupervisorId: true,
        plannerId: true,
        teamMembers: { select: { userId: true, role: true } },
        maintenanceRequest: { select: { requestedBy: true } },
        shiftHandovers: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
          include: {
            handedOverBy: { select: { id: true, fullName: true, username: true } },
            receivedBy: { select: { id: true, fullName: true, username: true } },
          },
        },
      },
    });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
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

    const mode = new URL(request.url).searchParams.get('mode');
    if (mode === 'candidates') {
      if (wo.status !== 'in_progress' || !canInitiateWorkOrderHandoverForActor(session, wo)) {
        return NextResponse.json(
          { success: false, error: 'You are not authorized to initiate a handover for this work order' },
          { status: 403 },
        );
      }
      if (!wo.plantId) {
        return NextResponse.json(
          { success: false, error: 'Operational work order must have a plant before handover' },
          { status: 400 },
        );
      }

      const search = new URL(request.url).searchParams.get('search')?.trim() || '';
      const candidates = await db.user.findMany({
        where: {
          id: { not: session.userId },
          status: 'active',
          plantAccess: { some: { plantId: wo.plantId } },
          userRoles: {
            some: {
              role: { slug: 'maintenance_technician' },
            },
          },
          ...(search
            ? {
                OR: [
                  { fullName: { contains: search } },
                  { staffId: { contains: search } },
                  { username: { contains: search } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          fullName: true,
          staffId: true,
          username: true,
          primaryTrade: true,
          userRoles: {
            select: {
              role: {
                select: {
                  slug: true,
                  rolePermissions: {
                    select: { permission: { select: { slug: true } } },
                  },
                },
              },
            },
          },
          directPerms: {
            select: {
              isGranted: true,
              expiresAt: true,
              permission: { select: { slug: true } },
            },
          },
        },
        orderBy: { fullName: 'asc' },
        take: 50,
      });

      const eligible = candidates
        .filter((candidate) => handoverUserHasEffectivePermission(candidate, 'work_orders.start'))
        .map((candidate) => ({
          id: candidate.id,
          fullName: candidate.fullName,
          staffId: candidate.staffId,
          username: candidate.username,
          trade: candidate.primaryTrade,
        }));

      return NextResponse.json({ success: true, data: eligible });
    }

    const handover = wo.shiftHandovers[0] ?? null;
    const managementOverride = isAdmin(session) || session.roles.includes('maintenance_manager');
    const canInitiate = wo.status === 'in_progress'
      && canInitiateWorkOrderHandoverForActor(session, wo);
    const canConfirm = Boolean(
      handover
      && handover.status === 'pending'
      && handover.receivedById === session.userId,
    );
    const canResume = Boolean(
      handover
      && handover.status === 'confirmed'
      && (handover.receivedById === session.userId || managementOverride),
    );

    return NextResponse.json({
      success: true,
      data: {
        handover,
        capabilities: { canInitiate, canConfirm, canResume },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load work-order handover';
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

    const { id } = await params;
    const body = await request.json();
    const action = body.action as string | undefined;

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: { id: true, plantId: true, status: true },
    });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, wo.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const sessionCtx: SessionContext = {
      userId: session.userId,
      fullName: session.fullName,
      roles: session.roles || [],
      permissions: session.permissions || [],
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    };

    if (action === 'resume') {
      const result = await resumeConfirmedHandover(id, sessionCtx, {
        reason: body.reason,
      });
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ success: true, data: result.data });
    }

    // Handover initiation must designate a real incoming worker.
    const receivedById = typeof body.receivedById === 'string' ? body.receivedById.trim() : '';
    if (!receivedById) {
      return NextResponse.json({ success: false, error: 'receivedById is required for shift handover' }, { status: 400 });
    }
    if (receivedById === session.userId) {
      return NextResponse.json({ success: false, error: 'Handover receiver must be different from the outgoing worker' }, { status: 400 });
    }
    if (!wo.plantId) {
      return NextResponse.json({ success: false, error: 'Operational work order must have a plant before handover' }, { status: 400 });
    }

    const receiver = await db.user.findUnique({
      where: { id: receivedById },
      select: { id: true, status: true },
    });
    if (!receiver || receiver.status !== 'active') {
      return NextResponse.json({ success: false, error: 'Designated handover receiver is not an active user' }, { status: 400 });
    }

    const receiverPlant = await db.userPlant.findFirst({
      where: { userId: receivedById, plantId: wo.plantId },
      select: { id: true },
    });
    if (!receiverPlant) {
      return NextResponse.json({ success: false, error: 'Designated handover receiver does not have access to this plant' }, { status: 400 });
    }

    // Canonical handover initiation closes all live team sessions without
    // rewriting their start/resume action, then transitions + creates the
    // ShiftHandover record atomically.
    const result = await initiateCanonicalHandover(id, sessionCtx, {
      reason: body.reason,
      idempotencyKey: body.idempotencyKey,
      shiftType: body.shiftType,
      shiftDate: body.shiftDate,
      fromShift: body.fromShift,
      toShift: body.toShift,
      receivedById,
      tasksSummary: body.tasksSummary,
      pendingIssues: body.pendingIssues,
      safetyNotes: body.safetyNotes,
      equipmentStatus: body.equipmentStatus,
      notes: body.notes,
    });
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: result.data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Handover operation failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
