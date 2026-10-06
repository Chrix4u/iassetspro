import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (
      !hasPermission(session, 'pm_triggers.view')
      && !hasPermission(session, 'pm_triggers.create')
      && !hasPermission(session, 'pm_triggers.update')
      && !isAdmin(session)
    ) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const scheduleId = searchParams.get('scheduleId') || '';
    const triggerType = searchParams.get('triggerType') || '';
    if (!scheduleId || !['condition', 'production_count'].includes(triggerType)) {
      return NextResponse.json({ success: false, error: 'scheduleId and a supported triggerType are required' }, { status: 400 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });

    const schedule = await db.pmSchedule.findUnique({
      where: { id: scheduleId },
      select: {
        id: true,
        assetId: true,
        componentId: true,
        asset: { select: { id: true, name: true, assetTag: true, plantId: true } },
        component: { select: { id: true, name: true, componentCode: true } },
      },
    });
    if (!schedule) return NextResponse.json({ success: false, error: 'PM schedule not found' }, { status: 404 });
    if (!canAccessPlantStrict(plantScope, schedule.asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const sources: Array<{
      value: string;
      label: string;
      sourceType: string;
      currentValue: number | null;
      unit: string | null;
    }> = [];

    if (triggerType === 'condition') {
      if (schedule.componentId) {
        const readings = await db.componentConditionReading.findMany({
          where: { componentId: schedule.componentId },
          orderBy: [{ parameterKey: 'asc' }, { recordedAt: 'desc' }],
          select: { parameterKey: true, value: true, unit: true },
        });
        const seen = new Set<string>();
        for (const reading of readings) {
          if (seen.has(reading.parameterKey)) continue;
          seen.add(reading.parameterKey);
          sources.push({
            value: `component_condition|${encodeURIComponent(reading.parameterKey)}`,
            label: `${schedule.component?.componentCode || 'Component'} · ${reading.parameterKey} (${reading.value} ${reading.unit})`,
            sourceType: 'component_condition',
            currentValue: reading.value,
            unit: reading.unit,
          });
        }
      } else {
        const devices = await db.iotDevice.findMany({
          where: {
            assetId: schedule.assetId,
            isActive: true,
            OR: [{ plantId: schedule.asset.plantId }, { plantId: null }],
          },
          orderBy: [{ parameter: 'asc' }, { name: 'asc' }],
          select: { id: true, name: true, deviceCode: true, parameter: true, unit: true, lastReading: true },
        });
        for (const device of devices) {
          sources.push({
            value: `iot_device|${device.id}`,
            label: `${device.parameter} · ${device.name} [${device.deviceCode}]${device.lastReading == null ? '' : ` (${device.lastReading} ${device.unit})`}`,
            sourceType: 'iot_device',
            currentValue: device.lastReading,
            unit: device.unit,
          });
        }
      }
    } else {
      if (schedule.componentId) {
        const counters = await db.componentRuntimeCounter.findMany({
          where: { componentId: schedule.componentId, counterType: { in: ['cycles', 'starts'] } },
          orderBy: { counterType: 'asc' },
          select: { id: true, counterType: true, value: true, unit: true },
        });
        for (const counter of counters) {
          sources.push({
            value: `component_counter|${counter.id}`,
            label: `${schedule.component?.componentCode || 'Component'} · ${counter.counterType.replace(/_/g, ' ')} (${counter.value} ${counter.unit})`,
            sourceType: 'component_counter',
            currentValue: counter.value,
            unit: counter.unit,
          });
        }
      } else {
        const productionTotals = await db.productionOrder.groupBy({
          by: ['workCenterId'],
          where: {
            plantId: schedule.asset.plantId,
            status: { not: 'cancelled' },
            workCenterId: { not: null },
          },
          _sum: { completedQty: true },
        });
        const totals = new Map(productionTotals.map((row) => [row.workCenterId, Number(row._sum.completedQty || 0)]));
        const workCenterIds = productionTotals
          .map((row) => row.workCenterId)
          .filter((id): id is string => Boolean(id));
        const workCenters = workCenterIds.length
          ? await db.workCenter.findMany({
              where: { id: { in: workCenterIds }, isActive: true },
              orderBy: { name: 'asc' },
              select: { id: true, name: true, code: true },
            })
          : [];
        for (const workCenter of workCenters) {
          const current = totals.get(workCenter.id) || 0;
          sources.push({
            value: `work_center_output|${workCenter.id}`,
            label: `${workCenter.name} [${workCenter.code}] · ${current} completed units in asset plant`,
            sourceType: 'work_center_output',
            currentValue: current,
            unit: 'completed units',
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: sources,
      target: {
        scheduleId: schedule.id,
        assetId: schedule.assetId,
        assetName: schedule.asset.name,
        componentId: schedule.componentId,
        componentName: schedule.component?.name || null,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load PM trigger sources';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
