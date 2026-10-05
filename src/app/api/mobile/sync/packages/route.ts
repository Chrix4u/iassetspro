// ============================================================================
// GET /api/mobile/sync/packages — Get data packages for offline use
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getPlantScope, getPlantFilterWhere, canAccessPlantStrict } from '@/lib/plant-scope';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const logger = createLogger('api:mobile:sync-packages');

export async function GET(req: NextRequest) {
  try {
    const session = getSession(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const plantId = url.searchParams.get('plantId');
    const entityTypes = url.searchParams.get('entityTypes');
    const sinceVersion = url.searchParams.get('sinceVersion');

    const plantScope = await getPlantScope(req, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }
    if (plantId && !canAccessPlantStrict(plantScope, plantId)) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }
    const plantFilter = plantId ? { plantId } : getPlantFilterWhere(plantScope);

    let sinceDate: Date | undefined;
    if (sinceVersion) {
      const parsed = Number(sinceVersion);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return NextResponse.json({ success: false, error: 'sinceVersion must be a non-negative timestamp' }, { status: 400 });
      }
      sinceDate = new Date(parsed);
    }

    const packages: Array<{
      entityType: string;
      priority: string;
      records: unknown[];
      version: number;
    }> = [];

    const allowedEntityTypes = new Set([
      'work_orders', 'assets', 'inspection_templates',
      'geofence_zones', 'maintenance_requests',
    ]);
    const types = entityTypes ? entityTypes.split(',').filter(Boolean) : [...allowedEntityTypes];
    const unsupported = types.filter((type) => !allowedEntityTypes.has(type));
    if (unsupported.length > 0) {
      return NextResponse.json({
        success: false,
        error: `Unsupported offline entity type: ${unsupported.join(', ')}`,
      }, { status: 400 });
    }

    for (const entityType of types) {
      try {
        let records: unknown[] = [];

        switch (entityType) {
          case 'work_orders': {
            const where: Record<string, unknown> = {
              ...plantFilter,
              status: { in: ['assigned', 'in_progress'] },
              OR: [
                { assignedTo: session.userId },
                { teamLeaderId: session.userId },
                {
                  teamMembers: {
                    some: {
                      userId: session.userId,
                      role: { not: 'handover_receiver' },
                      accessLevel: { not: 'read_only' },
                    },
                  },
                },
              ],
            };
            if (sinceDate) where.updatedAt = { gt: sinceDate };

            records = await db.workOrder.findMany({
              where,
              take: 50,
              orderBy: { updatedAt: 'desc' },
              select: {
                id: true, woNumber: true, title: true, description: true, type: true,
                priority: true, status: true, assetId: true, assetName: true,
                assignedTo: true, estimatedHours: true, plannedStart: true, plannedEnd: true,
                safetyNotes: true, ppeRequired: true, updatedAt: true, plantId: true,
              },
            });
            break;
          }
          case 'assets': {
            const where: Record<string, unknown> = { isActive: true, ...plantFilter };
            if (sinceDate) where.updatedAt = { gt: sinceDate };
            records = await db.asset.findMany({
              where,
              take: 200,
              orderBy: { name: 'asc' },
              select: { id: true, name: true, assetTag: true, serialNumber: true, status: true, criticality: true, location: true, plantId: true, specification: true },
            });
            break;
          }
          case 'inspection_templates': {
            records = await db.inspectionTemplate.findMany({
              where: { isActive: true, ...(sinceDate ? { updatedAt: { gt: sinceDate } } : {}) },
              orderBy: { name: 'asc' },
              select: { id: true, name: true, description: true, category: true, frequency: true, estimatedMinutes: true, sectionsJson: true, passThreshold: true },
            });
            break;
          }
          case 'geofence_zones': {
            records = await db.geofenceZone.findMany({
              where: { isActive: true, ...plantFilter, ...(sinceDate ? { updatedAt: { gt: sinceDate } } : {}) },
              select: { id: true, name: true, description: true, zoneType: true, coordinates: true, alertOnEnter: true, alertOnExit: true, requiresPermit: true, hazardLevel: true, plantId: true },
            });
            break;
          }
          case 'maintenance_requests': {
            const where: Record<string, unknown> = { requestedBy: session.userId, ...plantFilter };
            if (sinceDate) where.updatedAt = { gt: sinceDate };
            records = await db.maintenanceRequest.findMany({
              where,
              take: 50,
              orderBy: { updatedAt: 'desc' },
              select: { id: true, requestNumber: true, title: true, description: true, priority: true, status: true, assetId: true, plantId: true },
            });
            break;
          }
          default: {
            logger.warn('Unknown entity type requested', { entityType });
          }
        }

        packages.push({
          entityType,
          priority: entityType === 'work_orders' ? 'critical' : entityType === 'assets' ? 'high' : 'medium',
          records,
          version: Date.now(),
        });
      } catch (err) {
        logger.error(`Failed to fetch package for ${entityType}`, { error: (err as Error).message });
      }
    }

    const totalRecords = packages.reduce((sum, p) => sum + p.records.length, 0);

    logger.info('Sync packages served', { userId: session.userId, packageCount: packages.length, totalRecords });

    return NextResponse.json({
      success: true,
      data: {
        packages,
        totalRecords,
        servedAt: new Date().toISOString(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to get sync packages';
    logger.error('Sync packages GET error', error instanceof Error ? error : { error: message });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
