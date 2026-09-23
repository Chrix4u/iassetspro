import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockDb,
  mockGetSession,
  mockAuthorizePlant,
  mockCanViewWorkOrder,
  mockGetUnavailableOperationalModules,
} = vi.hoisted(() => ({
  mockDb: {
    workOrder: { findUnique: vi.fn() },
    inventoryItem: { findMany: vi.fn() },
  },
  mockGetSession: vi.fn(),
  mockAuthorizePlant: vi.fn(),
  mockCanViewWorkOrder: vi.fn(),
  mockGetUnavailableOperationalModules: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
  hasPermission: vi.fn(),
  isAdmin: vi.fn(),
}));
vi.mock('@/lib/plant-auth-helpers', () => ({
  authorizeWorkOrderExecutionAccess: mockAuthorizePlant,
}));
vi.mock('@/services/workOrderAccess.service', () => ({
  canManageWorkOrder: vi.fn(),
  canViewWorkOrder: mockCanViewWorkOrder,
}));
vi.mock('@/lib/module-access.server', () => ({
  getUnavailableOperationalModules: mockGetUnavailableOperationalModules,
}));

import { GET } from '../route';

const session = {
  userId: 'planner-1',
  fullName: 'Planner One',
  roles: ['maintenance_planner'],
  permissions: ['work_orders.view'],
};

function request(): NextRequest {
  return new NextRequest('http://localhost/api/work-orders/wo-1/suggested-items');
}

describe('GET /api/work-orders/[id]/suggested-items material reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReturnValue(session);
    mockAuthorizePlant.mockResolvedValue({ ok: true });
    mockCanViewWorkOrder.mockReturnValue(true);
    mockGetUnavailableOperationalModules.mockResolvedValue([]);
    mockDb.inventoryItem.findMany.mockResolvedValue([
      { id: 'item-1', itemCode: 'BRG-001', unitOfMeasure: 'each' },
    ]);
  });

  it('recovers planner-selected material from planned WO material rows when the suggestion snapshot/request projection is absent', async () => {
    mockDb.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      suggestedParts: null,
      suggestedTools: JSON.stringify([
        {
          id: 'tool-suggestion-1',
          toolId: 'tool-1',
          toolName: 'Torque Wrench',
          toolCode: 'TW-001',
          quantity: 1,
          notes: '',
        },
      ]),
      plantId: 'plant-1',
      materials: [
        {
          id: 'wo-mat-1',
          itemId: 'item-1',
          itemName: 'Bearing',
          quantity: 2,
          unitCost: 25,
          status: 'planned',
        },
      ],
      assignedTo: 'tech-1',
      teamLeaderId: null,
      assignedSupervisorId: 'sup-1',
      plannerId: 'planner-1',
      teamMembers: [],
      maintenanceRequest: { requestedBy: 'requester-1' },
      repairMaterialRequests: [],
      repairToolRequests: [],
    });

    const response = await GET(request(), { params: Promise.resolve({ id: 'wo-1' }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.suggestedTools).toHaveLength(1);
    expect(json.data.suggestedParts).toEqual([
      expect.objectContaining({
        itemId: 'item-1',
        itemName: 'Bearing',
        itemCode: 'BRG-001',
        quantity: 2,
        unit: 'each',
        pipelineStatus: 'suggested',
      }),
    ]);
  });

  it('deduplicates the same material while keeping legacy planner-pending rows as recommendations', async () => {
    mockDb.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      suggestedParts: JSON.stringify([
        {
          id: 'snap-1',
          itemId: 'item-1',
          itemName: 'Bearing',
          itemCode: 'BRG-001',
          quantity: 2,
          unit: 'each',
          notes: '',
        },
      ]),
      suggestedTools: '[]',
      plantId: 'plant-1',
      materials: [
        {
          id: 'wo-mat-1',
          itemId: 'item-1',
          itemName: 'Bearing',
          quantity: 2,
          unitCost: 25,
          status: 'planned',
        },
      ],
      assignedTo: 'tech-1',
      teamLeaderId: null,
      assignedSupervisorId: 'sup-1',
      plannerId: 'planner-1',
      teamMembers: [],
      maintenanceRequest: { requestedBy: 'requester-1' },
      repairMaterialRequests: [
        {
          id: 'rmr-1',
          itemName: 'Bearing',
          quantityRequested: 2,
          quantityApproved: 0,
          quantityIssued: 0,
          unit: 'each',
          status: 'pending',
          itemId: 'item-1',
          item: { itemCode: 'BRG-001', currentStock: 20, unitCost: 25 },
          source: 'planner_suggested',
        },
      ],
      repairToolRequests: [],
    });

    const response = await GET(request(), { params: Promise.resolve({ id: 'wo-1' }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.suggestedParts).toHaveLength(1);
    expect(json.data.suggestedParts[0]).toEqual(expect.objectContaining({
      itemId: 'item-1',
      pipelineId: null,
      pipelineStatus: 'suggested',
    }));
  });

  it('returns rejected technician-submitted planner tools for review while keeping withdrawn planner rows hidden', async () => {
    mockDb.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      suggestedParts: '[]',
      suggestedTools: '[]',
      plantId: 'plant-1',
      materials: [],
      assignedTo: 'tech-1',
      teamLeaderId: null,
      assignedSupervisorId: 'sup-1',
      plannerId: 'planner-1',
      teamMembers: [],
      maintenanceRequest: { requestedBy: 'requester-1' },
      repairMaterialRequests: [],
      repairToolRequests: [
        {
          id: 'tr-rejected-tech',
          toolName: 'Torque Wrench',
          status: 'rejected',
          toolId: 'tool-1',
          tool: { id: 'tool-1', name: 'Torque Wrench', toolCode: 'TW-001', status: 'available' },
          items: [
            {
              toolId: 'tool-1',
              toolName: 'Torque Wrench',
              toolCode: 'TW-001',
              quantityRequested: 1,
              tool: { id: 'tool-1', name: 'Torque Wrench', toolCode: 'TW-001', status: 'available' },
            },
          ],
          source: 'technician_from_planner_recommendation',
        },
        {
          id: 'tr-rejected-planner',
          toolName: 'Removed Planner Tool',
          status: 'rejected',
          toolId: 'tool-2',
          tool: { id: 'tool-2', name: 'Removed Planner Tool', toolCode: 'RPT-002', status: 'available' },
          items: [
            {
              toolId: 'tool-2',
              toolName: 'Removed Planner Tool',
              toolCode: 'RPT-002',
              quantityRequested: 1,
              tool: { id: 'tool-2', name: 'Removed Planner Tool', toolCode: 'RPT-002', status: 'available' },
            },
          ],
          source: 'planner_suggested',
        },
      ],
    });

    const response = await GET(request(), { params: Promise.resolve({ id: 'wo-1' }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.suggestedTools).toEqual([
      expect.objectContaining({
        toolId: 'tool-1',
        toolName: 'Torque Wrench',
        pipelineId: 'tr-rejected-tech',
        pipelineStatus: 'rejected',
      }),
    ]);
  });

});
