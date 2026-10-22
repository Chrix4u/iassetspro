import { NextRequest, NextResponse } from 'next/server';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { buildPmTaskImportTemplate } from '@/services/pm/pmTaskImport.service';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  if (!hasPermission(session, 'pm_tasks.import') && !isAdmin(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
  const workbook = buildPmTaskImportTemplate();
  return new NextResponse(new Uint8Array(workbook), { status: 200, headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="pm-task-import-template.xlsx"', 'Cache-Control': 'no-store',
  } });
}
