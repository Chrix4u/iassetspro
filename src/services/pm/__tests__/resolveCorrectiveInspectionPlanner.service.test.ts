import { describe, expect, it, vi } from 'vitest';
import { resolveCorrectiveInspectionPlanner } from '@/services/pm/resolveCorrectiveInspectionPlanner.service';

describe('accountable planner for an inspection-generated corrective work order', () => {
  it('selects only an active planner with write/admin membership in the exact plant', async () => {
    const findFirst = vi.fn().mockResolvedValue({ userId: 'planner-plant-a' });
    const plannerId = await resolveCorrectiveInspectionPlanner({
      userPlant: { findFirst },
    } as never, 'plant-a');
    expect(plannerId).toBe('planner-plant-a');
    expect(findFirst).toHaveBeenCalledOnce();
    expect(findFirst).toHaveBeenCalledWith({
      where: {
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
      select: { userId: true },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }, { userId: 'asc' }],
    });
  });

  it('returns no owner when a plant has no eligible planner instead of pretending the inspector is a planner', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    expect(await resolveCorrectiveInspectionPlanner({ userPlant: { findFirst } } as never, 'plant-b')).toBeNull();
  });

  it('makes an eligible planner lookup failure visible rather than silently misassigning ownership', async () => {
    const findFirst = vi.fn().mockRejectedValue(new Error('DB query failed'));
    await expect(resolveCorrectiveInspectionPlanner({ userPlant: { findFirst } } as never, 'plant-b'))
      .rejects.toThrow('DB query failed');
  });
});
