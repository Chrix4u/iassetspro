import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';

// ============================================================================
// POST /api/pm-templates/[id]/tasks — Add a task to a template
// ============================================================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'pm_templates.update') && !isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { description, taskType, requiredParts, estimatedMinutes, taskNumber } = body;

    if (!description || !taskType) {
      return NextResponse.json(
        { success: false, error: 'Description and task type are required' },
        { status: 400 }
      );
    }

    const requestedNumber = taskNumber !== undefined ? Number(taskNumber) : null;
    if (requestedNumber !== null && (!Number.isInteger(requestedNumber) || requestedNumber <= 0)) {
      return NextResponse.json(
        { success: false, error: 'Task number must be a positive integer' },
        { status: 400 },
      );
    }

    const result = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        `iassetspro:pm-template-task-order:${id}`,
      );

      const template = await tx.pmTemplate.findUnique({ where: { id }, select: { id: true } });
      if (!template) return { kind: 'missing' as const };

      let nextNumber = requestedNumber;
      if (nextNumber === null) {
        const maxTask = await tx.pmTemplateTask.findFirst({
          where: { templateId: id },
          orderBy: { taskNumber: 'desc' },
          select: { taskNumber: true },
        });
        nextNumber = (maxTask?.taskNumber ?? 0) + 1;
      } else {
        const collision = await tx.pmTemplateTask.findFirst({
          where: { templateId: id, taskNumber: nextNumber, isActive: true },
          select: { id: true },
        });
        if (collision) return { kind: 'duplicate' as const };
      }

      const task = await tx.pmTemplateTask.create({
        data: {
          templateId: id,
          taskNumber: nextNumber,
          description,
          taskType,
          requiredParts: requiredParts ? JSON.stringify(requiredParts) : null,
          estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : null,
          sortOrder: nextNumber,
        },
      });
      return { kind: 'created' as const, task };
    });

    if (result.kind === 'missing') {
      return NextResponse.json({ success: false, error: 'PM template not found' }, { status: 404 });
    }
    if (result.kind === 'duplicate') {
      return NextResponse.json({ success: false, error: 'Task number already exists in this template' }, { status: 409 });
    }

    return NextResponse.json({ success: true, data: result.task }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to add task';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// ============================================================================
// PUT /api/pm-templates/[id]/tasks — Reorder tasks
// Body: { taskIds: string[] } — new ordered list of task IDs
// ============================================================================
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'pm_templates.update') && !isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { taskIds } = body;

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'taskIds array is required' },
        { status: 400 }
      );
    }

    const template = await db.pmTemplate.findUnique({ where: { id }, select: { id: true } });
    if (!template) {
      return NextResponse.json(
        { success: false, error: 'PM template not found' },
        { status: 404 },
      );
    }

    const normalizedTaskIds = taskIds.map((taskId: unknown) => String(taskId));
    const uniqueTaskIds = new Set(normalizedTaskIds);
    if (uniqueTaskIds.size !== normalizedTaskIds.length) {
      return NextResponse.json(
        { success: false, error: 'taskIds must not contain duplicates' },
        { status: 400 },
      );
    }

    const activeTasks = await db.pmTemplateTask.findMany({
      where: { templateId: id, isActive: true },
      select: { id: true },
    });
    const activeTaskIds = new Set(activeTasks.map((task) => task.id));
    const isExactTaskSet =
      activeTasks.length === normalizedTaskIds.length
      && normalizedTaskIds.every((taskId) => activeTaskIds.has(taskId));
    if (!isExactTaskSet) {
      return NextResponse.json(
        { success: false, error: 'Every active task must belong to this template before reordering' },
        { status: 400 },
      );
    }

    await db.$transaction(
      normalizedTaskIds.map((taskId, index) =>
        db.pmTemplateTask.updateMany({
          where: { id: taskId, templateId: id, isActive: true },
          data: {
            taskNumber: index + 1,
            sortOrder: index + 1,
          },
        }),
      ),
    );

    const updatedTasks = await db.pmTemplateTask.findMany({
      where: { templateId: id, isActive: true },
      orderBy: { taskNumber: 'asc' },
    });

    return NextResponse.json({ success: true, data: updatedTasks });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to reorder tasks';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
