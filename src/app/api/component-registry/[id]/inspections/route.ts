import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getComponentPlantAccess } from '@/lib/component-plant-access';
import { POST as recordPmInspection } from '@/app/api/pm-inspections/[pointId]/records/route';

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

/** Legacy Digital Twin recording endpoint delegates to the same canonical PM inspection lifecycle. */
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
    const inspectionPointId = typeof body.inspectionPointId === 'string' ? body.inspectionPointId.trim() : '';
    if (!inspectionPointId) return NextResponse.json({ success: false, error: 'inspectionPointId is required' }, { status: 400 });
    const point = await db.componentInspectionPoint.findFirst({
      where: { id: inspectionPointId, componentId: id, isActive: true },
      select: { id: true },
    });
    if (!point) return NextResponse.json({ success: false, error: 'Inspection point does not belong to this part' }, { status: 404 });
    const legacyResult = body.result === 'conditional' ? 'needs_attention' : body.result || 'pass';
    const delegatedRequest = new NextRequest(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify({
        value: body.value,
        outcome: legacyResult,
        findings: body.findings,
        recommendation: body.recommendation,
      }),
    });
    return recordPmInspection(delegatedRequest, { params: Promise.resolve({ pointId: inspectionPointId }) });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to record inspection' }, { status: 500 });
  }
}
