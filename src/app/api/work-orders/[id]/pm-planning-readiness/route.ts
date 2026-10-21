import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { authorizeWorkOrderExecutionAccess } from '@/lib/plant-auth-helpers';
import { getUnavailableOperationalModules } from '@/lib/module-access.server';
import { buildPmPlanningReadiness } from '@/services/pm/planningReadiness.service';

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
    const access = await authorizeWorkOrderExecutionAccess(request, session, id);
    if (!access.ok) return access.response;

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        pmScheduleId: true,
        plannerId: true,
        assignedTo: true,
        assignedSupervisorId: true,
        departmentId: true,
        suggestedParts: true,
        suggestedTools: true,
        taskExecutions: {
          orderBy: { taskNumber: 'asc' },
          select: { requiredParts: true, estimatedMinutes: true },
        },
        pmSchedule: {
          select: {
            id: true,
            title: true,
            template: {
              select: {
                id: true,
                title: true,
                requiredSkills: true,
                requiredTools: true,
              },
            },
          },
        },
      },
    });

    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }
    if (!wo.pmScheduleId || !wo.pmSchedule) {
      return NextResponse.json({ success: false, error: 'Work order is not linked to a PM schedule' }, { status: 400 });
    }

    const unavailableModules = new Set(
      await getUnavailableOperationalModules(['repairs', 'inventory', 'tools']),
    );
    const repairsOperational = !unavailableModules.has('repairs');

    const readiness = buildPmPlanningReadiness({
      plannerId: wo.plannerId,
      assignedTo: wo.assignedTo,
      assignedSupervisorId: wo.assignedSupervisorId,
      departmentId: wo.departmentId,
      repairsOperational,
      requiredSkills: wo.pmSchedule.template?.requiredSkills || null,
      requiredTools: wo.pmSchedule.template?.requiredTools || null,
      suggestedParts: wo.suggestedParts,
      suggestedTools: wo.suggestedTools,
      tasks: wo.taskExecutions,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...readiness,
        schedule: {
          id: wo.pmSchedule.id,
          title: wo.pmSchedule.title,
          templateId: wo.pmSchedule.template?.id || null,
          templateTitle: wo.pmSchedule.template?.title || null,
        },
        modules: {
          repairs: repairsOperational,
          inventory: !unavailableModules.has('inventory'),
          tools: !unavailableModules.has('tools'),
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load PM planning readiness';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
