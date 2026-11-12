import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const planningSource = readFileSync(resolve(process.cwd(), 'src/components/modules/pm/PmPlanningPage.tsx'), 'utf8');
const machineRollupSource = readFileSync(resolve(process.cwd(), 'src/components/modules/pm/PmMachineRollupPanel.tsx'), 'utf8');

describe('PM portfolio compliance planning composition', () => {
  it('prioritizes inspection Action Lists, then machine scheduling and assigned tasks before optional portfolio reports', () => {
    expect(planningSource).toContain("import { PmPortfolioCompliancePanel } from '@/components/modules/pm/PmPortfolioCompliancePanel';");
    const rollupIndex = planningSource.indexOf('<PmMachineRollupPanel />');
    const inspectionIndex = planningSource.indexOf('<PmInspectionWorksheetPanel />');
    const targetListIndex = planningSource.indexOf('<PmAssignmentTargetList groups=');
    const reportsIndex = planningSource.indexOf('data-testid="pm-more-planning-reports"');
    const portfolioIndex = planningSource.indexOf('<PmPortfolioCompliancePanel />');
    expect(rollupIndex).toBeGreaterThan(-1);
    expect(rollupIndex).toBeGreaterThan(inspectionIndex);
    expect(targetListIndex).toBeGreaterThan(rollupIndex);
    expect(reportsIndex).toBeGreaterThan(targetListIndex);
    expect(portfolioIndex).toBeGreaterThan(reportsIndex);
    expect(planningSource).toContain('{showReports && <div');
  });

  it('does not wrap or restructure the machine roll-up component to add portfolio intelligence', () => {
    expect(machineRollupSource).not.toContain('PmPortfolioCompliancePanel');
  });
});
