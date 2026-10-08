export type SparePartReturnActor = {
  userId?: string | null;
  roles: string[];
};

type RefurbishmentRecord = { refurbisherId?: string | null };

const hasAnyRole = (actor: SparePartReturnActor, allowed: readonly string[]) =>
  actor.roles.some((role) => allowed.includes(role));

const ADMIN = ['admin'] as const;
const MAINTENANCE_MANAGEMENT = ['maintenance_supervisor', 'maintenance_manager', 'plant_manager'] as const;
const STORE_CUSTODY = ['store_keeper', 'inventory_manager', 'tools_shop_attendant'] as const;
const INSPECTION_ROLES = [...ADMIN, ...MAINTENANCE_MANAGEMENT, ...STORE_CUSTODY] as const;
const DISPOSAL_ROLES = [...ADMIN, ...MAINTENANCE_MANAGEMENT, 'store_keeper', 'inventory_manager'] as const;

export function canViewAllSparePartReturns(actor: SparePartReturnActor): boolean {
  return hasAnyRole(actor, INSPECTION_ROLES);
}

export function canInspectSparePartReturn(actor: SparePartReturnActor): boolean {
  return hasAnyRole(actor, INSPECTION_ROLES);
}

export function canRejectSparePartReturn(actor: SparePartReturnActor): boolean {
  return hasAnyRole(actor, INSPECTION_ROLES);
}

export function canEditSparePartReturn(actor: SparePartReturnActor, requestedById?: string | null): boolean {
  return hasAnyRole(actor, [...ADMIN, ...MAINTENANCE_MANAGEMENT])
    || Boolean(actor.userId && requestedById && actor.userId === requestedById);
}

export function canStartSpareRefurbishment(actor: SparePartReturnActor): boolean {
  return hasAnyRole(actor, [...ADMIN, ...MAINTENANCE_MANAGEMENT]);
}

export function canCompleteSpareRefurbishment(actor: SparePartReturnActor, record: RefurbishmentRecord): boolean {
  return canStartSpareRefurbishment(actor)
    || Boolean(actor.userId && record.refurbisherId && actor.userId === record.refurbisherId);
}

export function canReturnSparePartToStore(actor: SparePartReturnActor): boolean {
  return hasAnyRole(actor, [...ADMIN, ...STORE_CUSTODY]);
}

export function canDisposeSparePartReturn(actor: SparePartReturnActor): boolean {
  return hasAnyRole(actor, DISPOSAL_ROLES);
}
