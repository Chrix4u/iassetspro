import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { analyzePmPlanningConflicts, type PlannedPmWorkOrder } from '@/lib/pm-planning-conflict';

const MAX_WOS = 1500;
const CLOSED = ['completed', 'verified', 'closed', 'cancelled'];
const DAY = 86_400_000;

/** Plant-safe, read-only PM work-order scheduling conflicts.
 * Planning warnings only; work-order authorization remains unchanged.
 */
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!isAdmin(session) && !['pm_schedules.view', 'pm_schedules.update',
      'pm_analytics.view', 'work_orders.view'].some(p=>hasPermission(session,p))) {
      return NextResponse.json({ success: false, error: 'Insufficient planning permission' }, { status: 403 });
    }
    const scope = await getPlantScope(request, session);
    if (scope.denyAccess) return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    const query = new URL(request.url).searchParams;
    const requestedPlantId = query.get('plantId')?.trim() || '';
    if (requestedPlantId && (requestedPlantId.length > 120 || !canAccessPlantStrict(scope, requestedPlantId))) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }
    const days = Number(query.get('windowDays') || 30);
    if (![7,30,90].includes(days)) {
      return NextResponse.json({ success: false, error: 'Window must be 7, 30, or 90 days' }, { status: 400 });
    }
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
    const to = new Date(from.getTime()+days*DAY);
    const plantWhere: Prisma.WorkOrderWhereInput = requestedPlantId
      ? { plantId: requestedPlantId }
      : scope.isSystemWide ? {}
      : { plantId: { in: scope.isScoped && scope.plantId
        ? [scope.plantId] : scope.accessiblePlantIds } };
    const where: Prisma.WorkOrderWhereInput = {
      ...plantWhere,
      status: { notIn: CLOSED },
      AND: [
        { OR: [
          { pmScheduleId: { not: null } },
          { taskExecutions: { some: { pmScheduleTaskId: { not: null } } } },
        ] },
        { OR: [
          { plannedStart: { gte: from, lt: to } },
          { plannedEnd: { gte: from, lt: to } },
          { plannedStart: { lt: from }, plannedEnd: { gte: to } },
        ] },
      ],
    };
    const workOrders = await db.workOrder.findMany({
      where,
      select: {
        id:true,woNumber:true,assetId:true,assetName:true,plantId:true,
        status:true,plannedStart:true,plannedEnd:true,assignedTo:true,teamLeaderId:true,
        taskExecutions: { select: {
          pmScheduleTaskId:true,
          pmScheduleTask: { select: { equipmentState:true } },
        } },
      },
      orderBy: [{ plannedStart:'asc' }, { id:'asc' }],
      take:MAX_WOS+1,
    });
    if(workOrders.length>MAX_WOS){
      return NextResponse.json({success:false,
        error:'More than 1,500 PM work orders match. Choose an authorized plant; conflict results are never silently truncated.'},
        {status:422});
    }
    const rows:PlannedPmWorkOrder[] = workOrders.map((wo)=>({
      id:wo.id,woNumber:wo.woNumber,assetId:wo.assetId,assetName:wo.assetName||'Asset not recorded',
      plantId:wo.plantId||'',status:wo.status,
      plannedStart:wo.plannedStart?.toISOString()||null,plannedEnd:wo.plannedEnd?.toISOString()||null,
      technicianId:wo.assignedTo,teamLeaderId:wo.teamLeaderId,
      equipmentStates:wo.taskExecutions.flatMap((task)=>task.pmScheduleTask?.equipmentState
        ? [task.pmScheduleTask.equipmentState] : []),
    }));
    const result=analyzePmPlanningConflicts(rows,now);
    return NextResponse.json({
      success:true,data:{...result,windowDays:days,from:from.toISOString(),to:to.toISOString()},
    },{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){
    console.error('[PM planned-work conflicts] read-only query failed',error);
    return NextResponse.json({success:false,error:'Could not load PM scheduling conflicts'},{status:500});
  }
}
