import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';

// Reading IDs are not authorization tokens. Every direct-id request must
// independently check plant access, including privileged users who explicitly
// selected a narrower plant context.
async function canSeeReading(request: NextRequest, session: NonNullable<ReturnType<typeof getSession>>, plantId: string | null) {
  const scope = await getPlantScope(request, session);
  return !scope.denyAccess && canAccessPlantStrict(scope, plantId);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!isAdmin(session) && !hasPermission(session, 'meters.view')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;

    const reading = await db.meterReading.findUnique({
      where: { id },
      include: {
        readBy: { select: { id: true, fullName: true, username: true } },
      },
    });

    if (!reading) {
      return NextResponse.json({ success: false, error: 'Meter reading not found' }, { status: 404 });
    }
    if (!await canSeeReading(request, session, reading.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: reading });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load meter reading';
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
    if (!hasPermission(session, 'meters.update') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await db.meterReading.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Meter reading not found' }, { status: 404 });
    }
    if (!await canSeeReading(request, session, existing.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }
    // Asset-linked meter records are PM evidence. Their identity, values and
    // observation dates must not be rewritten via the generic legacy editor.
    // A separate, reviewed correction workflow can preserve superseded values.
    if ((existing.assetMeterId || existing.assetId)
      && Object.keys(body).some(field => field !== 'notes')) {
      return NextResponse.json({ success: false,
        error: 'Asset-linked meter evidence is immutable. Only its notes may be corrected here.',
      }, { status: 409 });
    }
    if (body.notes !== undefined && body.notes !== null
      && (typeof body.notes !== 'string' || body.notes.length > 2000)) {
      return NextResponse.json({ success: false, error: 'Notes must contain at most 2,000 characters' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    const allowedFields = ['meterName', 'value', 'unit', 'readingDate', 'notes'];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'value') {
          const parsed = Number(body[field]);
          if (body[field] === '' || body[field] === null || !Number.isFinite(parsed) || parsed < 0) {
            return NextResponse.json({ success: false, error: 'Reading must be a nonnegative number' }, { status: 400 });
          }
          updateData[field] = parsed;
        } else if (field === 'readingDate') {
          const stamp = new Date(body[field]);
          if (!body[field] || Number.isNaN(stamp.getTime())) {
            return NextResponse.json({ success: false, error: 'Reading date is invalid' }, { status: 400 });
          }
          updateData[field] = stamp;
        } else {
          updateData[field] = body[field];
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: false, error: 'No valid reading updates supplied' }, { status: 400 });
    }
    const updated = await db.$transaction(async tx => {
      const record = await tx.meterReading.update({
        where: { id },
        data: updateData,
        include: {
          readBy: { select: { id: true, fullName: true, username: true } },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'update',
          entityType: 'meter_reading',
          entityId: id,
          oldValues: JSON.stringify({ readingNumber: existing.readingNumber, value: existing.value }),
          newValues: JSON.stringify(updateData),
        },
      });
      return record;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update meter reading';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;

    const existing = await db.meterReading.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Meter reading not found' }, { status: 404 });
    }
    if (!await canSeeReading(request, session, existing.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }
    // Never erase asset-linked meter evidence used by PM recurrence, work
    // orders, inspections and investigations, even with an admin account.
    if (existing.assetMeterId || existing.assetId) {
      return NextResponse.json({ success: false,
        error: 'Asset-linked meter evidence cannot be deleted. Use an audited correction process.',
      }, { status: 409 });
    }
    await db.$transaction(async tx => {
      await tx.meterReading.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'delete',
          entityType: 'meter_reading',
          entityId: id,
          oldValues: JSON.stringify({ readingNumber: existing.readingNumber }),
        },
      });
    });
    return NextResponse.json({ success: true, message: 'Meter reading deleted' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete meter reading';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
