import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetSession,
  mockHasPermission,
  mockIsAdmin,
  mockResumeWaitingWorkOrder,
  mockExtractAuditContext,
  mockAuthorizeWorkOrderPlant,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockHasPermission: vi.fn(),
  mockIsAdmin: vi.fn(),
  mockResumeWaitingWorkOrder: vi.fn(),
  mockExtractAuditContext: vi.fn(),
  mockAuthorizeWorkOrderPlant: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
  hasPermission: mockHasPermission,
  isAdmin: mockIsAdmin,
}));
vi.mock('@/services/workOrderExecutionState.service', () => ({
  resumeWaitingWorkOrder: mockResumeWaitingWorkOrder,
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

function request(body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest('http://localhost/api/work-orders/wo-1/resume', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/work-orders/[id]/resume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReturnValue(session);
    mockHasPermission.mockReturnValue(true);
    mockIsAdmin.mockReturnValue(false);
    mockAuthorizeWorkOrderPlant.mockResolvedValue({ ok: true });
    mockExtractAuditContext.mockReturnValue({ ipAddress: '127.0.0.1' });
  });

  it('marks genuine technician resume as not requiring another technician start', async () => {
    mockResumeWaitingWorkOrder.mockResolvedValue({
      success: true,
      data: {
        status: 'in_progress',
        resumedAt: new Date('2026-09-09T12:00:00.000Z'),
        executionSessionOpened: true,
      },
    });

    const response = await POST(request({ reason: 'Parts are available' }), {
      params: Promise.resolve({ id: 'wo-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.executionSessionOpened).toBe(true);
    expect(json.data.technicianExecutionStartRequired).toBe(false);
    expect(mockResumeWaitingWorkOrder).toHaveBeenCalledWith(
      'wo-1',
      session,
      expect.objectContaining({ reason: 'Parts are available' }),
    );
  });

  it('marks supervisor/planner/manager release as requiring explicit technician execution start', async () => {
    mockResumeWaitingWorkOrder.mockResolvedValue({
      success: true,
      data: {
        status: 'in_progress',
        resumedAt: new Date('2026-09-09T12:00:00.000Z'),
        executionSessionOpened: false,
      },
    });

    const response = await POST(request({ notes: 'Hold released by supervisor' }), {
      params: Promise.resolve({ id: 'wo-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.executionSessionOpened).toBe(false);
    expect(json.data.technicianExecutionStartRequired).toBe(true);
    expect(mockResumeWaitingWorkOrder).toHaveBeenCalledWith(
      'wo-1',
      session,
      expect.objectContaining({ reason: 'Hold released by supervisor' }),
    );
  });

  it('preserves structured active-session conflicts as HTTP 409', async () => {
    mockResumeWaitingWorkOrder.mockResolvedValue({
      success: false,
      reason: 'ACTIVE_SESSION_CONFLICT',
      error: 'You already have active work on WO #WO-002',
      conflict: {
        workOrderId: 'wo-2',
        woNumber: 'WO-002',
        status: 'in_progress',
        startedAt: '2026-09-09T11:00:00.000Z',
      },
    });

    const response = await POST(request(), {
      params: Promise.resolve({ id: 'wo-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.reason).toBe('ACTIVE_SESSION_CONFLICT');
    expect(json.conflict.workOrderId).toBe('wo-2');
  });
});
