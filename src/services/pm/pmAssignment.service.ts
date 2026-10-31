import type { Prisma } from '@prisma/client';
import {
  PM_ACTIVITY_MODES,
  PM_ASSIGNMENT_TYPES,
  normalizePmInspectionType,
  type PmActivityMode,
  type PmAssignmentType,
  type PmInspectionType,
} from '@/lib/pm-assignment';
import { PM_SCHEDULE_TASK_TIME_UNITS } from '@/services/pm/pmScheduleTask.service';

type PmAssignmentClient = Pick<
  Prisma.TransactionClient,
  'asset' | 'componentRegistry' | 'pmTask' | 'assetMeter' | 'pmScheduleTask'
>;

export type NormalizedPmAssignment = {
  assetId: string;
  componentId: string | null;
  pmTaskId: string;
  pmType: PmAssignmentType;
  activityMode: PmActivityMode;
  inspectionType: PmInspectionType;
  basis: 'calendar' | 'meter' | null;
  value: number | null;
  unit: string | null;
  assetMeterId: string | null;
  nextDueDate: Date | null;
  estimatedMinutes: number;
  leadDays: number;
  isActive: boolean;
  conditionSourceType: string | null;
  conditionSourceId: string | null;
  conditionMetric: string | null;
  conditionOperator: string | null;
  conditionThreshold: number | null;
  conditionThresholdMax: number | null;
  conditionUnit: string | null;
  evaluationCadenceMinutes: number | null;
};

export type NormalizePmAssignmentResult =
  | { ok: true; value: NormalizedPmAssignment }
  | { ok: false; error: string };

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function finite(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

function whole(value: unknown, fallback = 0): number | null {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

export function normalizePmAssignmentInput(input: unknown): NormalizePmAssignmentResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'PM assignment is required' };
  const raw = input as Record<string, unknown>;
  const assetId = text(raw.assetId);
  const pmTaskId = text(raw.pmTaskId);
  if (!assetId) return { ok: false, error: 'Asset is required' };
  if (!pmTaskId) return { ok: false, error: 'Task is required' };

  const pmType = text(raw.pmType)?.toLowerCase() as PmAssignmentType | undefined;
  if (!pmType || !(PM_ASSIGNMENT_TYPES as readonly string[]).includes(pmType)) return { ok: false, error: 'PM Type must be TBM, UBM, CBM, or FBM' };
  const activityMode = text(raw.activityMode)?.toLowerCase() as PmActivityMode | undefined;
  if (!activityMode || !(PM_ACTIVITY_MODES as readonly string[]).includes(activityMode)) {
    return { ok: false, error: 'Activity Mode must be Inspection, Lubrication, Servicing, or Replacement' };
  }
  const inspectionType = normalizePmInspectionType(raw.inspectionType ?? raw.equipmentState);
  if (!inspectionType) return { ok: false, error: 'Inspection Type must be Running or Standstill' };

  const estimatedMinutes = whole(raw.estimatedMinutes, 0);
  if (estimatedMinutes === null) return { ok: false, error: 'Est. Minutes must be a non-negative whole number' };
  let leadDays = whole(raw.leadDays, 0);
  if (leadDays === null) return { ok: false, error: 'Lead Days must be a non-negative whole number' };

  const rawValue = finite(raw.value ?? raw.frequencyInterval);
  if (Number.isNaN(rawValue)) return { ok: false, error: 'Value must be numeric' };
  const rawUnit = text(raw.unit ?? raw.frequencyUnit);
  const assetMeterId = text(raw.assetMeterId);
  let basis: 'calendar' | 'meter' | null = null;
  let value: number | null = rawValue;
  let unit: string | null = rawUnit;
  let nextDueDate: Date | null = null;

  if (pmType === 'tbm') {
    basis = 'calendar';
    if (value === null || !Number.isInteger(value) || value <= 0) return { ok: false, error: 'TBM Value must be a positive whole number' };
    if (!unit || !(PM_SCHEDULE_TASK_TIME_UNITS as readonly string[]).includes(unit)) return { ok: false, error: 'TBM unit is invalid' };
    const due = text(raw.nextDueDate);
    if (!due) return { ok: false, error: 'TBM Next Due Date is required' };
    nextDueDate = new Date(due);
    if (Number.isNaN(nextDueDate.getTime())) return { ok: false, error: 'TBM Next Due Date is invalid' };
    if (unit === 'minutes' || unit === 'hours') leadDays = 0;
  } else if (pmType === 'ubm') {
    basis = 'meter';
    if (value === null || value <= 0) return { ok: false, error: 'UBM Value must be greater than zero' };
    if (!assetMeterId) return { ok: false, error: 'UBM requires an assigned asset meter' };
    unit = null; // authoritative unit is inherited from AssetMeter
  } else {
    basis = null;
    value = null;
    unit = null;
  }

  const threshold = finite(raw.conditionThreshold);
  const thresholdMax = finite(raw.conditionThresholdMax);
  const cadence = whole(raw.evaluationCadenceMinutes, 0);
  if (Number.isNaN(threshold) || Number.isNaN(thresholdMax) || cadence === null) return { ok: false, error: 'Condition planning values are invalid' };

  return {
    ok: true,
    value: {
      assetId,
      componentId: text(raw.componentId),
      pmTaskId,
      pmType,
      activityMode,
      inspectionType,
      basis,
      value,
      unit,
      assetMeterId: pmType === 'ubm' ? assetMeterId : null,
      nextDueDate,
      estimatedMinutes,
      leadDays,
      isActive: raw.isActive !== false,
      conditionSourceType: text(raw.conditionSourceType),
      conditionSourceId: text(raw.conditionSourceId),
      conditionMetric: text(raw.conditionMetric),
      conditionOperator: text(raw.conditionOperator),
      conditionThreshold: Number.isNaN(threshold) ? null : threshold,
      conditionThresholdMax: Number.isNaN(thresholdMax) ? null : thresholdMax,
      conditionUnit: text(raw.conditionUnit),
      evaluationCadenceMinutes: cadence && cadence > 0 ? cadence : null,
    },
  };
}

async function buildPersistenceData(client: PmAssignmentClient, plantId: string, input: unknown) {
  const normalized = normalizePmAssignmentInput(input);
  if (!normalized.ok) throw new Error(normalized.error);
  const plan = normalized.value;

  const asset = await client.asset.findUnique({ where: { id: plan.assetId }, select: { id: true, plantId: true } });
  if (!asset || asset.plantId !== plantId) throw new Error('Asset is unavailable in the selected plant');
  const master = await client.pmTask.findUnique({ where: { id: plan.pmTaskId }, select: { id: true, plantId: true, isActive: true } });
  if (!master || !master.isActive || master.plantId !== plantId) throw new Error('Task must be active in the selected plant');
  if (plan.componentId) {
    const component = await client.componentRegistry.findUnique({ where: { id: plan.componentId }, select: { id: true, assetId: true } });
    if (!component || component.assetId !== plan.assetId) throw new Error('Selected component must belong to the selected asset/machine');
  }

  let meterName: string | null = null;
  let frequencyUnit = plan.unit;
  let nextDueReading: number | null = null;
  if (plan.pmType === 'ubm') {
    const meter = await client.assetMeter.findUnique({
      where: { id: plan.assetMeterId! },
      select: { id: true, assetId: true, name: true, unit: true, currentValue: true, isActive: true },
    });
    if (!meter || !meter.isActive || meter.assetId !== plan.assetId) throw new Error('Selected meter must be active and belong to the selected asset/machine');
    meterName = meter.name;
    frequencyUnit = meter.unit;
    nextDueReading = Number(meter.currentValue) + Number(plan.value);
  }

  return {
    scheduleId: null,
    assetId: plan.assetId,
    componentId: plan.componentId,
    assetMeterId: plan.assetMeterId,
    pmTaskId: plan.pmTaskId,
    pmType: plan.pmType,
    activityMode: plan.activityMode,
    basis: plan.basis,
    maintenanceMode: plan.pmType,
    equipmentState: plan.inspectionType,
    estimatedMinutes: plan.estimatedMinutes,
    leadDays: plan.leadDays,
    frequencyInterval: plan.value,
    frequencyUnit,
    meterName,
    nextDueReading,
    nextDueDate: plan.nextDueDate,
    conditionSourceType: plan.pmType === 'cbm' ? plan.conditionSourceType : null,
    conditionSourceId: plan.pmType === 'cbm' ? plan.conditionSourceId : null,
    conditionMetric: plan.pmType === 'cbm' ? plan.conditionMetric : null,
    conditionOperator: plan.pmType === 'cbm' ? plan.conditionOperator : null,
    conditionThreshold: plan.pmType === 'cbm' ? plan.conditionThreshold : null,
    conditionThresholdMax: plan.pmType === 'cbm' ? plan.conditionThresholdMax : null,
    conditionUnit: plan.pmType === 'cbm' ? plan.conditionUnit : null,
    evaluationCadenceMinutes: plan.pmType === 'cbm' ? plan.evaluationCadenceMinutes : null,
    isActive: plan.isActive,
  };
}

export async function createPmAssignment(client: PmAssignmentClient, args: { plantId: string; actorId: string; input: unknown }) {
  const data = await buildPersistenceData(client, args.plantId, args.input);
  return client.pmScheduleTask.create({ data });
}


export async function createPmAssignmentBatch(client: {
  $transaction: <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
}, args: {
  plantId: string;
  actorId: string;
  assetId: string;
  componentId: string | null;
  assignments: unknown[];
}) {
  if (!args.assetId.trim()) throw new Error('Asset is required');
  if (!Array.isArray(args.assignments) || args.assignments.length === 0) throw new Error('At least one PM assignment is required');

  return client.$transaction(async (tx) => {
    const created: Array<Awaited<ReturnType<typeof createPmAssignment>>> = [];
    for (const raw of args.assignments) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('PM assignment row is invalid');
      const input = {
        ...(raw as Record<string, unknown>),
        assetId: args.assetId,
        componentId: args.componentId,
      };
      const assignment = await createPmAssignment(tx as PmAssignmentClient, {
        plantId: args.plantId,
        actorId: args.actorId,
        input,
      });
      await tx.auditLog.create({
        data: {
          userId: args.actorId,
          action: 'create',
          entityType: 'pm_assignment',
          entityId: assignment.id,
          newValues: JSON.stringify({
            assetId: assignment.assetId,
            componentId: assignment.componentId,
            pmTaskId: assignment.pmTaskId,
            pmType: assignment.pmType,
          }),
        },
      });
      created.push(assignment);
    }
    return created;
  });
}

export async function updatePmAssignment(client: PmAssignmentClient, args: { id: string; plantId: string; actorId: string; input: unknown }) {
  const data = await buildPersistenceData(client, args.plantId, args.input);
  return client.pmScheduleTask.update({ where: { id: args.id }, data });
}

type PmAssignmentTargetTransactionHost = {
  $transaction: <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
};

async function validatePmAssignmentTarget(
  tx: Prisma.TransactionClient,
  plantId: string,
  assetId: string,
  componentId: string | null,
) {
  const asset = await tx.asset.findUnique({ where: { id: assetId }, select: { id: true, plantId: true } });
  if (!asset || asset.plantId !== plantId) throw new Error('Asset is unavailable in the selected plant');
  if (componentId) {
    const component = await tx.componentRegistry.findUnique({ where: { id: componentId }, select: { id: true, assetId: true } });
    if (!component || component.assetId !== assetId) throw new Error('Selected component must belong to the selected asset/machine');
  }
}

export async function replacePmAssignmentTarget(
  client: PmAssignmentTargetTransactionHost,
  args: { plantId: string; actorId: string; assetId: string; componentId: string | null; assignments: unknown[] },
) {
  if (!args.assetId.trim()) throw new Error('Asset is required');
  if (!Array.isArray(args.assignments) || args.assignments.length === 0) throw new Error('At least one PM assignment is required');

  return client.$transaction(async (tx) => {
    await validatePmAssignmentTarget(tx, args.plantId, args.assetId, args.componentId);
    const current = await tx.pmScheduleTask.findMany({
      where: { scheduleId: null, assetId: args.assetId, componentId: args.componentId, isActive: true },
    });
    const currentById = new Map(current.map((row) => [row.id, row]));
    const retained = new Set<string>();
    const saved = [];

    for (const raw of args.assignments) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('PM assignment row is invalid');
      const row = raw as Record<string, unknown>;
      const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : null;
      const input = { ...row, assetId: args.assetId, componentId: args.componentId, isActive: true };
      if (id) {
        const existing = currentById.get(id);
        if (!existing) throw new Error(`PM assignment ${id} does not belong to this PM target`);
        const updated = await updatePmAssignment(tx as unknown as PmAssignmentClient, {
          id, plantId: args.plantId, actorId: args.actorId, input,
        });
        await tx.auditLog.create({ data: {
          userId: args.actorId, action: 'update', entityType: 'pm_assignment', entityId: id,
          oldValues: JSON.stringify({ pmTaskId: existing.pmTaskId, pmType: existing.pmType, isActive: existing.isActive }),
          newValues: JSON.stringify({ pmTaskId: updated.pmTaskId, pmType: updated.pmType, isActive: updated.isActive }),
        } });
        retained.add(id);
        saved.push(updated);
      } else {
        const created = await createPmAssignment(tx as unknown as PmAssignmentClient, {
          plantId: args.plantId, actorId: args.actorId, input,
        });
        await tx.auditLog.create({ data: {
          userId: args.actorId, action: 'create', entityType: 'pm_assignment', entityId: created.id,
          newValues: JSON.stringify({ assetId: created.assetId, componentId: created.componentId, pmTaskId: created.pmTaskId, pmType: created.pmType }),
        } });
        saved.push(created);
      }
    }

    for (const existing of current) {
      if (retained.has(existing.id)) continue;
      await tx.pmScheduleTask.update({ where: { id: existing.id }, data: { isActive: false } });
      await tx.auditLog.create({ data: {
        userId: args.actorId, action: 'deactivate', entityType: 'pm_assignment', entityId: existing.id,
        oldValues: JSON.stringify({ isActive: existing.isActive }), newValues: JSON.stringify({ isActive: false }),
      } });
    }
    return saved;
  });
}

export async function deactivatePmAssignmentTarget(
  client: PmAssignmentTargetTransactionHost,
  args: { plantId: string; actorId: string; assetId: string; componentId: string | null },
) {
  if (!args.assetId.trim()) throw new Error('Asset is required');
  return client.$transaction(async (tx) => {
    await validatePmAssignmentTarget(tx, args.plantId, args.assetId, args.componentId);
    const current = await tx.pmScheduleTask.findMany({
      where: { scheduleId: null, assetId: args.assetId, componentId: args.componentId, isActive: true },
    });
    for (const existing of current) {
      await tx.pmScheduleTask.update({ where: { id: existing.id }, data: { isActive: false } });
      await tx.auditLog.create({ data: {
        userId: args.actorId, action: 'deactivate', entityType: 'pm_assignment', entityId: existing.id,
        oldValues: JSON.stringify({ isActive: existing.isActive }), newValues: JSON.stringify({ isActive: false }),
      } });
    }
    return { count: current.length };
  });
}

