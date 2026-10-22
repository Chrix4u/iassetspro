import { NextRequest, NextResponse } from 'next/server';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope } from '@/lib/plant-scope';
import { PmTaskBatchValidationError } from '@/lib/pm-task';
import { createPmTaskBatch } from '@/services/pm/pmTask.service';
export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'pm_tasks.create') && !isAdmin(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    if (!plantScope.plantId) return NextResponse.json({ success: false, error: 'Select a plant before creating PM tasks' }, { status: 400 });
    const body = await request.json();
    if (!Array.isArray(body?.rows) || body.rows.length === 0) return NextResponse.json({ success: false, error: 'At least one task row is required' }, { status: 400 });
    try {
      const created = await createPmTaskBatch({ plantId: plantScope.plantId, userId: session.userId, source: 'bulk', rows: body.rows });
      return NextResponse.json({ success: true, data: created, count: created.length }, { status: 201 });
    } catch (error: unknown) {
      if (error instanceof PmTaskBatchValidationError) return NextResponse.json({ success: false, error: error.message, rowErrors: error.rowErrors }, { status: 400 });
      throw error;
    }
  } catch (error: unknown) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to create PM tasks' }, { status: 500 }); }
}
