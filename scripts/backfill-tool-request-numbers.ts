/**
 * Backfill request numbers for existing RepairToolRequest rows that have null requestNumber.
 *
 * Run on VPS:
 *   cd /home/ifleetpro/git/eam-system && bun run backfill:tool-requests
 *   (or: bun scripts/backfill-tool-request-numbers.ts)
 *
 * This script:
 * 1. Finds all repair_tool_requests with NULL requestNumber
 * 2. Groups them by creation month
 * 3. Generates sequential TR-YYYYMM-NNNN numbers respecting existing numbers
 * 4. Updates each row
 *
 * Safe to run multiple times — skips rows that already have a requestNumber.
 *
 * NOTE: The API endpoint also has auto-backfill (ensureLegacyRequestNumbers),
 * so this manual script is optional. Use it if you want to backfill without
 * waiting for the first page access.
 */

import { PrismaClient } from '@prisma/client';
import { createAdapter } from '../src/lib/create-postgres-adapter';

// Build Prisma client using the same PostgreSQL adapter as the app.
function createPrismaClient(): PrismaClient {
  let connectionString = process.env.DATABASE_URL || '';

  if (!connectionString) {
    const host = process.env.DB_HOST;
    const port = process.env.DB_PORT || '5432';
    const user = process.env.DB_USER;
    const password = process.env.DB_PASSWORD;
    const database = process.env.DB_NAME;

    if (host && user && password && database) {
      connectionString =
        `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}?schema=public`;
    }
  }

  if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string');
  }

  const adapter = createAdapter(connectionString);
  const url = new URL(connectionString);
  console.log(`🔄 Connecting to PostgreSQL: ${url.host}/${url.pathname.slice(1)}...`);
  return new PrismaClient({ adapter });
}

async function backfillRequestNumbers() {
  const prisma = createPrismaClient();

  try {
    console.log('✅ Connected! Checking for legacy tool requests...\n');

    // Step 1: Find rows with NULL requestNumber
    const legacyRows = await prisma.repairToolRequest.findMany({
      where: { requestNumber: null },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    if (legacyRows.length === 0) {
      console.log('✅ All requests already have request numbers. Nothing to backfill.');
      return;
    }

    console.log(`📋 Found ${legacyRows.length} legacy request(s) without request numbers.`);

    // Step 2: Build a map of existing request numbers by month prefix
    const existingNumbers = await prisma.repairToolRequest.findMany({
      where: { requestNumber: { not: null } },
      select: { requestNumber: true },
    });

    const existingByPrefix = new Map<string, Set<number>>();
    for (const r of existingNumbers) {
      if (!r.requestNumber) continue;
      const parts = r.requestNumber.split('-');
      if (parts.length >= 3) {
        const prefix = `${parts[0]}-${parts[1]}`;
        const num = parseInt(parts[2], 10);
        if (!isNaN(num)) {
          if (!existingByPrefix.has(prefix)) {
            existingByPrefix.set(prefix, new Set());
          }
          existingByPrefix.get(prefix)!.add(num);
        }
      }
    }

    // Step 3: Generate and assign numbers
    const prefixCounter = new Map<string, number>();
    let updated = 0;

    for (const row of legacyRows) {
      const created = new Date(row.createdAt);
      const ym = `${created.getFullYear()}${String(created.getMonth() + 1).padStart(2, '0')}`;
      const prefix = `TR-${ym}`;

      // Get next available number for this prefix
      let counter = prefixCounter.get(prefix) || 1;
      const usedNumbers = existingByPrefix.get(prefix);

      // Find the next unused number
      while (usedNumbers && usedNumbers.has(counter)) {
        counter++;
      }
      prefixCounter.set(prefix, counter);

      const requestNumber = `${prefix}${String(counter).padStart(4, '0')}`;

      // Update the row
      await prisma.repairToolRequest.update({
        where: { id: row.id },
        data: { requestNumber },
      });

      // Track this number as used
      if (!existingByPrefix.has(prefix)) {
        existingByPrefix.set(prefix, new Set());
      }
      existingByPrefix.get(prefix)!.add(counter);

      const dateStr = created.toISOString().slice(0, 10);
      console.log(`  ✅ ${row.id.slice(0, 8)}... → ${requestNumber} (created: ${dateStr})`);
      updated++;
    }

    console.log(`\n🎉 Backfilled ${updated} request number(s) successfully.`);

    // Verify
    const remaining = await prisma.repairToolRequest.count({
      where: { requestNumber: null },
    });
    if (remaining === 0) {
      console.log('✅ Verification PASSED: All requests now have request numbers.');
    } else {
      console.error(`❌ Verification FAILED: ${remaining} requests still have NULL requestNumber.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

backfillRequestNumbers()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Backfill failed:', err.message);
    process.exit(1);
  });
