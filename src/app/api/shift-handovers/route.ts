import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope } from '@/lib/plant-scope';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    // ── Phase 3G: Plant scope enforcement ──
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const shiftType = searchParams.get('shiftType');
    const status = searchParams.get('status');
    const workOrderId = searchParams.get('workOrderId');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

    // Build where clause — plant scope applied via linked WO's plantId
    const where: Record<string, unknown> = {};

    // Plant scope: filter handovers by linked work order's plant
    if (!plantScope.isSystemWide) {
      if (plantScope.plantId) {
        where.workOrder = { plantId: plantScope.plantId };
      } else if (plantScope.accessiblePlantIds.length > 0) {
        where.workOrder = { plantId: { in: plantScope.accessiblePlantIds } };
      } else {
        // No plant assignments — deny access
        where.workOrder = { plantId: '__ACCESS_DENIED__' };
      }
    }

    if (workOrderId) where.workOrderId = workOrderId;
    if (shiftType) where.shiftType = shiftType;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { handedOverBy: { fullName: { contains: search } } },
        { receivedBy: { fullName: { contains: search } } },
        { notes: { contains: search } },
        { safetyNotes: { contains: search } },
      ];
    }

    const [handovers, total] = await Promise.all([
      db.shiftHandover.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        include: {
          handedOverBy: { select: { id: true, fullName: true, username: true } },
          receivedBy: { select: { id: true, fullName: true, username: true } },
          workOrder: { select: { id: true, woNumber: true, title: true, plantId: true } },
        },
        orderBy: { shiftDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.shiftHandover.count({
        where: Object.keys(where).length > 0 ? where : undefined,
      }),
    ]);

    // ── Phase 3G: KPI counts also plant-scoped ──
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const kpiWhere: Record<string, unknown> = {};
    if (!plantScope.isSystemWide) {
      if (plantScope.plantId) {
        kpiWhere.workOrder = { plantId: plantScope.plantId };
      } else if (plantScope.accessiblePlantIds.length > 0) {
        kpiWhere.workOrder = { plantId: { in: plantScope.accessiblePlantIds } };
      } else {
        kpiWhere.workOrder = { plantId: '__ACCESS_DENIED__' };
      }
    }

    const [totalCount, todayCount, pendingCount, confirmedCount] = await Promise.all([
      db.shiftHandover.count({ where: Object.keys(kpiWhere).length > 0 ? kpiWhere : undefined }),
      db.shiftHandover.count({ where: { ...kpiWhere, shiftDate: { gte: today, lt: tomorrow } } }),
      db.shiftHandover.count({ where: { ...kpiWhere, status: 'pending' } }),
      db.shiftHandover.count({ where: { ...kpiWhere, status: 'confirmed' } }),
    ]);

    return NextResponse.json({
      success: true,
      data: handovers,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      kpis: {
        total: totalCount,
        today: todayCount,
        pending: pendingCount,
        confirmed: confirmedCount,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load shift handovers';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'shift_handovers.create') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    // ── Phase 3G: Plant scope check for create ──
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const { shiftType, shiftDate, fromShift, toShift, departmentId, receivedById, tasksSummary, pendingIssues, safetyNotes, equipmentStatus, notes, workOrderId } = body;

    // Operational work-order handovers must use the canonical work-order route.
    // That route validates the receiver, closes active labor sessions, performs
    // the state transition, creates the handover and writes audit/idempotency
    // evidence atomically. Allowing a linked record here creates a shadow
    // handover that bypasses those invariants.
    if (workOrderId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Work-order handovers must be initiated through /api/work-orders/[id]/handover',
        },
        { status: 400 },
      );
    }

    if (!shiftType) {
      return NextResponse.json({ success: false, error: 'Shift type is required' }, { status: 400 });
    }

    // Parse structured fields as JSON
    let parsedTasks: string | null = null;
    let parsedIssues: string | null = null;
    let parsedEquipment: string | null = null;

    if (tasksSummary) {
      parsedTasks = typeof tasksSummary === 'string'
        ? JSON.stringify([{ task: tasksSummary }])
        : JSON.stringify(tasksSummary);
    }
    if (pendingIssues) {
      parsedIssues = typeof pendingIssues === 'string'
        ? JSON.stringify([{ issue: pendingIssues }])
        : JSON.stringify(pendingIssues);
    }
    if (equipmentStatus) {
      parsedEquipment = typeof equipmentStatus === 'string'
        ? JSON.stringify([{ status: equipmentStatus }])
        : JSON.stringify(equipmentStatus);
    }

    const handover = await db.shiftHandover.create({
      data: {
        shiftDate: shiftDate ? new Date(shiftDate) : new Date(),
        shiftType: shiftType.toLowerCase(),
        fromShift: fromShift || null,
        toShift: toShift || null,
        departmentId: departmentId || null,
        handedOverById: session.userId,
        receivedById: receivedById || null,
        tasksSummary: parsedTasks || JSON.stringify([]),
        pendingIssues: parsedIssues || JSON.stringify([]),
        safetyNotes: safetyNotes || null,
        equipmentStatus: parsedEquipment || null,
        notes: notes || null,
        workOrderId: null,
      },
      include: {
        workOrder: { select: { id: true, woNumber: true, title: true, plantId: true } },
        handedOverBy: { select: { id: true, fullName: true, username: true } },
        receivedBy: { select: { id: true, fullName: true, username: true } },
      },
    });

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'create',
        entityType: 'shift_handover',
        entityId: handover.id,
        newValues: JSON.stringify({ shiftType, shiftDate: handover.shiftDate }),
      },
    });

    return NextResponse.json({ success: true, data: handover }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create shift handover';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
