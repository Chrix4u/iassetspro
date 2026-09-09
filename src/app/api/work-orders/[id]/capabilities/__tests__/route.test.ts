import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockDb, mockGetSession, mockIsAdmin, mockGetPlantScope, mockCanAccessPlant } = vi.hoisted(() => ({
  mockDb: {
    workOrder: { findUnique: vi.fn() },
    workOrderTimeLog: { findFirst: vi.fn() },
  },
  mockGetSession: vi.fn(),
  mockIsAdmin: vi.fn(),
  mockGetPlantScope: vi.fn(),
  mockCanAccessPlant: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/auth', () => ({ getSession: mockGetSession, isAdmin: mockIsAdmin }));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mockGetPlantScope,
  canAccessPlant: mockCanAccessPlant,
}));

import { GET } from '../route';

const session = {
  userId: 'tech-1',
  roles: ['maintenance_technician'],
  permissions: ['work_orders.start'],
};

function request(): NextRequest {
  return new NextRequest('http://localhost/api/work-orders/wo-1/capabilities');
}

function workOrder(status: string) {
  return {
    id: 'wo-1',
    status,
    assignedTo: 'tech-1',
    teamLeaderId: null,
    assignedSupervisorId: 'sup-1',
    plannerId: 'planner-1',
    plantId: 'plant-a',
    isLocked: false,
    teamMembers: [],
  };
}

describe('GET /api/work-orders/[id]/capabilities start lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReturnValue(session);
    mockIsAdmin.mockReturnValue(false);
    mockGetPlantScope.mockResolvedValue({
      plantId: 'plant-a',
      accessiblePlantIds: ['plant-a'],
      isScoped: true,
      isSystemWide: false,
      accessLevel: 'write',
    });
    mockCanAccessPlant.mockReturnValue(true);
    mockDb.workOrderTimeLog.findFirst.mockResolvedValue(null);
  });

  it('does not advertise Start while a work order is only planned', async () => {
    mockDb.workOrder.findUnique.mockResolvedValue(workOrder('planned'));

    const response = await GET(request(), { params: Promise.resolve({ id: 'wo-1' }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.canStart).toBe(false);
  });

  it('advertises Start after assignment', async () => {
    mockDb.workOrder.findUnique.mockResolvedValue(workOrder('assigned'));

    const response = await GET(request(), { params: Promise.resolve({ id: 'wo-1' }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.canStart).toBe(true);
  });

  it('advertises restart when an in-progress assigned technician has no live timer', async () => {
    mockDb.workOrder.findUnique.mockResolvedValue(workOrder('in_progress'));
    mockDb.workOrderTimeLog.findFirst.mockResolvedValue(null);

    const response = await GET(request(), { params: Promise.resolve({ id: 'wo-1' }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.canStart).toBe(true);
    expect(json.data.hasActiveExecutionSession).toBe(false);
  });

  it('does not advertise a second start while the technician has a live timer', async () => {
    mockDb.workOrder.findUnique.mockResolvedValue(workOrder('in_progress'));
    mockDb.workOrderTimeLog.findFirst.mockResolvedValue({ id: 'timer-1' });

    const response = await GET(request(), { params: Promise.resolve({ id: 'wo-1' }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.canStart).toBe(false);
    expect(json.data.hasActiveExecutionSession).toBe(true);
  });
});
