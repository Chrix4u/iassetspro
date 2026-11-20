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

    if (!isAdmin(session) && !hasPermission(session, 'meters.view')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }
    const plantFilter = getPlantFilterWhere(plantScope);

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const meterName = searchParams.get('meterName');
    const assetId = searchParams.get('assetId');
    const requestedPage = Number(searchParams.get('page') || 1);
    const requestedLimit = Number(searchParams.get('limit') || 50);
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const limit = Number.isSafeInteger(requestedLimit)
      ? Math.min(200, Math.max(1, requestedLimit)) : 50;

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

/**
 * Legacy standalone utility-meter entry. Registered AssetMeter counters are
 * deliberately updated through the canonical asset/production-survey flows,
 * not by this endpoint, which does not advance AssetMeter.currentValue.
 */
export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'meters.create') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const scope = await getPlantScope(request, session);
    if (scope.denyAccess || (scope.isScoped && scope.accessLevel === 'read')) {
      return NextResponse.json({ success: false, error: 'Write access to the selected plant is required' }, { status: 403 });
    }

    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: 'Invalid reading' }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    const meterName = typeof input.meterName === 'string' ? input.meterName.trim() : '';
    const unit = typeof input.unit === 'string' ? input.unit.trim() : '';
    const valueInput = input.value;
    if (!meterName || meterName.length > 160 || !unit || unit.length > 32) {
      return NextResponse.json({ success: false, error: 'Meter name (max 160) and unit (max 32) are required' }, { status: 400 });
    }
    if (valueInput === undefined || valueInput === null || typeof valueInput === 'boolean'
      || (typeof valueInput !== 'number' && typeof valueInput !== 'string')
      || (typeof valueInput === 'string' && !valueInput.trim())
      || !Number.isFinite(Number(valueInput)) || Number(valueInput) < 0) {
      return NextResponse.json({ success: false, error: 'Reading must be a nonnegative number; a blank is not zero' }, { status: 400 });
    }
    const readingValue = Number(valueInput);
    if (input.notes !== undefined && input.notes !== null
      && (typeof input.notes !== 'string' || input.notes.length > 2000)) {
      return NextResponse.json({ success: false, error: 'Notes must contain at most 2,000 characters' }, { status: 400 });
    }
    const notes = typeof input.notes === 'string' ? input.notes.trim() || null : null;
    if (input.assetId != null && (typeof input.assetId !== 'string' || !input.assetId.trim())) {
      return NextResponse.json({ success: false, error: 'Invalid asset' }, { status: 400 });
    }
    if (input.plantId != null && (typeof input.plantId !== 'string' || !input.plantId.trim())) {
      return NextResponse.json({ success: false, error: 'Invalid plant' }, { status: 400 });
    }
    if (input.assetMeterId != null) {
      return NextResponse.json({ success: false, error: 'Registered asset meter readings must use the machine meter workflow' }, { status: 409 });
    }
    const assetId = typeof input.assetId === 'string' ? input.assetId.trim() : null;
    const requestedPlantId = typeof input.plantId === 'string' ? input.plantId.trim() : null;
    const readingDate = input.readingDate == null
      ? new Date()
      : typeof input.readingDate === 'string' && input.readingDate.trim()
        ? new Date(input.readingDate)
        : new Date(NaN);
    if (Number.isNaN(readingDate.getTime()) || readingDate.getTime() > Date.now() + 5 * 60_000) {
      return NextResponse.json({ success: false, error: 'Reading date is invalid or in the future' }, { status: 400 });
    }

    let plantId: string;
    if (assetId) {
      const asset = await db.asset.findUnique({
        where: { id: assetId }, select: { id: true, plantId: true },
      });
      if (!asset) {
        return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });
      }
      plantId = asset.plantId;
      // A supplied plant must never override the asset's actual plant.
      if (requestedPlantId && requestedPlantId !== plantId) {
        return NextResponse.json({ success: false, error: 'Asset and plant do not match' }, { status: 403 });
      }
    } else {
      // For shared utility meters a plant is mandatory, even for admins.
      // A single assigned plant is unambiguous for normal operators.
      const inferred = !scope.isSystemWide && scope.accessiblePlantIds.length === 1
        ? scope.accessiblePlantIds[0] : null;
      plantId = requestedPlantId || scope.plantId || inferred || '';
      if (!plantId) {
        return NextResponse.json({
          success: false, error: 'Select a plant before recording a meter reading',
        }, { status: 400 });
      }
    }

    if (!canAccessPlantStrict(scope, plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }
    // Unscoped users may belong to several plants with different access levels.
    // Being allowed to read a plant is not permission to write meter history.
    if (!scope.isSystemWide && !scope.isScoped) {
      const assignment = await db.userPlant.findUnique({
        where: { userId_plantId: { userId: session.userId, plantId } },
        select: { accessLevel: true },
      });
      if (!assignment || !['write', 'admin'].includes(assignment.accessLevel)) {
        return NextResponse.json({
          success: false, error: 'Write access to the selected plant is required',
        }, { status: 403 });
      }
    }
    if (assetId) {
      // Do not leak existence of another plant's registered meter before
      // the asset's plant and the caller's plant permissions were verified.
      const registered = await db.assetMeter.findFirst({
        where: { assetId, name: meterName, unit, isActive: true },
        select: { id: true },
      });
      if (registered) {
        return NextResponse.json({
          success: false,
          error: 'This is a registered machine meter. Record readings through its machine or production shift workflow.',
        }, { status: 409 });
      }
    } else {
      const plant = await db.plant.findUnique({
        where: { id: plantId }, select: { id: true, isActive: true },
      });
      if (!plant?.isActive) {
        return NextResponse.json({ success: false, error: 'Plant not found or inactive' }, { status: 400 });
      }
    }

    // Always partition even standalone utility meters by their plant and unit.
    // A shared label must not use another plant's reading as its baseline.
    const previous = await db.meterReading.findFirst({
      where: { plantId, assetId, meterName, unit },
      orderBy: [{ readingDate: 'desc' }, { createdAt: 'desc' }],
      select: { value: true, readingDate: true },
    });
    if (previous && readingDate.getTime() <= previous.readingDate.getTime()) {
      return NextResponse.json({
        success: false, error: 'A later reading already exists for this meter. Verify the date.',
      }, { status: 409 });
    }
    if (previous && readingValue < previous.value) {
      return NextResponse.json({
        success: false, error: 'Cumulative readings cannot decrease. Meter resets need an audited replacement process.',
      }, { status: 409 });
    }

    const readingNumber = await generateReadingNumber();
    const previousValue = previous?.value ?? null;
    const consumption = previousValue === null ? null : readingValue - previousValue;
    // Never persist a reading without its matching audit record.
    const reading = await db.$transaction(async tx => {
      const created = await tx.meterReading.create({
        data: {
          readingNumber, meterName, assetId, plantId,
          value: readingValue, unit, readingDate, previousValue, consumption,
          notes, readById: session.userId,
        },
        include: { readBy: { select: { id: true, fullName: true, username: true } } },
      });
      await tx.auditLog.create({
        data: {
          userId: session.userId, action: 'create', entityType: 'meter_reading',
          entityId: created.id,
          newValues: JSON.stringify({
            readingNumber, meterName, assetId, plantId, value: readingValue, unit, readingDate,
          }),
        },
      });
      return created;
    }, { isolationLevel: 'Serializable' });

    return NextResponse.json({ success: true, data: reading }, { status: 201 });
  } catch (error: unknown) {
    // A collision or concurrent update is never a successful meter observation.
    if (error && typeof error === 'object' && 'code' in error
      && ['P2002', 'P2034'].includes(String(error.code))) {
      return NextResponse.json({
        success: false, error: 'Another meter reading was saved at the same time. Refresh and retry.',
      }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : 'Failed to create meter reading';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
