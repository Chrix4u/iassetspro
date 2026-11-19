import { db } from '@/lib/db';

interface ReviewableModel {
  id: string;
  filePath: string;
  isActive: boolean;
}

/**
 * A commissioned private CAD model's technical component links are part of
 * the engineer-reviewed record. Mutating them without a new review would make
 * the stored approval evidence inaccurate.
 *
 * Uncommissioned uploads may be mapped by an authorized engineer. Withdrawn
 * revisions remain immutable for forensic and technical traceability.
 */
export function isPrivateSmartAnatomyModel(model: Pick<ReviewableModel, 'filePath'>): boolean {
  return model.filePath.startsWith('/api/smart-anatomy/models/');
}

export async function reviewedCadMappingsAreFrozen(
  model: ReviewableModel,
): Promise<boolean> {
  if (!isPrivateSmartAnatomyModel(model)) return false;
  if (model.isActive) return true;
  const withdrawal = await db.auditLog.findFirst({
    where: {
      entityType: 'asset_model',
      entityId: model.id,
      action: 'withdraw',
    },
    select: { id: true },
  });
  return Boolean(withdrawal);
}
