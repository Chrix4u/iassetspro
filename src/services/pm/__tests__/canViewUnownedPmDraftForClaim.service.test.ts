import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import type { SessionData } from '@/lib/auth';
import {
  canViewUnownedPmDraftForClaim,
  type ClaimablePmWorkOrder,
} from '@/services/pm/canViewUnownedPmDraftForClaim.service';

const actor: SessionData = {
  userId: 'planner-1',
  username: 'planner',
  fullName: 'Maintenance Planner',
  roles: ['maintenance_planner'],
  permissions: ['work_orders.view', 'work_orders.update'],
  createdAt: new Date(),
};

const orphan: ClaimablePmWorkOrder = {
  plantId: 'plant-a',
  pmScheduleId: 'schedule-a',
  plannerId: null,
  status: 'draft',
  isLocked: false,
};

function makeTx(member: { id: string } | null = { id: 'plant-membership' }) {
  const findFirst = vi.fn().mockResolvedValue(member);
  return {
    findFirst,
    tx: { userPlant: { findFirst } } as unknown as Pick<Prisma.TransactionClient, 'userPlant'>,
  };
}

describe('canViewUnownedPmDraftForClaim — narrowly scoped pre-claim read', () => {
  it('allows an active planner with current write membership, basic view and update permissions', async () => {
    const { tx, findFirst } = makeTx();
    expect(await canViewUnownedPmDraftForClaim(tx, actor, orphan)).toBe(true);
    expect(findFirst).toHaveBeenCalledOnce();
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'planner-1',
        plantId: 'plant-a',
        accessLevel: { in: ['write', 'admin'] },
        user: {
          is: {
            status: 'active',
            userRoles: {
              some: { role: { slug: { in: ['planner', 'maintenance_planner'] } } },
            },
          },
        },
      },
      select: { id: true },
    });
  });

  it('also accepts the explicit view-all permission without requiring basic view', async () => {
    const { tx } = makeTx();
    expect(await canViewUnownedPmDraftForClaim(
      tx, { ...actor, permissions: ['work_orders.view_all', 'work_orders.update'] }, orphan,
    )).toBe(true);
  });

  it('fails closed for a read-only, inactive or cross-plant planner', async () => {
    const { tx, findFirst } = makeTx(null);
    expect(await canViewUnownedPmDraftForClaim(tx, actor, orphan)).toBe(false);
    expect(findFirst).toHaveBeenCalledOnce();
  });

  it('denies technicians and supervisors even with broad WO update permissions', async () => {
    const { tx, findFirst } = makeTx();
    for (const roles of [['maintenance_technician'], ['maintenance_supervisor']]) {
      expect(await canViewUnownedPmDraftForClaim(tx, { ...actor, roles }, orphan)).toBe(false);
    }
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('requires both work-order read and update permissions', async () => {
    const { tx, findFirst } = makeTx();
    for (const permissions of [
      ['work_orders.view'],
      ['work_orders.update'],
      ['pm_schedules.view'],
    ]) {
      expect(await canViewUnownedPmDraftForClaim(tx, { ...actor, permissions }, orphan)).toBe(false);
    }
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('does not open already owned, locked, completed, non-PM or plantless work orders', async () => {
    const { tx, findFirst } = makeTx();
    const variants: Array<Partial<ClaimablePmWorkOrder>> = [
      { plannerId: 'someone-else' },
      { status: 'approved' },
      { status: 'closed' },
      { isLocked: true },
      { pmScheduleId: null },
      { plantId: null },
    ];
    for (const patch of variants) {
      expect(await canViewUnownedPmDraftForClaim(tx, actor, { ...orphan, ...patch })).toBe(false);
    }
    expect(findFirst).not.toHaveBeenCalled();
  });
});
