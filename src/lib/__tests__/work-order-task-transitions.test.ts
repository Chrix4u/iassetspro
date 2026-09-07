import { describe, expect, it } from 'vitest';
import {
  canTransitionWorkOrderTask,
  isWorkOrderTaskStatus,
  taskTransitionError,
} from '@/lib/work-order-task-transitions';

describe('work-order task transition contract', () => {
  it('allows the same execution transitions used by live and offline task mutations', () => {
    expect(canTransitionWorkOrderTask('pending', 'completed')).toBe(true);
    expect(canTransitionWorkOrderTask('pending', 'in_progress')).toBe(true);
    expect(canTransitionWorkOrderTask('in_progress', 'failed')).toBe(true);
    expect(canTransitionWorkOrderTask('completed', 'pending')).toBe(true);
  });

  it('rejects transitions that would let offline replay bypass the live endpoint rules', () => {
    expect(canTransitionWorkOrderTask('pending', 'failed')).toBe(false);
    expect(canTransitionWorkOrderTask('completed', 'failed')).toBe(false);
    expect(canTransitionWorkOrderTask('skipped', 'completed')).toBe(false);
  });

  it('validates supported statuses and produces the canonical transition error', () => {
    expect(isWorkOrderTaskStatus('completed')).toBe(true);
    expect(isWorkOrderTaskStatus('unknown')).toBe(false);
    expect(taskTransitionError('pending', 'failed')).toBe("Cannot transition from 'Pending' to 'Failed'");
  });
});
