import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const createdRows: Array<Record<string, unknown>> = [];
  const tx = {
    $executeRawUnsafe: vi.fn(),
    pmSchedule: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    pmScheduleTask: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    pmTask: { findMany: vi.fn() },
    meterReading: { findFirst: vi.fn() },
    componentConditionReading: { findFirst: vi.fn() },
    iotDevice: { findUnique: vi.fn() },
    pmTemplate: { findUnique: vi.fn() },
    pmTrigger: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    auditLog: { create: vi.fn() },
    workOrder: { findUnique: vi.fn() },
  };
  const db = {
    asset: { findUnique: vi.fn() },
    componentRegistry: { findUnique: vi.fn() },
    meterReading: { findFirst: vi.fn() },
    pmSchedule: { findMany: vi.fn(), findUnique: vi.fn() },
    componentConditionReading: { findMany: vi.fn() },
    iotDevice: { findMany: vi.fn() },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  return { createdRows, tx, db, getPlantScope: vi.fn(), canAccessPlantStrict: vi.fn(), getAssetLiveLocationMap: vi.fn() };
});

vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/auth', () => ({
  getSession: () => ({ userId: 'planner-1', roles: ['planner'] }),
  hasPermission: () => true,
  isAdmin: () => false,
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mocks.getPlantScope,
  canAccessPlantStrict: mocks.canAccessPlantStrict,
}));
vi.mock('@/lib/functional-location/live-location', () => ({
  findAssetIdsByLiveLocationSearch: vi.fn(async () => []),
  getAssetLiveLocationMap: mocks.getAssetLiveLocationMap,
}));

import { GET as listSchedules, POST as createSchedule } from '@/app/api/pm-schedules/route';
import { PUT as updateSchedule } from '@/app/api/pm-schedules/[id]/route';
import { GET as getConditionSources } from '@/app/api/pm-schedules/condition-sources/route';

const stamp = new Date('2026-10-25T00:00:00Z');
const taskMaster = (id: string, taskNumber: number) => ({
  id, plantId: 'plant-1', taskNumber, description: `Task ${taskNumber}`, taskType: 'mechanical', isActive: true,
});
const schedule = (overrides: Record<string, unknown> = {}) => ({
  id: 'schedule-1', title: 'Task-level PM', description: null, assetId: 'asset-1', componentId: null,
  frequencyType: 'time_day', frequencyValue: 1, frequencyUnit: 'days', meterName: null,
  lastCompletedDate: null, nextDueDate: null, estimatedDuration: 1, priority: 'medium', assignedToId: null,
  departmentId: null, templateId: null, autoGenerateWO: false, leadDays: 0, isActive: true, createdById: 'planner-1',
  createdAt: stamp, updatedAt: stamp,
  asset: { id: 'asset-1', name: 'Pump A', assetTag: 'P-001', status: 'active', plantId: 'plant-1' },
  component: null, assignedTo: null, department: null, template: null,
  createdBy: { id: 'planner-1', fullName: 'Planner', username: 'planner' }, trigger: null, ...overrides,
});
const taskPayload = () => [
  { pmTaskId: 'task-1', sortOrder: 0, maintenanceMode: 'tbm', equipmentState: 'stopped', estimatedMinutes: 30, leadDays: 2, frequencyInterval: 30, frequencyUnit: 'days', nextDueDate: '2026-11-24T00:00:00.000Z' },
  { pmTaskId: 'task-2', sortOrder: 1, maintenanceMode: 'ubm', equipmentState: 'running', estimatedMinutes: 20, leadDays: 1, frequencyInterval: 500, frequencyUnit: 'hours', meterName: 'Operating Hours' },
  { pmTaskId: 'task-3', sortOrder: 2, maintenanceMode: 'cbm', equipmentState: 'running', estimatedMinutes: 10, leadDays: 0, conditionSourceType: 'iot_device', conditionSourceId: 'iot-1', conditionMetric: 'Temperature', conditionOperator: '>', conditionThreshold: 80, evaluationCadenceMinutes: 15 },
];
function request(url: string, method: string, body?: unknown) {
  return new Request(url, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

describe('PM scheduled-task API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createdRows.length = 0;
    mocks.getPlantScope.mockResolvedValue({ plantId: 'plant-1', accessiblePlantIds: ['plant-1'], isScoped: true, isSystemWide: false, denyAccess: false, accessLevel: 'write' });
    mocks.canAccessPlantStrict.mockReturnValue(true);
    mocks.getAssetLiveLocationMap.mockResolvedValue(new Map());
    mocks.db.asset.findUnique.mockResolvedValue({ id: 'asset-1', plantId: 'plant-1' });
    mocks.tx.pmTask.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => {
      const all = [taskMaster('task-1', 1), taskMaster('task-2', 2), taskMaster('task-3', 3)];
      return all.filter((task) => where.id.in.includes(task.id));
    });
    mocks.tx.pmScheduleTask.findMany.mockImplementation(async () => mocks.createdRows.map((row, index) => ({ ...row, pmTask: taskMaster(String(row.pmTaskId), index + 1) })));
    mocks.tx.pmScheduleTask.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `scheduled-${mocks.createdRows.length + 1}`, createdAt: stamp, updatedAt: stamp, ...data };
      mocks.createdRows.push(row);
      return row;
    });
    mocks.tx.pmScheduleTask.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const index = mocks.createdRows.findIndex((row) => row.id === where.id);
      mocks.createdRows[index] = { ...mocks.createdRows[index], ...data };
      return mocks.createdRows[index];
    });
    mocks.tx.pmScheduleTask.updateMany.mockResolvedValue({ count: 0 });
    mocks.tx.meterReading.findFirst.mockResolvedValue({ id: 'reading-1', value: 1250, meterName: 'Operating Hours', unit: 'hours' });
    mocks.tx.iotDevice.findUnique.mockResolvedValue({ id: 'iot-1', assetId: 'asset-1', plantId: 'plant-1', parameter: 'Temperature', unit: '°C', isActive: true });
    mocks.tx.auditLog.create.mockResolvedValue({ id: 'audit-1' });
  });

  it('creates a mixed task-level schedule without header cadence input and disables legacy automation', async () => {
    mocks.tx.pmSchedule.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => schedule(data));
    const response = await createSchedule(request('http://localhost/api/pm-schedules', 'POST', {
      title: 'Task-level PM', assetId: 'asset-1', scheduledTasks: taskPayload(),
    }) as never);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.tx.pmSchedule.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      autoGenerateWO: false, frequencyType: 'time_day', frequencyValue: 1, frequencyUnit: 'days', nextDueDate: null, leadDays: 0,
    }) }));
    expect(mocks.tx.pmScheduleTask.create).toHaveBeenCalledTimes(3);
    expect(body.data.scheduledTasks).toHaveLength(3);
  });

  it('rejects an explicitly empty scheduled-task list', async () => {
    const response = await createSchedule(request('http://localhost/api/pm-schedules', 'POST', {
      title: 'Task-level PM', assetId: 'asset-1', scheduledTasks: [],
    }) as never);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/at least one scheduled task/i);
    expect(mocks.tx.pmSchedule.create).not.toHaveBeenCalled();
  });

  it('preserves the legacy header-cadence create path when scheduledTasks is absent', async () => {
    mocks.tx.pmSchedule.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => schedule(data));
    const response = await createSchedule(request('http://localhost/api/pm-schedules', 'POST', {
      title: 'Legacy daily PM', assetId: 'asset-1', frequencyType: 'time_day', frequencyValue: 1, frequencyUnit: 'days', autoGenerateWO: true,
    }) as never);
    expect(response.status).toBe(201);
    expect(mocks.tx.pmSchedule.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ autoGenerateWO: true }) }));
    expect(mocks.tx.pmScheduleTask.create).not.toHaveBeenCalled();
  });

  it('returns scheduled tasks with their Task Master snapshots from list reads', async () => {
    mocks.db.pmSchedule.findMany.mockResolvedValue([schedule({
      tasks: [{ id: 'scheduled-1', pmTaskId: 'task-1', sortOrder: 0, maintenanceMode: 'tbm', pmTask: taskMaster('task-1', 1) }],
    })]);
    const response = await listSchedules(request('http://localhost/api/pm-schedules', 'GET') as never);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data[0].scheduledTasks[0].pmTask.taskNumber).toBe(1);
  });

  it('discovers active whole-asset IoT sources before the schedule exists', async () => {
    mocks.db.iotDevice.findMany.mockResolvedValue([{ id: 'iot-1', name: 'Bearing RTD', deviceCode: 'RTD-1', parameter: 'Temperature', unit: '°C', lastReading: 72 }]);
    const response = await getConditionSources(request('http://localhost/api/pm-schedules/condition-sources?assetId=asset-1', 'GET') as never);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data).toEqual([expect.objectContaining({ sourceType: 'iot_device', sourceId: 'iot-1', metric: 'Temperature', unit: '°C', currentValue: 72 })]);
  });

  it('discovers only readings from the selected component target', async () => {
    mocks.db.componentRegistry.findUnique.mockResolvedValue({ id: 'component-1', assetId: 'asset-1', name: 'Drive Bearing', componentCode: 'BRG-1' });
    mocks.db.componentConditionReading.findMany.mockResolvedValue([
      { parameterKey: 'vibration', value: 4.2, unit: 'mm/s' },
      { parameterKey: 'vibration', value: 3.9, unit: 'mm/s' },
      { parameterKey: 'temperature', value: 68, unit: '°C' },
    ]);
    const response = await getConditionSources(request('http://localhost/api/pm-schedules/condition-sources?assetId=asset-1&componentId=component-1', 'GET') as never);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data).toEqual([
      expect.objectContaining({ sourceType: 'component_condition', sourceId: 'component-1', metric: 'vibration', currentValue: 4.2 }),
      expect.objectContaining({ sourceType: 'component_condition', sourceId: 'component-1', metric: 'temperature', currentValue: 68 }),
    ]);
  });

  it('updates task rows inside the schedule transaction and keeps legacy automation disabled', async () => {
    const existing = schedule();
    mocks.db.pmSchedule.findUnique.mockResolvedValue(existing);
    mocks.tx.pmSchedule.findUnique.mockResolvedValue(existing);
    mocks.tx.pmSchedule.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => schedule(data));
    mocks.createdRows.push({ id: 'scheduled-1', scheduleId: 'schedule-1', pmTaskId: 'task-1', sortOrder: 0, maintenanceMode: 'tbm', equipmentState: 'stopped', estimatedMinutes: 30, leadDays: 2, frequencyInterval: 30, frequencyUnit: 'days', meterName: null, nextDueReading: null, conditionSourceType: null, conditionSourceId: null, conditionMetric: null, conditionOperator: null, conditionThreshold: null, conditionThresholdMax: null, conditionUnit: null, evaluationCadenceMinutes: null, lastCompletedAt: null, nextDueDate: new Date('2026-11-24T00:00:00Z'), isActive: true, createdAt: stamp, updatedAt: stamp });

    const response = await updateSchedule(request('http://localhost/api/pm-schedules/schedule-1', 'PUT', {
      title: 'Updated Task-level PM', scheduledTasks: [{ ...taskPayload()[0], id: 'scheduled-1', estimatedMinutes: 45 }],
    }) as never, { params: Promise.resolve({ id: 'schedule-1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.db.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.pmSchedule.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ autoGenerateWO: false }) }));
    expect(mocks.tx.pmScheduleTask.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'scheduled-1' }, data: expect.objectContaining({ estimatedMinutes: 45 }) }));
    expect(body.data.scheduledTasks[0].id).toBe('scheduled-1');
  });
});
