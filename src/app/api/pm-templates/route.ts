import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';

// ============================================================================
// GET /api/pm-templates — List all PM templates
// ============================================================================
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'pm_templates.view') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const type = searchParams.get('type');
    const active = searchParams.get('active');

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }

    if (type) {
      where.type = type;
    }

    if (active !== null) {
      where.isActive = active === 'true';
    }

    const templates = await db.pmTemplate.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        createdBy: {
          select: { id: true, fullName: true, username: true },
        },
        _count: {
          select: { tasks: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: templates });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load PM templates';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// ============================================================================
// POST /api/pm-templates — Create a new PM template
// ============================================================================
export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'pm_templates.create') && !isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const {
      title,
      description,
      type,
      category,
      estimatedDuration,
      priority,
      requiredSkills,
      requiredTools,
    } = body;

    if (!title || !estimatedDuration) {
      return NextResponse.json(
        { success: false, error: 'Title and estimated duration are required' },
        { status: 400 }
      );
    }

    const template = await db.pmTemplate.create({
      data: {
        title,
        description: description || null,
        type: type || 'preventive',
        category: category || null,
        estimatedDuration: Number(estimatedDuration),
        priority: priority || 'medium',
        requiredSkills: requiredSkills ? JSON.stringify(requiredSkills) : null,
        requiredTools: requiredTools ? JSON.stringify(requiredTools) : null,
        createdById: session.userId,
      },
      include: {
        createdBy: { select: { id: true, fullName: true, username: true } },
        _count: { select: { tasks: true } },
      },
    });

    return NextResponse.json({ success: true, data: template }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create PM template';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
