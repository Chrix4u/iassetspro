import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantFilterWhere, getPlantScope } from '@/lib/plant-scope';
import { PM_TASK_TYPES, PmTaskBatchValidationError, type PmTaskType } from '@/lib/pm-task';
import { createPmTaskBatch } from '@/services/pm/pmTask.service';
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'pm_tasks.view') && !isAdmin(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim();
    const type = searchParams.get('type')?.trim().toLowerCase();
    const active = searchParams.get('active');
    const where = { ...getPlantFilterWhere(plantScope) } as Prisma.PmTaskWhereInput;
    if (search) {
      const numeric = Number(search.replace(/^#/, ''));
      where.OR = [{ description: { contains: search, mode: 'insensitive' } }, ...(Number.isInteger(numeric) && numeric > 0 ? [{ taskNumber: numeric }] : [])];
    }
    if (type) {
      if (!PM_TASK_TYPES.includes(type as PmTaskType)) return NextResponse.json({ success: false, error: 'Invalid PM task type' }, { status: 400 });
      where.taskType = type;
    }
    if (active !== null) where.isActive = active === 'true';
    const tasks = await db.pmTask.findMany({ where, include: {
      plant: { select: { id: true, name: true, code: true } }, createdBy: { select: { id: true, fullName: true, username: true } },
    }, orderBy: { taskNumber: 'asc' } });
    return NextResponse.json({ success: true, data: tasks });
  } catch (error: unknown) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to load PM tasks' }, { status: 500 }); }
}
export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'pm_tasks.create') && !isAdmin(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    if (!plantScope.plantId) return NextResponse.json({ success: false, error: 'Select a plant before creating PM tasks' }, { status: 400 });
    const body = await request.json();
    try {
      const created = await createPmTaskBatch({ plantId: plantScope.plantId, userId: session.userId, source: 'single', rows: [{ description: body?.description, taskType: body?.taskType }] });
      return NextResponse.json({ success: true, data: created[0] }, { status: 201 });
    } catch (error: unknown) {
      if (error instanceof PmTaskBatchValidationError) return NextResponse.json({ success: false, error: error.message, rowErrors: error.rowErrors }, { status: 400 });
      throw error;
    }
  } catch (error: unknown) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to create PM task' }, { status: 500 }); }
}
