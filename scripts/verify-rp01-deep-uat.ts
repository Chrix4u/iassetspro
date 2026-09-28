import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) {
  throw new Error('DATABASE_URL must point to PostgreSQL');
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

type Node = {
  id: string;
  parentId: string | null;
  componentCode: string;
  componentType: string;
};

function calculateDepth(nodes: Node[]): { maxDepth: number; orphanCount: number; cycleCount: number } {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let maxDepth = 0;
  let orphanCount = 0;
  let cycleCount = 0;

  for (const node of nodes) {
    let current: Node | undefined = node;
    const seen = new Set<string>();
    let depth = 1;
    while (current?.parentId) {
      if (seen.has(current.id)) {
        cycleCount += 1;
        break;
      }
      seen.add(current.id);
      const parent = byId.get(current.parentId);
      if (!parent) {
        orphanCount += 1;
        break;
      }
      current = parent;
      depth += 1;
      if (depth > nodes.length + 1) {
        cycleCount += 1;
        break;
      }
    }
    maxDepth = Math.max(maxDepth, depth);
  }

  return { maxDepth, orphanCount, cycleCount };
}

async function main() {
  const asset = await db.asset.findUnique({
    where: { assetTag: 'UAT-RP-001' },
    select: { id: true, assetTag: true, name: true, plantId: true },
  });
  if (!asset) throw new Error('UAT-RP-001 is missing');

  const components = await db.componentRegistry.findMany({
    where: { assetId: asset.id },
    select: { id: true, parentId: true, componentCode: true, componentType: true },
  });

  const byType = components.reduce<Record<string, number>>((acc, component) => {
    acc[component.componentType] = (acc[component.componentType] || 0) + 1;
    return acc;
  }, {});
  const hierarchy = calculateDepth(components);

  const [componentPm, spareLinks, linkedSpareLinks, toolRequirements, linkedToolRequirements, maintenanceHistory, componentWorkOrders] = await Promise.all([
    db.pmSchedule.count({ where: { assetId: asset.id, componentId: { not: null }, isActive: true } }),
    db.componentSparePart.count({ where: { component: { assetId: asset.id } } }),
    db.componentSparePart.count({ where: { component: { assetId: asset.id }, inventoryItemId: { not: null } } }),
    db.componentToolRequirement.count({ where: { component: { assetId: asset.id } } }),
    db.componentToolRequirement.count({ where: { component: { assetId: asset.id }, toolId: { not: null } } }),
    db.componentMaintenanceHistory.count({ where: { component: { assetId: asset.id } } }),
    db.workOrderComponent.count({ where: { componentRegistry: { assetId: asset.id } } }),
  ]);

  const checks = {
    componentCount: components.length >= 70,
    hierarchyDepth: hierarchy.maxDepth >= 4,
    noOrphans: hierarchy.orphanCount === 0,
    noCycles: hierarchy.cycleCount === 0,
    assemblies: (byType.assembly || 0) >= 8,
    subassemblies: (byType.subassembly || 0) >= 20,
    components: (byType.component || 0) >= 25,
    parts: (byType.part || 0) >= 18,
    instruments: (byType.instrument || 0) >= 6,
    componentPmCoverage: componentPm >= 14,
    spareCoverage: spareLinks >= 11,
    allSparesStoreLinked: spareLinks > 0 && linkedSpareLinks === spareLinks,
    toolCoverage: toolRequirements >= 8,
    allToolsLinked: toolRequirements > 0 && linkedToolRequirements === toolRequirements,
    maintenanceHistory: maintenanceHistory >= 1,
    componentWorkOrderHistory: componentWorkOrders >= 1,
  };

  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  const result = {
    asset,
    componentCount: components.length,
    byType,
    hierarchy,
    componentPm,
    spareLinks,
    linkedSpareLinks,
    toolRequirements,
    linkedToolRequirements,
    maintenanceHistory,
    componentWorkOrders,
    checks,
    status: failed.length === 0 ? 'PASS' : 'FAIL',
    failed,
  };

  console.log(JSON.stringify(result, null, 2));
  if (failed.length) process.exitCode = 1;
}

main().finally(() => db.$disconnect());