import { db } from '@/lib/db';

/**
 * Resolve a persisted User row for PM automation writes.
 *
 * AuditLog and WorkOrderComment both require a real User foreign key, so cron
 * execution must never fall back to a synthetic string such as "system".
 */
export async function resolvePmAutomationActorId(sessionUserId?: string | null): Promise<string> {
  if (sessionUserId) {
    const sessionUser = await db.user.findUnique({
      where: { id: sessionUserId },
      select: { id: true, status: true },
    });
    if (!sessionUser || sessionUser.status !== 'active') {
      throw new Error('Authenticated PM automation actor is missing or inactive');
    }
    return sessionUser.id;
  }

  const configuredUserId = process.env.PM_CRON_USER_ID?.trim();
  if (configuredUserId) {
    const configuredUser = await db.user.findUnique({
      where: { id: configuredUserId },
      select: { id: true, status: true },
    });
    if (!configuredUser || configuredUser.status !== 'active') {
      throw new Error('PM_CRON_USER_ID must reference an active user');
    }
    return configuredUser.id;
  }

  const systemAdministrator = await db.user.findFirst({
    where: { username: 'admin', status: 'active' },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!systemAdministrator) {
    throw new Error('PM automation requires PM_CRON_USER_ID or an active System Administrator user');
  }
  return systemAdministrator.id;
}
