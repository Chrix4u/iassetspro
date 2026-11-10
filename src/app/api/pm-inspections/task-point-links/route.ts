import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { validateInspectionTaskPointSelection } from '@/lib/pm-explicit-inspection-task-points';

type Session = NonNullable<ReturnType<typeof getSession>>;
const mayRead = (s: Session) => isAdmin(s)
  || ['pm_schedules.view', 'pm_schedules.create', 'pm_schedules.update'].some((p) => hasPermission(s, p));
const mayEdit = (s: Session) => isAdmin(s)
  || hasPermission(s, 'pm_schedules.create') || hasPermission(s, 'pm_schedules.update');

async function authorize(request: NextRequest, componentId: string) {
  const session = getSession(request);
  if (!session) return { error: 'Not authenticated', status: 401 } as const;
  if (!mayRead(session)) return { error: 'PM planning permission required', status: 403 } as const;
  const scope = await getPlantScope(request, session);
  if (scope.denyAccess) return { error: 'Plant access denied', status: 403 } as const;
  const part = await db.componentRegistry.findUnique({
    where: { id: componentId },
    select: { id: true, assetId: true, asset: { select: { id: true, plantId: true } } },
  });
  if (!part?.asset || part.assetId !== part.asset.id)
    return { error: 'Registered machine part not found', status: 404 } as const;
  if (!canAccessPlantStrict(scope, part.asset.plantId))
    return { error: 'Plant access denied', status: 403 } as const;
  return { session, part } as const;
}

async function activePartTasks(componentId: string, assetId: string, plantId: string) {
  return db.pmScheduleTask.findMany({
    where: {
      componentId, assetId, isActive: true, activityMode: 'inspection',
      pmTask: { is: { isActive: true, plantId } },
      OR: [{ scheduleId: null }, { schedule: { is: { isActive: true } } }],
    },
    select: { pmTaskId: true, pmTask: { select: { id: true, taskNumber: true, description: true } } },
    take: 1501,
  });
}

/** Read the exact PM-task/checkpoint association for a registered machine part. */
export async function GET(request: NextRequest) {
  try {
    const componentId = new URL(request.url).searchParams.get('componentId')?.trim() || '';
    if (!componentId || componentId.length > 120)
      return NextResponse.json({ success: false, error: 'Select a registered machine part' }, { status: 400 });
    const auth = await authorize(request, componentId);
    if ('error' in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const { part } = auth;
    const [assignments, points] = await Promise.all([
      activePartTasks(componentId, part.asset.id, part.asset.plantId),
      db.componentInspectionPoint.findMany({
        where: { componentId, isActive: true },
        select: { id: true, name: true, inspectionType: true, parameterKey: true, normalRange: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], take: 3001,
      }),
    ]);
    if (assignments.length > 1500 || points.length > 3000)
      return NextResponse.json({ success: false, error: 'Too many tasks or checkpoints for one part' }, { status: 422 });
    const tasks = [...new Map(assignments.map((row) => [row.pmTaskId, row.pmTask])).values()];
    const links = tasks.length && points.length ? await db.pmInspectionTaskPoint.findMany({
      where: { pmTaskId: { in: tasks.map((t) => t.id) },
        inspectionPointId: { in: points.map((p) => p.id) } },
      select: { pmTaskId: true, inspectionPointId: true },
    }) : [];
    return NextResponse.json({ success: true, data: {
      componentId, assetId: part.asset.id, tasks, points, links,
      mappingComplete: tasks.length > 0 && tasks.every((t) => links.some((l) => l.pmTaskId === t.id)),
    } });
  } catch (error) {
    return NextResponse.json({
      success: false, error: error instanceof Error ? error.message : 'Unable to load task/check mapping',
    }, { status: 500 });
  }
}

/** Replace just this PM task's links on this part, preserving other parts and tasks. */
export async function PUT(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!mayEdit(session))
      return NextResponse.json({ success: false, error: 'PM planning edit permission required' }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const componentId = typeof body.componentId === 'string' ? body.componentId.trim() : '';
    const pmTaskId = typeof body.pmTaskId === 'string' ? body.pmTaskId.trim() : '';
    if (!componentId || !pmTaskId || componentId.length > 120 || pmTaskId.length > 120)
      return NextResponse.json({ success: false, error: 'Select the exact PM task and part' }, { status: 400 });
    const auth = await authorize(request, componentId);
    if ('error' in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const { part } = auth;
    const [tasks, points] = await Promise.all([
      activePartTasks(componentId, part.asset.id, part.asset.plantId),
      db.componentInspectionPoint.findMany({
        where: { componentId, isActive: true }, select: { id: true }, take: 3001,
      }),
    ]);
    if (tasks.length > 1500 || points.length > 3000)
      return NextResponse.json({ success: false, error: 'Too many tasks or checkpoints for one part' }, { status: 422 });
    if (!tasks.some((t) => t.pmTaskId === pmTaskId))
      return NextResponse.json({
        success: false, error: 'PM task is not assigned to this machine part in this plant',
      }, { status: 422 });
    const selected = validateInspectionTaskPointSelection(body.pointIds, points.map((p) => p.id));
    if (selected.error) return NextResponse.json({ success: false, error: selected.error }, { status: 422 });
    const pointIds = selected.pointIds;
    const result = await db.$transaction(async (tx) => {
      const prior = await tx.pmInspectionTaskPoint.findMany({
        where: { pmTaskId, inspectionPoint: { componentId } },
        select: { inspectionPointId: true },
      });
      await tx.pmInspectionTaskPoint.deleteMany({ where: { pmTaskId, inspectionPoint: { componentId } } });
      if (pointIds.length) await tx.pmInspectionTaskPoint.createMany({
        data: pointIds.map((inspectionPointId) => ({
          pmTaskId, inspectionPointId, createdById: session.userId,
        })),
      });
      await tx.auditLog.create({ data: {
        userId: session.userId, action: 'update', plantId: part.asset.plantId,
        entityType: 'pm_inspection_task_point_mapping', entityId: pmTaskId,
        oldValues: JSON.stringify({ componentId, pointIds: prior.map((p) => p.inspectionPointId) }),
        newValues: JSON.stringify({ componentId, pointIds }),
      } });
      return { componentId, pmTaskId, pointIds, mappedCount: pointIds.length };
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({
      success: false, error: error instanceof Error ? error.message : 'Unable to save task/check mapping',
    }, { status: 500 });
  }
}
