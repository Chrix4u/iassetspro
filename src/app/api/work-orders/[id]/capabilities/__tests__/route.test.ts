import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockDb, mockGetSession, mockIsAdmin, mockHasPermission, mockGetPlantScope, mockCanAccessPlantStrict, mockCheckReadiness } = vi.hoisted(() => ({
  mockDb: {
    workOrder: { findUnique: vi.fn() },
    workOrderTimeLog: { findFirst: vi.fn() },
  },
  mockGetSession: vi.fn(),
  mockIsAdmin: vi.fn(),
  mockHasPermission: vi.fn(),
  mockGetPlantScope: vi.fn(),
  mockCanAccessPlantStrict: vi.fn(),
  mockCheckReadiness: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
  isAdmin: mockIsAdmin,
  hasPermission: mockHasPermission,
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mockGetPlantScope,
  canAccessPlantStrict: mockCanAccessPlantStrict,
}));
vi.mock('@/services/workOrderReadiness.service', () => ({
  checkReadiness: mockCheckReadiness,
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
    assignmentResponseStatus: status === 'assigned' ? 'accepted' : null,
    assignmentRespondedAt: null,
    assignmentResponseReason: null,
    maintenanceRequest: null,
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
    mockCanAccessPlantStrict.mockReturnValue(true);
    mockHasPermission.mockImplementation((_session, permission) => permission === 'work_orders.start');
    mockCheckReadiness.mockResolvedValue({ ready: true, blockers: [], warnings: [] });
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

  it('does not advertise execution actions to a handover-only team member', async () => {
    mockGetSession.mockReturnValue({
      userId: 'tech-1',
      roles: ['maintenance_technician'],
      permissions: [
        'work_orders.update',
        'time_logs.create',
        'repair_tool_requests.create',
        'repair_material_requests.create',
        'assistance_requests.create',
      ],
    });
    mockHasPermission.mockReturnValue(true);
    mockDb.workOrder.findUnique.mockResolvedValue({
      ...workOrder('in_progress'),
      assignedTo: 'tech-2',
      teamLeaderId: 'tech-2',
      teamMembers: [
        { userId: 'tech-1', role: 'handover_receiver', accessLevel: 'execution' },
      ],
    });

    const response = await GET(request(), { params: Promise.resolve({ id: 'wo-1' }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.isTeamMember).toBe(true);
    expect(json.data.isExecutionMember).toBe(false);
    expect(json.data.canLogOwnTime).toBe(false);
    expect(json.data.canRequestTools).toBe(false);
    expect(json.data.canRequestMaterials).toBe(false);
    expect(json.data.canLogDowntime).toBe(false);
    expect(json.data.canRequestAssistance).toBe(false);
  });
});
