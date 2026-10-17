import { db } from '@/lib/db';

// ============================================================================
// MODEL PIPELINE SERVICE — 3D Model Management & Processing Pipeline
// ============================================================================

export interface ListModelsParams {
  page?: number;
  limit?: number;
  search?: string;
  plantId?: string;
  plantIds?: string[];
  format?: string;
  status?: string;
  assetId?: string;
}

export interface CreateModelParams {
  name: string;
  description?: string;
  plantId?: string;
  assetId?: string;
  originalFile?: string;
  storedPath?: string;
  fileKey?: string;
  mimeType?: string;
  format?: string;
  fileSize?: number;
  version?: number | string;
  metadata?: Record<string, unknown>;
  uploadedById: string;
}

function parseVersion(value: number | string | undefined): number {
  if (value === undefined || value === null || value === '') return 1;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export const modelPipelineService = {
  async listModels(params: ListModelsParams) {
    const { page = 1, limit = 20, search, plantId, plantIds, format, status, assetId } = params;

    const where: Record<string, unknown> = { isActive: true };

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { originalFile: { contains: search } },
        { format: { contains: search } },
      ];
    }
    if (plantId) where.plantId = plantId;
    else if (plantIds) where.plantId = { in: plantIds };
    if (assetId) where.assetId = assetId;
    if (format) where.format = format;
    if (status) where.status = status;

    const [models, total, readyCount, processingCount, sizeAggregate] = await Promise.all([
      db.modelLibrary.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          uploadedBy: { select: { id: true, fullName: true, username: true } },
          asset: { select: { id: true, name: true, assetTag: true } },
          plant: { select: { id: true, name: true, code: true } },
          _count: { select: { scenes: true, versions: true } },
        },
      }),
      db.modelLibrary.count({ where }),
      db.modelLibrary.count({ where: { ...where, status: 'ready' } }),
      db.modelLibrary.count({ where: { ...where, status: 'processing' } }),
      db.modelLibrary.aggregate({ where, _sum: { fileSize: true } }),
    ]);

    return {
      data: models,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      stats: {
        totalCount: total,
        readyCount,
        processingCount,
        totalSizeBytes: sizeAggregate._sum.fileSize ?? 0,
      },
    };
  },

  async getModelById(id: string) {
    const model = await db.modelLibrary.findUnique({
      where: { id },
      include: {
        uploadedBy: { select: { id: true, fullName: true, username: true } },
        asset: { select: { id: true, name: true, assetTag: true, status: true, plantId: true } },
        plant: { select: { id: true, name: true, code: true } },
        modelProcessingJobs: { orderBy: { createdAt: 'desc' } },
        _count: { select: { scenes: true, versions: true, meshComponentMappings: true } },
      },
    });

    if (!model) {
      throw new Error('3D model not found');
    }

    return model;
  },

  async createModelRecord(params: CreateModelParams) {
    const {
      name,
      description,
      plantId,
      assetId,
      originalFile,
      storedPath,
      fileKey,
      mimeType,
      format,
      fileSize,
      version,
      metadata,
      uploadedById,
    } = params;

    if (!name) {
      throw new Error('Invalid: Model name is required');
    }

    return db.modelLibrary.create({
      data: {
        name,
        description: description || null,
        plantId: plantId || null,
        assetId: assetId || null,
        originalFile: originalFile || name,
        storedPath: storedPath || fileKey || '',
        fileSize: fileSize || 0,
        mimeType: mimeType || 'model/gltf-binary',
        format: format || 'glb',
        version: parseVersion(version),
        metadata: metadata ? JSON.stringify(metadata) : null,
        status: 'processing',
        uploadedById,
      },
      include: {
        uploadedBy: { select: { id: true, fullName: true, username: true } },
        asset: { select: { id: true, name: true, assetTag: true } },
        plant: { select: { id: true, name: true, code: true } },
        _count: { select: { scenes: true, versions: true } },
      },
    });
  },

  async updateModelStatus(id: string, status: string, updates: Record<string, unknown> = {}) {
    const model = await db.modelLibrary.findUnique({ where: { id } });
    if (!model) {
      throw new Error('3D model not found');
    }

    const data: Record<string, unknown> = { status };
    for (const field of [
      'description',
      'thumbnail',
      'boundingBox',
      'geometryStats',
      'dracoCompressed',
      'optimizedForWeb',
      'maxLodPolygons',
      'processingLog',
      'processingError',
      'storedPath',
    ]) {
      if (updates[field] !== undefined) data[field] = updates[field];
    }
    if (updates.metadata !== undefined) {
      data.metadata = typeof updates.metadata === 'string' ? updates.metadata : JSON.stringify(updates.metadata);
    }

    return db.modelLibrary.update({
      where: { id },
      data,
      include: {
        uploadedBy: { select: { id: true, fullName: true, username: true } },
        asset: { select: { id: true, name: true, assetTag: true } },
        plant: { select: { id: true, name: true, code: true } },
        _count: { select: { scenes: true, versions: true } },
      },
    });
  },

  async deleteModel(id: string) {
    const model = await db.modelLibrary.findUnique({ where: { id } });
    if (!model) {
      throw new Error('3D model not found');
    }

    await db.modelLibrary.delete({ where: { id } });
  },

  async getModelJobs(id: string) {
    const model = await db.modelLibrary.findUnique({ where: { id }, select: { id: true } });
    if (!model) {
      throw new Error('3D model not found');
    }

    return db.modelProcessingJob.findMany({
      where: { modelId: id },
      orderBy: { createdAt: 'desc' },
    });
  },
};
