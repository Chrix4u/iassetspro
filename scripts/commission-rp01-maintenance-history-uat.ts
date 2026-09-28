import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) {
  throw new Error('DATABASE_URL must point to PostgreSQL');
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const WO_NUMBER = 'WO-202609-UAT-RP01-01';

async function main() {
  const asset = await db.asset.findUnique({ where: { assetTag: 'UAT-RP-001' } });
  if (!asset) throw new Error('UAT-RP-001 is missing');

  const component = await db.componentRegistry.findUnique({ where: { componentCode: 'RP01-PRT-BRG-DS' } });
  if (!component || component.assetId !== asset.id) throw new Error('RP01-PRT-BRG-DS is missing or belongs to another asset');

  const technician = await db.user.findFirst({
    where: { username: { in: ['uat_tech_single', 'uat_tech_leader', 'admin'] } },
    orderBy: { username: 'asc' },
  });
  if (!technician) throw new Error('No UAT technician/admin found');

  const completedAt = new Date('2026-09-26T14:45:00.000Z');
  const startedAt = new Date('2026-09-26T13:15:00.000Z');

  const existingWo = await db.workOrder.findUnique({ where: { woNumber: WO_NUMBER } });
  const woData = {
    title: 'UAT RP-01 drive-side bearing inspection and lubrication',
    description: 'Completed preventive maintenance on the RP-01 drive-side spherical roller bearing. UAT history record for component drill-down validation.',
    type: 'preventive',
    priority: 'high',
    status: 'closed',
    assetId: asset.id,
    assetName: asset.name,
    plantId: asset.plantId,
    departmentId: asset.departmentId,
    assignedTo: technician.id,
    teamLeaderId: technician.id,
    estimatedHours: 1.5,
    actualHours: 1.5,
    plannedStart: startedAt,
    plannedEnd: completedAt,
    actualStart: startedAt,
    actualEnd: completedAt,
    laborCost: 75,
    partsCost: 35,
    totalCost: 110,
    actionDescription: 'Inspected bearing housing, checked radial play, cleaned and re-lubricated bearing, verified smooth rotation.',
    notes: 'UAT historical maintenance record. No defect requiring replacement was found.',
  };

  const wo = existingWo
    ? await db.workOrder.update({ where: { id: existingWo.id }, data: woData })
    : await db.workOrder.create({ data: { woNumber: WO_NUMBER, ...woData } });

  await db.workOrderComponent.upsert({
    where: {
      workOrderId_componentRegistryId: {
        workOrderId: wo.id,
        componentRegistryId: component.id,
      },
    },
    update: { notes: 'Drive-side bearing maintained during completed preventive UAT work' },
    create: {
      workOrderId: wo.id,
      componentRegistryId: component.id,
      notes: 'Drive-side bearing maintained during completed preventive UAT work',
    },
  });

  const existingHistory = await db.componentMaintenanceHistory.findFirst({
    where: { componentId: component.id, workOrderId: wo.id },
  });

  const historyData = {
    maintenanceType: 'preventive',
    description: 'Drive-side spherical roller bearing inspection, cleaning and EP2 re-lubrication.',
    performedById: technician.id,
    startedAt,
    completedAt,
    durationMinutes: 90,
    findings: JSON.stringify({
      radialPlay: 'within tolerance',
      housingCondition: 'good',
      abnormalNoise: false,
      replacementRequired: false,
    }),
    actionsTaken: JSON.stringify([
      'Cleaned bearing housing exterior',
      'Checked bearing radial play',
      'Applied specified EP2 grease quantity',
      'Verified free rotation after service',
    ]),
    partsUsed: JSON.stringify([
      { partName: 'EP2 bearing grease', partCode: 'LUB-EP2', quantity: 0.25, unit: 'kg' },
    ]),
    cost: 110,
    notes: 'Historical UAT record used to validate component maintenance history drill-down.',
  };

  const history = existingHistory
    ? await db.componentMaintenanceHistory.update({ where: { id: existingHistory.id }, data: historyData })
    : await db.componentMaintenanceHistory.create({
        data: {
          componentId: component.id,
          workOrderId: wo.id,
          ...historyData,
        },
      });

  console.log(JSON.stringify({
    assetTag: asset.assetTag,
    componentCode: component.componentCode,
    workOrder: { id: wo.id, woNumber: wo.woNumber, status: wo.status },
    maintenanceHistoryId: history.id,
  }, null, 2));
}

main().finally(() => db.$disconnect());