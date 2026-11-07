import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mock = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    componentInspectionPoint: {
      findFirst: vi.fn(), create: vi.fn(), update: vi.fn().mockResolvedValue({}),
    },
    componentInspectionRecord: {
      create: vi.fn(), findUnique: vi.fn(),
    },
    workOrder: {
      findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(),
    },
    auditLog: {
      findFirst: vi.fn(), create: vi.fn().mockResolvedValue({}),
    },
  };
  return {
    tx,
    db: {
      pmScheduleTask: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
      $transaction: vi.fn(async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)),
    },
  };
});

vi.mock('@/lib/db', () => ({ db: mock.db }));
vi.mock('@/lib/auth', () => ({
  getSession: () => ({ userId: 'tech-1', roles: ['maintenance_technician'], permissions: ['pm_schedules.view', 'work_orders.update'] }),
  hasPermission: (_: unknown, permission: string) => ['pm_schedules.view', 'work_orders.update'].includes(permission),
  isAdmin: () => false,
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: async () => ({
    denyAccess: false, accessiblePlantIds: ['plant-a'], isSystemWide: false, isScoped: false,
  }),
  canAccessPlantStrict: (scope: { accessiblePlantIds: string[] }, id: string) => scope.accessiblePlantIds.includes(id),
}));

import { GET, POST } from '@/app/api/pm-inspections/route';

const createRequest = (payload: Record<string, unknown>) => new NextRequest('http://localhost/api/pm-inspections', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
});

const assignment = {
  id: 'task-1', assetId: 'asset-1', componentId: 'component-1', equipmentState: 'running',
  asset: { id: 'asset-1', name: 'Rotary Printer', plantId: 'plant-a', departmentId: 'dept-1' },
  pmTask: { taskNumber: 3, description: 'Check bearing temperature' },
};
const point = {
  id: 'point-1', componentId: 'component-1', name: 'Bearing temperature', inspectionType: 'measurement',
  normalRange: JSON.stringify({ min: 10, max: 70, unit: '°C' }), frequency: 'per_start',
};

describe('PM inspection record API behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.db.pmScheduleTask.findFirst.mockResolvedValue(assignment);
    mock.tx.componentInspectionPoint.findFirst.mockResolvedValue(point);
    mock.tx.componentInspectionPoint.update.mockResolvedValue({});
    mock.tx.componentInspectionRecord.create.mockResolvedValue({
      id: 'record-1', inspectionPointId: 'point-1', result: 'fail', value: '84',
    });
    mock.tx.auditLog.findFirst.mockResolvedValue(null);
    mock.tx.auditLog.create.mockResolvedValue({});
    mock.tx.workOrder.findFirst.mockResolvedValue(null);
    mock.tx.workOrder.findMany.mockResolvedValue([]);
    mock.tx.workOrder.create.mockResolvedValue({
      id: 'wo-1', woNumber: 'WO-202611-0001', status: 'draft',
    });
    mock.db.$transaction.mockImplementation(async (fn: (tx: typeof mock.tx) => Promise<unknown>) => fn(mock.tx));
  });

  it('creates one evidence-backed corrective draft for an abnormal parameter reading', async () => {
    const response = await POST(createRequest({
      action: 'record', assignmentId: 'task-1', pointId: 'point-1',
      requestKey: 'inspection_rec_1234567890', result: 'pass', value: 84,
      findings: 'High bearing temperature',
    }));
    const data = await response.json();
    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.workOrder.woNumber).toBe('WO-202611-0001');
    expect(mock.tx.componentInspectionRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ result: 'fail', value: '84', inspectionPointId: 'point-1' }),
    });
    expect(mock.tx.workOrder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'corrective', status: 'draft', assetId: 'asset-1',
        workOrderComponents: { create: { componentRegistryId: 'component-1' } },
      }),
    });
    expect(mock.tx.auditLog.create).toHaveBeenCalledTimes(2);
  });

  it('reuses the existing record for an exact retry without creating a new WO', async () => {
    mock.tx.auditLog.findFirst.mockResolvedValue({ entityId: 'record-1' });
    mock.tx.componentInspectionRecord.findUnique.mockResolvedValue({
      id: 'record-1', result: 'fail', value: '84',
    });
    const response = await POST(createRequest({
      action: 'record', assignmentId: 'task-1', pointId: 'point-1',
      requestKey: 'inspection_rec_1234567890', result: 'fail', value: 84,
      findings: 'High bearing temperature',
    }));
    expect(response.status).toBe(200);
    expect((await response.json()).idempotent).toBe(true);
    expect(mock.tx.workOrder.create).not.toHaveBeenCalled();
    expect(mock.tx.componentInspectionRecord.create).not.toHaveBeenCalled();
  });

  it('denies cross-plant inspection records before any database mutation', async () => {
    mock.db.pmScheduleTask.findFirst.mockResolvedValue({
      ...assignment, asset: { ...assignment.asset, plantId: 'other-plant' },
    });
    const response = await POST(createRequest({
      action: 'record', assignmentId: 'task-1', pointId: 'point-1',
      requestKey: 'inspection_rec_1234567890', result: 'fail', value: 84,
      findings: 'Hot bearing',
    }));
    expect(response.status).toBe(403);
    expect(mock.db.$transaction).not.toHaveBeenCalled();
  });

  it('retrieves only active inspection assignments in scoped plants', async () => {
    mock.db.pmScheduleTask.findMany.mockResolvedValue([]);
    mock.db.pmScheduleTask.count.mockResolvedValue(0);
    const response = await GET(new NextRequest('http://localhost/api/pm-inspections'));
    expect(response.status).toBe(200);
    expect((await response.json()).data.items).toEqual([]);
    expect(mock.db.pmScheduleTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scheduleId: null, isActive: true, activityMode: 'inspection',
          asset: { plantId: { in: ['plant-a'] } },
        }),
      }),
    );
  });
});
