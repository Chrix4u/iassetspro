import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const assetId = searchParams.get('assetId');
    if (!assetId) {
      return NextResponse.json({ success: false, error: 'Asset is required' }, { status: 400 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const asset = await db.asset.findUnique({
      where: { id: assetId },
      select: { id: true, plantId: true },
    });
    if (!asset) {
      return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });
    }
    if (!canAccessPlantStrict(plantScope, asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const readings = await db.meterReading.findMany({
      where: { assetId },
      orderBy: { readingDate: 'desc' },
      distinct: ['meterName', 'unit'],
      select: {
        meterName: true,
        unit: true,
        value: true,
        readingDate: true,
      },
    });

    // Newly commissioned output meters must be selectable before their first
    // production shift. Preserve historical reading-backed sources as-is.
    const registered = await db.assetMeter.findMany({
      where: { assetId, isActive: true },
      select: { name: true, unit: true, currentValue: true, lastReadingAt: true },
    });
    const sources = [...readings];
    const seen = new Set(readings.map((reading) => reading.meterName + '\\u0000' + reading.unit));
    for (const meter of registered) {
      const key = meter.name + '\\u0000' + meter.unit;
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push({
        meterName: meter.name,
        unit: meter.unit,
        value: meter.currentValue,
        readingDate: meter.lastReadingAt ?? new Date(0),
      });
    }
    return NextResponse.json({
      success: true,
      data: sources,
      pagination: { page: 1, limit: sources.length, total: sources.length, totalPages: 1 },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load PM meter sources';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
