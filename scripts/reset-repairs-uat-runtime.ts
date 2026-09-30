import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) {
  throw new Error('DATABASE_URL must point to PostgreSQL');
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

async function ensureLaborRate(
  username: string,
  plantId: string,
  tradeId: string | null,
) {
  const user = await db.user.findUnique({ where: { username }, select: { id: true } });
  if (!user) throw new Error(`UAT user ${username} is missing`);

  const effectiveFrom = new Date('2024-01-01T00:00:00.000Z');
  const existing = await db.laborRate.findFirst({
    where: { userId: user.id, plantId, effectiveFrom },
    select: { id: true },
  });
  if (existing) return;

  await db.laborRate.create({
    data: {
      userId: user.id,
      plantId,
      tradeId,
      normalHourlyRate: 50,
      overtimeHourlyRate: 75,
      effectiveFrom,
      currency: 'GHS',
    },
  });
}

async function main() {
  const uatUsers = await db.user.findMany({
    where: { username: { startsWith: 'uat_' } },
    select: { id: true, username: true },
  });
  const userIds = uatUsers.map((user) => user.id);
  if (userIds.length === 0) {
    console.log('🧹 Repairs UAT runtime reset: no UAT users found');
    return;
  }

  const plantA = await db.plant.findUnique({ where: { code: 'PLANT-A' }, select: { id: true } });
  if (!plantA) throw new Error('PLANT-A is missing; run scripts/seed-repairs-uat.ts first');
  const mechanicalTrade = await db.trade.findUnique({ where: { name: 'Mechanical' }, select: { id: true } });
  const electricalTrade = await db.trade.findUnique({ where: { name: 'Electrical' }, select: { id: true } });

  // Every execution actor used for deterministic cost-bearing UAT work gets a
  // real configured rate. Production costing still reads the normal LaborRate
  // table; no test-only costing bypass is introduced.
  await ensureLaborRate('uat_tech_single', plantA.id, mechanicalTrade?.id ?? null);
  await ensureLaborRate('uat_tech_leader', plantA.id, mechanicalTrade?.id ?? null);
  await ensureLaborRate('uat_tech_assistant', plantA.id, electricalTrade?.id ?? null);

  // Restore deterministic calibration fixtures. Successful UAT scenarios use
  // real checkout/return custody, but an interrupted prior run can leave the
  // single valid unit checked out and make the next run fail for stale state
  // rather than product behavior.
  const calibrationFixtures = [
    { toolCode: 'UAT-CAL-VALID', status: 'available', condition: 'good' },
    { toolCode: 'UAT-CAL-EXPIRED', status: 'available', condition: 'good' },
    { toolCode: 'UAT-CAL-FAILED', status: 'in_repair', condition: 'fair' },
  ] as const;
  let resetTools = 0;
  for (const fixture of calibrationFixtures) {
    const updated = await db.tool.updateMany({
      where: { toolCode: fixture.toolCode },
      data: {
        status: fixture.status,
        condition: fixture.condition,
        quantity: 1,
        assignedToId: null,
        checkedOutAt: null,
        expectedReturn: null,
      },
    });
    resetTools += updated.count;
  }

  // Scenario A deliberately consumes one UAT bearing on each successful run.
  // Repeated acceptance runs must therefore restore the seeded test fixture
  // instead of gradually exhausting it and producing a false insufficient-stock
  // failure. This touches only the dedicated UAT item, never production stock.
  const bearingReset = await db.inventoryItem.updateMany({
    where: { itemCode: 'UAT-BRG-6205', plantId: plantA.id },
    data: { currentStock: 10 },
  });

  const activeLogs = await db.workOrderTimeLog.findMany({
    where: {
      userId: { in: userIds },
      action: { in: ['start', 'resume'] },
      endTime: null,
    },
    orderBy: { timestamp: 'asc' },
  });

  const now = new Date();
  const affectedWorkOrders = new Set<string>();

  if (activeLogs.length > 0) {
    await db.$transaction(async (tx) => {
      for (const log of activeLogs) {
        const startedAt = log.startTime || log.timestamp;
        const elapsedHours = Math.max(
          0,
          (now.getTime() - startedAt.getTime()) / 3_600_000 - ((log.breakMinutes || 0) / 60),
        );
        const duration = Math.round(elapsedHours * 100) / 100;
        affectedWorkOrders.add(log.workOrderId);

        await tx.workOrderTimeLog.update({
          where: { id: log.id },
          data: {
            startTime: startedAt,
            endTime: now,
            duration,
            notes: log.notes
              ? `${log.notes} | Closed by deterministic UAT runtime reset`
              : 'Closed by deterministic UAT runtime reset',
          },
        });
      }

      for (const workOrderId of affectedWorkOrders) {
        const logs = await tx.workOrderTimeLog.findMany({
          where: { workOrderId },
          select: { duration: true },
        });
        const actualHours = Math.round(
          logs.reduce((sum, log) => sum + (log.duration || 0), 0) * 100,
        ) / 100;
        await tx.workOrder.updateMany({
          where: { id: workOrderId, isLocked: false },
          data: { actualHours },
        });
      }
    });
  }

  console.log(
    `🧹 Repairs UAT runtime prepared: labor rates ensured; reset ${resetTools} calibration tool fixture(s); reset ${bearingReset.count} bearing stock fixture(s); closed ${activeLogs.length} stale timer(s) across ${affectedWorkOrders.size} WO(s)`,
  );
}

main()
  .catch((error) => {
    console.error('❌ Repairs UAT runtime reset failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
