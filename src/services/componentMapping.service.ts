import { db } from '@/lib/db';

// ============================================================================
// COMPONENT MAPPING SERVICE — Mesh-to-entity mapping management
// ============================================================================

export interface ListMappingsParams {
  modelId: string;
  mappingType?: string;
  page?: number;
  limit?: number;
}

export interface CreateMappingParams {
  modelId: string;
  meshName: string;
  meshPath?: string;
  mappingType?: string;
  targetId: string;
  targetName?: string;
  color?: string;
  opacity?: number;
  isHighlighted?: boolean;
  isVisible?: boolean;
  metadata?: Record<string, unknown> | string;
  sortOrder?: number;
  createdById: string;
}

function serializeMetadata(value: CreateMappingParams['metadata']): string | null {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export const componentMappingService = {
  async listMappings(params: ListMappingsParams) {
    const { modelId, mappingType, page = 1, limit = 50 } = params;

    const where: Record<string, unknown> = { modelId };
    if (mappingType) where.mappingType = mappingType;

    const [mappings, total] = await Promise.all([
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
    ]);

    return {
      data: mappings,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  async createMapping(params: CreateMappingParams) {
    const {
      modelId,
      meshName,
      meshPath,
      mappingType = 'component',
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

    if (!modelId || !meshName || !targetId) {
      throw new Error('Invalid: modelId, meshName and targetId are required');
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
        color: color || null,
        opacity: opacity ?? 1,
        isHighlighted: isHighlighted ?? false,
        isVisible: isVisible ?? true,
        metadata: serializeMetadata(metadata),
        sortOrder: sortOrder ?? 0,
        createdById,
      },
      include: {
        createdBy: { select: { id: true, fullName: true, username: true } },
      },
    });
  },

  async bulkCreateMappings(mappings: CreateMappingParams[], userId: string) {
    const results = await Promise.allSettled(
      mappings.map((mapping) => this.createMapping({ ...mapping, createdById: userId })),
    );

    const created = results
      .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof this.createMapping>>> => result.status === 'fulfilled')
      .map((result) => result.value);
    const errors = results
      .map((result, index) => result.status === 'rejected'
        ? { index, error: result.reason instanceof Error ? result.reason.message : String(result.reason) }
        : null)
      .filter((item): item is { index: number; error: string } => item !== null);

    return {
      created,
      errors,
      totalRequested: mappings.length,
      successCount: created.length,
      errorCount: errors.length,
    };
  },

  async updateMapping(id: string, updates: Record<string, unknown>) {
    const mapping = await db.meshComponentMapping.findUnique({ where: { id } });
    if (!mapping) throw new Error('Mapping not found');

    const data: Record<string, unknown> = {};
    const simpleFields = [
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
    ];
    for (const field of simpleFields) {
      if (updates[field] !== undefined) data[field] = updates[field];
    }
    if (updates.metadata !== undefined) {
      data.metadata = typeof updates.metadata === 'string'
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
    if (!mapping) throw new Error('Mapping not found');
    await db.meshComponentMapping.delete({ where: { id } });
  },
};
