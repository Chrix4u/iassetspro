import { describe, expect, it } from 'vitest';
import {
  hasMaintenanceApprovalPermission,
  isMaintenanceApproverForPlant,
} from '@/lib/maintenance-approvers';

const approvalPermission = { permission: { slug: 'maintenance_requests.approve' } };

const approver = (overrides: Record<string, unknown> = {}) => ({
  status: 'active',
  userRoles: [
    {
      role: {
        slug: 'custom_shift_supervisor',
        rolePermissions: [approvalPermission],
      },
    },
  ],
  directPerms: [],
  plantAccess: [{ plantId: 'plant-a' }],
  ...overrides,
});

describe('maintenance approver policy', () => {
  it('accepts a custom role when it grants maintenance request approval', () => {
    expect(hasMaintenanceApprovalPermission(approver())).toBe(true);
    expect(isMaintenanceApproverForPlant(approver(), 'plant-a')).toEqual({
      eligible: true,
      reason: 'eligible',
    });
  });

  it('honors an explicit direct deny over a role permission', () => {
    const user = approver({
      directPerms: [
        {
          isGranted: false,
          expiresAt: null,
          permission: { slug: 'maintenance_requests.approve' },
        },
      ],
    });

    expect(hasMaintenanceApprovalPermission(user)).toBe(false);
    expect(isMaintenanceApproverForPlant(user, 'plant-a').reason).toBe('missing_permission');
  });

  it('rejects inactive approvers and approvers outside the plant', () => {
    expect(isMaintenanceApproverForPlant(approver({ status: 'inactive' }), 'plant-a').reason)
      .toBe('inactive');
    expect(isMaintenanceApproverForPlant(approver(), 'plant-b').reason)
      .toBe('missing_plant_access');
  });

  it('allows an active admin without explicit plant access', () => {
    const admin = approver({
      userRoles: [{ role: { slug: 'admin', rolePermissions: [] } }],
      plantAccess: [],
    });

    expect(isMaintenanceApproverForPlant(admin, 'plant-b')).toEqual({
      eligible: true,
      reason: 'eligible',
    });
  });
});
