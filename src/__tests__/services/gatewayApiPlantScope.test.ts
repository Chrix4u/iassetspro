import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), getPlantScope: vi.fn(), listGateways: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getSession: mocks.getSession,
  isAdmin: vi.fn(),
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mocks.getPlantScope,
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));
vi.mock('@/services/connectivity', () => ({
  edgeGatewayService: { listGateways: mocks.listGateways },
}));

import { GET } from '@/app/api/connectivity/gateway/route';

const request = (search = '', selectedPlant = '') => new NextRequest(
  'http://localhost/api/connectivity/gateway' + search,
  selectedPlant ? { headers: { 'X-Plant-ID': selectedPlant } } : undefined,
);
const limitedScope = {
  isSystemWide: false,
  isScoped: false,
  plantId: null,
  accessiblePlantIds: ['plant-one', 'plant-two'],
  denyAccess: false,
};

describe('gateway list API access boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockReturnValue({ userId: 'operator-one', roles: ['operator'] });
    mocks.getPlantScope.mockResolvedValue(limitedScope);
    mocks.listGateways.mockResolvedValue({
      data: [{ id: 'gateway-one' }],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });
  });

  it('does not reveal gateways to anonymous callers', async () => {
    mocks.getSession.mockReturnValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(mocks.getPlantScope).not.toHaveBeenCalled();
    expect(mocks.listGateways).not.toHaveBeenCalled();
  });

  it('rejects explicit unauthorized scope before querying gateways', async () => {
    mocks.getPlantScope.mockResolvedValue({ ...limitedScope, denyAccess: true });
    expect((await GET(request())).status).toBe(403);
    expect(mocks.listGateways).not.toHaveBeenCalled();
  });

  it('rejects a foreign plant query, even if caller has a different plant context', async () => {
    expect((await GET(request('?plantId=foreign-plant', 'plant-one'))).status).toBe(403);
    expect(mocks.listGateways).not.toHaveBeenCalled();
  });

  it('restricts regular users to their assigned plants and bounds pagination', async () => {
    const response = await GET(request('?page=-8&limit=999'));
    expect(response.status).toBe(200);
    expect(mocks.listGateways).toHaveBeenCalledWith({
      plantId: undefined,
      plantIds: ['plant-one', 'plant-two'],
      status: undefined,
      page: 1,
      limit: 100,
    });
  });

  it('narrows an explicitly selected plant to that plant', async () => {
    mocks.getPlantScope.mockResolvedValue({
      ...limitedScope,
      isScoped: true,
      plantId: 'plant-one',
      accessiblePlantIds: ['plant-one'],
    });
    expect((await GET(request('?plantId=plant-one', 'plant-one'))).status).toBe(200);
    expect(mocks.listGateways).toHaveBeenCalledWith(expect.objectContaining({
      plantId: 'plant-one',
      plantIds: ['plant-one'],
    }));
  });

  it('preserves system-wide visibility for authorized admins', async () => {
    mocks.getSession.mockReturnValue({ userId: 'admin', roles: ['system_admin'] });
    mocks.getPlantScope.mockResolvedValue({
      ...limitedScope,
      isSystemWide: true,
      accessiblePlantIds: [],
    });
    expect((await GET(request('?status=online'))).status).toBe(200);
    expect(mocks.listGateways).toHaveBeenCalledWith(expect.objectContaining({
      plantIds: undefined,
      status: 'online',
    }));
  });
});