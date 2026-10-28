import type { Prisma } from '@prisma/client';
import { normalizePmInspectionType } from '@/lib/pm-assignment';

type MigrationClient = Pick<
  Prisma.TransactionClient,
  'meterReading' | 'assetMeter' | 'pmScheduleTask'
>;

type MigrationResult = {
  metersBackfilled: number;
  readingsLinked: number;
  assignmentsCanonicalized: number;
  assignmentsMeterLinked: number;
};

function meterKey(assetId: string, name: string, unit: string): string {
  return `${assetId}\u001f${name}\u001f${unit}`;
}

function canonicalPmType(mode: string): string {
  const normalized = mode.trim().toLowerCase();
  return ['tbm', 'ubm', 'cbm', 'fbm'].includes(normalized) ? normalized : 'tbm';
}

function canonicalBasis(mode: string): 'calendar' | 'meter' | null {
  if (mode === 'tbm') return 'calendar';
  if (mode === 'ubm') return 'meter';
  return null;
}

export async function backfillPmMeetingMigration(client: MigrationClient): Promise<MigrationResult> {
  const readings = await client.meterReading.findMany({
    where: { assetId: { not: null } },
    select: {
      id: true,
      assetId: true,
      meterName: true,
      unit: true,
      value: true,
      readingDate: true,
      createdAt: true,
      readById: true,
    },
    orderBy: [
      { assetId: 'asc' },
      { meterName: 'asc' },
      { unit: 'asc' },
      { readingDate: 'desc' },
      { createdAt: 'desc' },
    ],
  });

  const latestByMeter = new Map<string, (typeof readings)[number]>();
  for (const reading of readings) {
    if (!reading.assetId) continue;
    const key = meterKey(reading.assetId, reading.meterName, reading.unit);
    if (!latestByMeter.has(key)) latestByMeter.set(key, reading);
  }

  const meterIds = new Map<string, string>();
  let readingsLinked = 0;
  for (const latest of latestByMeter.values()) {
    if (!latest.assetId) continue;
    const meter = await client.assetMeter.upsert({
      where: {
        assetId_name_unit: {
          assetId: latest.assetId,
          name: latest.meterName,
          unit: latest.unit,
        },
      },
      create: {
        assetId: latest.assetId,
        name: latest.meterName,
        unit: latest.unit,
        meterType: 'general',
        currentValue: Number(latest.value),
        lastReadingAt: latest.readingDate,
        createdById: latest.readById,
      },
      update: {
        currentValue: Number(latest.value),
        lastReadingAt: latest.readingDate,
      },
    });
    const key = meterKey(latest.assetId, latest.meterName, latest.unit);
    meterIds.set(key, meter.id);
    const linked = await client.meterReading.updateMany({
      where: {
        assetId: latest.assetId,
        meterName: latest.meterName,
        unit: latest.unit,
        assetMeterId: null,
      },
      data: { assetMeterId: meter.id },
    });
    readingsLinked += linked.count;
  }

  const tasks = await client.pmScheduleTask.findMany({
    select: {
      id: true,
      assetId: true,
      maintenanceMode: true,
      equipmentState: true,
      meterName: true,
      frequencyUnit: true,
      assetMeterId: true,
      pmType: true,
      basis: true,
      activityMode: true,
    },
  });

  let assignmentsCanonicalized = 0;
  let assignmentsMeterLinked = 0;
  for (const task of tasks) {
    const pmType = canonicalPmType(task.maintenanceMode || task.pmType);
    const inspectionType = normalizePmInspectionType(task.equipmentState) || 'standstill';
    let assetMeterId = task.assetMeterId;

    if (!assetMeterId && pmType === 'ubm' && task.meterName && task.frequencyUnit) {
      const key = meterKey(task.assetId, task.meterName, task.frequencyUnit);
      assetMeterId = meterIds.get(key) || null;
      if (!assetMeterId) {
        const meter = await client.assetMeter.findFirst({
          where: {
            assetId: task.assetId,
            name: task.meterName,
            unit: task.frequencyUnit,
            isActive: true,
          },
          select: { id: true },
        });
        assetMeterId = meter?.id || null;
      }
    }

    const data = {
      pmType,
      basis: canonicalBasis(pmType),
      equipmentState: inspectionType,
      activityMode: task.activityMode || 'inspection',
      ...(assetMeterId ? { assetMeterId } : {}),
    };
    await client.pmScheduleTask.update({ where: { id: task.id }, data });
    assignmentsCanonicalized += 1;
    if (!task.assetMeterId && assetMeterId) assignmentsMeterLinked += 1;
  }

  return {
    metersBackfilled: latestByMeter.size,
    readingsLinked,
    assignmentsCanonicalized,
    assignmentsMeterLinked,
  };
}
