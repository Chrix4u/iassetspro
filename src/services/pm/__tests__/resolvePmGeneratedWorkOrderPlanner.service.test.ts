import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { resolvePmGeneratedWorkOrderPlanner } from '@/services/pm/resolvePmGeneratedWorkOrderPlanner.service';

function makeTx(...results: Array<{ userId: string } | null>) {
  const findFirst = vi.fn();
  for (const result of results) findFirst.mockResolvedValueOnce(result);
  const tx = { userPlant: { findFirst } } as unknown as Pick<Prisma.TransactionClient, 'userPlant'>;
  return { tx, findFirst };
}

describe('resolvePmGeneratedWorkOrderPlanner', () => {
  it('preserves the schedule creator only when an active, writable plant planner', async () => {
    const { tx, findFirst } = makeTx({ userId: 'creator-1' });
    expect(await resolvePmGeneratedWorkOrderPlanner(tx, 'plant-a', 'creator-1')).toBe('creator-1');
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        plantId: 'plant-a', userId: 'creator-1',
        accessLevel: { in: ['write', 'admin'] },
        user: { is: {
          status: 'active',
          userRoles: { some: { role: { slug: { in: ['planner', 'maintenance_planner'] } } } },
        } },
      },
      select: { userId: true },
    });
  });

  it('selects an eligible plant planner when a schedule author is no longer eligible', async () => {
    const { tx, findFirst } = makeTx(null, { userId: 'plant-planner-2' });
    expect(await resolvePmGeneratedWorkOrderPlanner(tx, 'plant-a', 'ex-planner-1')).toBe('plant-planner-2');
    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(findFirst).toHaveBeenLastCalledWith({
      where: {
        plantId: 'plant-a',
        accessLevel: { in: ['write', 'admin'] },
        user: { is: {
          status: 'active',
          userRoles: { some: { role: { slug: { in: ['planner', 'maintenance_planner'] } } } },
        } },
      },
      select: { userId: true },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }, { userId: 'asc' }],
    });
  });

  it('leaves PM draft unowned if no eligible planner is available', async () => {
    const { tx, findFirst } = makeTx(null, null);
    expect(await resolvePmGeneratedWorkOrderPlanner(tx, 'plant-a', 'technician-1')).toBeNull();
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it('does not look up or assign a planner when the work order has no plant', async () => {
    const { tx, findFirst } = makeTx();
    expect(await resolvePmGeneratedWorkOrderPlanner(tx, null, 'creator-1')).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
});
