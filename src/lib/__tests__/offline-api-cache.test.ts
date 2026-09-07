import { describe, expect, it } from 'vitest';
import {
  buildOfflineSnapshotId,
  isOfflineSnapshotEndpoint,
} from '@/lib/offline-api-cache';

describe('offline API snapshot policy', () => {
  it.each([
    '/api/work-orders/wo-1',
    '/api/work-orders/wo-1/tasks',
    '/api/work-orders/wo-1/time-logs?includeTeamLogs=true',
    '/api/work-orders/wo-1/measurements',
    '/api/work-orders/wo-1/components',
    '/api/work-orders/wo-1/comments',
    '/api/work-orders/wo-1/personal-tools',
    '/api/work-orders/wo-1/status-history',
    '/api/repairs/downtime?workOrderId=wo-1&limit=50',
  ])('allows stale-safe field execution read %s', (endpoint) => {
    expect(isOfflineSnapshotEndpoint(endpoint)).toBe(true);
  });

  it.each([
    '/api/auth/me',
    '/api/auth/login',
    '/api/work-orders/wo-1/readiness?phase=complete',
    '/api/work-orders/wo-1/start',
    '/api/work-orders/wo-1/hold',
    '/api/work-orders/wo-1/resume',
    '/api/work-orders/wo-1/complete',
    '/api/repairs/completion/wo-1',
    '/api/inventory',
    '/api/repairs/downtime?limit=50',
  ])('never snapshots authoritative or broad endpoint %s', (endpoint) => {
    expect(isOfflineSnapshotEndpoint(endpoint)).toBe(false);
  });

  it('partitions snapshots by both actor and plant', () => {
    const endpoint = '/api/work-orders/wo-1/tasks';
    const actorAPlantA = buildOfflineSnapshotId('tech-a', 'plant-a', endpoint);
    const actorBPlantA = buildOfflineSnapshotId('tech-b', 'plant-a', endpoint);
    const actorAPlantB = buildOfflineSnapshotId('tech-a', 'plant-b', endpoint);

    expect(actorAPlantA).not.toBe(actorBPlantA);
    expect(actorAPlantA).not.toBe(actorAPlantB);
  });

  it('includes the full endpoint including query string in the snapshot key', () => {
    expect(
      buildOfflineSnapshotId('tech-a', 'plant-a', '/api/work-orders/wo-1/time-logs?includeTeamLogs=true'),
    ).not.toBe(
      buildOfflineSnapshotId('tech-a', 'plant-a', '/api/work-orders/wo-1/time-logs?includeTeamLogs=false'),
    );
  });
});
