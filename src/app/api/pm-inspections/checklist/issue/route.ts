import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { newIssuedWorksheetReference } from '@/lib/pm-issued-paper-worksheet';

/** Issue a durable, auditable reference for a blank machine checklist.
 * Never records readings, starts a WO or represents that a technician signed it.
 */
export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!isAdmin(session)
      && !hasPermission(session, 'pm_schedules.view')
      && !hasPermission(session, 'pm_schedules.create')
      && !hasPermission(session, 'pm_schedules.update')
      && !hasPermission(session, 'work_orders.view')
      && !hasPermission(session, 'work_orders.view_own')
      && !hasPermission(session, 'digital_twin.view')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }
    const body = await request.json();
    const assetId = typeof body.assetId === 'string' ? body.assetId.trim() : '';
    const equipmentState = body.equipmentState;
    if (!assetId || assetId.length > 120 || !['running', 'standstill'].includes(equipmentState)) {
      return NextResponse.json({ success: false, error: 'Select a machine and Running or Standstill inspection state' }, { status: 400 });
    }
    const scope = await getPlantScope(request, session);
    if (scope.denyAccess) return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    const asset = await db.asset.findUnique({
      where: { id: assetId }, select: { id: true, plantId: true },
    });
    if (!asset) return NextResponse.json({ success: false, error: 'Machine not found' }, { status: 404 });
    if (!canAccessPlantStrict(scope, asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const assignments = await db.pmScheduleTask.findMany({
      where: {
        assetId, isActive: true, activityMode: 'inspection',
        equipmentState: { in: equipmentState === 'running' ? ['running'] : ['standstill', 'stopped'] },
        pmTask: { is: { isActive: true } },
        OR: [{ scheduleId: null }, { schedule: { is: { isActive: true } } }],
      },
      select: { componentId: true, component: { select: { assetId: true } } },
      take: 1501,
    });
    if (!assignments.length) {
      return NextResponse.json({ success: false, error: 'No active inspection tasks on this machine/state' }, { status: 422 });
    }
    if (assignments.length > 1500) {
      return NextResponse.json({ success: false, error: 'More than 1,500 inspection tasks: split the checklist scope first' }, { status: 422 });
    }
    const componentIds = Array.from(new Set(assignments.flatMap((item) =>
      item.componentId && item.component?.assetId === asset.id ? [item.componentId] : [])));
    const points = componentIds.length ? await db.componentInspectionPoint.findMany({
      where: { componentId: { in: componentIds }, isActive: true },
      select: { id: true },
    }) : [];
    // All affected point IDs are resolved on the server; the caller cannot
    // invent printed points or authorize a checklist for another asset.
    const pointIds = Array.from(new Set(points.map((point) => point.id))).sort();
    const expected = body.expectedPointIds;
    // A previously loaded browser checklist must not be printed with a new,
    // authoritative issue number if its configured points have changed.
    if (!Array.isArray(expected) || expected.some((id) => typeof id !== 'string')
      || expected.length !== pointIds.length
      || [...expected].sort().some((id, index) => id !== pointIds[index])) {
      return NextResponse.json({
        success: false,
        error: 'The inspection checklist has changed. Refresh before printing a new paper sheet.',
      }, { status: 409 });
    }
    for (let retry = 0; retry < 3; retry += 1) {
      try {
        const issued = await db.$transaction(async (tx) => {
          const record = await tx.pmInspectionWorksheetIssue.create({
            data: {
              reference: newIssuedWorksheetReference(),
              assetId: asset.id, plantId: asset.plantId,
              equipmentState, issuedById: session.userId, pointIds,
            },
          });
          await tx.auditLog.create({
            data: {
              userId: session.userId, action: 'create',
              entityType: 'pm_inspection_worksheet_issue', entityId: record.id,
              plantId: asset.plantId,
              newValues: JSON.stringify({
                reference: record.reference, assetId: asset.id, equipmentState,
                issuedAt: record.issuedAt.toISOString(), pointIds,
              }),
            },
          });
          return record;
        });
        return NextResponse.json({
          success: true,
          data: {
            reference: issued.reference, issuedAt: issued.issuedAt.toISOString(),
            assetId: asset.id, equipmentState, pointCount: pointIds.length,
          },
        }, { status: 201 });
      } catch (error: unknown) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') continue;
        throw error;
      }
    }
    return NextResponse.json({ success: false, error: 'Could not allocate a unique paper worksheet reference' }, { status: 503 });
  } catch (error) {
    console.error('[pm-checklist-issue]', error);
    return NextResponse.json({ success: false, error: 'Could not issue the paper inspection worksheet' }, { status: 500 });
  }
}
