import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { canAccessPlant, getPlantScope } from '@/lib/plant-scope';

function canView(session: ReturnType<typeof getSession>) {
  if (!session) return false;
  return isAdmin(session)
    || hasPermission(session, 'digital_twin.view')
    || hasPermission(session, 'work_orders.view')
    || hasPermission(session, 'work_orders.view_own');
}

function canManage(session: ReturnType<typeof getSession>) {
  if (!session) return false;
  return isAdmin(session)
    || hasPermission(session, 'digital_twin.manage')
    || hasPermission(session, 'work_orders.update')
    || hasPermission(session, 'work_orders.start')
    || hasPermission(session, 'work_orders.complete');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!canView(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;

    const component = await db.componentRegistry.findUnique({
      where: { id },
      select: { id: true, assetId: true, asset: { select: { plantId: true } } },
    });
    if (!component) {
      return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
    }

    const plantScope = await getPlantScope(request, session);
    if (!canAccessPlant(plantScope, component.asset?.plantId)) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const replacements = await db.componentReplacementHistory.findMany({
      where: { componentId: id },
      orderBy: { replacedAt: 'desc' },
      include: { workOrder: { select: { id: true, woNumber: true, title: true, status: true } } },
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

    if (!canManage(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
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
      workOrderId,
    } = body;

    if (!partName) {
      return NextResponse.json({ success: false, error: 'partName is required' }, { status: 400 });
    }

    if (!reason) {
      return NextResponse.json({ success: false, error: 'reason is required' }, { status: 400 });
    }

    const parsedCost = cost === undefined || cost === null || cost === ''
      ? null
      : Number(cost);
    if (parsedCost !== null && !Number.isFinite(parsedCost)) {
      return NextResponse.json({ success: false, error: 'cost must be a valid number' }, { status: 400 });
    }

    const component = await db.componentRegistry.findUnique({
      where: { id },
      select: { id: true, assetId: true, asset: { select: { plantId: true } } },
    });
    if (!component) {
      return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
    }

    const plantScope = await getPlantScope(request, session);
    if (!canAccessPlant(plantScope, component.asset?.plantId)) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    if (workOrderId) {
      const workOrder = await db.workOrder.findUnique({
        where: { id: String(workOrderId) },
        select: { id: true, assetId: true },
      });
      if (!workOrder) {
        return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
      }
      if (component.assetId && workOrder.assetId && component.assetId !== workOrder.assetId) {
        return NextResponse.json({ success: false, error: 'Work order belongs to a different asset' }, { status: 400 });
      }
    }

    const record = await db.componentReplacementHistory.create({
      data: {
        componentId: id,
        workOrderId: workOrderId ? String(workOrderId) : null,
        partName,
        partCode: partCode || null,
        serialNumberOld: serialNumberOld || null,
        serialNumberNew: serialNumberNew || null,
        reason,
        cost: parsedCost,
        vendor: vendor || null,
        expectedNextReplacement: expectedNextReplacement ? new Date(expectedNextReplacement) : null,
        replacedAt: new Date(),
        performedById: session.userId,
      },
    });

    await createAuditLog(
      session.userId,
      'component_replacement_history',
      'create',
      record.id,
      {
        newValues: { componentId: id, workOrderId: workOrderId ? String(workOrderId) : null, partName, partCode, reason },
      },
    );

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to record component replacement';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
