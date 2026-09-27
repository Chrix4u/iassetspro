import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const due = fs.readFileSync('src/app/api/pm-schedules/check-due/route.ts', 'utf8');
const cron = fs.readFileSync('src/app/api/pm-schedules/check-due-cron/route.ts', 'utf8');
const close = fs.readFileSync('src/services/workOrderClosure.service.ts', 'utf8');

describe('PM cadence advances only after completed maintenance', () => {
  it('does not mark PM completed or advance due date when generating a work order', () => {
    for (const source of [due, cron]) {
      expect(source).not.toContain('lastCompletedDate: nextDueDate');
      expect(source).not.toContain('nextDueDate: newNextDueDate');
      expect(source).not.toContain('calculateNextDueDate(');
      expect(source).toContain('Generation does not mark maintenance as completed');
    }
  });

  it('retains planner closure as the cadence advancement authority', () => {
    expect(close).toContain('calculateNextDueDate(');
    expect(close).toContain('lastCompletedDate: pmCompletedAt');
    expect(close).toContain('nextDueDate');
    expect(close).toContain('PM WO');
  });
});
