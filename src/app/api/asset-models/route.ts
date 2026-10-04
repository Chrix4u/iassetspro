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
    const assetId = searchParams.get('assetId');
    const format = searchParams.get('format');
    let page = parseInt(searchParams.get('page') || '1', 10);
    let limit = parseInt(searchParams.get('limit') || '20', 10);
    page = Math.max(1, isNaN(page) ? 1 : page);
    limit = Math.min(100, Math.max(1, isNaN(limit) ? 20 : limit));

    const where: Record<string, unknown> = {
      asset: { is: assetPlantWhere },
    };

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { fileName: { contains: search } },
        { asset: { is: { name: { contains: search } } } },
        { asset: { is: { assetTag: { contains: search } } } },
      ];
    }

    if (assetId) {
      const asset = await db.asset.findUnique({ where: { id: assetId }, select: { plantId: true } });
      if (!asset || !canAccessPlantStrict(plantScope, asset.plantId)) {
        return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
      }
      where.assetId = assetId;
    }

    if (format) {
      where.format = format;
    }

    const [models, total] = await Promise.all([
      db.assetModel.findMany({
        where,
        include: {
          asset: { select: { id: true, name: true, assetTag: true, status: true, condition: true } },
          uploadedBy: { select: { id: true, fullName: true, username: true } },
          _count: { select: { meshBindings: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.assetModel.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: models,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load asset models';
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
    const { assetId, name, fileName, fileSize, fileType, filePath, format, meshCount, vertexCount } = body;

    if (!assetId) {
      return NextResponse.json({ success: false, error: 'Asset ID is required' }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ success: false, error: 'Model name is required' }, { status: 400 });
    }

    if (!fileName) {
      return NextResponse.json({ success: false, error: 'File name is required' }, { status: 400 });
    }

    if (!filePath) {
      return NextResponse.json({ success: false, error: 'File path is required' }, { status: 400 });
    }

    if (!fileType) {
      return NextResponse.json({ success: false, error: 'File type is required' }, { status: 400 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    // Verify asset exists and belongs to the caller's plant scope.
    const asset = await db.asset.findUnique({ where: { id: assetId }, select: { id: true, plantId: true } });
    if (!asset) {
      return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });
    }
    if (!canAccessPlantStrict(plantScope, asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const model = await db.assetModel.create({
      data: {
        assetId,
        name,
        fileName,
        fileSize: fileSize !== undefined ? parseInt(String(fileSize), 10) : 0,
        fileType,
        filePath,
        format: format || 'gltf',
        meshCount: meshCount ? parseInt(String(meshCount), 10) : null,
        vertexCount: vertexCount ? parseInt(String(vertexCount), 10) : null,
        uploadedById: session.userId,
      },
      include: {
        asset: { select: { id: true, name: true, assetTag: true, status: true, condition: true } },
        uploadedBy: { select: { id: true, fullName: true, username: true } },
      },
    });

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'create',
        entityType: 'asset_model',
        entityId: model.id,
        newValues: JSON.stringify({ name, assetId, format: format || 'gltf' }),
      },
    });

    return NextResponse.json({ success: true, data: model }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create asset model';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
