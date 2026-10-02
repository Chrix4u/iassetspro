import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pmFindMany: vi.fn(),
  woFindFirst: vi.fn(),
  woCreate: vi.fn(),
  componentUpsert: vi.fn(),
  commentCreate: vi.fn(),
  notifyUser: vi.fn(),
  auditCreate: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getSession: () => ({ userId: 'uat_planner', roles: ['planner'] }),
}));

vi.mock('@/lib/notifications', () => ({
  notifyUser: mocks.notifyUser,
}));

vi.mock('@/lib/db', () => ({
  db: {
    pmSchedule: { findMany: mocks.pmFindMany },
    workOrder: {
      findFirst: mocks.woFindFirst,
      create: mocks.woCreate,
    },
    workOrderComponent: { upsert: mocks.componentUpsert },
    workOrderComment: { create: mocks.commentCreate },
    auditLog: { create: mocks.auditCreate },
    user: { findUnique: mocks.userFindUnique },
  },
}));

import { POST } from '@/app/api/pm-schedules/check-due/route';

describe('component-targeted PM work-order generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const now = new Date();
    mocks.pmFindMany.mockResolvedValue([
      {
        id: 'pm-guard-switch',
        title: 'RP-01 Guard Safety Switch Weekly Functional Test',
        assetId: 'uat_asset_rotary_printer_01',
        componentId: 'component-guard-switch',
        frequencyType: 'weekly',
        frequencyValue: 1,
        nextDueDate: now,
        leadDays: 2,
        estimatedDuration: 0.5,
        priority: 'critical',
        assignedToId: null,
        departmentId: null,
        asset: {
          id: 'uat_asset_rotary_printer_01',
          name: 'Rotary Printing Machine RP-01',
          assetTag: 'UAT-RP-001',
          plantId: 'uat_plant_tema_01',
          departmentId: null,
        },
        component: {
          id: 'component-guard-switch',
          name: 'Guard Safety Switch',
          componentCode: 'RP01-INS-GUARDSW',
          componentType: 'instrument',
          assetId: 'uat_asset_rotary_printer_01',
        },
        assignedTo: null,
        department: null,
        template: null,
      },
    ]);
    mocks.woFindFirst.mockResolvedValue(null);
    mocks.woCreate.mockResolvedValue({
      id: 'wo-rp01-guard-switch',
      woNumber: 'WO-202609-9999',
    });
    mocks.componentUpsert.mockResolvedValue({});
    mocks.auditCreate.mockResolvedValue({});
    mocks.userFindUnique.mockResolvedValue({ id: 'uat_planner', status: 'active' });
  });

  it('keeps the parent asset and exact component context on the generated WO', async () => {
    const request = new Request('http://localhost/api/pm-schedules/check-due', {
      method: 'POST',
    });

    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    expect(mocks.woCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        assetId: 'uat_asset_rotary_printer_01',
        pmScheduleId: 'pm-guard-switch',
        type: 'preventive',
      }),
    }));

    expect(mocks.componentUpsert).toHaveBeenCalledWith({
      where: {
        workOrderId_componentRegistryId: {
          workOrderId: 'wo-rp01-guard-switch',
          componentRegistryId: 'component-guard-switch',
        },
      },
      create: {
        workOrderId: 'wo-rp01-guard-switch',
        componentRegistryId: 'component-guard-switch',
        notes: 'Inherited from component-targeted PM schedule',
      },
      update: {},
    });
  });
});