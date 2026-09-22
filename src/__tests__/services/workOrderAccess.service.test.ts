import { describe, expect, it } from 'vitest';
import type { SessionData } from '@/lib/auth';
import {
  canManageWorkOrder,
  canPerformWorkOrderTransition,
  canViewWorkOrder,
  hasWorkOrderViewOverride,
  isWorkOrderExecutionMember,
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

  it('does not surface Start to an unrelated technician or assistant', () => {
    const snapshot = {
      status: 'assigned',
      assignedTo: 'tech-a',
      teamLeaderId: null,
      assignedSupervisorId: 'sup-a',
      plannerId: 'planner-a',
      teamMembers: [{ userId: 'assistant-a', role: 'assistant' }],
    };
    expect(canPerformWorkOrderTransition(
      session({ userId: 'tech-a', roles: ['maintenance_technician'], permissions: ['work_orders.start'] }),
      snapshot,
      'in_progress',
    )).toBe(true);
    expect(canPerformWorkOrderTransition(
      session({ userId: 'tech-b', roles: ['maintenance_technician'], permissions: ['work_orders.start'] }),
      snapshot,
      'in_progress',
    )).toBe(false);
    expect(canPerformWorkOrderTransition(
      session({ userId: 'assistant-a', roles: ['maintenance_technician'], permissions: ['work_orders.start'] }),
      snapshot,
      'in_progress',
    )).toBe(false);
  });

  it('treats assigned read-only team rows as execution members for dedicated execution APIs', () => {
    const actor = session({
      userId: 'assistant-a',
      roles: ['maintenance_technician'],
      permissions: ['repair_tool_requests.create'],
    });
    const snapshot = {
      assignedTo: 'tech-a',
      teamLeaderId: 'tech-a',
      teamMembers: [{
        userId: 'assistant-a',
        role: 'assistant',
        accessLevel: 'read_only',
      }],
    };

    expect(canViewWorkOrder(actor, snapshot)).toBe(true);
    expect(isWorkOrderExecutionMember(actor, snapshot)).toBe(true);
  });

  it('keeps pending handover custody viewable but non-executable', () => {
    const actor = session({ userId: 'receiver-a' });
    const snapshot = {
      assignedTo: 'tech-a',
      teamLeaderId: null,
      teamMembers: [{
        userId: 'receiver-a',
        role: 'handover_receiver',
        accessLevel: 'read_only',
      }],
    };

    expect(canViewWorkOrder(actor, snapshot)).toBe(true);
    expect(isWorkOrderExecutionMember(actor, snapshot)).toBe(false);
  });

  it('binds verification, closure and planning to the accountable actor', () => {
    const completed = {
      status: 'completed',
      assignedSupervisorId: 'sup-a',
      plannerId: 'planner-a',
      assignedTo: 'tech-a',
      teamMembers: [],
    };
    expect(canPerformWorkOrderTransition(
      session({ userId: 'sup-a', roles: ['maintenance_supervisor'], permissions: ['work_orders.verify'] }),
      completed,
      'verified',
    )).toBe(true);
    expect(canPerformWorkOrderTransition(
      session({ userId: 'sup-b', roles: ['maintenance_supervisor'], permissions: ['work_orders.verify'] }),
      completed,
      'verified',
    )).toBe(false);

    const verified = { ...completed, status: 'verified' };
    expect(canPerformWorkOrderTransition(
      session({ userId: 'planner-a', roles: ['maintenance_planner'], permissions: ['work_orders.close'] }),
      verified,
      'closed',
    )).toBe(true);
    expect(canPerformWorkOrderTransition(
      session({ userId: 'planner-b', roles: ['maintenance_planner'], permissions: ['work_orders.close'] }),
      verified,
      'closed',
    )).toBe(false);

    const approved = { ...completed, status: 'approved' };
    expect(canPerformWorkOrderTransition(
      session({ userId: 'planner-a', roles: ['maintenance_planner'], permissions: ['work_orders.update'] }),
      approved,
      'planned',
    )).toBe(true);
    expect(canPerformWorkOrderTransition(
      session({ userId: 'planner-b', roles: ['maintenance_planner'], permissions: ['work_orders.update'] }),
      approved,
      'planned',
    )).toBe(false);
  });

});
