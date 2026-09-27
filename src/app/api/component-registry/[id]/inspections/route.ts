import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getComponentPlantAccess } from '@/lib/component-plant-access';
import { createAuditLog } from '@/lib/audit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'digital_twin.view') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const componentAccess = await getComponentPlantAccess(request, session, id);
    if (!componentAccess.exists) {
      return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
    }
    if (!componentAccess.allowed) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const component = await db.componentRegistry.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!component) {
      return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
    }

    // Get inspection points with latest record each
    const inspectionPoints = await db.componentInspectionPoint.findMany({
      where: { componentId: id },
      orderBy: { sortOrder: 'asc' },
      include: {
        inspectionRecords: {
          orderBy: { inspectedAt: 'desc' },
          take: 1,
        },
      },
    });

    const result = inspectionPoints.map((point) => ({
      ...point,
      latestRecord: point.inspectionRecords[0] || null,
      inspectionRecords: undefined,
    }));

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load inspections';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'digital_twin.manage') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const componentAccess = await getComponentPlantAccess(request, session, id);
    if (!componentAccess.exists) {
      return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
    }
    if (!componentAccess.allowed) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }
    const body = await request.json();
    const { inspectionPointId, value, result, findings, recommendation } = body;

    if (!inspectionPointId) {
      return NextResponse.json({ success: false, error: 'inspectionPointId is required' }, { status: 400 });
    }

    const component = await db.componentRegistry.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!component) {
      return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
    }

    // Validate inspection point belongs to this component
    const point = await db.componentInspectionPoint.findFirst({
      where: { id: inspectionPointId, componentId: id },
    });
    if (!point) {
      return NextResponse.json({ success: false, error: 'Inspection point not found for this component' }, { status: 404 });
    }

    // Create inspection record
    const record = await db.componentInspectionRecord.create({
      data: {
        inspectionPointId,
        componentId: id,
        value: value !== undefined ? String(value) : null,
        result: result || null,
        findings: findings || null,
        recommendation: recommendation || null,
        inspectedAt: new Date(),
        inspectedBy: session.userId,
      },
    });

    // Update inspection point lastInspected and compute nextInspection
    const updateData: Record<string, unknown> = {
      lastInspected: new Date(),
    };

    if (point.inspectionIntervalDays && point.inspectionIntervalDays > 0) {
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + point.inspectionIntervalDays);
      updateData.nextInspection = nextDate;
    }

    await db.componentInspectionPoint.update({
      where: { id: inspectionPointId },
      data: updateData,
    });

    await createAuditLog(
      session.userId,
      'component_inspection_record',
      'create',
      record.id,
      {
        newValues: { componentId: id, inspectionPointId, value, result },
      },
    );

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to record inspection result';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
