import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import {
  canAccessPlantStrict,
  getPlantFilterWhere,
  getPlantScope,
} from '@/lib/plant-scope';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'digital_twin.view') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }
    const assetPlantWhere = getPlantFilterWhere(plantScope);

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    let page = parseInt(searchParams.get('page') || '1', 10);
    let limit = parseInt(searchParams.get('limit') || '50', 10);
    page = Math.max(1, isNaN(page) ? 1 : page);
    limit = Math.min(100, Math.max(1, isNaN(limit) ? 50 : limit));

    const where: Record<string, unknown> = {
      asset: { is: assetPlantWhere },
    };

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
        { type: { contains: search } },
        { asset: { is: { name: { contains: search } } } },
      ];
    }

    const [twins, total] = await Promise.all([
      db.digitalTwin.findMany({
        where,
        include: {
          asset: { select: { id: true, name: true, assetTag: true, status: true, condition: true } },
          createdBy: { select: { id: true, fullName: true, username: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.digitalTwin.count({ where }),
    ]);

    const scopedWhere = { asset: { is: assetPlantWhere } };
    const [totalKpi, activeCount, inactiveCount, activeTwinAssets] = await Promise.all([
      db.digitalTwin.count({ where: scopedWhere }),
      db.digitalTwin.count({ where: { ...scopedWhere, isActive: true } }),
      db.digitalTwin.count({ where: { ...scopedWhere, isActive: false } }),
      db.digitalTwin.findMany({
        where: { ...scopedWhere, isActive: true },
        select: { assetId: true },
      }),
    ]);

    // Count alerts only for assets represented by twins inside the caller's
    // authenticated plant scope. This prevents the KPI card from leaking
    // cross-plant alert counts even when the list itself is scoped.
    const activeAlertsCount = await db.iotAlert.count({
      where: {
        status: 'active',
        severity: { in: ['warning', 'critical'] },
        device: {
          assetId: { in: activeTwinAssets.map((t) => t.assetId) },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: twins,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      kpis: {
        total: totalKpi,
        activeSync: activeCount,
        inactive: inactiveCount,
        simulationRuns: 0,
        alerts: activeAlertsCount,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load digital twins';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'digital_twin.manage') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const {
      assetId,
      name,
      description,
      type,
      parameters,
      connections,
      specification,
      healthScore,
      syncInterval,
    } = body;

    if (!assetId) {
      return NextResponse.json({ success: false, error: 'Asset ID is required' }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ success: false, error: 'Twin name is required' }, { status: 400 });
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

    // Check if twin already exists for this asset
    const existing = await db.digitalTwin.findUnique({ where: { assetId } });
    if (existing) {
      return NextResponse.json({ success: false, error: 'A digital twin already exists for this asset' }, { status: 409 });
    }

    const twin = await db.digitalTwin.create({
      data: {
        assetId,
        name,
        description,
        type: type || 'other',
        parameters: parameters ? JSON.stringify(parameters) : '{}',
        connections: connections ? JSON.stringify(connections) : '{}',
        specification: specification ? JSON.stringify(specification) : null,
        healthScore: healthScore ? parseInt(String(healthScore), 10) : 0,
        syncInterval: syncInterval || '5min',
        createdById: session.userId,
      },
      include: {
        asset: { select: { id: true, name: true, assetTag: true, status: true, condition: true } },
        createdBy: { select: { id: true, fullName: true, username: true } },
      },
    });

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'create',
        entityType: 'digital_twin',
        entityId: twin.id,
        newValues: JSON.stringify({ name, assetId }),
      },
    });

    return NextResponse.json({ success: true, data: twin }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create digital twin';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
