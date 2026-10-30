import { describe, expect, it } from 'vitest';
import { defaultPmBundleMaintenanceDate } from '@/lib/pm-bundle-planning';

describe('PM bundle maintenance date defaults', () => {
  it('clamps an overdue-only bundle to the planning-window start instead of an old due date', () => {
    expect(defaultPmBundleMaintenanceDate({
      candidate: '2026-10-27T00:00:00.000Z',
      windowStart: '2026-10-30T18:00:00.000Z',
      windowEnd: '2026-11-06T18:00:00.000Z',
    })).toBe('2026-10-30');
  });

  it('keeps an in-window due-soon date and clamps dates beyond the horizon', () => {
    expect(defaultPmBundleMaintenanceDate({
      candidate: '2026-11-02T00:00:00.000Z',
      windowStart: '2026-10-30T18:00:00.000Z',
      windowEnd: '2026-11-06T18:00:00.000Z',
    })).toBe('2026-11-02');

    expect(defaultPmBundleMaintenanceDate({
      candidate: '2026-11-20T00:00:00.000Z',
      windowStart: '2026-10-30T18:00:00.000Z',
      windowEnd: '2026-11-06T18:00:00.000Z',
    })).toBe('2026-11-06');
  });
});
