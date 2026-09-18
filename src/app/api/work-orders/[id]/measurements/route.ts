import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { canViewWorkOrder } from '@/services/workOrderAccess.service';

type NormalRange = {
  min: number | null;
  max: number | null;
  unit: string | null;
};

function finiteNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNormalRange(value?: string | null): NormalRange {
  if (!value) return { min: null, max: null, unit: null };
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const rawUnit = typeof parsed.unit === 'string' ? parsed.unit.trim() : '';
    return {
      min: finiteNumberOrNull(parsed.min),
      max: finiteNumberOrNull(parsed.max),
      unit: rawUnit || null,
    };
  } catch {
    return { min: null, max: null, unit: null };
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { componentId, parameterKey, value } = body;

    if (!parameterKey || typeof parameterKey !== 'string' || !parameterKey.trim()) {
      return NextResponse.json({ success: false, error: 'parameterKey is required' }, { status: 400 });
    }
    if (value === undefined || value === null || typeof value !== 'number' || !Number.isFinite(value)) {
      return NextResponse.json({ success: false, error: 'value is required and must be a finite number' }, { status: 400 });
    }

    const normalizedParameterKey = parameterKey.trim();
    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        isLocked: true,
        plantId: true,
        assignedTo: true,
        teamLeaderId: true,
        teamMembers: { select: { userId: true, accessLevel: true } },
        workOrderComponents: { select: { componentRegistryId: true } },
      },
    });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, wo.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const isAssignedTechnician = wo.assignedTo === session.userId || wo.teamLeaderId === session.userId;
    const isExecutionTeamMember = wo.teamMembers.some(
      (member) => member.userId === session.userId && member.accessLevel !== 'read_only',
    );
    const hasExecutionPermission =
      hasPermission(session, 'work_orders.update') ||
      hasPermission(session, 'work_orders.start') ||
      hasPermission(session, 'work_orders.complete');

    if (!isAdmin(session) && (!(isAssignedTechnician || isExecutionTeamMember) || !hasExecutionPermission)) {
      return NextResponse.json(
        { success: false, error: 'Only an assigned execution actor can record measurements for this work order' },
        { status: 403 },
      );
    }

    if (wo.isLocked) {
      return NextResponse.json({ success: false, error: 'Work order is locked and cannot be modified' }, { status: 409 });
    }
    if (wo.status === 'closed') {
      return NextResponse.json({ success: false, error: 'Work order is closed and cannot be modified' }, { status: 409 });
    }

    let resolvedComponentId = componentId;
    if (!resolvedComponentId) {
      if (wo.workOrderComponents.length === 1) {
        resolvedComponentId = wo.workOrderComponents[0].componentRegistryId;
      } else if (wo.workOrderComponents.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No components are linked to this work order' },
          { status: 400 },
        );
      } else {
        return NextResponse.json(
          { success: false, error: 'componentId is required when this work order has multiple linked components' },
          { status: 400 },
        );
      }
    } else {
      const match = wo.workOrderComponents.find((component) => component.componentRegistryId === resolvedComponentId);
      if (!match) {
        return NextResponse.json(
          { success: false, error: 'componentId does not belong to this work order' },
          { status: 400 },
        );
      }
    }

    const inspectionPoint = await db.componentInspectionPoint.findFirst({
      where: {
        componentId: resolvedComponentId,
        parameterKey: normalizedParameterKey,
        inspectionType: 'measurement',
        isActive: true,
      },
      select: { id: true, name: true, parameterKey: true, normalRange: true },
    });

    if (!inspectionPoint) {
      return NextResponse.json(
        { success: false, error: 'Measurement parameter is not an active configured inspection point for this component' },
        { status: 422 },
      );
    }

    const canonicalRange = parseNormalRange(inspectionPoint.normalRange);
    if (!canonicalRange.unit) {
      return NextResponse.json(
        { success: false, error: `Measurement point "${inspectionPoint.name}" has no unit configured. Update the component inspection point before recording readings.` },
        { status: 422 },
      );
    }

    let isAlarm = false;
    if (canonicalRange.min !== null && value < canonicalRange.min) isAlarm = true;
    if (canonicalRange.max !== null && value > canonicalRange.max) isAlarm = true;

    const reading = await db.componentConditionReading.create({
      data: {
        componentId: resolvedComponentId,
        parameterKey: normalizedParameterKey,
        value,
        unit: canonicalRange.unit,
        quality: 100,
        minThreshold: canonicalRange.min,
        maxThreshold: canonicalRange.max,
        isAlarm,
        source: 'manual',
        recordedById: session.userId,
      },
      include: {
        recordedBy: { select: { id: true, fullName: true, username: true } },
        component: { select: { id: true, name: true, componentCode: true } },
      },
    });

    return NextResponse.json({ success: true, data: reading }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to record measurement';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const componentIdFilter = searchParams.get('componentId') || undefined;

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        plantId: true,
        assignedTo: true,
        teamLeaderId: true,
        assignedSupervisorId: true,
        plannerId: true,
        maintenanceRequest: { select: { requestedBy: true } },
        teamMembers: { select: { userId: true } },
        workOrderComponents: {
          select: {
            componentRegistryId: true,
            componentRegistry: {
              select: {
                id: true,
                name: true,
                componentCode: true,
                inspectionPoints: {
                  where: {
                    isActive: true,
                    inspectionType: 'measurement',
                    parameterKey: { not: null },
                  },
                  orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
                  select: {
                    id: true,
                    name: true,
                    description: true,
                    parameterKey: true,
                    normalRange: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, wo.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    if (!canViewWorkOrder(session, wo)) {
      return NextResponse.json({ success: false, error: 'Access denied — you are not part of this work order workflow' }, { status: 403 });
    }

    const componentIds = wo.workOrderComponents.map((component) => component.componentRegistryId);
    if (componentIdFilter && !componentIds.includes(componentIdFilter)) {
      return NextResponse.json({ success: false, error: 'componentId does not belong to this work order' }, { status: 400 });
    }

    const readingComponentIds = componentIdFilter ? [componentIdFilter] : componentIds;
    const readings = componentIds.length === 0
      ? []
      : await db.componentConditionReading.findMany({
          where: { componentId: { in: readingComponentIds } },
          orderBy: { recordedAt: 'desc' },
          include: {
            recordedBy: { select: { id: true, fullName: true, username: true } },
            component: { select: { id: true, name: true, componentCode: true } },
          },
          take: 200,
        });

    const optionComponents = componentIdFilter
      ? wo.workOrderComponents.filter((component) => component.componentRegistryId === componentIdFilter)
      : wo.workOrderComponents;

    const options = optionComponents.flatMap(({ componentRegistry }) =>
      componentRegistry.inspectionPoints.map((point) => {
        const range = parseNormalRange(point.normalRange);
        return {
          inspectionPointId: point.id,
          componentId: componentRegistry.id,
          componentName: componentRegistry.name,
          componentCode: componentRegistry.componentCode,
          parameterKey: point.parameterKey,
          label: point.name,
          description: point.description,
          unit: range.unit,
          acceptableMin: range.min,
          acceptableMax: range.max,
          selectable: Boolean(range.unit),
        };
      }),
    );

    return NextResponse.json({ success: true, data: readings, options });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch measurements';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
