import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

// ============================================================================
// COMPONENT MAPPING SERVICE — Mesh-to-Entity Mapping Management
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
  mappingType?: string;
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

    const where: Prisma.MeshComponentMappingWhereInput = { modelId };
    if (mappingType) where.mappingType = mappingType;
    if (search?.trim()) {
      const q = search.trim();
      where.OR = [
        { meshName: { contains: q, mode: 'insensitive' } },
        { meshPath: { contains: q, mode: 'insensitive' } },
        { targetId: { contains: q, mode: 'insensitive' } },
        { targetName: { contains: q, mode: 'insensitive' } },
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

    const typeCounts = Object.fromEntries(
      grouped.map((row) => [row.mappingType, row._count._all]),
    );

    return {
      data: mappings,
      typeCounts,
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
        meshPath: meshPath?.trim() || meshName,
        mappingType,
        targetId,
        targetName: targetName?.trim() || null,
        color: color || null,
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

  async bulkCreateMappings(mappings: CreateMappingParams[], userId: string) {
    const results = await Promise.allSettled(
      mappings.map((mapping) => this.createMapping({ ...mapping, createdById: userId })),
    );

    const created: unknown[] = [];
    const errors: Array<{ index: number; error: string }> = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        created.push(result.value);
      } else {
        errors.push({
          index,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    });

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
    if (!mapping) {
      throw new Error('Mapping not found');
    }

    const data: Prisma.MeshComponentMappingUpdateInput = {};
    if (typeof updates.meshName === 'string') data.meshName = updates.meshName;
    if (typeof updates.meshPath === 'string') data.meshPath = updates.meshPath;
    if (typeof updates.mappingType === 'string') data.mappingType = updates.mappingType;
    if (typeof updates.targetId === 'string') data.targetId = updates.targetId;
    if (updates.targetName === null || typeof updates.targetName === 'string') data.targetName = updates.targetName;
    if (updates.color === null || typeof updates.color === 'string') data.color = updates.color;
    if (typeof updates.opacity === 'number') data.opacity = updates.opacity;
    if (typeof updates.isHighlighted === 'boolean') data.isHighlighted = updates.isHighlighted;
    if (typeof updates.isVisible === 'boolean') data.isVisible = updates.isVisible;
    if (typeof updates.sortOrder === 'number') data.sortOrder = updates.sortOrder;
    if (updates.metadata !== undefined) {
      data.metadata = updates.metadata === null ? null : JSON.stringify(updates.metadata);
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
