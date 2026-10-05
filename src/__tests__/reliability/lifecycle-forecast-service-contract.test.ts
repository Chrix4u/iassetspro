import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const service = readFileSync('src/services/reliability/lifecycleForecast.service.ts', 'utf8');
const route = readFileSync('src/app/api/reliability/lifecycle/route.ts', 'utf8');

describe('lifecycle forecast schema/runtime contract', () => {
  it('uses current WorkOrder completion and Digital Twin health fields', () => {
    expect(service).toContain('actualEnd: true');
    expect(service).not.toContain('completedAt: true');
    expect(service).toContain('digitalTwin: { select: { healthScore: true } }');
    expect(service).not.toMatch(/\basset\.healthScore\b/);
    expect(service).not.toContain('workOrders: true');
  });

  it('persists lifecycle JSON using the Prisma input contract', () => {
    expect(service).toContain("import type { Prisma } from '@prisma/client'");
    expect(service).toContain('healthTrajectory: trajectory as unknown as Prisma.InputJsonValue');
  });

  it('attributes generated forecasts to the authenticated user, not the asset', () => {
    expect(service).toContain('createdById: data.createdById');
    expect(service).toContain('createdById,');
    expect(service).not.toContain('createdById: data.assetId');
    expect(service).not.toContain('createdById: assetId');
    expect(route).toContain('createdById: session.userId');
    expect(route).toContain('predictHealthTrajectory(assetId, period, session.userId)');
  });
});
