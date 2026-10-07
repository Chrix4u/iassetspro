import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { isAutoCalculableFrequency, isPmFrequencyType } from '@/lib/pm-utils';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const assetId = searchParams.get('assetId');
    const componentId = searchParams.get('componentId');
    const isActive = searchParams.get('isActive');
    const dueSoon = searchParams.get('dueSoon');

    // Resolve plant scope (validates X-Plant-ID against user's plant access)
    // PmSchedule has no direct plantId — scope through the related Asset's plantId.
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const where: Record<string, unknown> = {};

    if (assetId) where.assetId = assetId;
    if (componentId) where.componentId = componentId;
    if (isActive !== null) {
      where.isActive = isActive === 'true';
    }
    if (dueSoon === 'true') {
      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      where.frequencyType = { notIn: ['meter_based', 'custom_hours'] };
      where.nextDueDate = { gte: now, lte: weekFromNow };
    }

    // Regular users must never fall through to an unrestricted schedule query.
    // Explicit plant selection narrows to one plant; otherwise scope to all plants
    // assigned to the user. An empty assignment list intentionally matches nothing.
    if (!plantScope.isSystemWide) {
      where.asset = {
        plantId: plantScope.isScoped && plantScope.plantId
          ? plantScope.plantId
          : { in: plantScope.accessiblePlantIds },
      };
    }

    const schedules = await db.pmSchedule.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        asset: {
          select: { id: true, name: true, assetTag: true, status: true },
        },
        component: {
          select: { id: true, name: true, componentCode: true, componentType: true, parentId: true, assetId: true },
        },
        assignedTo: { select: { id: true, fullName: true, username: true } },
        department: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, fullName: true, username: true } },
        template: { select: { id: true, title: true, type: true, _count: { select: { tasks: true } } } },
      },
      orderBy: { nextDueDate: 'asc' },
    });

    return NextResponse.json({ success: true, data: schedules });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load PM schedules';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'work_orders.create') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const {
      title,
      description,
      assetId,
      componentId,
      frequencyType,
      frequencyValue,
      lastCompletedDate,
      nextDueDate,
      estimatedDuration,
      priority,
      assignedToId,
      departmentId,
      templateId,
      autoGenerateWO,
      leadDays,
    } = body;

    if (!title || !assetId) {
      return NextResponse.json(
        { success: false, error: 'Title and asset are required' },
        { status: 400 }
      );
    }

    if (!frequencyType || !frequencyValue) {
      return NextResponse.json(
        { success: false, error: 'Frequency type and value are required' },
        { status: 400 }
      );
    }

    if (!isPmFrequencyType(frequencyType)) {
      return NextResponse.json({ success: false, error: 'Invalid PM frequency type' }, { status: 400 });
    }
    const normalizedFrequencyValue = Number(frequencyValue);
    if (!Number.isInteger(normalizedFrequencyValue) || normalizedFrequencyValue <= 0) {
      return NextResponse.json({ success: false, error: 'Frequency value must be a positive whole number' }, { status: 400 });
    }

    const rawLeadDays = leadDays === undefined
      || leadDays === null
      || (typeof leadDays === 'string' && leadDays.trim() === '')
      ? 3
      : leadDays;
    const normalizedLeadDays = typeof rawLeadDays === 'number' || typeof rawLeadDays === 'string'
      ? Number(rawLeadDays)
      : Number.NaN;
    if (!Number.isInteger(normalizedLeadDays) || normalizedLeadDays < 0) {
      return NextResponse.json(
        { success: false, error: 'Lead days must be a non-negative whole number' },
        { status: 400 },
      );
    }

    const normalizedEstimatedDuration = estimatedDuration === undefined
      || estimatedDuration === null
      || (typeof estimatedDuration === 'string' && estimatedDuration.trim() === '')
      ? 0
      : Number(estimatedDuration);
    if (!Number.isFinite(normalizedEstimatedDuration) || normalizedEstimatedDuration < 0) {
      return NextResponse.json(
        { success: false, error: 'Estimated duration must be a non-negative number of hours' },
        { status: 400 },
      );
    }

    const canonicalNextDueDate = isAutoCalculableFrequency(frequencyType)
      ? (nextDueDate ? new Date(nextDueDate) : null)
      : null;

    // Validate asset exists and belongs to the caller's active/assigned plant scope.
    const assetExists = await db.asset.findUnique({
      where: { id: assetId },
      select: { id: true, plantId: true },
    });
    if (!assetExists) {
      return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 400 });
    }
    if (!canAccessPlantStrict(plantScope, assetExists.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    let componentForTrigger: { id: string; assetId: string | null; name: string; componentCode: string; operatingHours: number } | null = null;
    if (componentId) {
      const component = await db.componentRegistry.findUnique({
        where: { id: componentId },
        select: { id: true, assetId: true, name: true, componentCode: true, operatingHours: true },
      });
      if (!component) {
        return NextResponse.json({ success: false, error: 'Component not found' }, { status: 400 });
      }
      if (component.assetId !== assetId) {
        return NextResponse.json(
          { success: false, error: 'Selected component does not belong to the selected asset' },
          { status: 400 },
        );
      }
      componentForTrigger = component;
    }

    if (templateId) {
      const template = await db.pmTemplate.findUnique({
        where: { id: templateId },
        select: { id: true, isActive: true },
      });
      if (!template || !template.isActive) {
        return NextResponse.json({ success: false, error: 'PM template not found or inactive' }, { status: 400 });
      }
    }

    const schedule = await db.pmSchedule.create({
      data: {
        title,
        description: description || null,
        assetId,
        componentId: componentId || null,
        frequencyType,
        frequencyValue: normalizedFrequencyValue,
        lastCompletedDate: lastCompletedDate ? new Date(lastCompletedDate) : null,
        nextDueDate: canonicalNextDueDate,
        estimatedDuration: normalizedEstimatedDuration,
        priority: priority || 'medium',
        assignedToId: assignedToId || null,
        departmentId: departmentId || null,
        templateId: templateId || null,
        autoGenerateWO: autoGenerateWO !== undefined ? autoGenerateWO : true,
        leadDays: normalizedLeadDays,
        createdById: session.userId,
      },
      include: {
        asset: { select: { id: true, name: true, assetTag: true, status: true } },
        component: { select: { id: true, name: true, componentCode: true, componentType: true, parentId: true, assetId: true } },
        assignedTo: { select: { id: true, fullName: true, username: true } },
        department: { select: { id: true, name: true, code: true } },
        template: { select: { id: true, title: true, type: true, _count: { select: { tasks: true } } } },
        createdBy: { select: { id: true, fullName: true, username: true } },
      },
    });

    if (
      componentForTrigger
      && ['custom_hours', 'meter_based'].includes(frequencyType)
      && Number(frequencyValue) > 0
    ) {
      await db.pmTrigger.create({
        data: {
          scheduleId: schedule.id,
          triggerType: 'meter',
          triggerValue: normalizedFrequencyValue,
          triggerConfig: JSON.stringify({
            source: 'component_operating_hours',
            componentId: componentForTrigger.id,
            baselineHours: Number(componentForTrigger.operatingHours || 0),
            unit: 'hours',
          }),
          isActive: true,
        },
      });
    }

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'create',
        entityType: 'pm_schedule',
        entityId: schedule.id,
        newValues: JSON.stringify({ title, assetId, componentId: componentId || null, templateId: templateId || null, frequencyType, frequencyValue }),
      },
    });

    return NextResponse.json({ success: true, data: schedule }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create PM schedule';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
