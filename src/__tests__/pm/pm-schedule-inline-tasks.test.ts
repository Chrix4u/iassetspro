import { describe, expect, it } from 'vitest';
import { normalizePmScheduleTasks } from '@/services/pm/scheduleTaskSnapshot.service';

describe('PM schedule inline task normalization', () => {
  it('normalizes ordered schedule tasks for snapshot persistence', () => {
    const result = normalizePmScheduleTasks([
      { description: ' Inspect bearing ', taskType: 'inspect', estimatedMinutes: '15', requiredParts: [' Grease ', 'Seal'] },
      { description: 'Record vibration', taskType: 'record', estimatedMinutes: '', requiredParts: [] },
    ]);

    expect(result).toEqual({
      ok: true,
      tasks: [
        { taskNumber: 1, description: 'Inspect bearing', taskType: 'inspect', estimatedMinutes: 15, requiredParts: ['Grease', 'Seal'] },
        { taskNumber: 2, description: 'Record vibration', taskType: 'record', estimatedMinutes: null, requiredParts: [] },
      ],
    });
  });

  it('rejects invalid descriptions, task types and minutes', () => {
    expect(normalizePmScheduleTasks([{ description: '', taskType: 'check' }])).toEqual({ ok: false, error: 'Task 1 description is required' });
    expect(normalizePmScheduleTasks([{ description: 'Test', taskType: 'unknown' }])).toEqual({ ok: false, error: 'Task 1 has an invalid task type' });
    expect(normalizePmScheduleTasks([{ description: 'Test', taskType: 'check', estimatedMinutes: 0 }])).toEqual({ ok: false, error: 'Task 1 estimated minutes must be a positive whole number' });
  });

  it('rejects malformed required parts instead of silently persisting them', () => {
    expect(normalizePmScheduleTasks([{ description: 'Test', taskType: 'check', requiredParts: ['good', ''] }]))
      .toEqual({ ok: false, error: 'Task 1 required parts must be non-empty strings' });
  });
});
