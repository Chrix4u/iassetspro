import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission, isAdmin } from '@/lib/auth';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { buildAuditData } from '@/lib/audit-helpers';

const VALID_CATEGORIES = new Set(['planned', 'unplanned', 'partial']);
const VALID_IMPACT_LEVELS = new Set(['low', 'medium', 'high', 'critical']);
const IMMUTABLE_STATUSES = new Set(['completed', 'verified', 'closed', 'cancelled']);
const ACTIVE_DOWNTIME_STATUSES = new Set(['in_progress', 'waiting_parts', 'waiting_tools', 'waiting_shutdown', 'waiting_permit', 'on_hold', 'pending_handover']);

type AccessWorkOrder = {
  id: string;
  plantId: string | null;
  assetId: string | null;
  assetName: string | null;
  assignedTo: string | null;
  teamLeaderId: string | null;
  assignedSupervisorId: string | null;
  plannerId: string | null;
  status: string;
  isLocked: boolean;
  teamMembers: Array<{ userId: string }>;
  maintenanceRequest: { requestedBy: string } | null;
};

function isOwnWorkOrder(wo: AccessWorkOrder, userId: string): boolean {
  return (
    wo.assignedTo === userId ||
    wo.teamLeaderId === userId ||
    wo.teamMembers.some((member) => member.userId === userId) ||
    wo.maintenanceRequest?.requestedBy === userId
  );
}

function isExecutionMember(wo: AccessWorkOrder, userId: string): boolean {
  return (
    wo.assignedTo === userId ||
    wo.teamLeaderId === userId ||
    wo.teamMembers.some((member) => member.userId === userId)
  );
}

async function loadWorkOrder(id: string): Promise<AccessWorkOrder | null> {
  return db.workOrder.findUnique({
    where: { id },
    select: {
      id: true,
      plantId: true,
      assetId: true,
      assetName: true,
      assignedTo: true,
      teamLeaderId: true,
      assignedSupervisorId: true,
      plannerId: true,
      status: true,
      isLocked: true,
      teamMembers: { select: { userId: true } },
      maintenanceRequest: { select: { requestedBy: true } },
    },
  });
}

function parseDate(value: unknown, fallback?: Date): Date | null {
  if (value == null || value === '') return fallback ?? null;
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function durationMinutes(start: Date, end: Date | null): number {
  if (!end) return 0;
  return Math.max(0, Math.round(((end.getTime() - start.getTime()) / 60000) * 100) / 100);
}

async function authorizeRead(request: NextRequest, id: string) {
  const session = getSession(request);
  if (!session) return { ok: false as const, response: NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 }) };

  const plantAuth = await authorizeWorkOrderPlant(request, session, id);
  if (!plantAuth.ok) return { ok: false as const, response: plantAuth.response };

  const wo = await loadWorkOrder(id);
  if (!wo) return { ok: false as const, response: NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 }) };

  const canViewAll = isAdmin(session) || hasAnyPermission(session, ['work_orders.view', 'work_orders.view_all']);
  const canViewOwn = hasAnyPermission(session, ['work_orders.view_own']) && isOwnWorkOrder(wo, session.userId);
  if (!canViewAll && !canViewOwn) {
    return { ok: false as const, response: NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 }) };
  }

  return { ok: true as const, session, wo };
}

async function authorizeWrite(request: NextRequest, id: string) {
  const read = await authorizeRead(request, id);
  if (!read.ok) return read;

  const isSupervisor = read.wo.assignedSupervisorId === read.session.userId;
  const isPlanner = read.wo.plannerId === read.session.userId;
  const isMaintenanceManager = read.session.roles.includes('maintenance_manager');
  const canManage = isAdmin(read.session) || isMaintenanceManager || isSupervisor || isPlanner || hasAnyPermission(read.session, ['work_orders.update']);
  if (!isExecutionMember(read.wo, read.session.userId) && !canManage) {
    return { ok: false as const, response: NextResponse.json({ success: false, error: 'Only assigned execution staff or authorized maintenance management can record work-order downtime' }, { status: 403 }) };
  }

  if (read.wo.isLocked || IMMUTABLE_STATUSES.has(read.wo.status)) {
    return { ok: false as const, response: NextResponse.json({ success: false, error: `Downtime cannot be changed for work order status: ${read.wo.status}` }, { status: 409 }) };
  }

  if (!ACTIVE_DOWNTIME_STATUSES.has(read.wo.status)) {
    return { ok: false as const, response: NextResponse.json({ success: false, error: `Downtime can only be recorded during active work-order execution. Status: ${read.wo.status}` }, { status: 409 }) };
  }

  return read;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorizeRead(request, id);
    if (!auth.ok) return auth.response;

    const records = await db.workOrderDowntime.findMany({
      where: { workOrderId: id },
      include: { createdBy: { select: { id: true, fullName: true, username: true } } },
      orderBy: [{ downtimeStart: 'desc' }, { createdAt: 'desc' }],
    });

    const totalMinutes = records.reduce((sum, row) => sum + (row.durationMinutes || 0), 0);
    const ongoing = records.filter((row) => row.downtimeEnd == null).length;
    return NextResponse.json({
      success: true,
      data: records,
      summary: { totalRecords: records.length, ongoing, totalMinutes: Math.round(totalMinutes * 100) / 100 },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load work-order downtime';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorizeWrite(request, id);
    if (!auth.ok) return auth.response;

    const body = await request.json() as Record<string, unknown>;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 3) {
      return NextResponse.json({ success: false, error: 'Downtime reason must be at least 3 characters' }, { status: 400 });
    }

    const category = typeof body.category === 'string' && VALID_CATEGORIES.has(body.category) ? body.category : 'unplanned';
    const impactLevel = typeof body.impactLevel === 'string' && VALID_IMPACT_LEVELS.has(body.impactLevel) ? body.impactLevel : 'medium';
    const start = parseDate(body.downtimeStart, new Date());
    const end = parseDate(body.downtimeEnd);
    if (!start) return NextResponse.json({ success: false, error: 'Invalid downtime start' }, { status: 400 });
    if (body.downtimeEnd && !end) return NextResponse.json({ success: false, error: 'Invalid downtime end' }, { status: 400 });
    if (end && end < start) return NextResponse.json({ success: false, error: 'Downtime end cannot be before start' }, { status: 400 });

    const rawLoss = body.productionLoss == null || body.productionLoss === '' ? null : Number(body.productionLoss);
    if (rawLoss != null && (!Number.isFinite(rawLoss) || rawLoss < 0)) {
      return NextResponse.json({ success: false, error: 'productionLoss must be a non-negative number' }, { status: 400 });
    }

    if (!end) {
      const existingOngoing = await db.workOrderDowntime.findFirst({
        where: { workOrderId: id, downtimeEnd: null },
        select: { id: true, downtimeStart: true },
      });
      if (existingOngoing) {
        return NextResponse.json({
          success: false,
          error: 'An ongoing downtime record already exists for this work order. End it before starting another.',
          data: { recordId: existingOngoing.id, downtimeStart: existingOngoing.downtimeStart },
        }, { status: 409 });
      }
    }

    const record = await db.$transaction(async (tx) => {
      const created = await tx.workOrderDowntime.create({
        data: {
          workOrderId: id,
          assetId: auth.wo.assetId,
          assetName: auth.wo.assetName || 'Unspecified asset',
          downtimeStart: start,
          downtimeEnd: end,
          durationMinutes: durationMinutes(start, end),
          reason,
          category,
          impactLevel,
          productionLoss: rawLoss,
          notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null,
          plantId: auth.wo.plantId,
          createdById: auth.session.userId,
        },
        include: { createdBy: { select: { id: true, fullName: true, username: true } } },
      });

      await tx.auditLog.create({
        data: buildAuditData('create', 'wo_downtime', created.id, auth.session.userId, undefined, {
          workOrderId: id,
          downtimeStart: start.toISOString(),
          downtimeEnd: end?.toISOString() || null,
          durationMinutes: created.durationMinutes,
          reason,
          category,
          impactLevel,
          productionLoss: rawLoss,
        }),
      });
      return created;
    });

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create work-order downtime';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorizeWrite(request, id);
    if (!auth.ok) return auth.response;

    const body = await request.json() as Record<string, unknown>;
    const recordId = typeof body.recordId === 'string' ? body.recordId : '';
    if (!recordId) return NextResponse.json({ success: false, error: 'recordId is required' }, { status: 400 });

    const existing = await db.workOrderDowntime.findFirst({ where: { id: recordId, workOrderId: id } });
    if (!existing) return NextResponse.json({ success: false, error: 'Downtime record not found' }, { status: 404 });
    if (existing.downtimeEnd) return NextResponse.json({ success: false, error: 'Downtime record is already ended' }, { status: 409 });

    const end = parseDate(body.downtimeEnd, new Date());
    if (!end) return NextResponse.json({ success: false, error: 'Invalid downtime end' }, { status: 400 });
    if (end < existing.downtimeStart) return NextResponse.json({ success: false, error: 'Downtime end cannot be before start' }, { status: 400 });

    const updated = await db.$transaction(async (tx) => {
      const row = await tx.workOrderDowntime.update({
        where: { id: recordId },
        data: {
          downtimeEnd: end,
          durationMinutes: durationMinutes(existing.downtimeStart, end),
          ...(typeof body.notes === 'string' ? { notes: body.notes.trim() || existing.notes } : {}),
        },
        include: { createdBy: { select: { id: true, fullName: true, username: true } } },
      });
      await tx.auditLog.create({
        data: buildAuditData('update', 'wo_downtime', recordId, auth.session.userId,
          { downtimeEnd: null, durationMinutes: existing.durationMinutes },
          { downtimeEnd: end.toISOString(), durationMinutes: row.durationMinutes, workOrderId: id }),
      });
      return row;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to close work-order downtime';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
