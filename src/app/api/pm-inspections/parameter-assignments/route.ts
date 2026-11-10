import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { PM_INSPECTION_FREQUENCIES } from '@/lib/pm-inspection';
import {
  actionListExistingKey, actionListLimitJson, parseActionListParameters,
} from '@/lib/pm-action-list-parameters';

type Session = NonNullable<ReturnType<typeof getSession>>;
const mayRead = (s: Session) => isAdmin(s) ||
  ['pm_schedules.view','pm_schedules.create','pm_schedules.update'].some(p => hasPermission(s,p));
const mayWrite = (s: Session) => isAdmin(s) ||
  ['pm_schedules.create','pm_schedules.update'].some(p => hasPermission(s,p));

async function authorizeMachine(request: NextRequest, assetId: string, edit: boolean) {
  const session = getSession(request);
  if (!session) return { error: 'Not authenticated', status: 401 } as const;
  if (!(edit ? mayWrite(session) : mayRead(session))) {
    return { error: 'PM planning permission required', status: 403 } as const;
  }
  const scope = await getPlantScope(request, session);
  if (scope.denyAccess) return { error: 'Plant access denied', status: 403 } as const;
  const asset = await db.asset.findUnique({
    where: { id: assetId }, select: { id: true, name: true, assetTag: true, plantId: true },
  });
  if (!asset) return { error: 'Machine not found', status: 404 } as const;
  if (!canAccessPlantStrict(scope, asset.plantId))
    return { error: 'Plant access denied', status: 403 } as const;
  return { session, asset } as const;
}

/** Paginated machine/part parameter matrix and eligible tasks. Never guess plant ownership. */
export async function GET(request: NextRequest) {
  try {
    const q = new URL(request.url).searchParams;
    const assetId = q.get('assetId')?.trim() || '';
    if (!assetId || assetId.length > 120)
      return NextResponse.json({ success: false, error: 'Select a machine' }, { status: 400 });
    const auth = await authorizeMachine(request, assetId, false);
    if ('error' in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const equipmentState = q.get('equipmentState');
    if (equipmentState !== 'running' && equipmentState !== 'standstill')
      return NextResponse.json({ success: false, error: 'Choose Running or Standstill machine state' }, { status: 400 });
    const page = Math.max(1, Number.parseInt(q.get('page') || '1', 10) || 1);
    const search = q.get('search')?.trim().slice(0, 100) || '';
    const where: Prisma.ComponentRegistryWhereInput = {
      assetId,
      ...(search ? { OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { componentCode: { contains: search, mode: 'insensitive' } },
      ] } : {}),
    };
    const [parts, total, assignments] = await Promise.all([
      db.componentRegistry.findMany({
        where, select: { id: true, name: true, componentCode: true, componentType: true, parentId: true },
        orderBy: [{ componentCode: 'asc' }, { id: 'asc' }], skip: (page - 1) * 100, take: 100,
      }),
      db.componentRegistry.count({ where }),
      db.pmScheduleTask.findMany({
        where: {
          assetId, isActive: true, activityMode: 'inspection',
          equipmentState: { in: equipmentState === 'running' ? ['running'] : ['standstill','stopped'] },
          pmTask: { is: { isActive: true, plantId: auth.asset.plantId } },
          OR: [{ scheduleId: null }, { schedule: { is: { isActive: true } } }],
        },
        select: { componentId: true, pmTaskId: true, pmTask: {
          select: { id: true, taskNumber: true, description: true },
        } }, take: 1501,
      }),
    ]);
    if (assignments.length > 1500)
      return NextResponse.json({ success: false, error: 'Too many active inspection assignments for one machine' }, { status: 422 });
    const configured = parts.length ? await db.componentInspectionPoint.findMany({
      where: { componentId: { in: parts.map(p => p.id) }, isActive: true },
      select: { componentId: true, parameterKey: true, name: true, inspectionType: true, normalRange: true },
      take: 5001,
    }) : [];
    if (configured.length > 5000)
      return NextResponse.json({ success: false, error: 'Too many checkpoints on this page; reduce the part search' }, { status: 422 });
    const tasks = [...new Map(assignments.map(row => [row.pmTaskId, row.pmTask])).values()];
    return NextResponse.json({ success: true, data: {
      machine: auth.asset, parts: parts.map(part => ({
        ...part, parameters: configured.filter(point => point.componentId === part.id),
        taskIds: [...new Set(assignments.filter(row => row.componentId === part.id).map(row => row.pmTaskId))],
      })),
      tasks: tasks.map(task => ({
        ...task,
        assignedPartCount: new Set(assignments.filter(row => row.pmTaskId === task.id).map(row => row.componentId).filter(Boolean)).size,
      })),
      pagination: { page, total, pageCount: Math.ceil(total / 100) },
    } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to load machine parameters' }, { status: 500 });
  }
}

/**
 * Bulk-assign approved parameter definitions to real registered parts and one
 * explicit PM task. No hardcoded thresholds and no silent overwrites.
 * Serializable transaction protects concurrent paper/configuration requests.
 */
export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!mayWrite(session)) return NextResponse.json({ success: false, error: 'PM planning permission required' }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const assetId = typeof body.assetId === 'string' ? body.assetId.trim() : '';
    const pmTaskId = typeof body.pmTaskId === 'string' ? body.pmTaskId.trim() : '';
    const equipmentState = body.equipmentState;
    if (equipmentState !== 'running' && equipmentState !== 'standstill')
      return NextResponse.json({ success: false, error: 'Choose Running or Standstill machine state' }, { status: 400 });
    if (!assetId || !pmTaskId || assetId.length > 120 || pmTaskId.length > 120)
      return NextResponse.json({ success: false, error: 'Select a machine and the exact PM task' }, { status: 400 });
    const ids = body.componentIds;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100 ||
      ids.some(id => typeof id !== 'string' || !id.trim() || id.length > 120) ||
      new Set(ids).size !== ids.length) {
      return NextResponse.json({ success: false, error: 'Select 1 to 100 distinct registered machine parts' }, { status: 400 });
    }
    let parameters;
    try { parameters = parseActionListParameters(body.parameters); }
    catch (error) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Invalid inspection parameters' }, { status: 400 }); }
    if (ids.length * parameters.length > 300)
      return NextResponse.json({ success: false, error: 'Assign at most 300 checkpoints per batch; split large selections' }, { status: 422 });
    const reviseUnused = body.reviseUnused === true;
    const frequency = typeof body.frequency === 'string' ? body.frequency : 'monthly';
    if (!PM_INSPECTION_FREQUENCIES.includes(frequency as typeof PM_INSPECTION_FREQUENCIES[number]))
      return NextResponse.json({ success: false, error: 'Choose a supported calendar checkpoint interval' }, { status: 400 });

    const auth = await authorizeMachine(request, assetId, true);
    if ('error' in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const [parts, assignments] = await Promise.all([
      db.componentRegistry.findMany({
        where: { id: { in: ids as string[] }, assetId },
        select: { id: true, componentCode: true },
      }),
      db.pmScheduleTask.findMany({
        where: {
          assetId, componentId: { in: ids as string[] }, pmTaskId,
          isActive: true, activityMode: 'inspection',
          equipmentState: { in: equipmentState === 'running' ? ['running'] : ['standstill','stopped'] },
          pmTask: { is: { isActive: true, plantId: auth.asset.plantId } },
          OR: [{ scheduleId: null }, { schedule: { is: { isActive: true } } }],
        },
        select: { componentId: true, nextDueDate: true },
      }),
    ]);
    if (parts.length !== ids.length)
      return NextResponse.json({ success: false, error: 'Some selected parts are outside this machine' }, { status: 422 });
    const dueByPart = new Map(assignments.map(row => [row.componentId, row.nextDueDate]));
    if (ids.some(id => !dueByPart.has(id)))
      return NextResponse.json({ success: false,
        error: 'The selected PM task must be actively assigned to every selected part. Choose the matching parts or task.',
      }, { status: 422 });

    const result = await db.$transaction(async tx => {
      const existing = await tx.componentInspectionPoint.findMany({
        where: { componentId: { in: ids as string[] }, isActive: true },
        select: { id: true, componentId: true, name: true, parameterKey: true, inspectionType: true, normalRange: true },
      });
      const byKey = new Map(existing.map(point => [point.componentId + ':' + actionListExistingKey(point), point]));
      const links: { pmTaskId: string; inspectionPointId: string; createdById: string }[] = [];
      const conflicts: string[] = [];
      let created = 0;
      let reused = 0;
      let updated = 0;
      for (const part of parts) {
        for (const parameter of parameters) {
          const key = part.id + ':' + parameter.key;
          const current = byKey.get(key);
          if (current) {
            // Never change an inspection method or a calibrated threshold with
            // existing evidence. A planner may explicitly revise UNUSED limits.
            if (current.inspectionType !== parameter.method) {
              conflicts.push(part.componentCode + ' / ' + parameter.name + ': inspection method differs');
              continue;
            }
            const requestedRange = actionListLimitJson(parameter);
            if (current.normalRange !== requestedRange) {
              const savedReadings = reviseUnused
                ? await tx.componentInspectionRecord.count({ where: { inspectionPointId: current.id } })
                : 1;
              if (savedReadings) {
                conflicts.push(part.componentCode + ' / ' + parameter.name +
                  ': existing approved limits retained (revision requires no saved readings)');
                continue;
              }
              await tx.componentInspectionPoint.update({
                where: { id: current.id },
                data: { normalRange: requestedRange, name: parameter.name,
                  parameterKey: parameter.key },
              });
              await tx.auditLog.create({ data: {
                userId: session.userId, action: 'update', plantId: auth.asset.plantId,
                entityType: 'component_inspection_point', entityId: current.id,
                oldValues: JSON.stringify({ name: current.name, normalRange: current.normalRange }),
                newValues: JSON.stringify({ name: parameter.name, normalRange: requestedRange,
                  reason: 'Planner-approved Action List parameter revision with no saved readings' }),
              } });
              updated++;
            } else {
              reused++;
            }
            links.push({ pmTaskId, inspectionPointId: current.id, createdById: session.userId });
          } else {
            const point = await tx.componentInspectionPoint.create({ data: {
              componentId: part.id, name: parameter.name, inspectionType: parameter.method,
              parameterKey: parameter.key, normalRange: actionListLimitJson(parameter),
              frequency, nextInspection: dueByPart.get(part.id) || null,
            } });
            byKey.set(key, { ...point, name: point.name, parameterKey: point.parameterKey, normalRange: point.normalRange });
            links.push({ pmTaskId, inspectionPointId: point.id, createdById: session.userId });
            created++;
          }
        }
      }
      if (links.length) await tx.pmInspectionTaskPoint.createMany({ data: links, skipDuplicates: true });
      await tx.auditLog.create({ data: {
        userId: session.userId, action: 'create', plantId: auth.asset.plantId,
        entityType: 'pm_action_list_parameter_assignment', entityId: assetId,
        newValues: JSON.stringify({
          assetId, pmTaskId, componentIds: ids, parameters,
          created, reused, updated, conflicts, frequency, reviseUnused,
        }),
      } });
      return { created, reused, updated, conflicted: conflicts.length, conflicts, mapped: links.length };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'P2034') return NextResponse.json({ success: false,
      error: 'Another planner updated these checkpoints. Retry after reloading the Action List parameters.',
    }, { status: 409 });
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to assign parameters' }, { status: 500 });
  }
}
