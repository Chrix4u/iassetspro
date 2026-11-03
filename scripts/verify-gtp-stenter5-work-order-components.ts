import { PrismaClient } from '@prisma/client';
if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) throw new Error('DATABASE_URL must point to PostgreSQL');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const TAG = 'UAT-GTP-340-5-007';
const MARKER = 'Auto-mapped from GTP Stenter 5 historical work-order title by conservative UAT commissioning rule';
const EXCLUDE = /stenter 6|air condition|wood(?:in|en)? plat(?:foam|form)|wood(?:in|en)? pallets?|chemical trolley/i;

async function main() {
  const asset = await db.asset.findUnique({
    where: { assetTag: TAG },
    select: { id: true, assetTag: true, name: true },
  });
  if (!asset) throw new Error('Stenter 5 asset missing');

  const total = await db.workOrder.count({ where: { assetId: asset.id } });
  const links = await db.workOrderComponent.findMany({
    where: {
      workOrder: { assetId: asset.id },
      notes: { contains: MARKER },
    },
    select: {
      workOrderId: true,
      workOrder: { select: { woNumber: true, title: true } },
      componentRegistry: { select: { componentCode: true } },
    },
  });
  const mapped = new Set(links.map((link) => link.workOrderId));
  const crossMachineLinks = links.filter((link) => EXCLUDE.test(link.workOrder.title || ''));

  const checks = {
    workOrderCount: total === 64,
    conservativeCoverage: mapped.size >= 54,
    conservativeCoveragePct: mapped.size / Math.max(total, 1) >= 0.84,
    meaningfulLinks: links.length >= 74,
    noCrossMachineLinks: crossMachineLinks.length === 0,
  };

  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => key);
  const pass = failed.length === 0 && crossMachineLinks.length === 0;
  console.log(JSON.stringify({
    asset,
    totalWorkOrders: total,
    mappedWorkOrders: mapped.size,
    totalLinks: links.length,
    coveragePct: Number((mapped.size / Math.max(total, 1) * 100).toFixed(1)),
    crossMachineLinks: crossMachineLinks.map((link) => ({
      woNumber: link.workOrder.woNumber,
      title: link.workOrder.title,
      componentCode: link.componentRegistry.componentCode,
    })),
    checks,
    status: pass ? 'PASS' : 'FAIL',
    failed,
  }, null, 2));

  if (!pass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => db.$disconnect());
