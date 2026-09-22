import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockDb,
  mockGetSession,
  mockGetPlantScope,
  mockCanAccessPlantStrict,
  mockCanViewWorkOrder,
  mockGetUnavailableOperationalModules,
} = vi.hoisted(() => ({
  mockDb: {
    workOrder: { findUnique: vi.fn() },
  },
  mockGetSession: vi.fn(),
  mockGetPlantScope: vi.fn(),
  mockCanAccessPlantStrict: vi.fn(),
  mockCanViewWorkOrder: vi.fn(),
  mockGetUnavailableOperationalModules: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/auth', () => ({
  getRequestSession: mockGetSession,
  isAdmin: vi.fn(),
  hasPermission: vi.fn(),
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mockGetPlantScope,
  canAccessPlantStrict: mockCanAccessPlantStrict,
}));
vi.mock('@/lib/plant-auth-helpers', () => ({
  authorizeWorkOrderPlant: vi.fn(),
}));
vi.mock('@/services/workOrderAccess.service', () => ({
  canManageWorkOrder: vi.fn(),
  canViewWorkOrder: mockCanViewWorkOrder,
}));
vi.mock('@/lib/module-access.server', () => ({
  getUnavailableOperationalModules: mockGetUnavailableOperationalModules,
}));

import { GET } from '../route';

function request(): NextRequest {
  return new NextRequest('http://localhost/api/work-orders/wo-1');
}

describe('GET /api/work-orders/[id] planner material projection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReturnValue({
      userId: 'planner-1',
      fullName: 'Planner One',
      roles: ['maintenance_planner'],
      permissions: ['work_orders.view'],
    });
    mockGetPlantScope.mockResolvedValue({
      isSystemWide: true,
      isScoped: false,
      plantId: null,
      accessiblePlantIds: [],
      denyAccess: false,
    });
    mockCanAccessPlantStrict.mockReturnValue(true);
    mockCanViewWorkOrder.mockReturnValue(true);
    mockGetUnavailableOperationalModules.mockResolvedValue([]);
  });

  it('projects a planned WorkOrderMaterial into the WO material pipeline when the canonical request is absent', async () => {
    mockDb.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      woNumber: 'WO-202609-0001',
      plantId: 'plant-1',
      createdAt: new Date('2026-09-21T00:00:00Z'),
      planner: { id: 'planner-1', fullName: 'Planner One', username: 'planner' },
      assignedTo: 'tech-1',
      teamLeaderId: null,
      assignedSupervisorId: 'sup-1',
      teamMembers: [],
      maintenanceRequest: { requestedBy: 'requester-1' },
      repairToolRequests: [],
      repairMaterialRequests: [],
      workOrderComponents: [],
      teamMemberRequests: [],
      suggestedParts: '[]',
      materials: [
        {
          id: 'wo-mat-1',
          itemId: 'item-1',
          itemName: 'Bearing 6205',
          quantity: 2,
          unitCost: 25,
          totalCost: 50,
          status: 'planned',
          requestedBy: 'planner-1',
          requester: { id: 'planner-1', fullName: 'Planner One' },
          approver: null,
          issuer: null,
          createdAt: new Date('2026-09-21T00:01:00Z'),
        },
      ],
    });

    const response = await GET(request(), { params: Promise.resolve({ id: 'wo-1' }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.repairMaterialRequests).toHaveLength(1);
    expect(json.data.repairMaterialRequests[0]).toEqual(expect.objectContaining({
      itemId: 'item-1',
      itemName: 'Bearing 6205',
      quantityRequested: 2,
      source: 'planner_suggested',
      status: 'planned',
      projectionOnly: true,
    }));
  });

  it('does not duplicate a material already represented by a canonical planner request', async () => {
    mockDb.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      woNumber: 'WO-202609-0001',
      plantId: 'plant-1',
      createdAt: new Date('2026-09-21T00:00:00Z'),
      planner: { id: 'planner-1', fullName: 'Planner One', username: 'planner' },
      assignedTo: 'tech-1',
      teamLeaderId: null,
      assignedSupervisorId: 'sup-1',
      teamMembers: [],
      maintenanceRequest: { requestedBy: 'requester-1' },
      repairToolRequests: [],
      repairMaterialRequests: [
        {
          id: 'rmr-1',
          itemId: 'item-1',
          itemName: 'Bearing 6205',
          quantityRequested: 2,
          quantityApproved: 0,
          quantityIssued: 0,
          quantityReturned: 0,
          unit: 'each',
          unitCost: 25,
          estimatedCost: 50,
          urgency: 'normal',
          reason: 'Planned for WO',
          notes: null,
          plantId: 'plant-1',
          source: 'planner_suggested',
          status: 'pending',
          requestedById: 'planner-1',
          requestedBy: { id: 'planner-1', fullName: 'Planner One' },
          supervisorApprovedBy: null,
          storekeeperApprovedBy: null,
          issuedByUser: null,
          item: { id: 'item-1', name: 'Bearing 6205', itemCode: 'BRG-6205', category: 'bearings' },
          createdAt: new Date('2026-09-21T00:01:00Z'),
          updatedAt: new Date('2026-09-21T00:01:00Z'),
        },
      ],
      workOrderComponents: [],
      teamMemberRequests: [],
      suggestedParts: JSON.stringify([
        { itemId: 'item-1', itemName: 'Bearing 6205', quantity: 2, unit: 'each' },
      ]),
      materials: [
        {
          id: 'wo-mat-1',
          itemId: 'item-1',
          itemName: 'Bearing 6205',
          quantity: 2,
          unitCost: 25,
          totalCost: 50,
          status: 'planned',
          requestedBy: 'planner-1',
          requester: { id: 'planner-1', fullName: 'Planner One' },
          approver: null,
          issuer: null,
          createdAt: new Date('2026-09-21T00:01:00Z'),
        },
      ],
    });

    const response = await GET(request(), { params: Promise.resolve({ id: 'wo-1' }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.repairMaterialRequests).toHaveLength(1);
    expect(json.data.repairMaterialRequests[0].id).toBe('rmr-1');
    expect(json.data.repairMaterialRequests[0].projectionOnly).toBeUndefined();
  });
});
