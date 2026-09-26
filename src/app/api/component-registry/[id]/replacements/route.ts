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

    const replacements = await db.componentReplacementHistory.findMany({
      where: { componentId: id },
      orderBy: { replacedAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: replacements });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load replacement history';
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
    const {
      partName,
      partCode,
      serialNumberOld,
      serialNumberNew,
      reason,
      cost,
      vendor,
      expectedNextReplacement,
    } = body;

    if (!partName) {
      return NextResponse.json({ success: false, error: 'partName is required' }, { status: 400 });
    }

    const component = await db.componentRegistry.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!component) {
      return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
    }

    const record = await db.componentReplacementHistory.create({
      data: {
        componentId: id,
        partName,
        partCode: partCode || null,
        serialNumberOld: serialNumberOld || null,
        serialNumberNew: serialNumberNew || null,
        reason: reason || null,
        cost: cost !== undefined ? parseFloat(String(cost)) : null,
        vendor: vendor || null,
        expectedNextReplacement: expectedNextReplacement ? new Date(expectedNextReplacement) : null,
        replacedAt: new Date(),
        replacedBy: session.userId,
      },
    });

    await createAuditLog(
      session.userId,
      'component_replacement_history',
      'create',
      record.id,
      {
        newValues: { componentId: id, partName, partCode, reason },
      },
    );

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to record component replacement';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
