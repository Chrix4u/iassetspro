import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockGetSession = vi.fn();
const mockHasPermission = vi.fn();
const mockIsAdmin = vi.fn();
const mockAuthorizeWorkOrderPlant = vi.fn();
const mockFindUnique = vi.fn();
const mockCheckReadiness = vi.fn();

vi.mock('@/lib/auth', () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
  hasPermission: (...args: unknown[]) => mockHasPermission(...args),
  isAdmin: (...args: unknown[]) => mockIsAdmin(...args),
}));

vi.mock('@/lib/plant-auth-helpers', () => ({
  authorizeWorkOrderPlant: (...args: unknown[]) => mockAuthorizeWorkOrderPlant(...args),
}));

vi.mock('@/lib/db', () => ({
  db: {
    workOrder: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

vi.mock('@/services/workOrderReadiness.service', () => ({
  checkReadiness: (...args: unknown[]) => mockCheckReadiness(...args),
}));

import { GET } from '@/app/api/work-orders/[id]/readiness/route';

const session = {
  userId: 'tech-1',
  username: 'tech1',
  roles: ['maintenance_technician'],
};

function request(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/work-orders/wo-1/readiness${query}`);
}

function routeContext(id = 'wo-1') {
  return { params: Promise.resolve({ id }) };
}

function accessibleWorkOrder(overrides: Record<string, unknown> = {}) {
  return {
    assignedTo: 'tech-1',
    teamLeaderId: null,
    teamMembers: [],
    ...overrides,
  };
}

describe('GET /api/work-orders/[id]/readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReturnValue(session);
    mockIsAdmin.mockReturnValue(false);
    mockHasPermission.mockReturnValue(false);
    mockAuthorizeWorkOrderPlant.mockResolvedValue({ ok: true });
    mockFindUnique.mockResolvedValue(accessibleWorkOrder());
    mockCheckReadiness.mockResolvedValue({ ready: true, blockers: [], warnings: [] });
  });

  it('returns 401 when there is no authenticated session', async () => {
    mockGetSession.mockReturnValue(null);

    const response = await GET(request(), routeContext());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ success: false, error: 'Not authenticated' });
    expect(mockAuthorizeWorkOrderPlant).not.toHaveBeenCalled();
    expect(mockCheckReadiness).not.toHaveBeenCalled();
  });

  it('returns the plant authorization denial before evaluating readiness', async () => {
    mockAuthorizeWorkOrderPlant.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 }),
    });

    const response = await GET(request('?phase=start'), routeContext());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('Plant access denied');
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockCheckReadiness).not.toHaveBeenCalled();
  });

  it('allows the assigned technician to request start readiness', async () => {
    const readiness = {
      ready: false,
      blockers: [{ code: 'NO_PLANT_ACCESS', category: 'safety', message: 'No plant access', severity: 'blocker' }],
      warnings: [],
    };
    mockCheckReadiness.mockResolvedValue(readiness);

    const response = await GET(request('?phase=start'), routeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockCheckReadiness).toHaveBeenCalledWith('wo-1', 'start');
    expect(body).toEqual({ success: true, data: readiness });
  });

  it('allows an assigned team member even without view-all permission', async () => {
    mockFindUnique.mockResolvedValue(accessibleWorkOrder({
      assignedTo: 'another-tech',
      teamMembers: [{ userId: 'tech-1' }],
    }));

    const response = await GET(request('?phase=start'), routeContext());

    expect(response.status).toBe(200);
    expect(mockCheckReadiness).toHaveBeenCalledWith('wo-1', 'start');
  });

  it('denies an unrelated user without view-all permission', async () => {
    mockFindUnique.mockResolvedValue(accessibleWorkOrder({
      assignedTo: 'another-tech',
      teamLeaderId: 'leader-2',
      teamMembers: [{ userId: 'member-3' }],
    }));

    const response = await GET(request('?phase=start'), routeContext());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ success: false, error: 'Access denied — you are not part of this work order workflow' });
    expect(mockCheckReadiness).not.toHaveBeenCalled();
  });

  it('keeps basic work-order view permission relationship-scoped', async () => {
    mockFindUnique.mockResolvedValue(accessibleWorkOrder({ assignedTo: 'another-tech' }));
    mockHasPermission.mockImplementation((_session: unknown, permission: string) => permission === 'work_orders.view');

    const response = await GET(request('?phase=complete'), routeContext());

    expect(response.status).toBe(403);
    expect(mockCheckReadiness).not.toHaveBeenCalled();
  });

  it('allows the explicit work-order view-all permission to inspect readiness', async () => {
    mockFindUnique.mockResolvedValue(accessibleWorkOrder({ assignedTo: 'another-tech' }));
    mockHasPermission.mockImplementation((_session: unknown, permission: string) => permission === 'work_orders.view_all');

    const response = await GET(request('?phase=complete'), routeContext());

    expect(response.status).toBe(200);
    expect(mockCheckReadiness).toHaveBeenCalledWith('wo-1', 'complete');
  });

  it('defaults to complete readiness when phase is omitted', async () => {
    const response = await GET(request(), routeContext());

    expect(response.status).toBe(200);
    expect(mockCheckReadiness).toHaveBeenCalledWith('wo-1', 'complete');
  });

  it('rejects unsupported readiness phases without calling the service', async () => {
    const response = await GET(request('?phase=verify'), routeContext());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Use 'start' or 'complete'");
    expect(mockCheckReadiness).not.toHaveBeenCalled();
  });

  it('returns 404 when the work order does not exist', async () => {
    mockFindUnique.mockResolvedValue(null);

    const response = await GET(request('?phase=start'), routeContext());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ success: false, error: 'Work order not found' });
    expect(mockCheckReadiness).not.toHaveBeenCalled();
  });
});
