import { NextRequest, NextResponse } from 'next/server';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope } from '@/lib/plant-scope';
import { PM_TASK_TYPES, type PmTaskType } from '@/lib/pm-task';
import {
  convertLegacyPmTemplateTask,
  deactivatePmTemplateTask,
  PmTemplateLastActiveTaskError,
} from '@/services/pm/pmTemplateTaskAssociation.service';

async function requireSelectedPlant(
  request: NextRequest,
  session: NonNullable<ReturnType<typeof getSession>>,
) {
  const plantScope = await getPlantScope(request, session);
  if (plantScope.denyAccess) return { response: NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 }) };
  if (!plantScope.plantId) {
    return { response: NextResponse.json({ success: false, error: 'Select a plant before editing PM template tasks' }, { status: 400 }) };
  }
  return { plantId: plantScope.plantId };
}

function mutationError(error: unknown, fallback: string) {
  if (error instanceof PmTemplateLastActiveTaskError) {
    return NextResponse.json({
      success: false,
      error: `${error.message}. Add a replacement task or reassign/deactivate the schedule first.`,
    }, { status: 409 });
  }
  const message = error instanceof Error ? error.message : fallback;
  if (/does not belong to the selected plant/i.test(message)) {
    return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
  }
  if (/association not found/i.test(message)) return NextResponse.json({ success: false, error: message }, { status: 404 });
  if (/already linked|invalid PM task type|required/i.test(message)) {
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
  return NextResponse.json({ success: false, error: message }, { status: 500 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'pm_templates.update') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    const { id, taskId } = await params;
    const scoped = await requireSelectedPlant(request, session);
    if ('response' in scoped) return scoped.response;
    const body = await request.json();
    const taskType = body?.convertLegacy?.taskType;
    if (typeof taskType !== 'string' || !PM_TASK_TYPES.includes(taskType.toLowerCase() as PmTaskType)) {
      return NextResponse.json({ success: false, error: 'convertLegacy.taskType must be a valid PM Task Type' }, { status: 400 });
    }
    const data = await convertLegacyPmTemplateTask({
      templateId: id,
      associationId: taskId,
      plantId: scoped.plantId,
      userId: session.userId,
      taskType: taskType.toLowerCase() as PmTaskType,
    });
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    return mutationError(error, 'Failed to convert legacy PM template task');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'pm_templates.update') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    const { id, taskId } = await params;
    const scoped = await requireSelectedPlant(request, session);
    if ('response' in scoped) return scoped.response;
    const data = await deactivatePmTemplateTask({
      templateId: id,
      associationId: taskId,
      plantId: scoped.plantId,
      userId: session.userId,
    });
    return NextResponse.json({ success: true, data: { id: data.id } });
  } catch (error: unknown) {
    return mutationError(error, 'Failed to remove PM template task');
  }
}
