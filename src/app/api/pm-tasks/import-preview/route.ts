import { NextRequest, NextResponse } from 'next/server';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope } from '@/lib/plant-scope';
import { PM_TASK_IMPORT_MAX_BYTES, buildPmTaskImportPreview, parsePmTaskWorkbook } from '@/services/pm/pmTaskImport.service';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const session = getSession(request); if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'pm_tasks.import') && !isAdmin(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    const plantScope = await getPlantScope(request, session); if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    if (!plantScope.plantId) return NextResponse.json({ success: false, error: 'Select a plant before importing PM tasks' }, { status: 400 });
    const formData = await request.formData(); const file = formData.get('file');
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: 'Excel workbook file is required' }, { status: 400 });
    if (file.size <= 0 || file.size > PM_TASK_IMPORT_MAX_BYTES) return NextResponse.json({ success: false, error: 'Workbook must be between 1 byte and 10 MB' }, { status: 400 });
    const parsed = parsePmTaskWorkbook(Buffer.from(await file.arrayBuffer()), file.name); const preview = await buildPmTaskImportPreview({ parsed, plantId: plantScope.plantId });
    if (preview.structuralErrors.length > 0) return NextResponse.json({ success: false, error: 'Workbook structure is invalid', data: preview, structuralErrors: preview.structuralErrors }, { status: 400 });
    return NextResponse.json({ success: true, data: preview });
  } catch (error: unknown) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to preview PM task import' }, { status: 500 }); }
}
