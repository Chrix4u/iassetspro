import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPlantScope: vi.fn(),
  canAccessPlantStrict: vi.fn(),
  findPlant: vi.fn(),
  getPmPortfolioCompliance: vi.fn(),
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
    plant: {
      findUnique: mocks.findPlant,
    },
  },
}));

vi.mock('@/services/pm/pmPortfolioCompliance.service', () => ({
  getPmPortfolioCompliance: mocks.getPmPortfolioCompliance,
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

const portfolio = {
  window: {
    days: 90,
    start: '2026-07-31T00:00:00.000Z',
    end: '2026-10-29T00:00:00.000Z',
  },
  summary: {
    maturedCycles: 12,
    completed: 8,
    openOverdue: 3,
    missed: 1,
    completionCompliancePct: 66.7,
    machinesWithMaturedCycles: 5,
    machinesWithOpenOverdue: 2,
  },
  departments: [],
  machines: [],
  oldestOpenOverdue: [],
};

function request(query = '') {
  return new NextRequest(`http://localhost/api/pm-assignments/compliance/portfolio${query}`, {
    headers: { authorization: 'Bearer test-token' },
  });
}

async function body(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe('GET /api/pm-assignments/compliance/portfolio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockReturnValue(session);
    mocks.getPlantScope.mockResolvedValue(scope);
    mocks.canAccessPlantStrict.mockReturnValue(true);
    mocks.findPlant.mockResolvedValue({ id: 'plant-1' });
    mocks.getPmPortfolioCompliance.mockResolvedValue(portfolio);
  });

  it('returns 401 when the request is not authenticated', async () => {
    mocks.getSession.mockReturnValue(null);

    const response = await GET(request('?plantId=plant-1'));

    expect(response.status).toBe(401);
    expect(await body(response)).toEqual({ success: false, error: 'Not authenticated' });
    expect(mocks.getPlantScope).not.toHaveBeenCalled();
    expect(mocks.findPlant).not.toHaveBeenCalled();
    expect(mocks.getPmPortfolioCompliance).not.toHaveBeenCalled();
  });

  it('returns 403 when the resolved plant scope denies all access', async () => {
    mocks.getPlantScope.mockResolvedValue({ ...scope, denyAccess: true });

    const response = await GET(request('?plantId=plant-1'));

    expect(response.status).toBe(403);
    expect(await body(response)).toEqual({ success: false, error: 'Access denied' });
    expect(mocks.findPlant).not.toHaveBeenCalled();
    expect(mocks.getPmPortfolioCompliance).not.toHaveBeenCalled();
  });

  it('returns 400 when plantId is missing', async () => {
    const response = await GET(request('?windowDays=90'));

    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ success: false, error: 'Plant is required' });
    expect(mocks.findPlant).not.toHaveBeenCalled();
    expect(mocks.getPmPortfolioCompliance).not.toHaveBeenCalled();
  });

  it('returns 404 when the requested plant does not exist', async () => {
    mocks.findPlant.mockResolvedValue(null);

    const response = await GET(request('?plantId=missing-plant'));

    expect(response.status).toBe(404);
    expect(await body(response)).toEqual({ success: false, error: 'Plant not found' });
    expect(mocks.canAccessPlantStrict).not.toHaveBeenCalled();
    expect(mocks.getPmPortfolioCompliance).not.toHaveBeenCalled();
  });

  it('returns 403 when the requested plant is outside the strict plant scope', async () => {
    mocks.findPlant.mockResolvedValue({ id: 'plant-2' });
    mocks.canAccessPlantStrict.mockReturnValue(false);

    const response = await GET(request('?plantId=plant-2'));

    expect(response.status).toBe(403);
    expect(await body(response)).toEqual({ success: false, error: 'Access denied' });
    expect(mocks.canAccessPlantStrict).toHaveBeenCalledWith(scope, 'plant-2');
    expect(mocks.getPmPortfolioCompliance).not.toHaveBeenCalled();
  });

  it('returns scoped portfolio data and forwards trimmed plant, department, and reporting window', async () => {
    const response = await GET(request('?plantId=%20plant-1%20&departmentId=%20dept-a%20&windowDays=90'));

    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ success: true, data: portfolio });
    expect(mocks.findPlant).toHaveBeenCalledWith({
      where: { id: 'plant-1' },
      select: { id: true },
    });
    expect(mocks.canAccessPlantStrict).toHaveBeenCalledWith(scope, 'plant-1');
    expect(mocks.getPmPortfolioCompliance).toHaveBeenCalledWith({
      client: db,
      plantId: 'plant-1',
      departmentId: 'dept-a',
      windowDays: 90,
    });
  });

  it('omits an empty department filter and uses the 30-day default window', async () => {
    const response = await GET(request('?plantId=plant-1&departmentId=%20%20'));

    expect(response.status).toBe(200);
    expect(mocks.getPmPortfolioCompliance).toHaveBeenCalledWith({
      client: db,
      plantId: 'plant-1',
      departmentId: undefined,
      windowDays: 30,
    });
  });
});
