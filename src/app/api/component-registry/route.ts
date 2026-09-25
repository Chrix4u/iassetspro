import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    // Allow component search by assetId for any authenticated user (e.g. technicians creating WO materials/returns)
    const { searchParams } = new URL(request.url);
    const assetIdParam = searchParams.get('assetId');
    if (!hasPermission(session, 'digital_twin.view') && !isAdmin(session) && !assetIdParam) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const twinId = searchParams.get('twinId');
    const assetId = assetIdParam;
    const parentId = searchParams.get('parentId');
    const componentType = searchParams.get('componentType');
    const criticality = searchParams.get('criticality');
    const lifecycleStatus = searchParams.get('lifecycleStatus');
    const search = searchParams.get('search');
    let page = parseInt(searchParams.get('page') || '1', 10);
    let limit = parseInt(searchParams.get('limit') || '50', 10);
    page = Math.max(1, isNaN(page) ? 1 : page);
    limit = Math.min(100, Math.max(1, isNaN(limit) ? 50 : limit));

    const where: Record<string, unknown> = {};

    if (twinId) where.twinId = twinId;
    if (assetId) where.assetId = assetId;
    if (parentId === 'null' || parentId === '') {
      where.parentId = null;
    } else if (parentId) {
      where.parentId = parentId;
    }
    if (componentType) where.componentType = componentType;
    if (criticality) where.criticality = criticality;
    if (lifecycleStatus) where.lifecycleStatus = lifecycleStatus;

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { componentCode: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const [components, total] = await Promise.all([
      db.componentRegistry.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        include: {
          parent: { select: { id: true, name: true, componentCode: true } },
          twin: { select: { id: true, name: true } },
          asset: { select: { id: true, name: true, assetTag: true } },
          _count: {
            select: {
              children: true,
              failureRecords: true,
              sparePartLinks: true,
              toolRequirements: true,
            },
          },
        },
        orderBy: { id: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.componentRegistry.count({
        where: Object.keys(where).length > 0 ? where : undefined,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: components,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load components';
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
      componentCode,
      name,
      description,
      componentType,
      parentId,
      twinId,
      assetId,
      manufacturer,
      modelNumber,
      serialNumber,
      specification,
      operatingParams,
      criticality,
      lifecycleStatus,
      installedDate,
      expectedLifeHours,
      operatingHours,
      lastInspection,
      nextInspectionDue,
      healthScore,
      notes,
    } = body;

    if (!componentCode) {
      return NextResponse.json({ success: false, error: 'componentCode is required' }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ success: false, error: 'name is required' }, { status: 400 });
    }

    // Check unique componentCode
    const existingCode = await db.componentRegistry.findUnique({ where: { componentCode } });
    if (existingCode) {
      return NextResponse.json({ success: false, error: 'Component code already exists' }, { status: 409 });
    }

    // Validate parentId if provided. A component hierarchy must remain
    // inside one parent machine/asset.
    if (parentId) {
      const parent = await db.componentRegistry.findUnique({ where: { id: parentId } });
      if (!parent) {
        return NextResponse.json({ success: false, error: 'Parent component not found' }, { status: 404 });
      }
      if (assetId && parent.assetId !== assetId) {
        return NextResponse.json(
          { success: false, error: 'Parent component belongs to a different asset' },
          { status: 400 },
        );
      }
    }

    // Validate twinId if provided
    if (twinId) {
      const twin = await db.digitalTwin.findUnique({ where: { id: twinId } });
      if (!twin) {
        return NextResponse.json({ success: false, error: 'Digital twin not found' }, { status: 404 });
      }
    }

    // Validate serialNumber uniqueness if provided
    if (serialNumber) {
      const existingSerial = await db.componentRegistry.findUnique({ where: { serialNumber } });
      if (existingSerial) {
        return NextResponse.json({ success: false, error: 'Serial number already exists' }, { status: 409 });
      }
    }

    const component = await db.componentRegistry.create({
      data: {
        componentCode,
        name,
        description: description || null,
        componentType: componentType || 'component',
        parentId: parentId || null,
        twinId: twinId || null,
        assetId: assetId || null,
        manufacturer: manufacturer || null,
        modelNumber: modelNumber || null,
        serialNumber: serialNumber || null,
        specification: specification ? JSON.stringify(specification) : null,
        operatingParams: operatingParams ? JSON.stringify(operatingParams) : null,
        criticality: criticality || 'medium',
        lifecycleStatus: lifecycleStatus || 'operational',
        installedDate: installedDate ? new Date(installedDate) : null,
        expectedLifeHours: expectedLifeHours ? parseFloat(String(expectedLifeHours)) : null,
        operatingHours: operatingHours ? parseFloat(String(operatingHours)) : 0,
        lastInspection: lastInspection ? new Date(lastInspection) : null,
        nextInspectionDue: nextInspectionDue ? new Date(nextInspectionDue) : null,
        healthScore: healthScore !== undefined ? parseInt(String(healthScore), 10) : 100,
        notes: notes || null,
      },
      include: {
        parent: { select: { id: true, name: true, componentCode: true } },
        twin: { select: { id: true, name: true } },
        asset: { select: { id: true, name: true, assetTag: true } },
        _count: {
          select: {
            children: true,
            failureRecords: true,
            sparePartLinks: true,
            toolRequirements: true,
          },
        },
      },
    });

    await createAuditLog(
      session.userId,
      'component_registry',
      'create',
      component.id,
      { newValues: { componentCode, name, componentType, twinId, assetId, parentId } },
    );

    return NextResponse.json({ success: true, data: component }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create component';
    // Log full details for debugging
    console.error('[API /api/component-registry POST] Failed:', {
      message,
      componentCode,
      name,
      assetId,
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
