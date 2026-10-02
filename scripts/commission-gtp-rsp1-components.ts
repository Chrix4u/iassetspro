import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) {
  throw new Error('DATABASE_URL must point to PostgreSQL');
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const SOURCE_ASSET_TAG = 'UAT-GTP-350-3-013';
const TARGET_ASSET_TAG = 'UAT-GTP-350-1-011';
const CODE_PREFIX = 'GTP-RSP1';

function targetCode(sourceCode: string) {
  const normalized = sourceCode
    .replace(/^GTP[-_]?RSP3[-_]?/i, '')
    .replace(/^UAT[-_]?/i, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${CODE_PREFIX}-${normalized || 'NODE'}`.slice(0, 190);
}

async function main() {
  const [sourceAsset, targetAsset] = await Promise.all([
    db.asset.findUnique({
      where: { assetTag: SOURCE_ASSET_TAG },
      select: { id: true, name: true, plantId: true },
    }),
    db.asset.findUnique({
      where: { assetTag: TARGET_ASSET_TAG },
      select: { id: true, name: true, plantId: true },
    }),
  ]);

  if (!sourceAsset) throw new Error(`${SOURCE_ASSET_TAG} is missing`);
  if (!targetAsset) throw new Error(`${TARGET_ASSET_TAG} is missing`);

  const source = await db.componentRegistry.findMany({
    where: { assetId: sourceAsset.id },
    orderBy: [{ sortOrder: 'asc' }, { componentCode: 'asc' }],
  });

  if (source.length !== 77) {
    throw new Error(`Expected 77 source hierarchy nodes, found ${source.length}`);
  }

  const sourceIds = new Set(source.map((item) => item.id));
  const byId = new Map(source.map((item) => [item.id, item]));
  const depths = new Map<string, number>();

  const depthOf = (id: string): number => {
    const cached = depths.get(id);
    if (cached !== undefined) return cached;
    const node = byId.get(id);
    if (!node) throw new Error(`Source component ${id} is missing`);
    const depth = !node.parentId || !sourceIds.has(node.parentId)
      ? 0
      : depthOf(node.parentId) + 1;
    depths.set(id, depth);
    return depth;
  };

  const ordered = [...source].sort(
    (a, b) => depthOf(a.id) - depthOf(b.id) || a.sortOrder - b.sortOrder,
  );

  const idMap = new Map<string, string>();

  await db.$transaction(async (tx) => {
    for (const node of ordered) {
      const componentCode = targetCode(node.componentCode);
      const parentId = node.parentId ? idMap.get(node.parentId) ?? null : null;
      const sourceSpecificNotes = (node.notes || '')
        .replace(/UAT template commissioned from [^.]+\./gi, '')
        .replace(/Generic rotary-printing-machine structure only; verify OEM names\/specifications before production master-data approval\./gi, '')
        .trim();

      const notes = [
        `UAT template commissioned from ${SOURCE_ASSET_TAG} for ${TARGET_ASSET_TAG}.`,
        'Generic rotary-printing-machine structure only; verify OEM names/specifications before production master-data approval.',
        sourceSpecificNotes || null,
      ]
        .filter(Boolean)
        .join(' ');

      const existing = await tx.componentRegistry.findUnique({
        where: { componentCode },
        select: { id: true },
      });

      const data = {
        parentId,
        assetId: targetAsset.id,
        twinId: null,
        componentCode,
        name: node.name,
        description: node.description,
        componentType: node.componentType,
        manufacturer: null,
        modelNumber: null,
        serialNumber: null,
        specification: node.specification,
        operatingParams: node.operatingParams,
        criticality: node.criticality,
        lifecycleStatus: 'operational',
        installedDate: null,
        expectedLifeHours: node.expectedLifeHours,
        operatingHours: 0,
        lastInspection: null,
        nextInspectionDue: null,
        healthScore: 100,
        sortOrder: node.sortOrder,
        notes,
      };

      const saved = existing
        ? await tx.componentRegistry.update({ where: { id: existing.id }, data })
        : await tx.componentRegistry.create({ data });

      idMap.set(node.id, saved.id);
    }
  });

  const commissioned = await db.componentRegistry.findMany({
    where: { assetId: targetAsset.id },
    select: { id: true, parentId: true, componentType: true },
  });

  const targetIds = new Set(commissioned.map((item) => item.id));
  const roots = commissioned.filter((item) => !item.parentId);
  const orphans = commissioned.filter(
    (item) => item.parentId && !targetIds.has(item.parentId),
  );

  if (commissioned.length !== 77 || roots.length !== 8 || orphans.length !== 0) {
    throw new Error(
      `Commissioning verification failed: nodes=${commissioned.length} roots=${roots.length} orphans=${orphans.length}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        targetAsset,
        nodes: commissioned.length,
        roots: roots.length,
        orphans: orphans.length,
        note: 'Hierarchy only. Inventory, tools and PM links are intentionally not copied across plants.',
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
