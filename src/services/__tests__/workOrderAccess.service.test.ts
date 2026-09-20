import { describe, expect, it } from 'vitest';
import type { SessionData } from '@/lib/auth';
import {
  canAssignWorkOrderForActor,
  canCancelWorkOrderForActor,
  canCloseWorkOrderForActor,
  canCompleteWorkOrderForActor,
  canPerformWorkOrderTransition,
  canPlanWorkOrderForActor,
  canStartWorkOrderForActor,
  canVerifyWorkOrderForActor,
  canViewWorkOrder,
} from '@/services/workOrderAccess.service';

function session(
  userId: string,
  roles: string[],
  permissions: string[] = [],
): SessionData {
  return {
    userId,
    username: userId,
    fullName: userId,
    roles,
    permissions,
    createdAt: new Date('2026-09-20T00:00:00.000Z'),
  };
}

function wo(overrides: Record<string, unknown> = {}) {
  return {
    status: 'assigned',
    assignedTo: 'tech-1',
    teamLeaderId: null,
    assignedSupervisorId: 'sup-1',
    plannerId: 'planner-1',
    assignedBy: 'planner-1',
    teamMembers: [],
    maintenanceRequest: { requestedBy: 'requester-1' },
    ...overrides,
  };
}

describe('workOrderAccess actor-aware lifecycle authority', () => {
  it('allows an assigned technician to start but hides Start from unrelated technicians and assistants', () => {
    const assigned = session('tech-1', ['maintenance_technician'], ['work_orders.start']);
    const unrelated = session('tech-2', ['maintenance_technician'], ['work_orders.start']);
    const assistant = session('assistant-1', ['maintenance_technician'], ['work_orders.start', 'work_orders.update']);
    const snapshot = wo({
      teamMembers: [{ userId: 'assistant-1', role: 'assistant' }],
    });

    expect(canStartWorkOrderForActor(assigned, snapshot)).toBe(true);
    expect(canPerformWorkOrderTransition(assigned, snapshot, 'in_progress')).toBe(true);
    expect(canPerformWorkOrderTransition(unrelated, snapshot, 'in_progress')).toBe(false);
    expect(canPerformWorkOrderTransition(assistant, snapshot, 'in_progress')).toBe(false);
  });

  it('requires the team leader to complete a multi-technician work order', () => {
    const snapshot = wo({
      status: 'in_progress',
      teamLeaderId: 'leader-1',
      teamMembers: [
        { userId: 'leader-1', role: 'team_leader' },
        { userId: 'assistant-1', role: 'assistant' },
      ],
    });
    const assignee = session('tech-1', ['maintenance_technician'], ['work_orders.complete']);
    const leader = session('leader-1', ['maintenance_technician'], ['work_orders.complete']);
    const assistant = session('assistant-1', ['maintenance_technician'], ['work_orders.complete']);

    expect(canCompleteWorkOrderForActor(assignee, snapshot)).toBe(false);
    expect(canCompleteWorkOrderForActor(assistant, snapshot)).toBe(false);
    expect(canCompleteWorkOrderForActor(leader, snapshot)).toBe(true);
    expect(canPerformWorkOrderTransition(leader, snapshot, 'completed')).toBe(true);
  });

  it('binds planning and assignment to the accountable planner/supervisor', () => {
    const snapshot = wo({ status: 'approved' });
    const planner = session('planner-1', ['maintenance_planner'], [
      'work_orders.update',
      'work_orders.assign_technician',
    ]);
    const otherPlanner = session('planner-2', ['maintenance_planner'], [
      'work_orders.update',
      'work_orders.assign_technician',
    ]);
    const supervisor = session('sup-1', ['maintenance_supervisor'], [
      'work_orders.update',
      'work_orders.assign_technician',
    ]);

    expect(canPlanWorkOrderForActor(planner, snapshot)).toBe(true);
    expect(canPlanWorkOrderForActor(otherPlanner, snapshot)).toBe(false);
    expect(canAssignWorkOrderForActor(planner, snapshot)).toBe(true);
    expect(canAssignWorkOrderForActor(supervisor, snapshot)).toBe(true);
    expect(canAssignWorkOrderForActor(otherPlanner, snapshot)).toBe(false);
    expect(canPerformWorkOrderTransition(otherPlanner, snapshot, 'planned')).toBe(false);
    expect(canPerformWorkOrderTransition(supervisor, snapshot, 'assigned')).toBe(true);
  });

  it('binds verification and rework to the assigned supervisor', () => {
    const completed = wo({ status: 'completed' });
    const assignedSupervisor = session('sup-1', ['maintenance_supervisor'], ['work_orders.verify', 'work_orders.update']);
    const otherSupervisor = session('sup-2', ['maintenance_supervisor'], ['work_orders.verify', 'work_orders.update']);

    expect(canVerifyWorkOrderForActor(assignedSupervisor, completed)).toBe(true);
    expect(canVerifyWorkOrderForActor(otherSupervisor, completed)).toBe(false);
    expect(canPerformWorkOrderTransition(assignedSupervisor, completed, 'verified')).toBe(true);
    expect(canPerformWorkOrderTransition(otherSupervisor, completed, 'verified')).toBe(false);
    expect(canPerformWorkOrderTransition(assignedSupervisor, completed, 'in_progress')).toBe(true);
    expect(canPerformWorkOrderTransition(otherSupervisor, completed, 'in_progress')).toBe(false);
  });

  it('binds closure to the assigned planner and requires explicit close permission', () => {
    const verified = wo({ status: 'verified' });
    const planner = session('planner-1', ['maintenance_planner'], ['work_orders.close']);
    const genericUpdater = session('planner-1', ['maintenance_planner'], ['work_orders.update']);
    const otherPlanner = session('planner-2', ['maintenance_planner'], ['work_orders.close']);

    expect(canCloseWorkOrderForActor(planner, verified)).toBe(true);
    expect(canCloseWorkOrderForActor(otherPlanner, verified)).toBe(false);
    expect(canPerformWorkOrderTransition(planner, verified, 'closed')).toBe(true);
    expect(canPerformWorkOrderTransition(genericUpdater, verified, 'closed')).toBe(false);
    expect(canPerformWorkOrderTransition(otherPlanner, verified, 'closed')).toBe(false);
  });

  it('does not surface Cancel when the actor lacks the cancel endpoint permission', () => {
    const active = wo({ status: 'in_progress' });
    const assignedSupervisor = session('sup-1', ['maintenance_supervisor'], ['work_orders.update']);
    const cancellableSupervisor = session('sup-1', ['maintenance_supervisor'], [
      'work_orders.update',
      'work_orders.cancel',
    ]);

    expect(canCancelWorkOrderForActor(assignedSupervisor, active)).toBe(true);
    expect(canPerformWorkOrderTransition(assignedSupervisor, active, 'cancelled')).toBe(false);
    expect(canPerformWorkOrderTransition(cancellableSupervisor, active, 'cancelled')).toBe(true);
  });

  it('keeps management overrides auditable but still permission-bound for endpoints', () => {
    const verified = wo({ status: 'verified' });
    const manager = session('manager-1', ['maintenance_manager'], ['work_orders.close']);
    const managerWithoutClose = session('manager-2', ['maintenance_manager'], ['work_orders.update']);

    expect(canCloseWorkOrderForActor(manager, verified)).toBe(true);
    expect(canPerformWorkOrderTransition(manager, verified, 'closed')).toBe(true);
    expect(canPerformWorkOrderTransition(managerWithoutClose, verified, 'closed')).toBe(false);
  });

  it('does not let an unrelated same-plant user query workflow capabilities', () => {
    const snapshot = wo();
    const requester = session('requester-1', ['production_operator'], ['work_orders.view_own']);
    const unrelated = session('other-1', ['production_operator'], ['work_orders.view_own']);

    expect(canViewWorkOrder(requester, snapshot)).toBe(true);
    expect(canViewWorkOrder(unrelated, snapshot)).toBe(false);
  });
});
