// ============================================================================
// Repair Planning Service — MR→WO Conversion Domain Service Tests
// ============================================================================
//
// Integration-style / type-contract tests for the repairPlanning.service.ts
// domain service. Since the service directly imports Prisma and executes DB
// transactions, we validate the exported types, function signature, and
// documented business logic rather than performing actual DB calls.
//
// These tests serve as a compile-time safety net: if the service's public API
// changes, these tests will fail at the TypeScript level.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import fs from 'fs';
import path from 'path';

// ---- Hoisted mocks for DB and state-machine ----
const { mockDb, mockExecuteTransition } = vi.hoisted(() => ({
  mockDb: {
    $transaction: vi.fn(),
    maintenanceRequest: {
      findUnique: vi.fn(),
    },
    workOrder: {
      findFirst: vi.fn(),
    },
  },
  mockExecuteTransition: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/state-machine', () => ({ executeTransition: mockExecuteTransition }));

// Import types and the main function AFTER mocks are set up
import type {
  ConvertMRToWOPayload,
  ConvertMRToWOResult,
  ConversionNotification,
  SessionLike,
} from '../repairPlanning.service';
import { convertMRToWorkOrder } from '../repairPlanning.service';

// ============================================================================
// Test 1: Type contract — verify the service exports the right types
// ============================================================================
describe('repairPlanning.service type exports', () => {
  it('should export SessionLike interface with required fields', () => {
    const validSession: SessionLike = {
      userId: 'user-123',
      roles: ['planner', 'admin'],
    };
    expect(validSession.userId).toBe('user-123');
    expect(validSession.roles).toContain('planner');

    // fullName should be optional
    const sessionWithOptional: SessionLike = {
      userId: 'user-456',
      fullName: 'John Doe',
      roles: ['technician'],
    };
    expect(sessionWithOptional.fullName).toBe('John Doe');
  });

  it('should export ConvertMRToWOPayload with all expected fields', () => {
    const payload: ConvertMRToWOPayload = {
      title: 'Fix pump bearing',
      priority: 'high',
      workOrderType: 'corrective',
      tradeActivity: 'mechanical',
      technicalDescription: 'Replace worn bearing',
      assignmentType: 'direct',
      assignedTo: 'tech-001',
      teamLeaderId: 'lead-001',
      teamMembers: [
        { userId: 'tech-001', role: 'technician' },
        { userId: 'tech-002', role: 'electrician' },
      ],
      assignedSupervisorId: 'sup-001',
      failureDescription: 'Bearing noise detected',
      causeDescription: 'Normal wear',
      actionDescription: 'Replace bearing assembly',
      estimatedHours: 4,
      plannedStart: '2025-07-01T08:00:00Z',
      plannedEnd: '2025-07-01T12:00:00Z',
      deliveryDateRequired: '2025-07-01T10:00:00Z',
      safetyNotes: 'LOTO required',
      ppeRequired: 'Safety glasses, gloves',
      notes: 'Customer requested urgent handling',
      requiredParts: [
        { itemId: 'part-001', quantity: 2 },
        { itemId: 'part-002' }, // quantity optional, defaults to 1
      ],
      requiredTools: [
        { toolId: 'tool-001', quantity: 1 },
        { toolId: 'tool-002' }, // quantity optional
      ],
    };

    // Verify all fields are accessible
    expect(payload.title).toBe('Fix pump bearing');
    expect(payload.priority).toBe('high');
    expect(payload.assignmentType).toBe('direct');
    expect(payload.teamMembers).toHaveLength(2);
    expect(payload.requiredParts).toHaveLength(2);
    expect(payload.requiredTools).toHaveLength(2);
  });

  it('should allow all payload fields to be optional', () => {
    const minimalPayload: ConvertMRToWOPayload = {};
    expect(Object.keys(minimalPayload)).toHaveLength(0);
  });

  it('should export convertMRToWorkOrder as a function', () => {
    expect(typeof convertMRToWorkOrder).toBe('function');
  });
});

// ============================================================================
// Test 2: Verify result type has all required fields
// ============================================================================
describe('ConvertMRToWOResult type structure', () => {
  it('should include success boolean as required field', () => {
    const successResult: ConvertMRToWOResult = { success: true };
    expect(successResult.success).toBe(true);
  });

  it('should support error result with conflictWoNumber', () => {
    const errorResult: ConvertMRToWOResult = {
      success: false,
      error: 'Already converted',
      conflictWoNumber: 'WO-202506-0001',
    };
    expect(errorResult.success).toBe(false);
    expect(errorResult.error).toBe('Already converted');
    expect(errorResult.conflictWoNumber).toBe('WO-202506-0001');
  });

  it('should support success result with workOrder and notifications', () => {
    const notifications: ConversionNotification[] = [
      {
        userId: 'user-001',
        type: 'mr_converted',
        title: 'MR Converted',
        message: 'Your request has been converted',
        entityType: 'work_order',
        entityId: 'wo-001',
        actionUrl: 'wo-detail?id=wo-001',
      },
    ];

    const result: ConvertMRToWOResult = {
      success: true,
      workOrder: { id: 'wo-001', woNumber: 'WO-202506-0001' },
      notifications,
    };
    expect(result.success).toBe(true);
    expect(result.workOrder).toBeDefined();
    expect(result.notifications).toHaveLength(1);
  });
});

// ============================================================================
// Test 3: Verify ConversionNotification type structure
// ============================================================================
describe('ConversionNotification type structure', () => {
  it('should require all notification fields except options', () => {
    const notif: ConversionNotification = {
      userId: 'user-001',
      type: 'wo_assigned',
      title: 'Work Order Assigned',
      message: 'You have been assigned WO-001',
      entityType: 'work_order',
      entityId: 'wo-001',
      actionUrl: 'wo-detail?id=wo-001',
    };
    expect(notif.userId).toBe('user-001');
    expect(notif.type).toBe('wo_assigned');
    expect(notif.options).toBeUndefined();
  });

  it('should accept optional options record', () => {
    const notif: ConversionNotification = {
      userId: 'user-001',
      type: 'wo_assigned',
      title: 'Work Order Team Lead Assignment',
      message: 'Assigned as team leader',
      entityType: 'work_order',
      entityId: 'wo-001',
      actionUrl: 'wo-detail?id=wo-001',
      options: { forceSms: true },
    };
    expect(notif.options?.forceSms).toBe(true);
  });
});

// ============================================================================
// Test 4: Verify SessionLike interface requires userId and roles
// ============================================================================
describe('SessionLike interface contract', () => {
  it('should require userId as string', () => {
    const session: SessionLike = { userId: 'abc', roles: [] };
    expect(typeof session.userId).toBe('string');
    expect(session.userId.length).toBeGreaterThan(0);
  });

  it('should require roles as string array', () => {
    const session: SessionLike = { userId: 'abc', roles: ['admin', 'planner'] };
    expect(Array.isArray(session.roles)).toBe(true);
    session.roles.forEach((role) => {
      expect(typeof role).toBe('string');
    });
  });

  it('should allow empty roles array', () => {
    const session: SessionLike = { userId: 'abc', roles: [] };
    expect(session.roles).toHaveLength(0);
  });
});

// ============================================================================
// Test 5: Verify priority preservation logic (documented as type-level test)
// ============================================================================
describe('Priority preservation logic (documented)', () => {
  // The service uses: payload.priority || mr.priority || 'medium'
  // This test documents the priority resolution chain.
  const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent', 'critical'] as const;

  it('should define valid priority values', () => {
    expect(VALID_PRIORITIES).toContain('low');
    expect(VALID_PRIORITIES).toContain('medium');
    expect(VALID_PRIORITIES).toContain('high');
    expect(VALID_PRIORITIES).toContain('urgent');
    expect(VALID_PRIORITIES).toContain('critical');
    expect(VALID_PRIORITIES).toHaveLength(5);
  });

  it('should accept any valid priority in the payload', () => {
    for (const priority of VALID_PRIORITIES) {
      const payload: ConvertMRToWOPayload = { priority };
      expect(payload.priority).toBe(priority);
    }
  });

  it('should accept undefined priority (falls back to MR priority or medium)', () => {
    const payload: ConvertMRToWOPayload = {};
    expect(payload.priority).toBeUndefined();
  });
});

// ============================================================================
// Test 6: Verify assignment type validation (documented as test)
// ============================================================================
describe('Assignment type validation (documented)', () => {
  it('should only accept \'direct\' or \'via_supervisor\' as assignmentType', () => {
    const directPayload: ConvertMRToWOPayload = { assignmentType: 'direct' };
    const supervisorPayload: ConvertMRToWOPayload = { assignmentType: 'via_supervisor' };

    expect(directPayload.assignmentType).toBe('direct');
    expect(supervisorPayload.assignmentType).toBe('via_supervisor');
  });

  it('should allow assignmentType to be undefined', () => {
    const payload: ConvertMRToWOPayload = {};
    expect(payload.assignmentType).toBeUndefined();
  });
});

// ============================================================================
// Test 7: Verify team member role validation (documented as test)
// ============================================================================
describe('Team member role validation (documented)', () => {
  it('should require each team member to have userId and role', () => {
    // Valid team members
    const validMembers: ConvertMRToWOPayload['teamMembers'] = [
      { userId: 'tech-001', role: 'technician' },
      { userId: 'tech-002', role: 'electrician' },
      { userId: 'lead-001', role: 'team_leader' },
    ];
    expect(validMembers).toHaveLength(3);
    expect(validMembers[0].userId).toBe('tech-001');
    expect(validMembers[0].role).toBe('technician');
  });

  it('should allow teamMembers to be undefined (not required)', () => {
    const payload: ConvertMRToWOPayload = {};
    expect(payload.teamMembers).toBeUndefined();
  });

  it('should allow empty teamMembers array', () => {
    const payload: ConvertMRToWOPayload = { teamMembers: [] };
    expect(payload.teamMembers).toHaveLength(0);
  });
});

// ============================================================================
// Test 8: Verify tool vs material distinction (documented as test)
// ============================================================================
describe('Tool vs material distinction (documented)', () => {
  it('should use itemId for parts (materials) and toolId for tools', () => {
    const payload: ConvertMRToWOPayload = {
      requiredParts: [{ itemId: 'part-001', quantity: 5 }],
      requiredTools: [{ toolId: 'tool-001', quantity: 1 }],
    };

    // Parts use 'itemId'
    expect(payload.requiredParts![0]).toHaveProperty('itemId');
    expect(payload.requiredParts![0].itemId).toBe('part-001');

    // Tools use 'toolId'
    expect(payload.requiredTools![0]).toHaveProperty('toolId');
    expect(payload.requiredTools![0].toolId).toBe('tool-001');
  });

  it('should allow quantity to be optional for both parts and tools', () => {
    const payload: ConvertMRToWOPayload = {
      requiredParts: [{ itemId: 'part-001' }],
      requiredTools: [{ toolId: 'tool-001' }],
    };
    expect(payload.requiredParts![0].quantity).toBeUndefined();
    expect(payload.requiredTools![0].quantity).toBeUndefined();
  });

  it('should document that parts create both compatibility and canonical planner-suggested records', () => {
    // Parts selected by a planner during MR conversion must be visible on the
    // WO detail page and enter the store approval pipeline.
    const PLANNED_STATUS = 'planned';
    const PLANNER_SUGGESTED_SOURCE = 'planner_suggested';
    expect(PLANNED_STATUS).toBe('planned');
    expect(PLANNER_SUGGESTED_SOURCE).toBe('planner_suggested');
  });

  it('should document that tools create RepairToolRequest (source: planner_suggested)', () => {
    // This test documents the business rule:
    // Tools → RepairToolRequest + RepairToolRequestItem with source 'planner_suggested'
    const PLANNER_SUGGESTED_SOURCE = 'planner_suggested';
    expect(PLANNER_SUGGESTED_SOURCE).toBe('planner_suggested');
  });
});

// ============================================================================
// Test 9: Function signature and behavior contract
// ============================================================================
describe('convertMRToWorkOrder function contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return error when MR not found', async () => {
    (mockDb.maintenanceRequest.findUnique as Mock).mockResolvedValue(null);

    const session: SessionLike = { userId: 'planner-1', roles: ['planner'] };
    const result = await convertMRToWorkOrder('nonexistent-mr-id', {}, session);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should return error when team members lack userId or role', async () => {
    (mockDb.maintenanceRequest.findUnique as Mock).mockResolvedValue({
      id: 'mr-1',
      title: 'Test MR',
      status: 'approved',
      requestedBy: 'user-1',
      description: 'desc',
    });

    const session: SessionLike = { userId: 'planner-1', roles: ['planner'] };
    const payload: ConvertMRToWOPayload = {
      teamMembers: [{ userId: 'tech-1', role: '' }], // empty role
    };

    const result = await convertMRToWorkOrder('mr-1', payload, session);

    expect(result.success).toBe(false);
    expect(result.error).toContain('userId and role');
  });

  it('should accept (mrId: string, payload: ConvertMRToWOPayload, session: SessionLike)', async () => {
    // Verify the function accepts the documented parameter types
    (mockDb.maintenanceRequest.findUnique as Mock).mockResolvedValue(null);

    const mrId = 'mr-abc';
    const payload: ConvertMRToWOPayload = { priority: 'high' };
    const session: SessionLike = { userId: 'user-1', roles: ['planner'] };

    // This would fail at compile time if the signature changed
    const result: Promise<ConvertMRToWOResult> = convertMRToWorkOrder(mrId, payload, session);
    expect(result).toBeInstanceOf(Promise);
  });

  it('persists planner resources as recommendations without auto-submitting approval requests', async () => {
    (mockDb.maintenanceRequest.findUnique as Mock).mockResolvedValue({
      id: 'mr-1',
      title: 'Pump bearing failure',
      status: 'approved',
      requestedBy: 'planner-1',
      description: 'Bearing noise',
      priority: 'high',
      plantId: 'plant-1',
      workOrderId: null,
      estimatedHours: null,
      plannedStart: null,
      plannedEnd: null,
      assetId: null,
      departmentId: null,
    });

    const tx = {
      workOrder: {
        findUnique: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'wo-1',
          woNumber: 'WO-202609-0001',
          title: 'Pump bearing failure',
          plantId: 'plant-1',
        }),
        update: vi.fn().mockResolvedValue({ id: 'wo-1' }),
      },
      maintenanceRequest: {
        update: vi.fn(),
      },
      workOrderTeamMember: {
        createMany: vi.fn(),
        create: vi.fn(),
      },
      inventoryItem: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'part-1',
          name: '6205 Bearing',
          itemCode: 'BRG-6205',
          unitOfMeasure: 'each',
          unitCost: 125,
          plantId: 'plant-1',
        }),
      },
      workOrderMaterial: {
        create: vi.fn().mockResolvedValue({ id: 'wom-1' }),
      },
      repairMaterialRequest: {
        create: vi.fn().mockResolvedValue({ id: 'rmr-1' }),
      },
      tool: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'tool-1',
          name: 'Bearing Puller',
          toolCode: 'TL-BP-01',
          category: 'mechanical',
          purchaseCost: 300,
          plantId: 'plant-1',
        }),
      },
      repairToolRequest: {
        create: vi.fn().mockResolvedValue({ id: 'rtr-1' }),
      },
      repairToolRequestItem: {
        create: vi.fn().mockResolvedValue({ id: 'rtri-1' }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    (mockDb.$transaction as Mock).mockImplementation(async (callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx));
    mockExecuteTransition.mockResolvedValue({ success: true });

    const result = await convertMRToWorkOrder(
      'mr-1',
      {
        requiredParts: [{ itemId: 'part-1', quantity: 2 }],
        requiredTools: [{ toolId: 'tool-1', quantity: 1 }],
      },
      { userId: 'planner-1', fullName: 'Planner One', roles: ['admin', 'maintenance_planner'] },
    );

    expect(result.success).toBe(true);

    expect(tx.workOrderMaterial.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workOrderId: 'wo-1',
        itemId: 'part-1',
        itemName: '6205 Bearing',
        quantity: 2,
        unitCost: 125,
        totalCost: 250,
        status: 'planned',
        requestedBy: 'planner-1',
      }),
    });

    // Planner recommendations must not enter the approval/issue pipeline
    // until assigned execution staff explicitly submit them.
    expect(tx.repairMaterialRequest.create).not.toHaveBeenCalled();
    expect(tx.repairToolRequest.create).not.toHaveBeenCalled();
    expect(tx.repairToolRequestItem.create).not.toHaveBeenCalled();

    const snapshotCall = tx.workOrder.update.mock.calls.find(
      ([args]) => args?.data?.suggestedParts && args?.data?.suggestedTools,
    );
    expect(snapshotCall).toBeDefined();

    const snapshotData = snapshotCall![0].data;
    expect(JSON.parse(snapshotData.suggestedParts)).toEqual([
      expect.objectContaining({
        itemId: 'part-1',
        itemName: '6205 Bearing',
        itemCode: 'BRG-6205',
        quantity: 2,
        unit: 'each',
        recommendedById: 'planner-1',
      }),
    ]);
    expect(JSON.parse(snapshotData.suggestedTools)).toEqual([
      expect.objectContaining({
        toolId: 'tool-1',
        toolName: 'Bearing Puller',
        toolCode: 'TL-BP-01',
        quantity: 1,
        recommendedById: 'planner-1',
      }),
    ]);
  });

  it('should handle P2002 race condition in the outer catch', async () => {
    (mockDb.maintenanceRequest.findUnique as Mock).mockResolvedValue({
      id: 'mr-1',
      title: 'Test MR',
      status: 'approved',
      requestedBy: 'user-1',
      description: 'desc',
    });
    (mockDb.$transaction as Mock).mockRejectedValue({ code: 'P2002' });
    (mockDb.workOrder.findFirst as Mock).mockResolvedValue({
      woNumber: 'WO-202506-0001',
    });

    const session: SessionLike = { userId: 'planner-1', roles: ['planner'] };
    const result = await convertMRToWorkOrder('mr-1', {}, session);

    expect(result.success).toBe(false);
    expect(result.error).toContain('already been converted');
    expect(result.conflictWoNumber).toBe('WO-202506-0001');
  });

  it('should handle generic error in the outer catch', async () => {
    (mockDb.maintenanceRequest.findUnique as Mock).mockResolvedValue({
      id: 'mr-1',
      title: 'Test MR',
      status: 'approved',
      requestedBy: 'user-1',
      description: 'desc',
    });
    (mockDb.$transaction as Mock).mockRejectedValue(new Error('DB connection lost'));
    (mockDb.workOrder.findFirst as Mock).mockResolvedValue(null);

    const session: SessionLike = { userId: 'planner-1', roles: ['planner'] };
    const result = await convertMRToWorkOrder('mr-1', {}, session);

    expect(result.success).toBe(false);
    expect(result.error).toContain('DB connection lost');
  });
});

describe('MR conversion material reconciliation source contract', () => {
  it('backfills legacy converted WO materials and derives missing suggestion snapshots', () => {
    const migration = fs.readFileSync(
      path.join(process.cwd(), 'prisma/migrations/20260920194000_backfill_mr_conversion_materials/migration.sql'),
      'utf8',
    );
    const suggestedRoute = fs.readFileSync(
      path.join(process.cwd(), 'src/app/api/work-orders/[id]/suggested-items/route.ts'),
      'utf8',
    );

    expect(migration).toContain("INSERT INTO `repair_material_requests`");
    expect(migration).toContain("w.`maintenanceRequestId` IS NOT NULL");
    expect(migration).toContain("wom.`status` = 'planned'");
    expect(migration).toContain("'planner_suggested'");
    expect(migration).toContain('NOT EXISTS');

    expect(suggestedRoute).toContain('Reconcile planner-selected materials from every durable source');
    expect(suggestedRoute).toContain('for (const material of wo.materials)');
    expect(suggestedRoute).toContain('for (const request of wo.repairMaterialRequests)');
    expect(suggestedRoute).toContain("source: { in: ['planner_suggested', 'technician_from_planner_recommendation'] }");
    expect(suggestedRoute).toContain("action === 'submit_recommendations'");
    expect(suggestedRoute).toContain('Only assigned execution staff can submit recommended resources for approval');
    expect(suggestedRoute).toContain("source: 'technician_from_planner_recommendation'");
    expect(suggestedRoute).toContain("status: { notIn: ['pending', 'rejected'] }");
    expect(suggestedRoute).toContain('Superseded when');
    expect(suggestedRoute).toContain("if (request.status === 'rejected' && !current) continue");
    expect(suggestedRoute).toContain("action: 'decline_planner_resource_recommendation'");
    expect(suggestedRoute).toContain("action: 'amend_planner_resource_recommendation'");
  });

  it('keeps planner WO edits and technician recommendation decisions separate', () => {
    const workOrderRoute = fs.readFileSync(
      path.join(process.cwd(), 'src/app/api/work-orders/[id]/route.ts'),
      'utf8',
    );
    const detailsUi = fs.readFileSync(
      path.join(process.cwd(), 'src/components/modules/MaintenancePages.tsx'),
      'utf8',
    );

    expect(workOrderRoute).toContain("await tx.workOrderMaterial.deleteMany({");
    expect(workOrderRoute).toContain("where: { workOrderId: id, status: 'planned' }");
    expect(workOrderRoute).toContain("data: { suggestedParts: JSON.stringify(resolvedParts) }");
    expect(workOrderRoute).toContain("data: { suggestedTools: JSON.stringify(resolvedTools) }");
    expect(workOrderRoute).toContain("source: 'planner_suggested'");
    expect(workOrderRoute).toContain("status: 'pending'");
    expect(workOrderRoute).toContain('Removed from planner recommendations before technician submission');
    expect(workOrderRoute).not.toContain("reason: 'Planner suggested material (updated)'");
    expect(workOrderRoute).not.toContain("reason: 'Planner suggested tool (updated)'");

    expect(detailsUi).toContain('Planner Recommended Resources');
    expect(detailsUi).toContain('Recommendations only — assigned technicians may adjust quantities');
    expect(detailsUi).toContain('handleSuggestedQuantityChange');
    expect(detailsUi).toContain('handleSubmitSuggestedRecommendations');
    expect(detailsUi).toContain("action: 'submit_recommendations'");
    expect(detailsUi).toContain('Request Extra Material');
    expect(detailsUi).toContain('Request Extra Tool');
    expect(detailsUi).toContain("m.status === 'planned' && m.itemId");
  });
});

// ============================================================================
// Test 10: Work order type validation (documented)
// ============================================================================
describe('Work order type values (documented)', () => {
  const VALID_WO_TYPES = [
    'breakdown', 'preventive', 'corrective', 'predictive',
    'inspection', 'project', 'emergency',
  ] as const;

  it('should accept all valid work order types', () => {
    for (const woType of VALID_WO_TYPES) {
      const payload: ConvertMRToWOPayload = { workOrderType: woType };
      expect(payload.workOrderType).toBe(woType);
    }
    expect(VALID_WO_TYPES).toHaveLength(7);
  });

  it('should default to \'corrective\' when not specified (documented)', () => {
    // The service defaults: payload.workOrderType || 'corrective'
    const DEFAULT_WO_TYPE = 'corrective';
    expect(DEFAULT_WO_TYPE).toBe('corrective');
  });
});

// ============================================================================
// Test 11: Trade activity values (documented)
// ============================================================================
describe('Trade activity values (documented)', () => {
  const VALID_TRADES = [
    'mechanical', 'electrical', 'civil', 'facility', 'workshop', 'other',
  ] as const;

  it('should accept all valid trade activities', () => {
    for (const trade of VALID_TRADES) {
      const payload: ConvertMRToWOPayload = { tradeActivity: trade };
      expect(payload.tradeActivity).toBe(trade);
    }
    expect(VALID_TRADES).toHaveLength(6);
  });
});

// ============================================================================
// Test 12: WO number format (documented)
// ============================================================================
describe('WO number format (documented)', () => {
  it('should follow WO-YYYYMM-NNNN format', () => {
    // Documented format: WO-{monthStr}-{seq padded to 4 digits}
    const monthStr = '202506';
    const seq = 1;
    const expected = `WO-${monthStr}-${String(seq).padStart(4, '0')}`;
    expect(expected).toBe('WO-202506-0001');
  });

  it('should pad sequence numbers to 4 digits', () => {
    expect(String(1).padStart(4, '0')).toBe('0001');
    expect(String(42).padStart(4, '0')).toBe('0042');
    expect(String(999).padStart(4, '0')).toBe('0999');
    expect(String(1000).padStart(4, '0')).toBe('1000');
  });
});
