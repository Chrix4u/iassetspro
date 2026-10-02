import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) {
  throw new Error('DATABASE_URL must point to PostgreSQL');
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const TAG = 'UAT-GTP-309-2-002';
const PREFIX = 'GTP-RS2';

(async () => {
  const asset = await db.asset.findUnique({
    where: { assetTag: TAG },
    select: { id: true, assetTag: true, name: true, plantId: true },
  });
  if (!asset) throw new Error('Rope Soaper Machine 2 missing');

  const rows = await db.componentRegistry.findMany({
    where: { assetId: asset.id, componentCode: { startsWith: PREFIX } },
    select: { id: true, parentId: true, componentCode: true, notes: true },
  });

  const ids = new Set(rows.map((row) => row.id));
  const roots = rows.filter((row) => !row.parentId);
  const orphans = rows.filter((row) => row.parentId && !ids.has(row.parentId));
  const disclosed = rows.filter((row) => row.notes?.includes('historical maintenance titles'));
  const requiredRoots = [
    'GTP-RS2-ASM-INFEED',
    'GTP-RS2-ASM-COMPARTMENTS',
    'GTP-RS2-ASM-MANGLE',
    'GTP-RS2-ASM-DRIVE',
    'GTP-RS2-ASM-DOSING',
    'GTP-RS2-ASM-PNEU',
    'GTP-RS2-ASM-UTIL',
    'GTP-RS2-ASM-CTRL',
  ];
  const codes = new Set(rows.map((row) => row.componentCode));

  const checks = {
    nodeCount: rows.length === 52,
    rootCount: roots.length === 8,
    noOrphans: orphans.length === 0,
    templateDisclosure: disclosed.length === rows.length,
    requiredRoots: requiredRoots.every((code) => codes.has(code)),
  };
  const failed = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);

  console.log(JSON.stringify({
    asset,
    nodeCount: rows.length,
    rootCount: roots.length,
    orphanCount: orphans.length,
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
