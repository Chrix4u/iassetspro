import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { sameSheetScope, paperSheetProgress, isRecordablePaperPoint } from '@/lib/pm-paper-worksheet-issue';
import { plannedPaperInspectionScope, type InspectionTaskPointLink } from '@/lib/pm-task-point-scope';

const select = { id: true, requestKey: true, reference: true, assetId: true, plantId: true,
  machineCode: true, equipmentState: true, issuedById: true, issuedAt: true,
  taskIds: true, pointIds: true, taskPointSnapshot: true } as const;
function allowed(session: NonNullable<ReturnType<typeof getSession>>) {
  return isAdmin(session) || ['pm_schedules.view','pm_schedules.create','pm_schedules.update',
    'work_orders.view','work_orders.view_own','digital_twin.view'].some((p) => hasPermission(session,p));
}
function validState(s: unknown): s is 'running' | 'standstill' {
  return s === 'running' || s === 'standstill';
}
function parseIds(value: unknown, max: number): string[] | null {
  return Array.isArray(value) && value.length <= max && value.every((v) =>
    typeof v === 'string' && v.length > 0 && v.length <= 120) ?
    Array.from(new Set(value as string[])) : null;
}
function parseTaskPointPairs(value: unknown): InspectionTaskPointLink[] | null {
  if (value === undefined) return null; // older clients remain supported for unambiguous single-task parts
  if (!Array.isArray(value) || value.length > 6000
    || !value.every((pair) => pair && typeof pair === 'object'
      && typeof pair.pmTaskId === 'string' && pair.pmTaskId.length > 0 && pair.pmTaskId.length <= 120
      && typeof pair.inspectionPointId === 'string' && pair.inspectionPointId.length > 0
      && pair.inspectionPointId.length <= 120)) return null;
  const pairs = value as InspectionTaskPointLink[];
  if (new Set(pairs.map((pair) => pair.pmTaskId + ':' + pair.inspectionPointId)).size !== pairs.length) return null;
  return pairs;
}
function sameTaskPointPairs(a: readonly InspectionTaskPointLink[], b: readonly InspectionTaskPointLink[]): boolean {
  return sameSheetScope(a.map((p) => p.pmTaskId + ':' + p.inspectionPointId),
    b.map((p) => p.pmTaskId + ':' + p.inspectionPointId));
}

async function getMachine(request: NextRequest, assetId: string) {
  const session = getSession(request)!;
  const scope = await getPlantScope(request, session);
  if (scope.denyAccess) return { error: 'Plant access denied', status: 403 } as const;
  const asset = await db.asset.findUnique({
    where: { id: assetId }, select: { id: true, plantId: true, assetTag: true },
  });
  if (!asset) return { error: 'Machine not found', status: 404 } as const;
  if (!canAccessPlantStrict(scope, asset.plantId))
    return { error: 'Plant access denied', status: 403 } as const;
  return { asset };
}
export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!allowed(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    const body = await request.json() as Record<string,unknown>;
    const assetId = typeof body.assetId === 'string' ? body.assetId.trim() : '';
    const state = body.equipmentState, key = typeof body.requestKey === 'string' ? body.requestKey.trim() : '';
    const tasks = parseIds(body.taskIds,1500), points = parseIds(body.pointIds,3000);
    const requestPairs = parseTaskPointPairs(body.taskPointLinks);
    if (!assetId || assetId.length > 120 || !validState(state)
      || !/^[A-Za-z0-9_-]{8,120}$/.test(key) || !tasks || !points
      || (body.taskPointLinks !== undefined && !requestPairs))
      return NextResponse.json({ success: false, error: 'Invalid worksheet issue request' }, { status: 400 });
    const auth = await getMachine(request,assetId);
    if ('error' in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const asset = auth.asset;
    const prior = await db.pmPaperWorksheetIssue.findUnique({ where: { requestKey: key }, select });
    if (prior) {
      if (prior.assetId !== assetId || prior.equipmentState !== state || prior.issuedById !== session.userId
        || !sameSheetScope(JSON.parse(prior.taskIds),tasks) || !sameSheetScope(JSON.parse(prior.pointIds),points)
        || (requestPairs && !sameTaskPointPairs(
          prior.taskPointSnapshot ? JSON.parse(prior.taskPointSnapshot) : [], requestPairs)))
        return NextResponse.json({ success: false, error: 'Worksheet issue key conflict' }, { status: 409 });
      return NextResponse.json({ success: true, data: prior, duplicate: true });
    }
    const assigned = await db.pmScheduleTask.findMany({
      where: { assetId, isActive: true, activityMode: 'inspection',
        equipmentState: { in: state === 'running' ? ['running'] : ['standstill','stopped'] },
        pmTask: { is: { isActive: true } },
        OR: [{ scheduleId: null },{ schedule: { is: { isActive: true } } }] },
      select: { id: true, pmTaskId: true, componentId: true, component: { select: { assetId: true } } },
      take: 1501,
    });
    if (assigned.length > 1500) return NextResponse.json({
      success: false, error: 'Too many task assignments for one sheet',
    }, { status: 422 });
    const partIds = [...new Set(assigned.flatMap((t) =>
      t.componentId && t.component?.assetId === assetId ? [t.componentId] : []))];
    const allPoints = partIds.length ? await db.componentInspectionPoint.findMany({
      where: { componentId: { in: partIds }, isActive: true },
      select: { id: true, componentId: true, inspectionType: true, parameterKey: true }, take: 3001,
    }) : [];
    if (allPoints.length > 3000) return NextResponse.json({
      success: false, error: 'Too many inspection points for one sheet',
    }, { status: 422 });
    // Keep unconfigured rows visible on the printed page, but exclude
    // unrecordable legacy/missing-parameter checks from completion totals.
    const linkRows = allPoints.length ? await db.pmInspectionTaskPoint.findMany({
      where: { pmTaskId: { in: assigned.map((item) => item.pmTaskId) },
        inspectionPointId: { in: allPoints.map((item) => item.id) } },
      select: { pmTaskId: true, inspectionPointId: true },
    }) : [];
    const validAssignments = assigned.map((task) => ({
      pmTaskId: task.pmTaskId,
      componentId: task.component?.assetId === assetId ? task.componentId : null,
    }));
    const scoped = plannedPaperInspectionScope(validAssignments, allPoints, linkRows);
    if (scoped.missingTaskMappings) return NextResponse.json({
      success: false,
      error: scoped.missingTaskMappings + ' PM task(s) share parts but have no exact check mapping. Configure task/check associations before printing.',
    }, { status: 422 });
    const recordableSet = new Set(allPoints.filter(isRecordablePaperPoint).map((point) => point.id));
    const verifiedPairs = scoped.pairs.filter((pair) => recordableSet.has(pair.inspectionPointId));
    const recordablePointIds = [...new Set(verifiedPairs.map((pair) => pair.inspectionPointId))];
    // A task-association change can preserve the union of points. Check
    // the task/point pairs as well, not only the unique point IDs.
    const hasSharedPart = new Set(validAssignments.filter((a) => a.componentId).map((a) => a.componentId)).size
      < validAssignments.filter((a) => a.componentId).length;
    if ((hasSharedPart && !requestPairs) || (requestPairs && !sameTaskPointPairs(verifiedPairs, requestPairs))) {
      return NextResponse.json({ success: false,
        error: 'Task/check associations changed or were not supplied; refresh the machine sheet before issuing.',
      }, { status: 409 });
    }
    if (!sameSheetScope(assigned.map(t=>t.id),tasks) || !sameSheetScope(recordablePointIds,points))
      return NextResponse.json({
        success: false, error: 'Checklist was updated; refresh before printing a new sheet',
      }, { status: 409 });
    const machine = asset.assetTag.replace(/[^a-zA-Z0-9]/g,'').toUpperCase().slice(0,18) || 'ASSET';
    const date = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const reference = `IW-${machine}-${date}-${randomBytes(5).toString('hex').toUpperCase()}`;
    const issued = await db.$transaction(async(tx) => {
      const item = await tx.pmPaperWorksheetIssue.create({
        data: { reference, requestKey: key, assetId, plantId: asset.plantId,
          machineCode: asset.assetTag, equipmentState: state, issuedById: session.userId,
          taskIds: JSON.stringify(tasks), pointIds: JSON.stringify(points),
          taskPointSnapshot: JSON.stringify(verifiedPairs) }, select,
      });
      await tx.auditLog.create({ data: {
        userId: session.userId, action: 'create', entityType: 'pm_paper_worksheet_issue',
        entityId: item.id, plantId: asset.plantId,
        newValues: JSON.stringify({ reference, assetId, equipmentState: state,
          taskCount: tasks.length, pointCount: points.length, taskPointPairs: verifiedPairs }),
      } });
      return item;
    });
    return NextResponse.json({ success: true, data: issued },{status:201});
  } catch(error) {
    return NextResponse.json({ success:false, error:error instanceof Error ? error.message : 'Cannot issue worksheet' },{status:500});
  }
}
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success:false,error:'Not authenticated' },{status:401});
    if (!allowed(session)) return NextResponse.json({success:false,error:'Insufficient permissions'},{status:403});
    const q = new URL(request.url).searchParams;
    const assetId = q.get('assetId')?.trim() || '', state = q.get('equipmentState');
    if (!assetId || assetId.length > 120 || !validState(state)) return NextResponse.json({
      success:false,error:'Choose machine and inspection state',
    },{status:400});
    const auth = await getMachine(request,assetId);
    if ('error' in auth) return NextResponse.json({ success:false,error:auth.error },{status:auth.status});
    const items = await db.pmPaperWorksheetIssue.findMany({
      where: { assetId, equipmentState: state }, orderBy: [{issuedAt:'desc'},{id:'desc'}],
      take:25, select,
    });
    const saved = items.length ? await db.componentInspectionRecord.findMany({
      where: { paperReference: { in: items.map(i=>i.reference) },
        captureSource:'paper', component: { assetId } },
      select:{paperReference:true,inspectionPointId:true},
    }) : [];
    const matched = new Map<string,Set<string>>();
    for (const rec of saved) {
      if (!rec.paperReference) continue;
      if (!matched.has(rec.paperReference)) matched.set(rec.paperReference,new Set());
      matched.get(rec.paperReference)!.add(rec.inspectionPointId);
    }
    return NextResponse.json({
      success:true,data:items.map(i=>({
        reference:i.reference,issuedAt:i.issuedAt,issuedById:i.issuedById,
        taskPointSnapshot: i.taskPointSnapshot ? JSON.parse(i.taskPointSnapshot) : null,
        ...paperSheetProgress(JSON.parse(i.pointIds),matched.get(i.reference)||new Set<string>()),
      })),
    });
  } catch(error) {
    return NextResponse.json({success:false,error:error instanceof Error?error.message:'Unable to list worksheets'},{status:500});
  }
}
