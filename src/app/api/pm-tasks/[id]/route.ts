import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { deactivatePmTask, updatePmTask } from '@/services/pm/pmTask.service';
function isPmTaskInputError(error: unknown): error is Error {
  return error instanceof Error && (error.message.startsWith('Task description') || error.message.startsWith('Task type') || error.message === 'No PM task changes were provided');
}
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'pm_tasks.view') && !isAdmin(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    const { id } = await params;
    const task = await db.pmTask.findUnique({ where: { id }, include: { plant: { select: { id: true, name: true, code: true } }, createdBy: { select: { id: true, fullName: true, username: true } } } });
    if (!task) return NextResponse.json({ success: false, error: 'PM task not found' }, { status: 404 });
    if (!canAccessPlantStrict(plantScope, task.plantId)) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    return NextResponse.json({ success: true, data: task });
  } catch (error: unknown) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to load PM task' }, { status: 500 }); }
}
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'pm_tasks.update') && !isAdmin(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    if (!plantScope.plantId) return NextResponse.json({ success: false, error: 'Select a plant before editing PM tasks' }, { status: 400 });
    const { id } = await params;
    const task = await db.pmTask.findUnique({ where: { id }, select: { id: true, plantId: true } });
    if (!task) return NextResponse.json({ success: false, error: 'PM task not found' }, { status: 404 });
    if (!canAccessPlantStrict(plantScope, task.plantId) || task.plantId !== plantScope.plantId) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    const body = await request.json();
    if (body?.isActive !== undefined && typeof body.isActive !== 'boolean') return NextResponse.json({ success: false, error: 'Task active state must be true or false' }, { status: 400 });
    try {
      const updated = await updatePmTask({ taskId: id, plantId: plantScope.plantId, userId: session.userId, patch: {
        ...(body?.description !== undefined ? { description: body.description } : {}), ...(body?.taskType !== undefined ? { taskType: body.taskType } : {}), ...(body?.isActive !== undefined ? { isActive: body.isActive } : {}),
      } });
      return NextResponse.json({ success: true, data: updated });
    } catch (error: unknown) {
      if (isPmTaskInputError(error)) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      if (error instanceof Error && error.message === 'PM task not found') return NextResponse.json({ success: false, error: error.message }, { status: 404 });
      throw error;
    }
  } catch (error: unknown) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to update PM task' }, { status: 500 }); }
}
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'pm_tasks.delete') && !isAdmin(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    if (!plantScope.plantId) return NextResponse.json({ success: false, error: 'Select a plant before deactivating PM tasks' }, { status: 400 });
    const { id } = await params;
    const task = await db.pmTask.findUnique({ where: { id }, select: { id: true, plantId: true } });
    if (!task) return NextResponse.json({ success: false, error: 'PM task not found' }, { status: 404 });
    if (!canAccessPlantStrict(plantScope, task.plantId) || task.plantId !== plantScope.plantId) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    const updated = await deactivatePmTask({ taskId: id, plantId: plantScope.plantId, userId: session.userId });
    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to deactivate PM task' }, { status: 500 }); }
}
