import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';

// ============================================================================
// DELETE /api/pm-templates/[id]/tasks/[taskId] — Remove a specific task from future use
// ============================================================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'pm_templates.update') && !isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id, taskId } = await params;

    // Verify template exists
    const template = await db.pmTemplate.findUnique({ where: { id } });
    if (!template) {
      return NextResponse.json(
        { success: false, error: 'PM template not found' },
        { status: 404 }
      );
    }

    // Verify task exists and belongs to the template
    const task = await db.pmTemplateTask.findFirst({
      where: { id: taskId, templateId: id },
    });

    if (!task) {
      return NextResponse.json(
        { success: false, error: 'Task not found in this template' },
        { status: 404 }
      );
    }

    await db.$transaction(async (tx) => {
      await tx.pmTemplateTask.update({
        where: { id: taskId },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'delete',
          entityType: 'pm_template_task',
          entityId: taskId,
          oldValues: JSON.stringify({
            templateId: id,
            taskNumber: task.taskNumber,
            description: task.description,
            taskType: task.taskType,
            requiredParts: task.requiredParts,
            estimatedMinutes: task.estimatedMinutes,
            isActive: task.isActive,
          }),
          newValues: JSON.stringify({ isActive: false }),
        },
      });
    });

    return NextResponse.json({ success: true, data: { id: taskId } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete task';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
