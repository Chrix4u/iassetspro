import { db } from '@/lib/db';

export interface MeterThresholdResult {
  due: boolean;
  current: number;
  baseline: number;
  interval: number;
  crossedThreshold: number | null;
}

export function evaluateMeterThreshold(current: number, baseline: number, interval: number): MeterThresholdResult {
  const safeCurrent = Number.isFinite(current) ? current : 0;
  const safeBaseline = Number.isFinite(baseline) ? baseline : 0;
  const safeInterval = Number.isFinite(interval) && interval > 0 ? interval : 0;
  if (!safeInterval || safeCurrent < safeBaseline + safeInterval) {
    return { due: false, current: safeCurrent, baseline: safeBaseline, interval: safeInterval, crossedThreshold: null };
  }
  const cycles = Math.floor((safeCurrent - safeBaseline) / safeInterval);
  return {
    due: cycles >= 1,
    current: safeCurrent,
    baseline: safeBaseline,
    interval: safeInterval,
    crossedThreshold: safeBaseline + cycles * safeInterval,
  };
}

function parseConfig(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

async function generateWoNumber(): Promise<string> {
  const now = new Date();
  const prefix = `WO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const latest = await db.workOrder.findFirst({
    where: { woNumber: { startsWith: prefix } },
    orderBy: { woNumber: 'desc' },
    select: { woNumber: true },
  });
  const n = latest ? Number.parseInt(latest.woNumber.split('-').pop() || '0', 10) + 1 : 1;
  return `${prefix}-${String(Number.isFinite(n) ? n : 1).padStart(4, '0')}`;
}

export async function evaluateMeterPmTriggers() {
  const triggers = await db.pmTrigger.findMany({
    where: {
      isActive: true,
      triggerType: 'meter',
      schedule: { isActive: true, autoGenerateWO: true },
    },
    include: {
      schedule: {
        include: {
          asset: { select: { id: true, name: true, assetTag: true, plantId: true, departmentId: true } },
          component: {
            include: {
              sparePartLinks: { include: { inventoryItem: true } },
              toolRequirements: { include: { tool: true } },
            },
          },
          template: { include: { tasks: { where: { isActive: true }, orderBy: { taskNumber: 'asc' } } } },
        },
      },
    },
  });

  const results: Array<Record<string, unknown>> = [];

  for (const trigger of triggers) {
    const schedule = trigger.schedule;
    const component = schedule.component;
    if (!component || !['meter_based', 'custom_hours'].includes(schedule.frequencyType)) {
      results.push({ triggerId: trigger.id, scheduleId: schedule.id, skipped: true, reason: 'Schedule is not an active component usage-based PM' });
      continue;
    }

    const config = parseConfig(trigger.triggerConfig);
    const baseline = Number(config.baselineHours ?? 0);
    const current = Number(component.operatingHours ?? 0);
    const interval = Number(trigger.triggerValue || schedule.frequencyValue || 0);
    const threshold = evaluateMeterThreshold(current, baseline, interval);

    if (!threshold.due || threshold.crossedThreshold == null) {
      results.push({ triggerId: trigger.id, scheduleId: schedule.id, skipped: true, reason: 'Meter threshold not reached', current, nextThreshold: baseline + interval });
      continue;
    }

    const existingOpen = await db.workOrder.findFirst({
      where: {
        pmScheduleId: schedule.id,
        status: { notIn: ['closed', 'cancelled'] },
      },
      select: { id: true, woNumber: true, status: true },
      orderBy: { createdAt: 'desc' },
    });
    if (existingOpen) {
      results.push({ triggerId: trigger.id, scheduleId: schedule.id, skipped: true, reason: 'Existing PM work order still open', workOrder: existingOpen });
      continue;
    }

    const tasks = schedule.template?.tasks || [];
    const taskText = tasks.length
      ? '\n\nTask Checklist:\n' + tasks.map((t) => `${t.taskNumber}. [${t.taskType}] ${t.description}`).join('\n')
      : '';

    const suggestedParts = (component.sparePartLinks || []).map((s) => ({
      itemId: s.inventoryItemId,
      itemName: s.inventoryItem?.name || s.sparePartName,
      itemCode: s.inventoryItem?.itemCode || s.sparePartCode,
      quantity: s.quantityRequired,
      unit: s.inventoryItem?.unitOfMeasure || 'each',
      notes: s.notes || '',
      status: 'recommended',
    }));
    const suggestedTools = (component.toolRequirements || []).map((t) => ({
      toolId: t.toolId,
      toolName: t.tool?.name || t.toolName,
      toolCode: t.tool?.toolCode || t.toolCode,
      quantity: t.quantityRequired,
      notes: t.notes || '',
      status: 'recommended',
    }));

    const woNumber = await generateWoNumber();
    const wo = await db.workOrder.create({
      data: {
        woNumber,
        title: `PM: ${schedule.title}`,
        description: `Meter-triggered preventive maintenance for ${component.componentCode} - ${component.name}. Current operating hours: ${current}. Trigger threshold reached: ${threshold.crossedThreshold}.${taskText}`,
        type: 'preventive',
        priority: schedule.priority,
        status: 'draft',
        assetId: schedule.assetId,
        assetName: schedule.asset.name,
        departmentId: schedule.asset.departmentId || schedule.departmentId || null,
        assignedTo: schedule.assignedToId,
        plantId: schedule.asset.plantId,
        estimatedHours: schedule.estimatedDuration,
        pmScheduleId: schedule.id,
        plannedStart: new Date(),
        notes: `Auto-generated by meter trigger ${trigger.id}; baseline ${baseline}, interval ${interval}, current ${current}`,
        suggestedParts: JSON.stringify(suggestedParts),
        suggestedTools: JSON.stringify(suggestedTools),
      },
    });

    await db.workOrderComponent.create({
      data: {
        workOrderId: wo.id,
        componentRegistryId: component.id,
        notes: 'Inherited from meter-triggered component PM schedule',
      },
    });

    const nextConfig = {
      ...config,
      source: config.source || 'component_operating_hours',
      componentId: component.id,
      baselineHours: threshold.crossedThreshold,
      unit: config.unit || 'hours',
    };
    await db.pmTrigger.update({
      where: { id: trigger.id },
      data: { lastTriggeredAt: new Date(), triggerConfig: JSON.stringify(nextConfig) },
    });

    results.push({
      triggerId: trigger.id,
      scheduleId: schedule.id,
      skipped: false,
      workOrderId: wo.id,
      woNumber: wo.woNumber,
      current,
      crossedThreshold: threshold.crossedThreshold,
      nextThreshold: threshold.crossedThreshold + interval,
    });
  }

  return {
    evaluated: triggers.length,
    generated: results.filter((r) => r.skipped === false).length,
    results,
  };
}