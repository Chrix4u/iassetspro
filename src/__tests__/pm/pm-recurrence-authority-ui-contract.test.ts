import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/components/modules/MaintenancePages.tsx'),
  'utf8',
);

describe('PM recurrence authority UI contract', () => {
  it('uses persisted authority rather than Scheduled Task row presence for edit mode', () => {
    expect(source).toContain("editItem.recurrenceAuthority !== 'task'");
    expect(source).not.toContain("editItem && (!Array.isArray(editItem.scheduledTasks) || editItem.scheduledTasks.length === 0)");
  });

  it('uses persisted authority for due-date aggregation and schedule labels', () => {
    expect(source).toContain("schedule.recurrenceAuthority === 'task'");
    expect(source).toContain("s.recurrenceAuthority === 'task'");
    expect(source).toContain("viewItem.recurrenceAuthority === 'task'");
  });

  it('keeps task-authority detail counts null-safe and never turns the authority boolean into a task count', () => {
    expect(source).toContain('viewItem.scheduledTasks?.length ?? 0');
    expect(source).toContain('(viewItem.scheduledTasks || []).map');
    expect(source).not.toContain("viewItem.recurrenceAuthority === 'task' ??");
  });

  it('does not advertise task-level generation as staged or pending after the engines shipped', () => {
    expect(source).not.toContain('Staged · task engines pending');
    expect(source).not.toContain('Legacy automatic generation stays disabled until the dedicated TBM/UBM/CBM task engines are released.');
    expect(source).toContain('When each task becomes due');
    expect(source).toContain('Each task is evaluated independently. Recurrence advances only after verified planner closeout');
  });
});
