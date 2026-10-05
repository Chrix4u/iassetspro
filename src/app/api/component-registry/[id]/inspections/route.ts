import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getComponentPlantAccess } from '@/lib/component-plant-access';
import { createAuditLog } from '@/lib/audit';

function nextInspectionDate(from: Date, frequency: string): Date | null {
  const next = new Date(from);
  switch (frequency) {
    case 'hourly': next.setHours(next.getHours() + 1); return next;
    case 'daily': next.setDate(next.getDate() + 1); return next;
    case 'weekly': next.setDate(next.getDate() + 7); return next;
    case 'monthly': next.setMonth(next.getMonth() + 1); return next;
    case 'quarterly': next.setMonth(next.getMonth() + 3); return next;
    case 'annually': next.setFullYear(next.getFullYear() + 1); return next;
    default: return null;
  }
}

async function authorize(request: NextRequest, session: NonNullable<ReturnType<typeof getSession>>, id: string) {
  const access = await getComponentPlantAccess(request, session, id);
  if (!access.exists) return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
  if (!access.allowed) return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
  return null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'digital_twin.view') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const denied = await authorize(request, session, id);
    if (denied) return denied;

    const inspectionPoints = await db.componentInspectionPoint.findMany({
      where: { componentId: id, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        records: {
          orderBy: { inspectedAt: 'desc' },
          take: 1,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: inspectionPoints.map((point) => ({
        ...point,
        latestRecord: point.records[0] || null,
        records: undefined,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load inspections';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'digital_twin.manage') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const denied = await authorize(request, session, id);
    if (denied) return denied;

    const body = await request.json();
    const inspectionPointId = typeof body.inspectionPointId === 'string' ? body.inspectionPointId : '';
    if (!inspectionPointId) return NextResponse.json({ success: false, error: 'inspectionPointId is required' }, { status: 400 });

    const point = await db.componentInspectionPoint.findFirst({
      where: { id: inspectionPointId, componentId: id, isActive: true },
    });
    if (!point) return NextResponse.json({ success: false, error: 'Inspection point not found for this component' }, { status: 404 });

    const inspectedAt = new Date();
    const result = typeof body.result === 'string' && body.result.trim() ? body.result.trim() : 'pass';
    const record = await db.componentInspectionRecord.create({
      data: {
        inspectionPointId,
        componentId: id,
        value: body.value !== undefined && body.value !== null ? String(body.value) : null,
        result,
        findings: typeof body.findings === 'string' ? body.findings : null,
        recommendation: typeof body.recommendation === 'string' ? body.recommendation : null,
        inspectorId: session.userId,
        inspectedAt,
      },
    });

    await db.componentInspectionPoint.update({
      where: { id: inspectionPointId },
      data: {
        lastInspected: inspectedAt,
        nextInspection: nextInspectionDate(inspectedAt, point.frequency),
      },
    });

    await createAuditLog(session.userId, 'component_inspection_record', 'create', record.id, {
      newValues: { componentId: id, inspectionPointId, value: record.value, result },
    });

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to record inspection result';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
