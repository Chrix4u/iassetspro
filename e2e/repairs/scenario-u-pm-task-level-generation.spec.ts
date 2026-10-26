import { test, expect } from '@playwright/test';
import { db } from '../../src/lib/db';
import { apiCall, apiCallWithPlant, getToken, lookupAssetId, lookupPlantId, lookupUserByKey } from './helpers/api';

test('UAT-21: mixed task-level PM generates only due compatible tasks without advancing recurrence', async () => {
  const suffix = Date.now().toString().slice(-7);
  const scheduleTitle = `UAT Task-Level Generation ${suffix}`;
  const componentCode = `UAT-TASKGEN-${suffix}`;
  const meterName = `UAT TaskGen Hours ${suffix}`;
  const conditionMetric = `uat_vibration_${suffix}`;
  const plannerToken = await getToken('planner');
  const plannerId = await lookupUserByKey(plannerToken, 'planner');
  const assetId = await lookupAssetId(plannerToken, 'UAT-PUMP-001');
  const plantId = await lookupPlantId(plannerToken, 'PLANT-A');
  const generatedWoIds: string[] = [];
  let componentId = '';
  let scheduleId = '';

  try {
    const componentCreate = await apiCall(plannerToken, 'POST', '/api/component-registry', {
      componentCode,
      name: `UAT Task Generation Bearing ${suffix}`,
      componentType: 'component',
      assetId,
      criticality: 'high',
      operatingHours: 1000,
    });
    expect(componentCreate.status).toBe(201);
    componentId = String(componentCreate.data.data?.id || '');
    expect(componentId).toBeTruthy();

    const taskSpecs = [
      { key: 'tbm', description: `Inspect task-generation bearing ${suffix}`, taskType: 'mechanical' },
      { key: 'ubm', description: `Lubricate task-generation bearing ${suffix}`, taskType: 'lubrication' },
      { key: 'cbm', description: `Investigate task-generation vibration ${suffix}`, taskType: 'electrical' },
      { key: 'future', description: `Future task-generation inspection ${suffix}`, taskType: 'mechanical' },
    ] as const;
    const taskIds = new Map<string, string>();
    for (const spec of taskSpecs) {
      const created = await apiCallWithPlant(plannerToken, 'POST', '/api/pm-tasks', plantId, {
        description: spec.description,
        taskType: spec.taskType,
      });
      expect(created.status).toBe(201);
      taskIds.set(spec.key, String(created.data.data?.id || ''));
      expect(taskIds.get(spec.key)).toBeTruthy();
    }

    const baseTime = Date.now();
    await db.meterReading.create({
      data: {
        readingNumber: `UAT-TASKGEN-METER-${suffix}-0`,
        assetId,
        plantId,
        meterName,
        value: 1000,
        unit: 'hours',
        readingDate: new Date(baseTime),
        notes: 'UAT-21 baseline before task-level schedule creation',
        readById: plannerId,
      },
    });
    await db.componentConditionReading.create({
      data: {
        componentId,
        parameterKey: conditionMetric,
        value: 4,
        unit: 'mm/s',
        source: 'manual',
        recordedAt: new Date(baseTime),
        recordedById: plannerId,
      },
    });

    const dueDate = new Date(baseTime - 60_000).toISOString();
    const futureDate = new Date(baseTime + 30 * 24 * 60 * 60 * 1000).toISOString();
    const createSchedule = await apiCall(plannerToken, 'POST', '/api/pm-schedules', {
      title: scheduleTitle,
      assetId,
      componentId,
      priority: 'high',
      scheduledTasks: [
        {
          pmTaskId: taskIds.get('tbm'), sortOrder: 0, maintenanceMode: 'tbm', equipmentState: 'stopped',
          estimatedMinutes: 30, leadDays: 0, frequencyInterval: 1, frequencyUnit: 'days', nextDueDate: dueDate,
        },
        {
          pmTaskId: taskIds.get('ubm'), sortOrder: 1, maintenanceMode: 'ubm', equipmentState: 'stopped',
          estimatedMinutes: 20, leadDays: 0, frequencyInterval: 100, frequencyUnit: 'hours', meterName,
        },
        {
          pmTaskId: taskIds.get('cbm'), sortOrder: 2, maintenanceMode: 'cbm', equipmentState: 'running',
          estimatedMinutes: 15, leadDays: 0, conditionSourceType: 'component_condition',
          conditionSourceId: componentId, conditionMetric, conditionOperator: '>=', conditionThreshold: 5,
        },
        {
          pmTaskId: taskIds.get('future'), sortOrder: 3, maintenanceMode: 'tbm', equipmentState: 'stopped',
          estimatedMinutes: 10, leadDays: 0, frequencyInterval: 30, frequencyUnit: 'days', nextDueDate: futureDate,
        },
      ],
    });
    expect(createSchedule.status).toBe(201);
    scheduleId = String(createSchedule.data.data?.id || '');
    expect(scheduleId).toBeTruthy();
    expect(createSchedule.data.data?.autoGenerateWO).toBe(false);

    const before = await db.pmSchedule.findUnique({
      where: { id: scheduleId },
      include: { tasks: { include: { pmTask: true }, orderBy: { sortOrder: 'asc' } } },
    });
    expect(before?.tasks).toHaveLength(4);
    const scheduledByMaster = new Map((before?.tasks || []).map((task) => [task.pmTaskId, task]));
    const tbmTask = scheduledByMaster.get(taskIds.get('tbm')!);
    const ubmTask = scheduledByMaster.get(taskIds.get('ubm')!);
    const cbmTask = scheduledByMaster.get(taskIds.get('cbm')!);
    const futureTask = scheduledByMaster.get(taskIds.get('future')!);
    expect(tbmTask?.id).toBeTruthy();
    expect(ubmTask?.id).toBeTruthy();
    expect(cbmTask?.id).toBeTruthy();
    expect(futureTask?.id).toBeTruthy();
    expect(Number(ubmTask?.nextDueReading)).toBe(1100);

    // Public task-level authoring remains fail-closed. This direct fixture toggle is
    // deliberate UAT eligibility only, until verified Repairs closeout owns recurrence advancement.
    await db.pmSchedule.update({ where: { id: scheduleId }, data: { autoGenerateWO: true } });

    await db.meterReading.create({
      data: {
        readingNumber: `UAT-TASKGEN-METER-${suffix}-1`,
        assetId,
        plantId,
        meterName,
        value: 1100,
        unit: 'hours',
        readingDate: new Date(baseTime + 1000),
        previousValue: 1000,
        consumption: 100,
        notes: 'UAT-21 reaches the task-level UBM threshold',
        readById: plannerId,
      },
    });
    await db.componentConditionReading.create({
      data: {
        componentId,
        parameterKey: conditionMetric,
        value: 6,
        unit: 'mm/s',
        source: 'manual',
        recordedAt: new Date(baseTime + 2000),
        recordedById: plannerId,
      },
    });

    const first = await apiCall(plannerToken, 'POST', '/api/pm-schedules/check-due', {});
    expect(first.status).toBe(200);
    const engine = first.data.data?.engines?.scheduledTasks;
    expect(engine).toBeTruthy();
    const generated = (engine.results as any[]).filter((row) => row.scheduleId === scheduleId && row.skipped === false);
    expect(generated).toHaveLength(2);

    const stopped = generated.find((row) => row.equipmentState === 'stopped');
    const running = generated.find((row) => row.equipmentState === 'running');
    expect(stopped?.workOrderId).toBeTruthy();
    expect(running?.workOrderId).toBeTruthy();
    expect(new Set(stopped.scheduledTaskIds)).toEqual(new Set([tbmTask!.id, ubmTask!.id]));
    expect(new Set(running.scheduledTaskIds)).toEqual(new Set([cbmTask!.id]));
    expect([...stopped.scheduledTaskIds, ...running.scheduledTaskIds]).not.toContain(futureTask!.id);
    generatedWoIds.push(String(stopped.workOrderId), String(running.workOrderId));

    for (const row of generated) {
      const wo = await apiCall(plannerToken, 'GET', `/api/work-orders/${row.workOrderId}`);
      expect(wo.status).toBe(200);
      expect(wo.data.data.type).toBe('preventive');
      expect(wo.data.data.pmSchedule?.id ?? wo.data.data.pmScheduleId).toBe(scheduleId);
      expect((wo.data.data.workOrderComponents as any[] | undefined)?.some((link) => link.componentRegistry?.id === componentId)).toBe(true);

      const checklist = await apiCall(plannerToken, 'GET', `/api/work-orders/${row.workOrderId}/tasks`);
      expect(checklist.status).toBe(200);
      expect(checklist.data.meta?.source).toBe('existing');
      const rows = checklist.data.data as any[];
      expect(rows).toHaveLength(row.scheduledTaskIds.length);
      expect(new Set(rows.map((task) => task.pmScheduleTaskId))).toEqual(new Set(row.scheduledTaskIds));
      for (const task of rows) {
        expect(task.pmDueCycleKey).toBeTruthy();
        const snapshot = JSON.parse(task.pmPlanningSnapshot || '{}');
        expect(snapshot.pmScheduleTaskId).toBe(task.pmScheduleTaskId);
        expect(snapshot.pmTaskId).toBeTruthy();
        expect(snapshot.due?.cycleKey).toBe(task.pmDueCycleKey);
        expect(['check', 'lubricate']).toContain(task.taskType);
      }
    }

    const second = await apiCall(plannerToken, 'POST', '/api/pm-schedules/check-due', {});
    expect(second.status).toBe(200);
    const secondRows = (second.data.data?.engines?.scheduledTasks?.results as any[] | undefined) || [];
    expect(secondRows.some((row) => row.scheduleId === scheduleId && row.skipped === false)).toBe(false);
    expect(await db.workOrder.count({ where: { pmScheduleId: scheduleId, type: 'preventive', status: { not: 'cancelled' } } })).toBe(2);

    const after = await db.pmSchedule.findUnique({
      where: { id: scheduleId },
      include: { tasks: { orderBy: { sortOrder: 'asc' } } },
    });
    const beforeById = new Map((before?.tasks || []).map((task) => [task.id, task]));
    for (const task of after?.tasks || []) {
      const prior = beforeById.get(task.id)!;
      expect(task.lastCompletedAt?.toISOString() || null).toBe(prior.lastCompletedAt?.toISOString() || null);
      expect(task.nextDueDate?.toISOString() || null).toBe(prior.nextDueDate?.toISOString() || null);
      expect(task.nextDueReading ?? null).toBe(prior.nextDueReading ?? null);
    }
    const afterById = new Map((after?.tasks || []).map((task) => [task.id, task]));
    expect(afterById.get(tbmTask!.id)?.lastGeneratedCycleKey).toBeTruthy();
    expect(afterById.get(ubmTask!.id)?.lastGeneratedCycleKey).toBeTruthy();
    expect(afterById.get(cbmTask!.id)?.lastGeneratedCycleKey).toBeTruthy();
    expect(afterById.get(futureTask!.id)?.lastGeneratedCycleKey).toBeNull();
  } finally {
    if (scheduleId) {
      await db.pmSchedule.update({ where: { id: scheduleId }, data: { autoGenerateWO: false } }).catch(() => undefined);
    }
    for (const woId of generatedWoIds) {
      await apiCall(plannerToken, 'POST', `/api/work-orders/${woId}/cancel`, {
        reason: 'UAT-21 cleanup after task-level generation verification',
      }).catch(() => undefined);
    }
    if (componentId) {
      await db.componentConditionReading.deleteMany({ where: { componentId, parameterKey: conditionMetric } }).catch(() => undefined);
    }
    await db.meterReading.deleteMany({ where: { assetId, meterName } }).catch(() => undefined);
  }
});
