import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';

const VALID_TASK_TYPES = new Set(['check', 'measure', 'inspect', 'lubricate', 'replace', 'record']);

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

    if (typeof description !== 'string' || !description.trim() || typeof taskType !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Description and task type are required' },
        { status: 400 }
      );
    }
    if (!VALID_TASK_TYPES.has(taskType)) {
      return NextResponse.json({ success: false, error: 'Invalid task type' }, { status: 400 });
    }

    let normalizedEstimatedMinutes: number | null = null;
    if (estimatedMinutes !== undefined && estimatedMinutes !== null && estimatedMinutes !== '') {
      normalizedEstimatedMinutes = Number(estimatedMinutes);
      if (!Number.isInteger(normalizedEstimatedMinutes) || normalizedEstimatedMinutes <= 0) {
        return NextResponse.json(
          { success: false, error: 'Estimated minutes must be a positive whole number' },
          { status: 400 },
        );
      }
    }
    if (requiredParts !== undefined && requiredParts !== null
      && (!Array.isArray(requiredParts) || !requiredParts.every((part) => typeof part === 'string' && part.trim().length > 0))) {
      return NextResponse.json(
        { success: false, error: 'Required parts must be an array of non-empty strings' },
        { status: 400 },
      );
    }
    const normalizedRequiredParts = Array.isArray(requiredParts)
      ? requiredParts.map((part: string) => part.trim())
      : null;

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
          description: description.trim(),
          taskType,
          requiredParts: normalizedRequiredParts && normalizedRequiredParts.length > 0 ? JSON.stringify(normalizedRequiredParts) : null,
          estimatedMinutes: normalizedEstimatedMinutes,
          sortOrder: nextNumber,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'create',
          entityType: 'pm_template_task',
          entityId: task.id,
          newValues: JSON.stringify({
            templateId: id,
            taskNumber: task.taskNumber,
            description: task.description,
            taskType: task.taskType,
            requiredParts: task.requiredParts,
            estimatedMinutes: task.estimatedMinutes,
          }),
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

    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        `iassetspro:pm-template-task-order:${id}`,
      );

      for (const [index, taskId] of normalizedTaskIds.entries()) {
        await tx.pmTemplateTask.updateMany({
          where: { id: taskId, templateId: id, isActive: true },
          data: {
            taskNumber: index + 1,
            sortOrder: index + 1,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'update',
          entityType: 'pm_template_task',
          entityId: id,
          oldValues: JSON.stringify({ order: activeTasks.map((task) => task.id) }),
          newValues: JSON.stringify({ order: normalizedTaskIds }),
        },
      });
    });

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
