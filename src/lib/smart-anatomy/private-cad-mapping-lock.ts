import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { isPrivateSmartAnatomyModel } from './reviewed-model';

export class CadMappingFrozenError extends Error {
  constructor() {
    super('Approved or withdrawn CAD mappings are immutable. Import and review a new revision.');
    this.name = 'CadMappingFrozenError';
  }
}

export class CadMappingConflictError extends Error {
  constructor(message = 'CAD mapping changed since engineer review; refresh the model') {
    super(message);
    this.name = 'CadMappingConflictError';
  }
}

/**
 * Serializes every private CAD component-mapping write with engineering
 * commission/withdrawal. Both use FOR UPDATE on the same asset_models row.
 *
 * Without this lock, a stale browser can pass an early isActive check,
 * then write changed component mappings after a second engineer approves
 * another set. No extra transaction is needed for ordinary legacy models.
 */
export async function writeCadBindingUnderModelLock<T>(
  model: {id: string; filePath: string},
  writer: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (!isPrivateSmartAnatomyModel(model)) {
    return db.$transaction(async tx => writer(tx));
  }

  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "asset_models" WHERE id = ${model.id} FOR UPDATE`;

    const current = await tx.assetModel.findUnique({
      where: {id:model.id},
      select: {id:true,isActive:true,filePath:true},
    });
    if (!current || !isPrivateSmartAnatomyModel(current) || current.isActive) {
      throw new CadMappingFrozenError();
    }
    const withdrawn=await tx.auditLog.findFirst({
      where: {entityType:'asset_model',entityId:model.id,action:'withdraw'},
      select: {id:true},
    });
    if (withdrawn) throw new CadMappingFrozenError();
    return writer(tx);
  });
}
