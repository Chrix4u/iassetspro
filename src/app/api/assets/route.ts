import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import {
  applyPlantScope,
  canAccessPlantStrict,
  getPlantScope,
} from '@/lib/plant-scope';

// Helper: generate asset tag AST-YYYYMM-NNNN
async function generateAssetTag(): Promise<string> {
  const now = new Date();
  const prefix = `AST-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

  const latest = await db.asset.findFirst({
    where: { assetTag: { startsWith: prefix } },
    orderBy: { assetTag: 'desc' },
    select: { assetTag: true },
  });

  let nextNum = 1;
  if (latest) {
    const parts = latest.assetTag.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    nextNum = lastNum + 1;
  }

  return `${prefix}-${String(nextNum).padStart(4, '0')}`;
}

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const condition = searchParams.get('condition');
    const criticality = searchParams.get('criticality');
    const categoryId = searchParams.get('categoryId');
    const searchPlantId = searchParams.get('plantId');
    const departmentId = searchParams.get('departmentId');
    const search = searchParams.get('search');
    const topLevelOnly = searchParams.get('topLevelOnly') === 'true';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // Resolve plant scope (validates X-Plant-ID against user's plant access).
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const where: Record<string, unknown> = { isActive: true };

    if (status) where.status = status;
    if (condition) where.condition = condition;
    if (criticality) where.criticality = criticality;
    if (categoryId) where.categoryId = categoryId;
    if (departmentId) where.departmentId = departmentId;
    if (topLevelOnly) where.parentId = null;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { assetTag: { contains: search } },
        { serialNumber: { contains: search } },
        { manufacturer: { contains: search } },
        { model: { contains: search } },
      ];
    }

    // Plant isolation rules:
    // - an explicit X-Plant-ID remains the authoritative selected context;
    // - otherwise a plant query parameter must itself be accessible;
    // - otherwise regular users are filtered to all assigned plants;
    // - system-wide users remain unrestricted when no plant filter is supplied.
    if (plantScope.isScoped && plantScope.plantId) {
      where.plantId = plantScope.plantId;
    } else if (searchPlantId) {
      if (!canAccessPlantStrict(plantScope, searchPlantId)) {
        return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
      }
      where.plantId = searchPlantId;
    } else {
      applyPlantScope(where, plantScope);
    }

    const [assets, total] = await Promise.all([
      db.asset.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, code: true } },
          plant: { select: { id: true, name: true, code: true } },
          department: { select: { id: true, name: true, code: true } },
          assignedTo: { select: { id: true, fullName: true, username: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.asset.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: assets,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load assets';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'assets.create') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const {
      name,
      description,
      categoryId,
      serialNumber,
      manufacturer,
      model,
      yearManufactured,
      condition,
      status,
      criticality,
      location,
      building,
      floor,
      area,
      plantId,
      departmentId,
      purchaseDate,
      purchaseCost,
      warrantyExpiry,
      installedDate,
      expectedLifeYears,
      currentValue,
      depreciationRate,
      imageUrl,
      drawingsUrl,
      manualUrl,
      specification,
      parentId,
      assignedToId,
    } = body;

    if (!name) {
      return NextResponse.json({ success: false, error: 'Asset name is required' }, { status: 400 });
    }

    if (!categoryId) {
      return NextResponse.json({ success: false, error: 'Category is required' }, { status: 400 });
    }

    if (!plantId) {
      return NextResponse.json({ success: false, error: 'Plant is required' }, { status: 400 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied for target plant' }, { status: 403 });
    }

    // Validate category exists
    const categoryExists = await db.assetCategory.findUnique({ where: { id: categoryId } });
    if (!categoryExists) {
      return NextResponse.json({ success: false, error: 'Category not found' }, { status: 400 });
    }

    // Validate plant exists
    const plantExists = await db.plant.findUnique({ where: { id: plantId } });
    if (!plantExists) {
      return NextResponse.json({ success: false, error: 'Plant not found' }, { status: 400 });
    }

    // Parent/child hierarchy cannot cross a plant boundary.
    if (parentId) {
      const parent = await db.asset.findUnique({
        where: { id: parentId },
        select: { id: true, plantId: true },
      });
      if (!parent) {
        return NextResponse.json({ success: false, error: 'Parent asset not found' }, { status: 400 });
      }
      if (parent.plantId !== plantId) {
        return NextResponse.json(
          { success: false, error: 'Parent asset must belong to the same plant' },
          { status: 400 },
        );
      }
    }

    const assetTag = await generateAssetTag();

    // Build relation connections
    const categoryConnect = categoryId ? { connect: { id: categoryId } } : undefined;
    const plantConnect = plantId ? { connect: { id: plantId } } : undefined;
    const departmentConnect = departmentId ? { connect: { id: departmentId } } : undefined;
    const assignedToConnect = assignedToId ? { connect: { id: assignedToId } } : undefined;
    const parentConnect = parentId ? { connect: { id: parentId } } : undefined;

    const asset = await db.asset.create({
      data: {
        assetTag,
        name,
        description: description || null,
        category: categoryConnect,
        serialNumber: serialNumber || null,
        manufacturer: manufacturer || null,
        model: model || null,
        yearManufactured: yearManufactured ? parseInt(yearManufactured, 10) : null,
        condition: condition || 'new',
        status: status || 'operational',
        criticality: criticality || 'medium',
        location: location || null,
        building: building || null,
        floor: floor || null,
        area: area || null,
        plant: plantConnect,
        department: departmentConnect,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
        purchaseCost: purchaseCost ? parseFloat(purchaseCost) : null,
        warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null,
        installedDate: installedDate ? new Date(installedDate) : null,
        expectedLifeYears: expectedLifeYears ? parseInt(expectedLifeYears, 10) : null,
        currentValue: currentValue ? parseFloat(currentValue) : null,
        depreciationRate: depreciationRate ? parseFloat(depreciationRate) : null,
        imageUrl: imageUrl || null,
        drawingsUrl: drawingsUrl || null,
        manualUrl: manualUrl || null,
        specification: specification || '{}',
        parent: parentConnect,
        createdBy: { connect: { id: session.userId } },
        assignedTo: assignedToConnect,
      },
      include: {
        category: { select: { id: true, name: true, code: true } },
        plant: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true, code: true } },
        assignedTo: { select: { id: true, fullName: true, username: true } },
        createdBy: { select: { id: true, fullName: true, username: true } },
      },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'create',
        entityType: 'asset',
        entityId: asset.id,
        newValues: JSON.stringify({ assetTag, name, categoryId, plantId }),
      },
    });

    return NextResponse.json({ success: true, data: asset }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create asset';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
