import { beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = new Date('2026-10-26T12:00:00.000Z');

const client = {
  meterReading: { findFirst: vi.fn() },
  componentConditionReading: { findFirst: vi.fn() },
  iotDevice: { findUnique: vi.fn() },
  pmScheduleTask: { update: vi.fn() },
};

const task = (overrides: Record<string, unknown> = {}) => ({
  id: 'scheduled-1',
  scheduleId: 'schedule-1',
  pmTaskId: 'task-1',
  sortOrder: 0,
  maintenanceMode: 'tbm',
  equipmentState: 'stopped',
  estimatedMinutes: 30,
  leadDays: 5,
  frequencyInterval: 1,
  frequencyUnit: 'months',
  meterName: null,
  nextDueReading: null,
  conditionSourceType: null,
  conditionSourceId: null,
  conditionMetric: null,
  conditionOperator: null,
  conditionThreshold: null,
  conditionThresholdMax: null,
  conditionUnit: null,
  evaluationCadenceMinutes: null,
  lastCompletedAt: null,
  lastEvaluatedAt: null,
  lastGeneratedAt: null,
  lastGeneratedCycleKey: null,
  nextDueDate: new Date('2026-10-31T00:00:00.000Z'),
  isActive: true,
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  updatedAt: new Date('2026-10-01T00:00:00.000Z'),
  ...overrides,
});

const baseInput = (overrides: Record<string, unknown> = {}) => ({
  client,
  task: task(),
  assetId: 'asset-1',
  plantId: 'plant-1',
  componentId: null,
  now: NOW,
  ...overrides,
});

async function evaluate(input: ReturnType<typeof baseInput>) {
  const { evaluateScheduledTaskDue } = await import('@/services/pm/pmScheduledTaskDueEngine');
  return evaluateScheduledTaskDue(input as never);
}

describe('pmScheduledTaskDueEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.pmScheduleTask.update.mockResolvedValue({});
  });

  it('fails closed for inactive Scheduled Tasks without reading a source', async () => {
    const result = await evaluate(baseInput({ task: task({ isActive: false }) }));
    expect(result).toMatchObject({ due: false, reason: 'inactive', dueCycleKey: null, maintenanceMode: 'tbm' });
    expect(client.meterReading.findFirst).not.toHaveBeenCalled();
    expect(client.componentConditionReading.findFirst).not.toHaveBeenCalled();
    expect(client.iotDevice.findUnique).not.toHaveBeenCalled();
  });

  it('uses the TBM lead window without mutating recurrence state', async () => {
    const beforeLead = await evaluate(baseInput({
      now: new Date('2026-10-25T23:59:59.999Z'),
      task: task({ nextDueDate: new Date('2026-10-31T00:00:00.000Z'), leadDays: 5 }),
    }));
    expect(beforeLead).toMatchObject({
      due: false,
      reason: 'tbm_not_due',
      dueCycleKey: 'tbm:scheduled-1:2026-10-31T00:00:00.000Z',
    });

    const atLead = await evaluate(baseInput({
      now: new Date('2026-10-26T00:00:00.000Z'),
      task: task({ nextDueDate: new Date('2026-10-31T00:00:00.000Z'), leadDays: 5 }),
    }));
    expect(atLead).toMatchObject({ due: true, reason: 'tbm_due' });
    expect(client.pmScheduleTask.update).not.toHaveBeenCalled();
  });

  it.each([
    [1499, false, 'ubm_not_due'],
    [1500, true, 'ubm_due'],
    [1501, true, 'ubm_due'],
  ])('evaluates UBM against the exact persisted threshold (%s)', async (value, due, reason) => {
    client.meterReading.findFirst.mockResolvedValue({
      id: 'meter-reading-1', value, meterName: 'Operating Hours', unit: 'hours',
      readingDate: new Date('2026-10-26T11:00:00Z'), createdAt: new Date('2026-10-26T11:00:01Z'),
    });
    const result = await evaluate(baseInput({
      task: task({
        maintenanceMode: 'ubm', meterName: 'Operating Hours', frequencyUnit: 'hours',
        nextDueReading: 1500, nextDueDate: null,
      }),
    }));
    expect(client.meterReading.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { assetId: 'asset-1', meterName: 'Operating Hours', unit: 'hours' },
    }));
    expect(result).toMatchObject({
      due, reason, currentValue: value, dueCycleKey: 'ubm:scheduled-1:1500', maintenanceMode: 'ubm',
    });
  });

  it('fails closed when persisted UBM or CBM numeric thresholds are missing', async () => {
    const ubm = await evaluate(baseInput({
      task: task({
        maintenanceMode: 'ubm', meterName: 'Operating Hours', frequencyUnit: 'hours',
        nextDueReading: null, nextDueDate: null,
      }),
    }));
    expect(ubm).toMatchObject({ due: false, reason: 'ubm_plan_invalid', dueCycleKey: null });
    expect(client.meterReading.findFirst).not.toHaveBeenCalled();

    const cbm = await evaluate(baseInput({
      componentId: 'component-1',
      task: task({
        maintenanceMode: 'cbm', nextDueDate: null, frequencyInterval: null, frequencyUnit: null,
        conditionSourceType: 'component_condition', conditionSourceId: 'component-1',
        conditionMetric: 'vibration', conditionOperator: '>=', conditionThreshold: null, conditionUnit: 'mm/s',
      }),
    }));
    expect(cbm).toMatchObject({ due: false, reason: 'cbm_plan_invalid' });
    expect(client.componentConditionReading.findFirst).not.toHaveBeenCalled();
  });

  it('fails closed when the persisted UBM meter is unavailable', async () => {
    client.meterReading.findFirst.mockResolvedValue(null);
    const result = await evaluate(baseInput({
      task: task({
        maintenanceMode: 'ubm', meterName: 'Operating Hours', frequencyUnit: 'hours',
        nextDueReading: 1500, nextDueDate: null,
      }),
    }));
    expect(result).toMatchObject({ due: false, reason: 'ubm_source_unavailable', currentValue: null });
  });

  it('respects CBM evaluation cadence without touching the source before the cadence elapses', async () => {
    const result = await evaluate(baseInput({
      now: new Date('2026-10-26T10:30:00Z'),
      componentId: 'component-1',
      task: task({
        maintenanceMode: 'cbm', nextDueDate: null, frequencyInterval: null, frequencyUnit: null,
        conditionSourceType: 'component_condition', conditionSourceId: 'component-1',
        conditionMetric: 'vibration', conditionOperator: '>=', conditionThreshold: 5,
        conditionUnit: 'mm/s', evaluationCadenceMinutes: 60,
        lastEvaluatedAt: new Date('2026-10-26T10:00:00Z'),
      }),
    }));
    expect(result).toMatchObject({ due: false, reason: 'cbm_cadence_pending', dueCycleKey: 'cbm:scheduled-1:initial' });
    expect(client.componentConditionReading.findFirst).not.toHaveBeenCalled();
    expect(client.pmScheduleTask.update).not.toHaveBeenCalled();
  });

  it.each([
    ['>', 6, 5, null, true],
    ['>=', 5, 5, null, true],
    ['<', 4, 5, null, true],
    ['<=', 5, 5, null, true],
    ['=', 5, 5, null, true],
    ['!=', 6, 5, null, true],
    ['outside_range', 2, 3, 7, true],
    ['outside_range', 5, 3, 7, false],
    ['outside_range', 8, 3, 7, true],
  ])('evaluates component CBM operator %s', async (operator, value, threshold, thresholdMax, due) => {
    client.componentConditionReading.findFirst.mockResolvedValue({
      id: 'condition-1', value, unit: 'mm/s', recordedAt: new Date('2026-10-26T11:45:00Z'),
    });
    const result = await evaluate(baseInput({
      componentId: 'component-1',
      task: task({
        maintenanceMode: 'cbm', nextDueDate: null, frequencyInterval: null, frequencyUnit: null,
        conditionSourceType: 'component_condition', conditionSourceId: 'component-1',
        conditionMetric: 'vibration', conditionOperator: operator, conditionThreshold: threshold,
        conditionThresholdMax: thresholdMax, conditionUnit: 'mm/s',
      }),
    }));
    expect(client.componentConditionReading.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { componentId: 'component-1', parameterKey: 'vibration' },
    }));
    expect(result).toMatchObject({
      due,
      reason: due ? 'cbm_due' : 'cbm_condition_clear',
      currentValue: value,
      dueCycleKey: 'cbm:scheduled-1:initial',
    });
  });

  it('requires a fresh post-completion component observation before CBM can become due again', async () => {
    const lastCompletedAt = new Date('2026-10-26T11:50:00Z');
    client.componentConditionReading.findFirst.mockResolvedValue({
      id: 'condition-stale', value: 8, unit: 'mm/s', recordedAt: new Date('2026-10-26T11:45:00Z'),
    });
    const planned = task({
      maintenanceMode: 'cbm', nextDueDate: null, frequencyInterval: null, frequencyUnit: null,
      conditionSourceType: 'component_condition', conditionSourceId: 'component-1',
      conditionMetric: 'vibration', conditionOperator: '>=', conditionThreshold: 5, conditionUnit: 'mm/s',
      lastCompletedAt,
    });

    const stale = await evaluate(baseInput({ componentId: 'component-1', task: planned }));
    expect(stale).toMatchObject({
      due: false, reason: 'cbm_source_stale_since_completion',
      dueCycleKey: 'cbm:scheduled-1:2026-10-26T11:50:00.000Z', currentValue: 8,
    });

    client.componentConditionReading.findFirst.mockResolvedValue({
      id: 'condition-fresh', value: 8, unit: 'mm/s', recordedAt: new Date('2026-10-26T11:55:00Z'),
    });
    const fresh = await evaluate(baseInput({ componentId: 'component-1', task: planned }));
    expect(fresh).toMatchObject({ due: true, reason: 'cbm_due' });
  });

  it('treats missing or non-newer IoT observation timestamps as stale after CBM completion', async () => {
    const lastCompletedAt = new Date('2026-10-26T11:50:00Z');
    const planned = task({
      maintenanceMode: 'cbm', nextDueDate: null, frequencyInterval: null, frequencyUnit: null,
      conditionSourceType: 'iot_device', conditionSourceId: 'iot-1', conditionMetric: 'Temperature',
      conditionOperator: '>', conditionThreshold: 80, conditionUnit: '°C', lastCompletedAt,
    });
    for (const lastSeen of [null, lastCompletedAt]) {
      client.iotDevice.findUnique.mockResolvedValue({
        id: 'iot-1', assetId: 'asset-1', plantId: 'plant-1', parameter: 'Temperature', unit: '°C',
        lastReading: 85, lastSeen, isActive: true,
      });
      const result = await evaluate(baseInput({ task: planned }));
      expect(result).toMatchObject({ due: false, reason: 'cbm_source_stale_since_completion', currentValue: 85 });
    }
  });

  it('fails closed when a component CBM source no longer matches the selected target', async () => {
    const result = await evaluate(baseInput({
      componentId: 'component-1',
      task: task({
        maintenanceMode: 'cbm', nextDueDate: null, frequencyInterval: null, frequencyUnit: null,
        conditionSourceType: 'component_condition', conditionSourceId: 'component-2',
        conditionMetric: 'vibration', conditionOperator: '>=', conditionThreshold: 5, conditionUnit: 'mm/s',
      }),
    }));
    expect(result).toMatchObject({ due: false, reason: 'cbm_source_invalid' });
    expect(client.componentConditionReading.findFirst).not.toHaveBeenCalled();
  });

  it('fails closed when a CBM reading unit no longer matches the saved planning unit', async () => {
    client.componentConditionReading.findFirst.mockResolvedValue({
      id: 'condition-1', value: 6, unit: 'in/s', recordedAt: new Date('2026-10-26T11:45:00Z'),
    });
    const result = await evaluate(baseInput({
      componentId: 'component-1',
      task: task({
        maintenanceMode: 'cbm', nextDueDate: null, frequencyInterval: null, frequencyUnit: null,
        conditionSourceType: 'component_condition', conditionSourceId: 'component-1',
        conditionMetric: 'vibration', conditionOperator: '>=', conditionThreshold: 5, conditionUnit: 'mm/s',
      }),
    }));
    expect(result).toMatchObject({ due: false, reason: 'cbm_unit_mismatch', currentValue: 6 });
  });

  it('validates IoT CBM source identity, scope, metric, unit and reading before evaluating', async () => {
    client.iotDevice.findUnique.mockResolvedValue({
      id: 'iot-1', assetId: 'asset-1', plantId: 'plant-1', parameter: 'Temperature', unit: '°C',
      lastReading: 85, lastSeen: new Date('2026-10-26T11:58:00Z'), isActive: true,
    });
    const result = await evaluate(baseInput({
      task: task({
        maintenanceMode: 'cbm', nextDueDate: null, frequencyInterval: null, frequencyUnit: null,
        conditionSourceType: 'iot_device', conditionSourceId: 'iot-1', conditionMetric: 'Temperature',
        conditionOperator: '>', conditionThreshold: 80, conditionUnit: '°C',
      }),
    }));
    expect(result).toMatchObject({ due: true, reason: 'cbm_due', currentValue: 85 });

    client.iotDevice.findUnique.mockResolvedValue({
      id: 'iot-1', assetId: 'asset-2', plantId: 'plant-1', parameter: 'Temperature', unit: '°C',
      lastReading: 85, lastSeen: NOW, isActive: true,
    });
    const invalid = await evaluate(baseInput({
      task: task({
        maintenanceMode: 'cbm', nextDueDate: null, frequencyInterval: null, frequencyUnit: null,
        conditionSourceType: 'iot_device', conditionSourceId: 'iot-1', conditionMetric: 'Temperature',
        conditionOperator: '>', conditionThreshold: 80, conditionUnit: '°C',
      }),
    }));
    expect(invalid).toMatchObject({ due: false, reason: 'cbm_source_invalid' });
  });

  it('records CBM evaluation time only when a configured cadence actually evaluates a valid source', async () => {
    client.componentConditionReading.findFirst.mockResolvedValue({
      id: 'condition-1', value: 4, unit: 'mm/s', recordedAt: new Date('2026-10-26T11:45:00Z'),
    });
    await evaluate(baseInput({
      componentId: 'component-1',
      task: task({
        maintenanceMode: 'cbm', nextDueDate: null, frequencyInterval: null, frequencyUnit: null,
        conditionSourceType: 'component_condition', conditionSourceId: 'component-1',
        conditionMetric: 'vibration', conditionOperator: '>=', conditionThreshold: 5,
        conditionUnit: 'mm/s', evaluationCadenceMinutes: 60,
      }),
    }));
    expect(client.pmScheduleTask.update).toHaveBeenCalledWith({
      where: { id: 'scheduled-1' },
      data: { lastEvaluatedAt: NOW },
    });
  });

  it('keeps the CBM cycle key latched until a verified closeout changes lastCompletedAt', async () => {
    client.componentConditionReading.findFirst.mockResolvedValue({
      id: 'condition-1', value: 8, unit: 'mm/s', recordedAt: NOW,
    });
    const common = {
      maintenanceMode: 'cbm', nextDueDate: null, frequencyInterval: null, frequencyUnit: null,
      conditionSourceType: 'component_condition', conditionSourceId: 'component-1',
      conditionMetric: 'vibration', conditionOperator: '>=', conditionThreshold: 5, conditionUnit: 'mm/s',
    };
    const first = await evaluate(baseInput({ componentId: 'component-1', task: task(common) }));
    const repeated = await evaluate(baseInput({ componentId: 'component-1', task: task(common) }));
    const rearmed = await evaluate(baseInput({
      componentId: 'component-1',
      task: task({ ...common, lastCompletedAt: new Date('2026-10-26T11:30:00Z') }),
    }));

    expect(first.dueCycleKey).toBe('cbm:scheduled-1:initial');
    expect(repeated.dueCycleKey).toBe(first.dueCycleKey);
    expect(rearmed.dueCycleKey).toBe('cbm:scheduled-1:2026-10-26T11:30:00.000Z');
  });
});
