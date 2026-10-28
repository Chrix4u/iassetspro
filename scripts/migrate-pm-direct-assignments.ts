import { db } from '../src/lib/db';
import { backfillPmMeetingMigration } from '../src/services/pm/pmMigration.service';

async function main() {
  const result = await db.$transaction(async (tx) => backfillPmMeetingMigration(tx), {
    maxWait: 10_000,
    timeout: 120_000,
  });
  console.log(JSON.stringify({ success: true, ...result }, null, 2));
}

main()
  .catch((error) => {
    console.error('PM direct-assignment migration failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
