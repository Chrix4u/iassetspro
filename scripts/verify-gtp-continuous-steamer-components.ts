import { PrismaClient } from '@prisma/client';
if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) throw new Error('DATABASE_URL must point to PostgreSQL');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const TAG = 'UAT-GTP-333-1-005';
const PREFIX = 'GTP-CST';

async function main() {
  const asset = await db.asset.findUnique({
    where: { assetTag: TAG },
    select: { id: true, assetTag: true, name: true },
  });
  if (!asset) throw new Error('Continuous Steamer asset missing');

  const rows = await db.componentRegistry.findMany({
    where: { assetId: asset.id, componentCode: { startsWith: PREFIX } },
    select: { id: true, parentId: true, componentType: true, notes: true },
  });

  const idSet = new Set(rows.map((row) => row.id));
  const roots = rows.filter((row) => !row.parentId);
  const orphans = rows.filter((row) => row.parentId && !idSet.has(row.parentId));
  const byType = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.componentType] = (acc[row.componentType] || 0) + 1;
    return acc;
  }, {});
  const disclosed = rows.filter((row) =>
    row.notes?.includes('historical maintenance titles') &&
    row.notes?.includes('OEM/nameplate/master-data verification')
  );

  const checks = {
    nodeCount: rows.length === 53,
    rootCount: roots.length === 9,
    noOrphans: orphans.length === 0,
    assemblies: byType.assembly === 9,
    subassemblies: byType.subassembly === 3,
    components: byType.component === 17,
    parts: byType.part === 22,
    instruments: byType.instrument === 2,
    provenanceDisclosure: disclosed.length === rows.length,
  };

  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => key);
  console.log(JSON.stringify({
    asset,
    nodeCount: rows.length,
    rootCount: roots.length,
    orphanCount: orphans.length,
    byType,
    checks,
    status: failed.length ? 'FAIL' : 'PASS',
    failed,
  }, null, 2));

  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => db.$disconnect());
