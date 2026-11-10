import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const panel = readFileSync('src/components/modules/pm/PmMachineInspectionChecklistPanel.tsx', 'utf8');
const sheet = readFileSync('src/components/modules/pm/PmMachineInspectionPrint.tsx', 'utf8');
const api = readFileSync('src/app/api/pm-inspections/[pointId]/records/route.ts', 'utf8');

describe('PM field visits: printed and electronic entry must agree', () => {
  it('lets the planner issue dated early visits and keeps actual PM due visible on paper', () => {
    expect(panel).toContain('aria-label="Planned field inspection date"');
    expect(panel).toContain('<SelectItem value="early_check">Early condition inspection</SelectItem>');
    expect(panel).toContain('plannedForDate, purpose: inspectionPurpose');
    expect(sheet).toContain('pm-print-planned-date');
    expect(sheet).toContain('Scheduled PM due:');
    expect(sheet).toContain('This visit does not generate,');
  });

  it('lets technicians report impossible standstill measurements without inventing zero', () => {
    expect(panel).toContain('value="not_measured">Not measurable — explain why');
    expect(panel).toContain("value === 'not_measured' ? { value: '' }");
    expect(api).toContain("if (notMeasured) {");
    expect(api).toContain("inspectionMayAdvanceDue(purpose, inspection.outcome)");
  });
});
