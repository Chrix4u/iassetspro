import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');

const databaseUrl = process.env.DATABASE_URL || '';
if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
  throw new Error('seed:constants requires a PostgreSQL DATABASE_URL');
}

const db = new PrismaClient({
  adapter: createAdapter(databaseUrl),
  log: ['warn', 'error'],
});

function runSeed(script: string) {
  const result = spawnSync('bun', ['run', script], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`Seed step failed: ${script}`);
  }
}

async function main() {
  console.log('🌱 iAssetsPro clean PostgreSQL bootstrap');

  // Keep reference/RBAC maintenance in one non-destructive authoritative path.
  runSeed('prisma/seed-reference-data.ts');

  const operationalCounts = {
    plants: await db.plant.count(),
    departments: await db.department.count(),
    assets: await db.asset.count(),
    components: await db.componentRegistry.count(),
    workOrders: await db.workOrder.count(),
    maintenanceRequests: await db.maintenanceRequest.count(),
    inventoryItems: await db.inventoryItem.count(),
    tools: await db.tool.count(),
    users: await db.user.count(),
  };

  for (const [name, count] of Object.entries(operationalCounts)) {
    if (count !== 0) {
      throw new Error(`Constants-only seed invariant failed: ${name} expected 0, found ${count}`);
    }
  }

  console.log('✅ Operational staging tables are empty and ready for manual commissioning');
}

main()
  .catch((error) => {
    console.error('❌ Constants-only seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
