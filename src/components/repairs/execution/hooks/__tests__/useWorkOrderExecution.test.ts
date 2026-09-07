import { describe, expect, it } from 'vitest';
import { buildUnverifiedCompletionReadiness } from '@/components/repairs/execution/hooks/useWorkOrderExecution';

describe('buildUnverifiedCompletionReadiness', () => {
  it('always creates a blocking, not-ready completion state', () => {
    const result = buildUnverifiedCompletionReadiness();

    expect(result.ready).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(result.blockers).toEqual([
      expect.objectContaining({
        code: 'COMPLETION_READINESS_UNVERIFIED',
        category: 'system',
        severity: 'blocker',
      }),
    ]);
  });

  it('preserves the explicit checking or outage message for the technician', () => {
    const result = buildUnverifiedCompletionReadiness('Checking completion readiness');

    expect(result.ready).toBe(false);
    expect(result.blockers[0]?.message).toBe('Checking completion readiness');
  });
});
