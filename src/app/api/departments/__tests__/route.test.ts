import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockDb,
  mockGetSession,
  mockIsAdmin,
  mockGetPlantScope,
  mockGetPlantFilterWhere,
  mockCanAccessPlantStrict,
} = vi.hoisted(() => ({
  mockDb: {
    department: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    plant: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  mockGetSession: vi.fn(),
  mockIsAdmin: vi.fn(),
  mockGetPlantScope: vi.fn(),
  mockGetPlantFilterWhere: vi.fn(),
  mockCanAccessPlantStrict: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
  isAdmin: mockIsAdmin,
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mockGetPlantScope,
  getPlantFilterWhere: mockGetPlantFilterWhere,
  canAccessPlantStrict: mockCanAccessPlantStrict,
}));

import { GET } from '../route';

const session = {
  userId: 'user-1',
  fullName: 'Scoped User',
  roles: ['technician'],
  permissions: [],
};

function request(query = '', plantHeader?: string): NextRequest {
  const headers = new Headers();
  if (plantHeader) headers.set('X-Plant-ID', plantHeader);
  return new NextRequest(
    `http://localhost/api/departments${query ? `?${query}` : ''}`,
    { headers },
  );
}

describe('GET /api/departments plant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReturnValue(session);
    mockIsAdmin.mockReturnValue(false);
    mockGetPlantScope.mockResolvedValue({
      plantId: null,
      accessiblePlantIds: ['plant-a', 'plant-c'],
      isScoped: false,
      isSystemWide: false,
      accessLevel: null,
    });
    mockGetPlantFilterWhere.mockReturnValue({ plantId: { in: ['plant-a', 'plant-c'] } });
    mockCanAccessPlantStrict.mockImplementation((scope: { isSystemWide?: boolean; accessiblePlantIds?: string[] }, plantId: string) =>
      Boolean(scope.isSystemWide || scope.accessiblePlantIds?.includes(plantId)),
    );
    mockDb.department.findMany.mockResolvedValue([]);
  });

  it('returns 401 without a session', async () => {
    mockGetSession.mockReturnValue(null);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mockGetPlantScope).not.toHaveBeenCalled();
    expect(mockDb.department.findMany).not.toHaveBeenCalled();
  });

  it('lists only departments from the regular user accessible plant set when no plant is selected', async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mockDb.department.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { plantId: { in: ['plant-a', 'plant-c'] } },
    }));
  });

  it('allows a query parameter to narrow to one accessible plant', async () => {
    const response = await GET(request('plantId=plant-c'));

    expect(response.status).toBe(200);
    expect(mockDb.department.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { plantId: 'plant-c' },
    }));
  });

  it('blocks a query parameter that requests an inaccessible plant', async () => {
    const response = await GET(request('plantId=plant-b'));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe('Plant access denied');
    expect(mockDb.department.findMany).not.toHaveBeenCalled();
  });

  it('does not let a query parameter override an explicitly selected plant context', async () => {
    mockGetPlantScope.mockResolvedValue({
      plantId: 'plant-a',
      accessiblePlantIds: ['plant-a', 'plant-c'],
      isScoped: true,
      isSystemWide: false,
      accessLevel: 'read',
    });
    mockGetPlantFilterWhere.mockReturnValue({ plantId: 'plant-a' });

    const response = await GET(request('plantId=plant-c', 'plant-a'));

    expect(response.status).toBe(403);
    expect(mockDb.department.findMany).not.toHaveBeenCalled();
  });

  it('fails closed when X-Plant-ID resolves to denyAccess', async () => {
    mockGetPlantScope.mockResolvedValue({
      plantId: null,
      accessiblePlantIds: ['plant-a'],
      isScoped: true,
      denyAccess: true,
      isSystemWide: false,
      accessLevel: 'none',
    });
    mockGetPlantFilterWhere.mockReturnValue({ plantId: '__ACCESS_DENIED__' });

    const response = await GET(request('', 'plant-b'));

    expect(response.status).toBe(403);
    expect(mockDb.department.findMany).not.toHaveBeenCalled();
  });

  it('allows a system-wide actor to select any explicit plant', async () => {
    mockGetPlantScope.mockResolvedValue({
      plantId: null,
      accessiblePlantIds: [],
      isScoped: false,
      isSystemWide: true,
      accessLevel: null,
    });
    mockGetPlantFilterWhere.mockReturnValue({});
    mockCanAccessPlantStrict.mockReturnValue(true);

    const response = await GET(request('plantId=plant-z'));

    expect(response.status).toBe(200);
    expect(mockDb.department.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { plantId: 'plant-z' },
    }));
  });
});
