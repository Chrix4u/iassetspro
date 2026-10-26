import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = fs.readFileSync('src/components/modules/MaintenancePages.tsx', 'utf8');
const start = page.indexOf('export function PmSchedulesPage()');
const end = page.indexOf('export function MaintenanceDashboardPage()', start);
const schedulePage = page.slice(start, end > start ? end : page.length);

describe('PM schedule automatic-generation UI contract', () => {
  it('uses one common automatic-generation control for legacy and task-level schedules', () => {
    expect(schedulePage).toContain('Auto-generate Work Orders');
    expect(schedulePage).not.toContain('Legacy Auto-generate Work Order');
    expect(schedulePage).toContain('checked={formAutoGenWO}');
    expect(schedulePage).toContain('onCheckedChange={setFormAutoGenWO}');
  });

  it('submits the automation choice for task-level and legacy schedule saves', () => {
    expect(schedulePage).toContain('autoGenerateWO: formAutoGenWO');
    const occurrences = schedulePage.split('autoGenerateWO: formAutoGenWO').length - 1;
    expect(occurrences).toBe(1);
    const payloadStart = schedulePage.indexOf('const payload: any = {');
    const automationField = schedulePage.indexOf('autoGenerateWO: formAutoGenWO', payloadStart);
    const modelSpecificBranch = schedulePage.indexOf('if (isLegacyScheduleEdit)', payloadStart);
    expect(payloadStart).toBeGreaterThan(-1);
    expect(automationField).toBeGreaterThan(payloadStart);
    expect(automationField).toBeLessThan(modelSpecificBranch);
  });
});
