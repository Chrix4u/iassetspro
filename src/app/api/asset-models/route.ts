import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';

function parseNonNegativeInt(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'digital_twin.view') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const assetId = searchParams.get('assetId');
    const format = searchParams.get('format');
    let page = parseInt(searchParams.get('page') || '1', 10);
    let limit = parseInt(searchParams.get('limit') || '20', 10);
    page = Math.max(1, isNaN(page) ? 1 : page);
    limit = Math.min(100, Math.max(1, isNaN(limit) ? 20 : limit));

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { fileName: { contains: search } },
        { asset: { name: { contains: search } } },
        { asset: { assetTag: { contains: search } } },
      ];
    }

    if (assetId) {
      where.assetId = assetId;
    }

    if (format) {
      where.format = format;
    }

    const [models, total] = await Promise.all([
      db.assetModel.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        include: {
          asset: { select: { id: true, name: true, assetTag: true, status: true, condition: true } },
          uploadedBy: { select: { id: true, fullName: true, username: true } },
          _count: { select: { bindings: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.assetModel.count({
        where: Object.keys(where).length > 0 ? where : undefined,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: models.map(({ _count, ...model }) => ({
        ...model,
        _count: { meshBindings: _count.bindings },
      })),
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

    // Verify asset exists
    const asset = await db.asset.findUnique({ where: { id: assetId } });
    if (!asset) {
      return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });
    }

    const model = await db.assetModel.create({
      data: {
        assetId,
        name,
        fileName,
        fileSize: parseNonNegativeInt(fileSize),
        fileType,
        filePath,
        format: format || 'gltf',
        meshCount: parseNonNegativeInt(meshCount),
        vertexCount: parseNonNegativeInt(vertexCount),
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
