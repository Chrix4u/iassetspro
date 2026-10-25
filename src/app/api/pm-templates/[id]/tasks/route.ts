import { NextRequest, NextResponse } from 'next/server';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope } from '@/lib/plant-scope';
import { PmTaskBatchValidationError } from '@/lib/pm-task';
import {
  createAndLinkPmTasks,
  linkPmTasksToTemplate,
  reorderPmTemplateTasks,
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

function requestError(error: unknown, fallback: string) {
  if (error instanceof PmTaskBatchValidationError) {
    return NextResponse.json({ success: false, error: error.message, rowErrors: error.rowErrors }, { status: 400 });
  }
  const message = error instanceof Error ? error.message : fallback;
  if (/does not belong to the selected plant|unavailable, inactive, or not in the same plant/i.test(message)) {
    return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
  }
  if (/not found/i.test(message)) return NextResponse.json({ success: false, error: message }, { status: 404 });
  if (/required|duplicate|exact set|active template association|Task Master/i.test(message)) {
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
  return NextResponse.json({ success: false, error: message }, { status: 500 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'pm_templates.update') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    const { id } = await params;
    const scoped = await requireSelectedPlant(request, session);
    if ('response' in scoped) return scoped.response;
    const body = await request.json();
    const hasTaskIds = Array.isArray(body?.taskIds);
    const hasNewTasks = Array.isArray(body?.newTasks);
    if (hasTaskIds === hasNewTasks) {
      return NextResponse.json({ success: false, error: 'Provide exactly one of taskIds or newTasks' }, { status: 400 });
    }

    const data = hasTaskIds
      ? await linkPmTasksToTemplate({
          templateId: id,
          plantId: scoped.plantId,
          userId: session.userId,
          pmTaskIds: body.taskIds,
        })
      : await createAndLinkPmTasks({
          templateId: id,
          plantId: scoped.plantId,
          userId: session.userId,
          rows: body.newTasks,
        });

    return NextResponse.json({ success: true, data, count: data.length }, { status: 201 });
  } catch (error: unknown) {
    return requestError(error, 'Failed to add PM template tasks');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'pm_templates.update') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    const { id } = await params;
    const scoped = await requireSelectedPlant(request, session);
    if ('response' in scoped) return scoped.response;
    const body = await request.json();
    if (!Array.isArray(body?.associationIds) || body.associationIds.length === 0) {
      return NextResponse.json({ success: false, error: 'associationIds array is required' }, { status: 400 });
    }
    const associationIds = await reorderPmTemplateTasks({
      templateId: id,
      plantId: scoped.plantId,
      userId: session.userId,
      associationIds: body.associationIds,
    });
    return NextResponse.json({ success: true, data: { associationIds } });
  } catch (error: unknown) {
    return requestError(error, 'Failed to reorder PM template tasks');
  }
}
