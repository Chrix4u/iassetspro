import { describe, expect, it } from 'vitest';
import { identifyPmWorkOrderSource } from '@/lib/pm-workorder-provenance';

describe('PM work-order provenance for readiness', () => {
  it('recognizes legacy schedule-linked work orders', () => {
    expect(identifyPmWorkOrderSource({
      pmScheduleId: 'schedule-1', schedule: { id: 'schedule-1' },
      taskExecutions: [{ pmScheduleTaskId: null }],
    })).toEqual({ kind: 'valid', source: 'legacy_schedule' });
  });
  it('accepts a direct PM assignment without a legacy schedule container', () => {
    expect(identifyPmWorkOrderSource({
      pmScheduleId: null, schedule: null,
      taskExecutions: [{ pmScheduleTaskId: 'direct-bearing-vibration' }],
    })).toEqual({ kind: 'valid', source: 'direct_assignment' });
  });
  it('rejects generic Repairs work orders and free-text preventive types', () => {
    expect(identifyPmWorkOrderSource({
      pmScheduleId: null, schedule: null,
      taskExecutions: [{ pmScheduleTaskId: null }, { pmScheduleTaskId: '' }],
    })).toMatchObject({ kind: 'not_pm' });
  });
  it('flags an orphaned PM schedule rather than misclassifying it as direct', () => {
    expect(identifyPmWorkOrderSource({
      pmScheduleId: 'deleted-1', schedule: null,
      taskExecutions: [{ pmScheduleTaskId: 'task-1' }],
    })).toMatchObject({ kind: 'broken_schedule' });
  });
  it('rejects unrelated schedule references even with a plausible PM task', () => {
    expect(identifyPmWorkOrderSource({
      pmScheduleId: 'a', schedule: { id: 'b' },
      taskExecutions: [{ pmScheduleTaskId: 'task-1' }],
    })).toMatchObject({ kind: 'broken_schedule' });
  });
});
