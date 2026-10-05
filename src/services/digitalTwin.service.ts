// ============================================================================
// DIGITAL TWIN SERVICE — Business logic extracted from API routes
// ============================================================================

import { BaseRepository } from '@/repositories/BaseRepository';
import { createLogger } from '@/lib/logger';
import { NotFoundError, ConflictError } from '@/lib/errors';
import { db } from '@/lib/db';

const log = createLogger('DigitalTwinService');

// Repositories
const twinRepo = new BaseRepository('digitalTwin');
const sceneRepo = new BaseRepository('digitalTwinScene');
const modelRepo = new BaseRepository('assetModel');
const hotspotRepo = new BaseRepository('twinHotspot');
const annotationRepo = new BaseRepository('twinAnnotation');
const cameraPresetRepo = new BaseRepository('twinCameraPreset');
const meshBindingRepo = new BaseRepository('assetMeshBinding');

export const digitalTwinService = {
  // ── Twin CRUD ─────────────────────────────────────────────────────────────

  async listTwins(params: {
    page: number;
    limit: number;
    search?: string;
    plantId?: string;
    isActive?: boolean;
  }) {
    const timer = log.timer('listTwins');
    const where: Record<string, unknown> = {};
    if (params.isActive !== undefined) where.isActive = params.isActive;
    if (params.plantId) (where as Record<string, unknown>).asset = { plantId: params.plantId };
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' as const } },
        { asset: { name: { contains: params.search, mode: 'insensitive' as const } } },
      ];
    }

    const result = await twinRepo.findManyPaginated({
      where,
      include: {
        asset: { include: { plant: true } },
        createdBy: { select: { id: true, name: true, fullName: true } },
        _count: { select: { scenes: true } },
      },
      orderBy: { updatedAt: 'desc' },
      page: params.page,
      limit: params.limit,
    });

    // KPI aggregation
    const [totalKpi, activeCount, inactiveCount] = await Promise.all([
      twinRepo.count(),
      twinRepo.count({ where: { isActive: true } }),
      twinRepo.count({ where: { isActive: false } }),
    ]);

    timer.end();
    return {
      ...result,
      kpis: { total: totalKpi, active: activeCount, inactive: inactiveCount },
    };
  },

  async getTwinById(id: string) {
    const timer = log.timer('getTwinById');
    const twin = await twinRepo.findByIdOrFail(id, {
      include: {
        asset: { include: { plant: true, parent: true } },
        createdBy: { select: { id: true, name: true, fullName: true } },
        scenes: {
          include: { model: true, hotspots: true, annotations: true, cameraPresets: true },
          orderBy: { createdAt: 'desc' },
        },
        componentRegistry: {
          where: { parentId: null },
          include: { children: true },
        },
      },
    });
    timer.end();
    return twin;
  },

  async createTwin(data: {
    assetId: string;
    name: string;
    description?: string;
    type: string;
    parameters?: Record<string, unknown>;
    connections?: Record<string, unknown>;
    syncInterval: string;
    createdById: string;
  }) {
    const timer = log.timer('createTwin');

    // Verify asset exists
    const asset = await db.asset.findUnique({ where: { id: data.assetId } });
    if (!asset) throw new NotFoundError('Asset', data.assetId);

    // Check for existing twin on this asset
    const existing = await twinRepo.exists({ assetId: data.assetId });
    if (existing) throw new ConflictError('DigitalTwin', 'assetId', data.assetId);

    const twin = await twinRepo.create({
      assetId: data.assetId,
      name: data.name,
      description: data.description,
      type: data.type,
      parameters: JSON.stringify(data.parameters || {}),
      connections: JSON.stringify(data.connections || {}),
      syncInterval: data.syncInterval,
      createdById: data.createdById,
    } as Record<string, unknown>);

    log.info('Digital twin created', { twinId: (twin as unknown as { id: string }).id, assetId: data.assetId });
    timer.end();
    return twin;
  },

  async deleteTwin(id: string) {
    const timer = log.timer('deleteTwin');
    const twin = await twinRepo.findByIdOrFail(id);
    await twinRepo.delete(id);
    log.info('Digital twin deleted', { twinId: id, assetId: (twin as unknown as Record<string, unknown>).assetId });
    timer.end();
  },

  // ── Scene Management ─────────────────────────────────────────────────────

  async createScene(data: {
    twinId: string;
    modelId: string;
    name: string;
    createdById: string;
    description?: string;
    sceneType?: string;
    environment?: string;
  }) {
    const timer = log.timer('createScene');
    await twinRepo.findByIdOrFail(data.twinId);
    await modelRepo.findByIdOrFail(data.modelId);

    const scene = await sceneRepo.create({
      twinId: data.twinId,
      modelId: data.modelId,
      name: data.name,
      description: data.description,
      sceneType: data.sceneType || '3d',
      environment: data.environment || 'warehouse',
      createdById: data.createdById,
    } as Record<string, unknown>);

    log.info('Scene created', { sceneId: (scene as unknown as { id: string }).id, twinId: data.twinId });
    timer.end();
    return scene;
  },

  async getSceneById(id: string) {
    return sceneRepo.findByIdOrFail(id, {
      include: {
        twin: { include: { asset: true } },
        model: { include: { bindings: { include: { asset: true } } } },
        hotspots: { include: { asset: true } },
        annotations: { include: { author: { select: { id: true, name: true, fullName: true } } } },
        cameraPresets: true,
        createdBy: { select: { id: true, name: true, fullName: true } },
      },
    });
  },

  // ── Component Registry ────────────────────────────────────────────────────

  async getComponentTree(assetId: string) {
    const timer = log.timer('getComponentTree');
    const components = await db.componentRegistry.findMany({
      where: { assetId },
      include: {
        children: {
          include: {
            children: true,
            _count: { select: { children: true, failureRecords: true, sparePartLinks: true } },
          },
        },
        _count: { select: { children: true, failureRecords: true, sparePartLinks: true } },
        failureRecords: { take: 5, orderBy: { detectedAt: 'desc' } },
      },
      orderBy: { name: 'asc' },
    });
    timer.end();
    return components;
  },

  // ── Health Computation ───────────────────────────────────────────────────

  async computeHealthScore(componentId: string) {
    const timer = log.timer('computeHealthScore');

    const component = await db.componentRegistry.findUnique({
      where: { id: componentId },
      include: {
        failureRecords: { orderBy: { detectedAt: 'desc' }, take: 20 },
      },
    });

    if (!component) throw new NotFoundError('Component', componentId);

    // Weighted factors
    let score = 100;
    const factors: Record<string, Record<string, unknown>> = {};

    // Factor 1: Recent failures (weight 30%)
    const recentFailures = component.failureRecords.filter(
      (f) => !f.resolvedAt && new Date(f.detectedAt) > new Date(Date.now() - 90 * 86400000)
    );
    const failurePenalty = Math.min(30, recentFailures.length * 10);
    score -= failurePenalty;
    factors.recentFailures = { weight: 30, penalty: failurePenalty, count: recentFailures.length };

    // Factor 2: Operating hours vs expected life (weight 25%)
    if (component.expectedLifeHours && component.expectedLifeHours > 0) {
      const usageRatio = component.operatingHours / component.expectedLifeHours;
      const lifePenalty = Math.min(25, Math.max(0, (usageRatio - 0.7) * 83));
      score -= lifePenalty;
      factors.operatingLife = { weight: 25, penalty: lifePenalty, usagePercent: Math.round(usageRatio * 100) };
    }

    // Factor 3: Days since last inspection (weight 20%)
    if (component.lastInspection) {
      const daysSince = Math.floor((Date.now() - new Date(component.lastInspection).getTime()) / 86400000);
      const inspectionPenalty = daysSince > 365 ? 20 : daysSince > 180 ? 10 : 0;
      score -= inspectionPenalty;
      factors.inspection = { weight: 20, penalty: inspectionPenalty, daysSince };
    }

    // Factor 4: Lifecycle status (weight 25%)
    const statusPenalty: Record<string, number> = {
      operational: 0,
      degraded: 15,
      under_maintenance: 10,
      failed: 25,
      decommissioned: 20,
    };
    const statusP = statusPenalty[component.lifecycleStatus] || 0;
    score -= statusP;
    factors.lifecycle = { weight: 25, penalty: statusP, status: component.lifecycleStatus };

    score = Math.max(0, Math.min(100, Math.round(score)));
    timer.end();
    return {
      healthScore: score,
      factors,
      recommendations: generateRecommendations(score, factors),
    };
  },
};

// ── Recommendation Engine ──────────────────────────────────────────────────

function generateRecommendations(
  score: number,
  factors: Record<string, Record<string, unknown>>
): string[] {
  const recommendations: string[] = [];

  if (score < 40) recommendations.push('CRITICAL: Immediate inspection and maintenance required');
  if (factors.recentFailures && (factors.recentFailures.count as number) > 0) {
    recommendations.push(`Address ${(factors.recentFailures.count as number)} unresolved failure(s)`);
  }
  if (factors.operatingLife && (factors.operatingLife.usagePercent as number) > 80) {
    recommendations.push(`Operating at ${factors.operatingLife.usagePercent}% of expected life — plan replacement`);
  }
  if (factors.inspection && (factors.inspection.daysSince as number) > 180) {
    recommendations.push(`Overdue for inspection by ${factors.inspection.daysSince} days`);
  }
  if (factors.lifecycle && factors.lifecycle.status === 'degraded') {
    recommendations.push('Component showing degraded performance — schedule maintenance');
  }
  if (recommendations.length === 0) {
    recommendations.push('Component operating within normal parameters');
  }

  return recommendations;
}
