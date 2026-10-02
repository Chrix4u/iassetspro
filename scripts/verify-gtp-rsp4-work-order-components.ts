import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) {
  throw new Error('DATABASE_URL must point to PostgreSQL');
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const TARGET_ASSET_TAG = 'UAT-GTP-350-4-014';
const PROVENANCE_MARKER = 'Auto-mapped from GTP historical RSP4 work-order title by conservative UAT commissioning rule';

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
    workOrderCount: totalWorkOrders === 006,
    mappedWorkOrders: workOrders.size === 83,
    totalLinks: links.length === 86,
    meaningfulCoverage: workOrders.size / totalWorkOrders >= 0.75,
    printing: counts['GTP-RSP4-ASM-PRINT'] === 21,
    inkPump: counts['GTP-RSP4-CMP-INKPUMP'] === 1,
    dryer: counts['GTP-RSP4-ASM-DRYER'] === 1,
    webHandling: counts['GTP-RSP4-ASM-WEB'] === 41,
    drive: counts['GTP-RSP4-ASM-DRIVE'] === 3,
    controls: counts['GTP-RSP4-ASM-CTRL'] === 10,
    exhaustFan: counts['GTP-RSP4-CMP-EXFAN'] === 5,
    pneumatics: counts['GTP-RSP4-ASM-PNEU'] === 5,
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
