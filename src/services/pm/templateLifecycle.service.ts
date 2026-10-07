import type { Prisma } from '@prisma/client';

export async function lockPmTemplateLifecycle(
  tx: Prisma.TransactionClient,
  templateId: string,
): Promise<void> {
  const lockKey = `iassetspro:pm-template-lifecycle:${templateId}`;
  await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', lockKey);
}
