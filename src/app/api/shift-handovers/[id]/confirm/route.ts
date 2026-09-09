import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';

// POST /api/shift-handovers/[id]/confirm
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;

    const handover = await db.shiftHandover.findUnique({
      where: { id },
      include: {
        workOrder: { select: { id: true, plantId: true, status: true } },
        handedOverBy: { select: { id: true } },
        receivedBy: { select: { id: true } },
      },
    });

    if (!handover) {
      return NextResponse.json({ success: false, error: 'Shift handover not found' }, { status: 404 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, handover.workOrder?.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    if (handover.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: `Cannot confirm: current status is '${handover.status}'. Expected 'pending'.` },
        { status: 400 },
      );
    }

    if (handover.workOrder && handover.workOrder.status !== 'pending_handover') {
      return NextResponse.json(
        { success: false, error: `Cannot confirm: linked work order status is '${handover.workOrder.status}'. Expected 'pending_handover'.` },
        { status: 400 },
      );
    }

    // Acceptance is a custody transfer, not a management override. The named
    // incoming worker must personally acknowledge the handover. Managers may
    // release a *confirmed* handover through the canonical resume service, but
    // they cannot impersonate the receiver's acceptance here.
    if (handover.receivedById !== session.userId) {
      return NextResponse.json(
        { success: false, error: 'Only the designated handover receiver can confirm acceptance' },
        { status: 403 },
      );
    }

    const now = new Date();

    // Atomically claim the pending handover and write its audit evidence in the
    // same transaction. updateMany gives us a compare-and-set guard so two
    // concurrent confirmation requests cannot both succeed or double-audit.
    const updated = await db.$transaction(async (tx) => {
      const claimed = await tx.shiftHandover.updateMany({
        where: {
          id,
          status: 'pending',
          receivedById: session.userId,
        },
        data: { status: 'confirmed' },
      });

      if (claimed.count !== 1) {
        return null;
      }

      const confirmed = await tx.shiftHandover.findUnique({
        where: { id },
        include: {
          handedOverBy: { select: { id: true, fullName: true, username: true } },
          receivedBy: { select: { id: true, fullName: true, username: true } },
        },
      });

      if (!confirmed) {
        throw new Error('Confirmed shift handover could not be reloaded');
      }

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'shift_handover_confirm',
          entityType: 'shift_handover',
          entityId: id,
          newValues: JSON.stringify({
            status: 'confirmed',
            confirmedAt: now.toISOString(),
            receivedById: handover.receivedById,
          }),
        },
      });

      return confirmed;
    });

    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'Shift handover was already confirmed or is no longer pending' },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        confirmedAt: now.toISOString(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to confirm shift handover';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
