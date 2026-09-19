import { hasPermission, hasRole, isAdmin, type SessionData } from '@/lib/auth';

const INVENTORY_OPERATIONAL_ROLES = [
  'inventory_manager',
  'store_keeper',
  'tools_shop_attendant',
] as const;

const INVENTORY_ELEVATED_PERMISSIONS = [
  'inventory.view_all',
  'inventory.manage',
  'inventory.create',
  'inventory.update',
  'inventory.stock_in',
  'inventory.stock_out',
  'inventory.transfer',
  'inventory.adjust',
] as const;

export function canAccessFullInventory(session: SessionData): boolean {
  return (
    isAdmin(session) ||
    INVENTORY_OPERATIONAL_ROLES.some(role => hasRole(session, role)) ||
    INVENTORY_ELEVATED_PERMISSIONS.some(permission => hasPermission(session, permission))
  );
}

export function canViewInventoryArea(session: SessionData, permission: string): boolean {
  return canAccessFullInventory(session) || hasPermission(session, permission);
}
