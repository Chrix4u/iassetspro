import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) {
  throw new Error('DATABASE_URL must point to PostgreSQL');
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const TARGET_ASSET_TAG = 'UAT-GTP-350-3-013';
const PROVENANCE_MARKER = 'Auto-mapped from GTP historical work-order title by conservative UAT commissioning rule';

async function main() {
  const asset = await db.asset.findUnique({
    where: { assetTag: TARGET_ASSET_TAG },
    select: { id: true, assetTag: true, name: true },
  });
  if (!asset) throw new Error(`${TARGET_ASSET_TAG} is missing`);

  const links = await db.workOrderComponent.findMany({
    where: {
      workOrder: { assetId: asset.id },
      notes: { contains: PROVENANCE_MARKER },
    },
    select: {
      workOrderId: true,
      componentRegistryId: true,
      componentRegistry: { select: { componentCode: true, name: true } },
    },
  });

  const workOrders = new Set(links.map((link) => link.workOrderId));
  const counts = links.reduce<Record<string, number>>((acc, link) => {
    const key = link.componentRegistry.componentCode;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const checks = {
    distinctMappedWorkOrders: workOrders.size === 78,
    totalLinks: links.length === 86,
    printing: counts['GTP-RSP3-ASM-PRINT'] === 18,
    inkPump: counts['GTP-RSP3-CMP-INKPUMP'] === 10,
    dryer: counts['GTP-RSP3-ASM-DRYER'] === 20,
    webHandling: counts['GTP-RSP3-ASM-WEB'] === 19,
    drive: counts['GTP-RSP3-ASM-DRIVE'] === 7,
    controls: counts['GTP-RSP3-ASM-CTRL'] === 4,
    exhaustFan: counts['GTP-RSP3-CMP-EXFAN'] === 4,
    pneumatics: counts['GTP-RSP3-ASM-PNEU'] === 4,
  };

  const failed = Object.entries(checks)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  console.log(
    JSON.stringify(
      {
        asset,
        distinctMappedWorkOrders: workOrders.size,
        totalLinks: links.length,
        linksByComponent: counts,
        checks,
        status: failed.length === 0 ? 'PASS' : 'FAIL',
        failed,
      },
      null,
      2,
    ),
  );

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
