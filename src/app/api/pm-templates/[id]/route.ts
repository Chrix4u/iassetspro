import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';

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
      'estimatedDuration', 'isActive',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const updated = await db.pmTemplate.update({
      where: { id },
      data: updateData,
      include: {
        createdBy: { select: { id: true, fullName: true, username: true } },
        _count: { select: { tasks: true } },
      },
    });

    return NextResponse.json({ success: true, data: updated });
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

    const deactivated = await db.pmTemplate.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true, data: deactivated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to deactivate PM template';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
