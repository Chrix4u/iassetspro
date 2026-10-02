import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) {
  throw new Error('DATABASE_URL must point to PostgreSQL');
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const TARGET_ASSET_TAG = 'UAT-GTP-350-3-013';

async function main() {
  const asset = await db.asset.findUnique({
    where: { assetTag: TARGET_ASSET_TAG },
    select: { id: true, assetTag: true, name: true, plantId: true },
  });
  if (!asset) throw new Error(`${TARGET_ASSET_TAG} is missing`);

  const components = await db.componentRegistry.findMany({
    where: { assetId: asset.id },
    select: {
      id: true,
      parentId: true,
      componentCode: true,
      componentType: true,
      notes: true,
    },
  });

  const ids = new Set(components.map((item) => item.id));
  const roots = components.filter((item) => !item.parentId);
  const orphans = components.filter(
    (item) => item.parentId && !ids.has(item.parentId),
  );
  const templateMarked = components.filter((item) =>
    item.notes?.includes('Generic rotary-printing-machine structure only'),
  );

  const byType = components.reduce<Record<string, number>>((acc, item) => {
    acc[item.componentType] = (acc[item.componentType] || 0) + 1;
    return acc;
  }, {});

  const checks = {
    nodeCount: components.length === 77,
    rootCount: roots.length === 8,
    noOrphans: orphans.length === 0,
    templateDisclosure: templateMarked.length === 77,
    assemblies: byType.assembly === 8,
    subassemblies: byType.subassembly === 20,
    components: byType.component === 25,
    parts: byType.part === 18,
    instruments: byType.instrument === 6,
  };

  const failed = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);

  console.log(
    JSON.stringify(
      {
        asset,
        nodeCount: components.length,
        rootCount: roots.length,
        orphanCount: orphans.length,
        byType,
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
