import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const assetId = searchParams.get('assetId')?.trim() || '';
    const componentId = searchParams.get('componentId')?.trim() || null;
    if (!assetId) return NextResponse.json({ success: false, error: 'Asset is required' }, { status: 400 });

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });

    const asset = await db.asset.findUnique({ where: { id: assetId }, select: { id: true, plantId: true } });
    if (!asset) return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });
    if (!canAccessPlantStrict(plantScope, asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const sources: Array<{
      sourceType: 'component_condition' | 'iot_device';
      sourceId: string;
      label: string;
      metric: string;
      unit: string;
      currentValue: number | null;
    }> = [];

    if (componentId) {
      const component = await db.componentRegistry.findUnique({
        where: { id: componentId },
        select: { id: true, assetId: true, name: true, componentCode: true },
      });
      if (!component) return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
      if (component.assetId !== assetId) {
        return NextResponse.json({ success: false, error: 'Selected component does not belong to the selected asset' }, { status: 400 });
      }

      const readings = await db.componentConditionReading.findMany({
        where: { componentId },
        orderBy: [{ parameterKey: 'asc' }, { recordedAt: 'desc' }],
        select: { parameterKey: true, value: true, unit: true },
      });
      const seen = new Set<string>();
      for (const reading of readings) {
        if (seen.has(reading.parameterKey)) continue;
        seen.add(reading.parameterKey);
        sources.push({
          sourceType: 'component_condition',
          sourceId: component.id,
          label: `${component.componentCode} · ${reading.parameterKey}`,
          metric: reading.parameterKey,
          unit: reading.unit,
          currentValue: reading.value,
        });
      }
    } else {
      const devices = await db.iotDevice.findMany({
        where: {
          assetId,
          isActive: true,
          OR: [{ plantId: asset.plantId }, { plantId: null }],
        },
        orderBy: [{ parameter: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, deviceCode: true, parameter: true, unit: true, lastReading: true },
      });
      for (const device of devices) {
        sources.push({
          sourceType: 'iot_device',
          sourceId: device.id,
          label: `${device.parameter} · ${device.name} [${device.deviceCode}]`,
          metric: device.parameter,
          unit: device.unit,
          currentValue: device.lastReading,
        });
      }
    }

    return NextResponse.json({ success: true, data: sources });
  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load PM condition sources',
    }, { status: 500 });
  }
}
