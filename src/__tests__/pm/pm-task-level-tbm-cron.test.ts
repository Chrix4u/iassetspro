import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: {
    pmSchedule: { findMany: vi.fn() },
    workOrder: { findFirst: vi.fn() },
    notification: { findFirst: vi.fn() },
  },
  getSession: vi.fn(),
  hasPermission: vi.fn(),
  isAdmin: vi.fn(),
  getPlantScope: vi.fn(),
  notifyUser: vi.fn(),
  generateDueWorkOrders: vi.fn(),
  evaluateRuntimeTriggers: vi.fn(),
  evaluateDueTbmScheduleTasks: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/auth', () => ({
  getSession: mocks.getSession,
  hasPermission: mocks.hasPermission,
  isAdmin: mocks.isAdmin,
}));
vi.mock('@/lib/plant-scope', () => ({ getPlantScope: mocks.getPlantScope }));
vi.mock('@/lib/notifications', () => ({ notifyUser: mocks.notifyUser }));
vi.mock('@/services/pm/tbmScheduleTaskEngine', () => ({
  evaluateDueTbmScheduleTasks: mocks.evaluateDueTbmScheduleTasks,
}));
vi.mock('@/app/api/pm-schedules/check-due/route', () => ({ POST: mocks.generateDueWorkOrders }));
vi.mock('@/app/api/pm-triggers/evaluate/route', () => ({ POST: mocks.evaluateRuntimeTriggers }));

import { POST as runCron } from '@/app/api/pm-schedules/check-due-cron/route';

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('task-level TBM cron observability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockReturnValue({ userId: 'planner-1', roles: ['planner'] });
    mocks.hasPermission.mockReturnValue(true);
    mocks.isAdmin.mockReturnValue(false);
    mocks.getPlantScope.mockResolvedValue({
      plantId: null,
      accessiblePlantIds: ['plant-1', 'plant-2'],
      isScoped: false,
      isSystemWide: false,
      denyAccess: false,
      accessLevel: 'write',
    });
    mocks.generateDueWorkOrders.mockResolvedValue(jsonResponse({
      success: true,
      data: { checked: 0, generated: 0, skipped: 0, results: [] },
    }));
    mocks.evaluateRuntimeTriggers.mockResolvedValue(jsonResponse({
      success: true,
      data: { evaluated: 0, generated: 0, results: [], engines: {} },
    }));
    mocks.evaluateDueTbmScheduleTasks.mockResolvedValue({
      evaluated: 2,
      due: 1,
      overdue: 0,
      results: [
        {
          scheduleTaskId: 'task-due', scheduleId: 'schedule-1', pmTaskId: 'pm-task-1', sortOrder: 0,
          taskNumber: 10, taskDescription: 'Inspect bearing', scheduleTitle: 'Pump PM',
          assetId: 'asset-1', componentId: null, plantId: 'plant-1', assetName: 'Pump A', assetTag: 'P-001',
          dueForGeneration: true, overdue: false, leadDays: 2,
          nextDueDate: new Date('2026-10-27T00:00:00.000Z'),
          leadWindowEnd: new Date('2026-10-28T00:00:00.000Z'),
        },
        {
          scheduleTaskId: 'task-later', scheduleId: 'schedule-1', pmTaskId: 'pm-task-2', sortOrder: 1,
          taskNumber: 20, taskDescription: 'Replace seal', scheduleTitle: 'Pump PM',
          assetId: 'asset-1', componentId: null, plantId: 'plant-1', assetName: 'Pump A', assetTag: 'P-001',
          dueForGeneration: false, overdue: false, leadDays: 0,
          nextDueDate: new Date('2027-01-24T00:00:00.000Z'),
          leadWindowEnd: new Date('2026-10-26T00:00:00.000Z'),
        },
      ],
    });
    mocks.db.pmSchedule.findMany.mockResolvedValue([]);
  });

  it('passes the manual caller plant boundary to the read-only TBM evaluator and returns only due details', async () => {
    const request = new Request('http://localhost/api/pm-schedules/check-due-cron', { method: 'POST' });
    const response = await runCron(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.evaluateDueTbmScheduleTasks).toHaveBeenCalledWith(mocks.db, {
      now: expect.any(Date),
      plantIds: ['plant-1', 'plant-2'],
    });
    expect(body.data.taskLevelTbm).toMatchObject({ evaluated: 2, due: 1, overdue: 0 });
    expect(body.data.taskLevelTbm.dueTasks).toHaveLength(1);
    expect(body.data.taskLevelTbm.dueTasks[0]).toMatchObject({
      scheduleTaskId: 'task-due',
      nextDueDate: '2026-10-27T00:00:00.000Z',
    });
    expect(mocks.db.workOrder.findFirst).not.toHaveBeenCalled();
  });
});
