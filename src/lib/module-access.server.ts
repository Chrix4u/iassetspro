import { db } from '@/lib/db';
import {
  isControlPlaneCoreModule,
  isSystemModuleOperational,
} from '@/lib/module-access';

export async function getUnavailableOperationalModules(
  moduleCodes: string[],
  now = new Date(),
): Promise<string[]> {
  const normalized = [...new Set(
    moduleCodes
      .map((code) => code.toLowerCase())
      .filter((code) => !isControlPlaneCoreModule(code)),
  )];

  if (normalized.length === 0) return [];

  const rows = await db.systemModule.findMany({
    where: { code: { in: normalized } },
    include: { companyModules: true },
  });

  const byCode = new Map(rows.map((row) => [row.code.toLowerCase(), row]));

  return normalized.filter((code) => {
    const row = byCode.get(code);
    return !row || !isSystemModuleOperational(row, now);
  });
}
