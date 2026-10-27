import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const cardSource = readFileSync(resolve(process.cwd(), 'src/components/modules/pm/PmScheduleTaskCard.tsx'), 'utf8');

describe('PM meter frequency schedule form UX', () => {
  it('uses compact planner-facing labels and an explicit calendar due-date control', () => {
    expect(cardSource).toContain('>Value / Interval</Label>');
    expect(cardSource).toContain('>Est. Minutes</Label>');
    expect(cardSource).toContain('>Next Due Date</Label>');
    expect(cardSource).toContain("type={usesSubDayTime ? 'datetime-local' : 'date'}");
  });

  it('derives meter frequency units from the selected asset meter', () => {
    expect(cardSource).toContain("task.frequencyType === 'meter' ? 'Meter / Unit' : 'Frequency Unit'");
    expect(cardSource).toContain('frequencyUnit: meter.unit');
    expect(cardSource).toContain('meterOptions.length === 1');
    expect(cardSource).toContain('selectedMeter.value + intervalValue');
    expect(cardSource).toContain('Next due');
  });
});
