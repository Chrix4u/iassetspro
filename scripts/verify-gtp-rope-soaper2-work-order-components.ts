import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) {
  throw new Error('DATABASE_URL must point to PostgreSQL');
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const TAG = 'UAT-GTP-309-2-002';
const MARKER = 'Auto-mapped from GTP Rope Soaper Machine 2 historical work-order title by conservative UAT commissioning rule';

(async () => {
  const asset = await db.asset.findUnique({
    where: { assetTag: TAG },
    select: { id: true, assetTag: true, name: true },
  });
  if (!asset) throw new Error('Rope Soaper Machine 2 missing');

  const links = await db.workOrderComponent.findMany({
    where: {
      workOrder: { assetId: asset.id },
      notes: { contains: MARKER },
    },
    select: {
      workOrderId: true,
      componentRegistry: { select: { componentCode: true } },
    },
  });

  const workOrderCount = await db.workOrder.count({ where: { assetId: asset.id } });
  const mapped = new Set(links.map((link) => link.workOrderId));
  const counts = links.reduce<Record<string, number>>((acc, link) => {
    const key = link.componentRegistry.componentCode;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const checks = {
    workOrderCount: workOrderCount === 158,
    mappedWorkOrders: mapped.size === 146,
    totalLinks: links.length === 197,
    meaningfulCoverage: mapped.size / workOrderCount >= 0.9,
    sewing: counts['GTP-RS2-CMP-SEWING-MACHINE'] === 39,
    chain: counts['GTP-RS2-PRT-CHAIN'] === 24,
    controls: counts['GTP-RS2-CMP-CONTROL-PANEL'] === 16,
    scutcher: counts['GTP-RS2-CMP-SCUTCHER'] === 10,
  };

  const failed = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);

  console.log(JSON.stringify({
    asset,
    totalWorkOrders: workOrderCount,
    mappedWorkOrders: mapped.size,
    totalLinks: links.length,
    coveragePct: Number((mapped.size / workOrderCount * 100).toFixed(1)),
    linksByComponent: counts,
    checks,
    status: failed.length ? 'FAIL' : 'PASS',
    failed,
  }, null, 2));

  if (failed.length) process.exitCode = 1;
  await db.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
