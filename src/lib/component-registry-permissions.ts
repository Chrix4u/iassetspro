import { hasPermission, isAdmin, type SessionData } from '@/lib/auth';

function any(session: SessionData, permissions: string[]) {
  return permissions.some((permission) => hasPermission(session, permission));
}

export function canViewComponentHierarchy(session: SessionData): boolean {
  return isAdmin(session) || any(session, [
    'digital_twin.view',
    'assets.view',
    'assets.view_all',
    'assets.hierarchy',
    'assemblies.view',
  ]);
}

export function canCreateComponentHierarchy(session: SessionData): boolean {
  return isAdmin(session)
    || hasPermission(session, 'digital_twin.manage')
    || (hasPermission(session, 'assets.hierarchy')
      && any(session, ['assets.create', 'assemblies.create']));
}

export function canUpdateComponentHierarchy(session: SessionData): boolean {
  return isAdmin(session)
    || hasPermission(session, 'digital_twin.manage')
    || (hasPermission(session, 'assets.hierarchy')
      && any(session, ['assets.update', 'assemblies.update']));
}

export function canDeleteComponentHierarchy(session: SessionData): boolean {
  return isAdmin(session)
    || hasPermission(session, 'digital_twin.manage')
    || (hasPermission(session, 'assets.hierarchy')
      && hasPermission(session, 'assets.delete'));
}