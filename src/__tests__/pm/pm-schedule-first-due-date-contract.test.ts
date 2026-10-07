import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const collection = fs.readFileSync('src/app/api/pm-schedules/route.ts', 'utf8');

describe('PM schedule first due date contract', () => {
  it('derives a first calendar due date when the planner leaves it blank', () => {
    expect(collection).toContain('calculateNextDueDate');
    expect(collection).toContain('normalizedNextDueDate ?? calculateNextDueDate(');
    expect(collection).toContain('normalizedLastCompletedDate ?? new Date()');
    expect(collection).toContain('frequencyType');
    expect(collection).toContain('normalizedFrequencyValue');
  });

  it('keeps usage-based schedules out of calendar due state', () => {
    expect(collection).toContain('isAutoCalculableFrequency(frequencyType)');
    expect(collection).toContain(': null;');
  });
});
