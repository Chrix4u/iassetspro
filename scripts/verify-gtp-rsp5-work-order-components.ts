import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) {
  throw new Error('DATABASE_URL must point to PostgreSQL');
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const TARGET_ASSET_TAG = 'UAT-GTP-350-5-015';
const PROVENANCE_MARKER = 'Auto-mapped from GTP historical RSP5 work-order title by conservative UAT commissioning rule';

async function main() {
  const asset = await db.asset.findUnique({
    where: { assetTag: TARGET_ASSET_TAG },
    select: { id: true, assetTag: true, name: true },
  });
  if (!asset) throw new Error(`${TARGET_ASSET_TAG} is missing`);

  const totalWorkOrders = await db.workOrder.count({ where: { assetId: asset.id } });
  const links = await db.workOrderComponent.findMany({
    where: {
      workOrder: { assetId: asset.id },
      notes: { contains: PROVENANCE_MARKER },
    },
    select: {
      workOrderId: true,
      componentRegistry: { select: { componentCode: true } },
    },
  });

  const workOrders = new Set(links.map((link) => link.workOrderId));
  const counts = links.reduce<Record<string, number>>((acc, link) => {
    const key = link.componentRegistry.componentCode;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const checks = {
    workOrderCount: totalWorkOrders === 119,
    mappedWorkOrders: workOrders.size === 90,
    totalLinks: links.length === 99,
    meaningfulCoverage: workOrders.size / totalWorkOrders >= 0.75,
    printing: counts['GTP-RSP5-ASM-PRINT'] === 26,
    inkPump: counts['GTP-RSP5-CMP-INKPUMP'] === 3,
    dryer: counts['GTP-RSP5-ASM-DRYER'] === 1,
    webHandling: counts['GTP-RSP5-ASM-WEB'] === 38,
    drive: counts['GTP-RSP5-ASM-DRIVE'] === 6,
    controls: counts['GTP-RSP5-ASM-CTRL'] === 13,
    exhaustFan: counts['GTP-RSP5-CMP-EXFAN'] === 5,
    pneumatics: counts['GTP-RSP5-ASM-PNEU'] === 7,
  };

  const failed = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);

  console.log(JSON.stringify({
    asset,
    totalWorkOrders,
    distinctMappedWorkOrders: workOrders.size,
    totalLinks: links.length,
    coveragePct: totalWorkOrders ? Number(((workOrders.size / totalWorkOrders) * 100).toFixed(1)) : 0,
    linksByComponent: counts,
    checks,
    status: failed.length === 0 ? 'PASS' : 'FAIL',
    failed,
  }, null, 2));

  if (failed.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
