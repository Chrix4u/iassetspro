import { NextRequest, NextResponse } from 'next/server';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope } from '@/lib/plant-scope';
import { PmTaskBatchValidationError } from '@/lib/pm-task';
import { createPmTaskBatch } from '@/services/pm/pmTask.service';
import { PM_TASK_IMPORT_MAX_ROWS, buildPmTaskImportPreview, type ParsedPmTaskImport } from '@/services/pm/pmTaskImport.service';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const session = getSession(request); if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    const canImport = hasPermission(session, 'pm_tasks.import'); const canCreate = hasPermission(session, 'pm_tasks.create');
    if ((!canImport || !canCreate) && !isAdmin(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    const plantScope = await getPlantScope(request, session); if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    if (!plantScope.plantId) return NextResponse.json({ success: false, error: 'Select a plant before importing PM tasks' }, { status: 400 });
    const body = await request.json(); const filename = typeof body?.filename === 'string' ? body.filename.trim() : '';
    if (!filename || !/\.(xlsx|xls)$/i.test(filename)) return NextResponse.json({ success: false, error: 'A valid .xlsx or .xls filename is required' }, { status: 400 });
    if (!Array.isArray(body?.rows) || body.rows.length === 0) return NextResponse.json({ success: false, error: 'At least one validated PM task row is required' }, { status: 400 });
    if (body.rows.length > PM_TASK_IMPORT_MAX_ROWS) return NextResponse.json({ success: false, error: 'PM task import is limited to 1,000 rows' }, { status: 400 });
    const parsed: ParsedPmTaskImport = { filename, structuralErrors: [], rows: body.rows.map((row: Record<string, unknown>, index: number) => ({
      sourceRow: Number.isInteger(row?.sourceRow) && Number(row.sourceRow) >= 2 ? Number(row.sourceRow) : index + 2,
      description: typeof row?.description === 'string' ? row.description : '', taskType: typeof row?.taskType === 'string' ? row.taskType : '',
    })) };
    const preview = await buildPmTaskImportPreview({ parsed, plantId: plantScope.plantId });
    if (preview.invalidRows > 0 || preview.structuralErrors.length > 0) return NextResponse.json({ success: false, error: 'PM task import contains validation errors', data: preview }, { status: 400 });
    try {
      const created = await createPmTaskBatch({ plantId: plantScope.plantId, userId: session.userId, source: 'import', filename, rows: preview.rows.map((row) => ({ description: row.description, taskType: row.taskType })) });
      return NextResponse.json({ success: true, data: created, count: created.length, warnings: preview.warningCount }, { status: 201 });
    } catch (error: unknown) {
      if (error instanceof PmTaskBatchValidationError) return NextResponse.json({ success: false, error: error.message, rowErrors: error.rowErrors }, { status: 400 });
      throw error;
    }
  } catch (error: unknown) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to import PM tasks' }, { status: 500 }); }
}
