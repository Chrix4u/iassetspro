import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { lockPmTemplateLifecycle } from '@/services/pm/templateLifecycle.service';

// ============================================================================
// GET /api/pm-templates/[id] — Get single template with tasks
// ============================================================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'pm_templates.view') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;

    const template = await db.pmTemplate.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, fullName: true, username: true } },
        tasks: {
          where: { isActive: true },
          orderBy: { taskNumber: 'asc' },
        },
        _count: {
          select: { schedules: true },
        },
      },
    });

    if (!template) {
      return NextResponse.json(
        { success: false, error: 'PM template not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: template });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load PM template';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// ============================================================================
// PUT /api/pm-templates/[id] — Update template
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

    const existing = await db.pmTemplate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'PM template not found' },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      'title', 'description', 'type', 'category', 'priority',
      'estimatedDuration', 'isActive', 'requiredSkills', 'requiredTools',
    ];

    for (const field of allowedFields) {
      if (body[field] === undefined) continue;
      if (field === 'estimatedDuration') {
        const normalizedDuration = Number(body[field]);
        if (!Number.isFinite(normalizedDuration) || normalizedDuration <= 0) {
          return NextResponse.json(
            { success: false, error: 'Estimated duration must be a positive number of hours' },
            { status: 400 },
          );
        }
        updateData[field] = normalizedDuration;
      } else if (field === 'requiredSkills' || field === 'requiredTools') {
        const value = body[field];
        if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
          return NextResponse.json(
            { success: false, error: `${field} must be an array of strings` },
            { status: 400 },
          );
        }
        updateData[field] = value.length > 0 ? JSON.stringify(value) : null;
      } else {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      if (body.isActive === false) {
        await lockPmTemplateLifecycle(tx, id);
        const activeSchedule = await tx.pmSchedule.findFirst({
          where: { templateId: id, isActive: true },
          select: { id: true, title: true },
        });
        if (activeSchedule) {
          return { kind: 'in_use' as const, activeSchedule };
        }
      }

      const updatedTemplate = await tx.pmTemplate.update({
        where: { id },
        data: updateData,
        include: {
          createdBy: { select: { id: true, fullName: true, username: true } },
          _count: { select: { tasks: { where: { isActive: true } } } },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'update',
          entityType: 'pm_template',
          entityId: id,
          oldValues: JSON.stringify({
            title: existing.title,
            description: existing.description,
            type: existing.type,
            category: existing.category,
            estimatedDuration: existing.estimatedDuration,
            priority: existing.priority,
            requiredSkills: existing.requiredSkills,
            requiredTools: existing.requiredTools,
            isActive: existing.isActive,
          }),
          newValues: JSON.stringify(updateData),
        },
      });

      return { kind: 'updated' as const, updatedTemplate };
    });

    if (result.kind === 'in_use') {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot deactivate this PM template while active PM schedule "${result.activeSchedule.title}" uses it. Reassign or deactivate that schedule first.`,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ success: true, data: result.updatedTemplate });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update PM template';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// ============================================================================
// DELETE /api/pm-templates/[id] — Soft delete template (isActive=false)
// ============================================================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'pm_templates.delete') && !isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    const existing = await db.pmTemplate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'PM template not found' },
        { status: 404 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      await lockPmTemplateLifecycle(tx, id);
      const activeSchedule = await tx.pmSchedule.findFirst({
        where: { templateId: id, isActive: true },
        select: { id: true, title: true },
      });
      if (activeSchedule) {
        return { kind: 'in_use' as const, activeSchedule };
      }

      const deactivatedTemplate = await tx.pmTemplate.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'delete',
          entityType: 'pm_template',
          entityId: id,
          oldValues: JSON.stringify({ title: existing.title, isActive: existing.isActive }),
          newValues: JSON.stringify({ isActive: false }),
        },
      });

      return { kind: 'deactivated' as const, deactivatedTemplate };
    });

    if (result.kind === 'in_use') {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot deactivate this PM template while active PM schedule "${result.activeSchedule.title}" uses it. Reassign or deactivate that schedule first.`,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ success: true, data: result.deactivatedTemplate });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to deactivate PM template';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
