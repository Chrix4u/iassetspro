import { db } from '@/lib/db';

// ============================================================================
// COMPONENT MAPPING SERVICE — Mesh-to-Component Mapping Management
// ============================================================================

export interface ListMappingsParams {
  modelId: string;
  mappingType?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateMappingParams {
  modelId: string;
  meshName: string;
  meshPath?: string;
  mappingType: string;
  targetId: string;
  targetName?: string;
  color?: string;
  opacity?: number;
  isHighlighted?: boolean;
  isVisible?: boolean;
  metadata?: Record<string, unknown>;
  sortOrder?: number;
  createdById: string;
}

export const componentMappingService = {
  async listMappings(params: ListMappingsParams) {
    const { modelId, mappingType, search, page = 1, limit = 50 } = params;

    const where: Record<string, unknown> = { modelId };
    if (mappingType) where.mappingType = mappingType;
    if (search) {
      where.OR = [
        { meshName: { contains: search } },
        { meshPath: { contains: search } },
        { targetName: { contains: search } },
      ];
    }

    const [mappings, total, grouped] = await Promise.all([
      db.meshComponentMapping.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          createdBy: { select: { id: true, fullName: true, username: true } },
        },
      }),
      db.meshComponentMapping.count({ where }),
      db.meshComponentMapping.groupBy({
        by: ['mappingType'],
        where: { modelId },
        _count: { _all: true },
      }),
    ]);

    return {
      data: mappings,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      typeCounts: Object.fromEntries(grouped.map((row) => [row.mappingType, row._count._all])),
    };
  },

  async createMapping(params: CreateMappingParams) {
    const {
      modelId,
      meshName,
      meshPath,
      mappingType,
      targetId,
      targetName,
      color,
      opacity,
      isHighlighted,
      isVisible,
      metadata,
      sortOrder,
      createdById,
    } = params;

    if (!modelId || !meshName || !mappingType || !targetId) {
      throw new Error('Invalid: modelId, meshName, mappingType and targetId are required');
    }

    const existing = await db.meshComponentMapping.findFirst({
      where: { modelId, meshName, mappingType, targetId },
    });
    if (existing) {
      throw new Error('Conflict: Mapping already exists for this mesh and target');
    }

    return db.meshComponentMapping.create({
      data: {
        modelId,
        meshName,
        meshPath: meshPath || meshName,
        mappingType,
        targetId,
        targetName: targetName || null,
        color: color || '#10b981',
        opacity: opacity ?? 1,
        isHighlighted: isHighlighted ?? false,
        isVisible: isVisible ?? true,
        metadata: metadata ? JSON.stringify(metadata) : null,
        sortOrder: sortOrder ?? 0,
        createdById,
      },
      include: {
        createdBy: { select: { id: true, fullName: true, username: true } },
      },
    });
  },

  async bulkCreateMappings(mappings: Omit<CreateMappingParams, 'createdById'>[], userId: string) {
    const results = await Promise.allSettled(
      mappings.map((mapping) => this.createMapping({ ...mapping, createdById: userId })),
    );

    const created = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    const errors = results.flatMap((result, index) =>
      result.status === 'rejected'
        ? [{ index, error: result.reason instanceof Error ? result.reason.message : String(result.reason) }]
        : [],
    );

    return {
      created,
      errors,
      totalRequested: mappings.length,
      successCount: created.length,
      errorCount: errors.length,
    };
  },

  async getMappingById(id: string) {
    const mapping = await db.meshComponentMapping.findUnique({
      where: { id },
      include: {
        model: {
          select: {
            id: true,
            name: true,
            plantId: true,
            assetId: true,
            asset: { select: { plantId: true } },
          },
        },
        createdBy: { select: { id: true, fullName: true, username: true } },
      },
    });
    if (!mapping) throw new Error('Mapping not found');
    return mapping;
  },

  async updateMapping(id: string, updates: Record<string, unknown>) {
    const mapping = await db.meshComponentMapping.findUnique({ where: { id } });
    if (!mapping) {
      throw new Error('Mapping not found');
    }

    const data: Record<string, unknown> = {};
    for (const field of [
      'meshName',
      'meshPath',
      'mappingType',
      'targetId',
      'targetName',
      'color',
      'opacity',
      'isHighlighted',
      'isVisible',
      'sortOrder',
    ]) {
      if (updates[field] !== undefined) data[field] = updates[field];
    }
    if (updates.metadata !== undefined) {
      data.metadata = updates.metadata === null
        ? null
        : typeof updates.metadata === 'string'
          ? updates.metadata
          : JSON.stringify(updates.metadata);
    }

    return db.meshComponentMapping.update({
      where: { id },
      data,
      include: {
        createdBy: { select: { id: true, fullName: true, username: true } },
      },
    });
  },

  async deleteMapping(id: string) {
    const mapping = await db.meshComponentMapping.findUnique({ where: { id } });
    if (!mapping) {
      throw new Error('Mapping not found');
    }

    await db.meshComponentMapping.delete({ where: { id } });
  },
};
