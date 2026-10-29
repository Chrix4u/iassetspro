import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPlantScope: vi.fn(),
  canAccessPlantStrict: vi.fn(),
  findAsset: vi.fn(),
  getPmCompliance: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getSession: mocks.getSession,
}));

vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mocks.getPlantScope,
  canAccessPlantStrict: mocks.canAccessPlantStrict,
}));

vi.mock('@/lib/db', () => ({
  db: {
    asset: {
      findUnique: mocks.findAsset,
    },
  },
}));

vi.mock('@/services/pm/pmCompliance.service', () => ({
  getPmCompliance: mocks.getPmCompliance,
}));

import { db } from '@/lib/db';
import { GET } from '../route';

const session = {
  userId: 'user-1',
  username: 'planner',
  fullName: 'PM Planner',
  roles: ['planner'],
  permissions: ['pm.view'],
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
};

const scope = {
  denyAccess: false,
  isAdmin: false,
  allowedPlantIds: ['plant-1'],
};

const compliance = {
  window: {
    days: 90,
    start: '2026-07-31T00:00:00.000Z',
    end: '2026-10-29T00:00:00.000Z',
  },
  summary: {
    maturedCycles: 4,
    completed: 3,
    openOverdue: 1,
    missed: 0,
    completionCompliancePct: 75,
  },
  cycles: [],
};

function request(query = '') {
  return new NextRequest(`http://localhost/api/pm-assignments/compliance${query}`, {
    headers: { authorization: 'Bearer test-token' },
  });
}

async function body(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe('GET /api/pm-assignments/compliance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockReturnValue(session);
    mocks.getPlantScope.mockResolvedValue(scope);
    mocks.canAccessPlantStrict.mockReturnValue(true);
    mocks.findAsset.mockResolvedValue({ id: 'asset-1', plantId: 'plant-1' });
    mocks.getPmCompliance.mockResolvedValue(compliance);
  });

  it('returns 401 when the request is not authenticated', async () => {
    mocks.getSession.mockReturnValue(null);

    const response = await GET(request('?assetId=asset-1'));

    expect(response.status).toBe(401);
    expect(await body(response)).toEqual({ success: false, error: 'Not authenticated' });
    expect(mocks.getPlantScope).not.toHaveBeenCalled();
    expect(mocks.findAsset).not.toHaveBeenCalled();
    expect(mocks.getPmCompliance).not.toHaveBeenCalled();
  });

  it('returns 403 when the resolved plant scope denies all access', async () => {
    mocks.getPlantScope.mockResolvedValue({ ...scope, denyAccess: true });

    const response = await GET(request('?assetId=asset-1'));

    expect(response.status).toBe(403);
    expect(await body(response)).toEqual({ success: false, error: 'Access denied' });
    expect(mocks.findAsset).not.toHaveBeenCalled();
    expect(mocks.getPmCompliance).not.toHaveBeenCalled();
  });

  it('returns 400 when assetId is missing', async () => {
    const response = await GET(request('?windowDays=90'));

    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ success: false, error: 'Asset is required' });
    expect(mocks.findAsset).not.toHaveBeenCalled();
    expect(mocks.getPmCompliance).not.toHaveBeenCalled();
  });

  it('returns 404 when the requested asset does not exist', async () => {
    mocks.findAsset.mockResolvedValue(null);

    const response = await GET(request('?assetId=missing-asset'));

    expect(response.status).toBe(404);
    expect(await body(response)).toEqual({ success: false, error: 'Asset not found' });
    expect(mocks.canAccessPlantStrict).not.toHaveBeenCalled();
    expect(mocks.getPmCompliance).not.toHaveBeenCalled();
  });

  it('returns 403 when the asset plant is outside the strict plant scope', async () => {
    mocks.findAsset.mockResolvedValue({ id: 'asset-2', plantId: 'plant-2' });
    mocks.canAccessPlantStrict.mockReturnValue(false);

    const response = await GET(request('?assetId=asset-2'));

    expect(response.status).toBe(403);
    expect(await body(response)).toEqual({ success: false, error: 'Access denied' });
    expect(mocks.canAccessPlantStrict).toHaveBeenCalledWith(scope, 'plant-2');
    expect(mocks.getPmCompliance).not.toHaveBeenCalled();
  });

  it('returns plant-scoped compliance and forwards the selected reporting window', async () => {
    const response = await GET(request('?assetId=%20asset-1%20&windowDays=90'));

    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ success: true, data: compliance });
    expect(mocks.findAsset).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
      select: { id: true, plantId: true },
    });
    expect(mocks.canAccessPlantStrict).toHaveBeenCalledWith(scope, 'plant-1');
    expect(mocks.getPmCompliance).toHaveBeenCalledWith({
      client: db,
      assetId: 'asset-1',
      windowDays: 90,
    });
  });

  it('uses the 30-day default window when windowDays is not supplied', async () => {
    const response = await GET(request('?assetId=asset-1'));

    expect(response.status).toBe(200);
    expect(mocks.getPmCompliance).toHaveBeenCalledWith({
      client: db,
      assetId: 'asset-1',
      windowDays: 30,
    });
  });
});
