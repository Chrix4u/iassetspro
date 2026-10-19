import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, getPlantFilterWhere, canAccessPlantStrict } from '@/lib/plant-scope';

// Helper: generate reading number MR-OPS-YYYYMM-NNNN
async function generateReadingNumber(): Promise<string> {
  const now = new Date();
  const prefix = `MR-OPS-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

  const latest = await db.meterReading.findFirst({
    where: { readingNumber: { startsWith: prefix } },
    orderBy: { readingNumber: 'desc' },
    select: { readingNumber: true },
  });

  let nextNum = 1;
  if (latest) {
    const parts = latest.readingNumber.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) nextNum = lastNum + 1;
  }

  return `${prefix}-${String(nextNum).padStart(4, '0')}`;
}

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const plantScope = await getPlantScope(request, session);
    const plantFilter = getPlantFilterWhere(plantScope);

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const meterName = searchParams.get('meterName');
    const assetId = searchParams.get('assetId');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const where: Record<string, unknown> = {};

    if (meterName) where.meterName = { contains: meterName };
    if (assetId) where.assetId = assetId;
    if (search) {
      where.OR = [
        { meterName: { contains: search } },
        { readingNumber: { contains: search } },
        { unit: { contains: search } },
        { notes: { contains: search } },
      ];
    }

    Object.assign(where, plantFilter);

    const [readings, total] = await Promise.all([
      db.meterReading.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        include: {
          readBy: { select: { id: true, fullName: true, username: true } },
        },
        orderBy: { readingDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.meterReading.count({
        where: Object.keys(where).length > 0 ? where : undefined,
      }),
    ]);

    const meterScopeWhere = {
      ...plantFilter,
      ...(assetId ? { assetId } : {}),
    };

    // KPI counts
    const [totalCount, thisMonthCount, anomalyCount] = await Promise.all([
      db.meterReading.count({ where: meterScopeWhere }),
      db.meterReading.count({
        where: {
          ...meterScopeWhere,
          readingDate: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
      db.meterReading.count({
        where: {
          ...meterScopeWhere,
          consumption: { gt: 0 },
        },
      }),
    ]);

    // Distinct meter names inside the same plant/asset scope.
    const metersResult = await db.meterReading.findMany({
      where: Object.keys(meterScopeWhere).length > 0 ? meterScopeWhere : undefined,
      distinct: ['meterName'],
      select: { meterName: true },
    });

    return NextResponse.json({
      success: true,
      data: readings,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      kpis: {
        total: totalCount,
        metersTracked: metersResult.length,
        thisMonth: thisMonthCount,
        withConsumption: anomalyCount,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load meter readings';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'meters.create') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);

    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const { meterName, value, unit, readingDate, notes, assetId } = body;

    if (!meterName) {
      return NextResponse.json({ success: false, error: 'Meter name is required' }, { status: 400 });
    }
    if (value === undefined || value === null || isNaN(Number(value))) {
      return NextResponse.json({ success: false, error: 'Reading value is required' }, { status: 400 });
    }
    if (!unit) {
      return NextResponse.json({ success: false, error: 'Unit is required' }, { status: 400 });
    }

    let meterAsset: { id: string; plantId: string } | null = null;
    if (assetId) {
      meterAsset = await db.asset.findUnique({
        where: { id: assetId },
        select: { id: true, plantId: true },
      });
      if (!meterAsset) {
        return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 400 });
      }
      if (!canAccessPlantStrict(plantScope, meterAsset.plantId)) {
        return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
      }
    }

    const readingNumber = await generateReadingNumber();
    const readingValue = Number(value);

    // Previous readings are scoped to the same physical meter. Asset-bound
    // meters must never consume a reading from another machine with the same label.
    const previousReading = await db.meterReading.findFirst({
      where: { meterName, ...(assetId ? { assetId } : {}) },
      orderBy: { readingDate: 'desc' },
      select: { value: true },
    });

    const previousValue = previousReading?.value ?? null;
    const consumption = previousValue !== null ? readingValue - previousValue : null;

    const reading = await db.meterReading.create({
      data: {
        readingNumber,
        meterName,
        assetId: assetId || null,
        value: readingValue,
        unit,
        readingDate: readingDate ? new Date(readingDate) : new Date(),
        previousValue,
        consumption,
        notes: notes || null,
        readById: session.userId,
        plantId: meterAsset?.plantId || body.plantId || plantScope?.plantId || null,
      },
      include: {
        readBy: { select: { id: true, fullName: true, username: true } },
      },
    });

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'create',
        entityType: 'meter_reading',
        entityId: reading.id,
        newValues: JSON.stringify({ readingNumber, meterName, value: readingValue, unit }),
      },
    });

    return NextResponse.json({ success: true, data: reading }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create meter reading';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
