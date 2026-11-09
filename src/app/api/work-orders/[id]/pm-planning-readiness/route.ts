import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { authorizeWorkOrderExecutionAccess } from '@/lib/plant-auth-helpers';
import { getUnavailableOperationalModules } from '@/lib/module-access.server';
import { buildPmPlanningReadiness } from '@/services/pm/planningReadiness.service';
import { identifyPmWorkOrderSource } from '@/lib/pm-workorder-provenance';

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
          select: { pmScheduleTaskId: true, requiredParts: true, estimatedMinutes: true },
        },
        repairMaterialRequests: {
          select: {
            itemId: true,
            itemName: true,
            status: true,
            source: true,
          },
        },
        repairToolRequests: {
          select: {
            toolId: true,
            toolName: true,
            status: true,
            source: true,
            items: {
              select: {
                toolId: true,
                toolName: true,
              },
            },
          },
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
    const provenance = identifyPmWorkOrderSource({
      pmScheduleId: wo.pmScheduleId,
      schedule: wo.pmSchedule,
      taskExecutions: wo.taskExecutions,
    });
    if (provenance.kind !== 'valid') {
      return NextResponse.json({ success: false, error: provenance.message }, {
        status: provenance.kind === 'broken_schedule' ? 409 : 400,
      });
    }

    const unavailableModules = new Set(
      await getUnavailableOperationalModules(['repairs', 'inventory', 'tools']),
    );
    const repairsOperational = !unavailableModules.has('repairs');
    const inventoryOperational = !unavailableModules.has('inventory');
    const toolsOperational = !unavailableModules.has('tools');

    const toolRequests = wo.repairToolRequests.flatMap((toolRequest) => {
      const requestItems = toolRequest.items.length > 0
        ? toolRequest.items
        : [{ toolId: toolRequest.toolId, toolName: toolRequest.toolName }];

      return requestItems.map((item) => ({
        toolId: item.toolId,
        toolName: item.toolName || toolRequest.toolName,
        status: toolRequest.status,
        source: toolRequest.source,
      }));
    });

    const readiness = buildPmPlanningReadiness({
      plannerId: wo.plannerId,
      assignedTo: wo.assignedTo,
      assignedSupervisorId: wo.assignedSupervisorId,
      departmentId: wo.departmentId,
      repairsOperational,
      inventoryOperational,
      toolsOperational,
      requiredSkills: wo.pmSchedule?.template?.requiredSkills || null,
      requiredTools: wo.pmSchedule?.template?.requiredTools || null,
      suggestedParts: wo.suggestedParts,
      suggestedTools: wo.suggestedTools,
      materialRequests: wo.repairMaterialRequests,
      toolRequests,
      tasks: wo.taskExecutions,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...readiness,
        schedule: {
          id: wo.pmSchedule?.id || null,
          title: wo.pmSchedule?.title || 'Direct PM assignment',
          templateId: wo.pmSchedule?.template?.id || null,
          templateTitle: wo.pmSchedule?.template?.title || null,
          source: provenance.source,
        },
        provenance: {
          source: provenance.source,
          assignmentCount: wo.taskExecutions.filter((task) => Boolean(task.pmScheduleTaskId)).length,
        },
        modules: {
          repairs: repairsOperational,
          inventory: inventoryOperational,
          tools: toolsOperational,
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load PM planning readiness';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
