import { describe, expect, it } from 'vitest';
import type { SessionData } from '@/lib/auth';
import {
  canManageWorkOrder,
  canViewWorkOrder,
  hasWorkOrderViewOverride,
} from '@/services/workOrderAccess.service';

function session(overrides: Partial<SessionData> = {}): SessionData {
  return {
    userId: 'user-a',
    username: 'user-a',
    fullName: 'User A',
    roles: [],
    permissions: [],
    createdAt: new Date('2026-09-12T00:00:00Z'),
    ...overrides,
  };
}

describe('work-order relationship isolation policy', () => {
  it('does not turn ordinary work_orders.view into view-all authority', () => {
    const actor = session({ permissions: ['work_orders.view'] });
    expect(hasWorkOrderViewOverride(actor)).toBe(false);
    expect(canViewWorkOrder(actor, { assignedTo: 'someone-else' })).toBe(false);
  });

  it('allows explicit view-all and management overrides', () => {
    expect(hasWorkOrderViewOverride(session({ permissions: ['work_orders.view_all'] }))).toBe(true);
    expect(hasWorkOrderViewOverride(session({ roles: ['maintenance_manager'] }))).toBe(true);
    expect(hasWorkOrderViewOverride(session({ roles: ['plant_manager'] }))).toBe(true);
    expect(hasWorkOrderViewOverride(session({ roles: ['admin'] }))).toBe(true);
  });

  it('allows every accountable workflow relationship', () => {
    const actor = session();
    expect(canViewWorkOrder(actor, { assignedTo: 'user-a' })).toBe(true);
    expect(canViewWorkOrder(actor, { teamLeaderId: 'user-a' })).toBe(true);
    expect(canViewWorkOrder(actor, { assignedSupervisorId: 'user-a' })).toBe(true);
    expect(canViewWorkOrder(actor, { plannerId: 'user-a' })).toBe(true);
    expect(canViewWorkOrder(actor, { teamMembers: [{ userId: 'user-a' }] })).toBe(true);
    expect(canViewWorkOrder(actor, { maintenanceRequest: { requestedBy: 'user-a' } })).toBe(true);
    expect(canViewWorkOrder(actor, { maintenanceRequest: { requester: { id: 'user-a' } } })).toBe(true);
  });

  it('denies unrelated same-plant users by default', () => {
    expect(canViewWorkOrder(session({ permissions: ['work_orders.view'] }), {
      assignedTo: 'tech-b',
      teamLeaderId: 'tech-c',
      assignedSupervisorId: 'sup-b',
      plannerId: 'planner-b',
      teamMembers: [{ userId: 'helper-b' }],
      maintenanceRequest: { requestedBy: 'requester-b' },
    })).toBe(false);
  });

  it('limits generic management edits to accountable management actors', () => {
    const genericUpdater = session({ permissions: ['work_orders.update'] });
    expect(canManageWorkOrder(genericUpdater, {
      plannerId: 'planner-b',
      assignedSupervisorId: 'sup-b',
    })).toBe(false);

    expect(canManageWorkOrder(session({ userId: 'planner-b' }), {
      plannerId: 'planner-b',
      assignedSupervisorId: 'sup-b',
    })).toBe(true);
    expect(canManageWorkOrder(session({ userId: 'sup-b' }), {
      plannerId: 'planner-b',
      assignedSupervisorId: 'sup-b',
    })).toBe(true);
    expect(canManageWorkOrder(session({ roles: ['maintenance_manager'] }), {
      plannerId: 'planner-b',
      assignedSupervisorId: 'sup-b',
    })).toBe(true);
  });
});
