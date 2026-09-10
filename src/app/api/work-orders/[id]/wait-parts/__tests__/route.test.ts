import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockDb,
  mockGetSession,
  mockHasPermission,
  mockIsAdmin,
  mockPlaceWorkOrderInWaitingState,
  mockExtractAuditContext,
  mockAuthorizeWorkOrderPlant,
} = vi.hoisted(() => ({
  mockDb: { workOrder: { findUnique: vi.fn() } },
  mockGetSession: vi.fn(),
  mockHasPermission: vi.fn(),
  mockIsAdmin: vi.fn(),
  mockPlaceWorkOrderInWaitingState: vi.fn(),
  mockExtractAuditContext: vi.fn(),
  mockAuthorizeWorkOrderPlant: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
  hasPermission: mockHasPermission,
  isAdmin: mockIsAdmin,
}));
vi.mock('@/services/workOrderExecutionState.service', () => ({
  placeWorkOrderInWaitingState: mockPlaceWorkOrderInWaitingState,
}));
vi.mock('@/lib/audit-helpers', () => ({
  extractAuditContext: mockExtractAuditContext,
}));
vi.mock('@/lib/plant-auth-helpers', () => ({
  authorizeWorkOrderPlant: mockAuthorizeWorkOrderPlant,
}));

import { POST } from '../route';

const session = {
  userId: 'tech-1',
  fullName: 'Technician One',
  roles: ['maintenance_technician'],
  permissions: ['work_orders.update'],
};

function request(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/work-orders/wo-1/wait-parts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/work-orders/[id]/wait-parts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReturnValue(session);
    mockHasPermission.mockReturnValue(true);
    mockIsAdmin.mockReturnValue(false);
    mockAuthorizeWorkOrderPlant.mockResolvedValue({ ok: true });
    mockExtractAuditContext.mockReturnValue({ ipAddress: '127.0.0.1' });
    mockPlaceWorkOrderInWaitingState.mockResolvedValue({
      success: true,
      data: { status: 'waiting_parts', closedTimers: 1, actualHours: 2.5 },
    });
    mockDb.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      status: 'waiting_parts',
    });
  });

  it('requires assignment/planner/management authority in addition to generic update permission', async () => {
    const response = await POST(request({
      notes: 'Bearing unavailable in store',
      requiredParts: [{ itemCode: 'BRG-6205', quantity: 2 }],
    }), { params: Promise.resolve({ id: 'wo-1' }) });

    expect(response.status).toBe(200);
    expect(mockPlaceWorkOrderInWaitingState).toHaveBeenCalledWith(
      'wo-1',
      'waiting_parts',
      session,
      expect.objectContaining({
        reason: 'Bearing unavailable in store',
        requireExecutionAuthority: true,
        extraData: expect.objectContaining({
          notes: expect.stringContaining('BRG-6205'),
        }),
      }),
    );
  });

  it('returns a business-rule 400 when the actor is not assigned to control the WO', async () => {
    mockPlaceWorkOrderInWaitingState.mockResolvedValue({
      success: false,
      error: 'Only the assigned technician, team leader, planner, or authorized maintenance manager can change this execution state',
    });

    const response = await POST(request({ notes: 'Waiting for spare' }), {
      params: Promise.resolve({ id: 'wo-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain('assigned technician');
    expect(mockDb.workOrder.findUnique).not.toHaveBeenCalled();
  });

  it('returns 404 when the canonical service cannot find the work order', async () => {
    mockPlaceWorkOrderInWaitingState.mockResolvedValue({
      success: false,
      error: 'Work order not found',
    });

    const response = await POST(request({ notes: 'Waiting for spare' }), {
      params: Promise.resolve({ id: 'missing' }),
    });

    expect(response.status).toBe(404);
    expect(mockDb.workOrder.findUnique).not.toHaveBeenCalled();
  });
});
