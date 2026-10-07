import type { Prisma } from '@prisma/client';

export async function lockPmTemplateLifecycle(
  tx: Prisma.TransactionClient,
  templateId: string,
): Promise<void> {
  const lockKey = `iassetspro:pm-template-lifecycle:${templateId}`;
  await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', lockKey);
}


export async function lockPmScheduleLifecycle(
  tx: Prisma.TransactionClient,
  scheduleId: string,
): Promise<void> {
  const lockKey = `iassetspro:pm-schedule-lifecycle:${scheduleId}`;
  await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', lockKey);
}
