import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope } from '@/lib/plant-scope';
import { buildChecklistScopeWhere, validateChecklistTargets } from '@/lib/pm-checklist-scope';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'pm_checklists.view') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const type = searchParams.get('type');
    const active = searchParams.get('active');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));

    const checklistScopeWhere = await buildChecklistScopeWhere(plantScope);
    const filters: Prisma.ChecklistWhereInput[] = [checklistScopeWhere];
    if (active === null) filters.push({ isActive: true });
    else if (active === 'true' || active === 'false') filters.push({ isActive: active === 'true' });
    if (type) filters.push({ type });
    if (search) {
      filters.push({
        OR: [
          { title: { contains: search } },
          { description: { contains: search } },
        ],
      });
    }
    const where: Prisma.ChecklistWhereInput = { AND: filters };

    const [checklists, total, totalCount, activeCount, totalItems] = await Promise.all([
      db.checklist.findMany({
        where,
        include: {
          items: { orderBy: { sortOrder: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.checklist.count({ where }),
      db.checklist.count({ where: checklistScopeWhere }),
      db.checklist.count({ where: { AND: [checklistScopeWhere, { isActive: true }] } }),
      db.checklistItem.count({ where: { checklist: checklistScopeWhere } }),
    ]);

    return NextResponse.json({
      success: true,
      data: checklists,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      kpis: {
        total: totalCount,
        active: activeCount,
        totalItems,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load checklists';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'pm_checklists.create') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const body = await request.json();
    const { title, description, type, frequency, departmentId, assetId, items } = body;

    if (!title) {
      return NextResponse.json({ success: false, error: 'Checklist title is required' }, { status: 400 });
    }
    if (!type) {
      return NextResponse.json({ success: false, error: 'Checklist type is required' }, { status: 400 });
    }
    if (!frequency) {
      return NextResponse.json({ success: false, error: 'Frequency is required' }, { status: 400 });
    }

    const normalizedAssetId = assetId || null;
    const normalizedDepartmentId = departmentId || null;
    const targetValidation = await validateChecklistTargets(
      plantScope,
      normalizedAssetId,
      normalizedDepartmentId,
    );
    if (!targetValidation.ok) {
      return NextResponse.json(
        { success: false, error: targetValidation.error },
        { status: targetValidation.status },
      );
    }

    let parsedItems: string[];
    if (Array.isArray(items)) {
      parsedItems = items.map((item) => String(item).trim()).filter(Boolean);
    } else if (typeof items === 'string') {
      parsedItems = items.split('\n').map((item) => item.trim()).filter(Boolean);
    } else {
      parsedItems = [];
    }

    const checklist = await db.$transaction(async (tx) => {
      const createdChecklist = await tx.checklist.create({
        data: {
          title,
          description: description || null,
          type,
          frequency,
          departmentId: normalizedDepartmentId,
          assetId: normalizedAssetId,
          createdById: session.userId,
          items: {
            create: parsedItems.map((item, index) => ({
              item,
              sortOrder: index,
              isRequired: true,
            })),
          },
        },
        include: {
          items: { orderBy: { sortOrder: 'asc' } },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'create',
          entityType: 'checklist',
          entityId: createdChecklist.id,
          newValues: JSON.stringify({
            title,
            type,
            frequency,
            assetId: normalizedAssetId,
            departmentId: normalizedDepartmentId,
            itemCount: parsedItems.length,
          }),
        },
      });

      return createdChecklist;
    });

    return NextResponse.json({ success: true, data: checklist }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create checklist';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
