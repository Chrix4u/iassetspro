import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), hasPermission: vi.fn(), isAdmin: vi.fn(),
  getPlantScope: vi.fn(), getPlantFilterWhere: vi.fn(), requiresCrewScope: vi.fn(),
  findMany: vi.fn(), count: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: { productionShiftRecord: { findMany: mocks.findMany, count: mocks.count } } }));
vi.mock('@/lib/auth', () => ({ getSession: mocks.getSession, hasPermission: mocks.hasPermission, isAdmin: mocks.isAdmin }));
vi.mock('@/lib/plant-scope', () => ({ getPlantScope: mocks.getPlantScope, getPlantFilterWhere: mocks.getPlantFilterWhere, canAccessPlantStrict: vi.fn() }));
vi.mock('@/lib/production-shift-access', () => ({ requiresCrewScope: mocks.requiresCrewScope }));

import { GET } from '@/app/api/production-surveys/route';
const request=(params:string)=>new NextRequest('http://localhost/api/production-surveys'+params);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockReturnValue({ userId: 'operator-1' });
  mocks.hasPermission.mockReturnValue(true);
  mocks.isAdmin.mockReturnValue(false);
  mocks.getPlantScope.mockResolvedValue({ denyAccess:false });
  mocks.getPlantFilterWhere.mockReturnValue({ plantId:'plant-1' });
  mocks.requiresCrewScope.mockReturnValue(true);
  mocks.findMany.mockResolvedValue([]);
  mocks.count.mockResolvedValue(0);
});

describe('production shift list pagination and date boundaries', () => {
  it.each(['?from=2026-02-30','?to=2026-13-01','?from=2026-02-31',
    '?from=2026-11-20&to=2026-11-19', '?page=1.5','?page=Infinity',
    '?page=-2','?limit=NaN','?limit=0','?limit=1.25'])(
    'rejects invalid filter %s before querying production history',async (query) => {
      const result=await GET(request(query));
      expect(result.status).toBe(400);
      expect(mocks.findMany).not.toHaveBeenCalled();
      expect(mocks.count).not.toHaveBeenCalled();
    });

  it('uses exact UTC day boundaries and integer, bounded paging for valid filters', async () => {
    const response=await GET(request('?from=2026-11-18&to=2026-11-19&page=2&limit=500'));
    expect(response.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip:100,take:100,where:expect.objectContaining({
        plantId:'plant-1',productionDate:{
          gte:new Date('2026-11-18T00:00:00.000Z'),
          lte:new Date('2026-11-19T00:00:00.000Z'),
        },
      }),
    }));
  });
});
