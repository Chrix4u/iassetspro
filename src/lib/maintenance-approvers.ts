import { db } from '@/lib/db';

export const MAINTENANCE_APPROVAL_PERMISSION = 'maintenance_requests.approve';

type PermissionRef = { permission: { slug: string } };
type RoleRef = {
  role: {
    slug: string;
    rolePermissions?: PermissionRef[];
  };
};
type DirectPermissionRef = {
  isGranted: boolean;
  expiresAt: Date | string | null;
  permission: { slug: string };
};

type MaintenanceApproverRecord = {
  status: string;
  userRoles?: RoleRef[];
  directPerms?: DirectPermissionRef[];
  plantAccess?: Array<{ plantId: string }>;
};

export type MaintenanceApproverEligibility = {
  eligible: boolean;
  reason: 'eligible' | 'not_found' | 'inactive' | 'missing_permission' | 'missing_plant_access';
};

export function hasMaintenanceApprovalPermission(
  user: MaintenanceApproverRecord,
  now = new Date(),
): boolean {
  const roles = user.userRoles || [];
  if (roles.some((entry) => entry.role.slug === 'admin')) return true;

  let granted = roles.some((entry) =>
    (entry.role.rolePermissions || []).some(
      (rolePermission) => rolePermission.permission.slug === MAINTENANCE_APPROVAL_PERMISSION,
    ),
  );

  const direct = (user.directPerms || []).find(
    (entry) => entry.permission.slug === MAINTENANCE_APPROVAL_PERMISSION,
  );

  if (direct) {
    if (direct.expiresAt && new Date(direct.expiresAt) < now) {
      granted = false;
    } else {
      granted = direct.isGranted;
    }
  }

  return granted;
}

export function isMaintenanceApproverForPlant(
  user: MaintenanceApproverRecord,
  plantId: string,
  now = new Date(),
): MaintenanceApproverEligibility {
  if (user.status !== 'active') return { eligible: false, reason: 'inactive' };
  if (!hasMaintenanceApprovalPermission(user, now)) {
    return { eligible: false, reason: 'missing_permission' };
  }

  const isAdmin = (user.userRoles || []).some((entry) => entry.role.slug === 'admin');
  if (isAdmin) return { eligible: true, reason: 'eligible' };

  const hasPlantAccess = (user.plantAccess || []).some((access) => access.plantId === plantId);
  if (!hasPlantAccess) return { eligible: false, reason: 'missing_plant_access' };

  return { eligible: true, reason: 'eligible' };
}

export async function getMaintenanceApproverEligibility(
  userId: string,
  plantId: string,
): Promise<MaintenanceApproverEligibility> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      status: true,
      userRoles: {
        select: {
          role: {
            select: {
              slug: true,
              rolePermissions: {
                select: { permission: { select: { slug: true } } },
              },
            },
          },
        },
      },
      directPerms: {
        select: {
          isGranted: true,
          expiresAt: true,
          permission: { select: { slug: true } },
        },
      },
      plantAccess: {
        where: { plantId },
        select: { plantId: true },
      },
    },
  });

  if (!user) return { eligible: false, reason: 'not_found' };
  return isMaintenanceApproverForPlant(user, plantId);
}

export function maintenanceApproverErrorMessage(reason: MaintenanceApproverEligibility['reason']): string {
  switch (reason) {
    case 'not_found':
      return 'Selected supervisor user was not found';
    case 'inactive':
      return 'Selected supervisor is inactive';
    case 'missing_permission':
      return 'Selected supervisor does not have maintenance request approval permission';
    case 'missing_plant_access':
      return 'Selected supervisor does not have access to the selected plant';
    default:
      return 'Selected supervisor is not an eligible maintenance approver';
  }
}
