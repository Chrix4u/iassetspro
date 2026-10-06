import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calculatePmPlannedEnd } from '@/services/pm/plannedWindow.service';

const due = fs.readFileSync('src/app/api/pm-schedules/check-due/route.ts', 'utf8');
const meter = fs.readFileSync('src/services/pm/meterTriggerEngine.ts', 'utf8');
const signal = fs.readFileSync('src/services/pm/conditionProductionTriggerEngine.ts', 'utf8');
const analytics = fs.readFileSync('src/app/api/pm-analytics/route.ts', 'utf8');
const ui = fs.readFileSync('src/components/modules/MaintenancePages.tsx', 'utf8');

describe('PM planned window and compliance contract', () => {
  it('derives planned end from start plus estimated maintenance duration', () => {
    const start = new Date('2026-10-06T08:00:00.000Z');
    expect(calculatePmPlannedEnd(start, 2.5)?.toISOString()).toBe('2026-10-06T10:30:00.000Z');
    expect(calculatePmPlannedEnd(start, 0)).toBeNull();
    expect(calculatePmPlannedEnd(start, Number.NaN)).toBeNull();
  });

  it('writes plannedEnd from every automatic PM generation path', () => {
    for (const source of [due, meter, signal]) {
      expect(source).toContain('calculatePmPlannedEnd');
      expect(source).toContain('plannedEnd,');
    }
  });

  it('does not classify completed PM work with no deadline as on-time', () => {
    expect(analytics).toContain('complianceEligibleWos');
    expect(analytics).toContain('unplannedCompletedCount');
    expect(analytics).not.toContain('if (!wo.actualEnd || !wo.plannedEnd) return true');
  });

  it('shows unavailable compliance as N/A rather than a false 0 or 100 percent', () => {
    expect(ui).toContain("pmAnalytics.complianceRate == null ? 'N/A'");
  });
});
