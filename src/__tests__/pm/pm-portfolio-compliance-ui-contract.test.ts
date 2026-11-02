import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const planningSource = readFileSync(resolve(process.cwd(), 'src/components/modules/pm/PmPlanningPage.tsx'), 'utf8');
const machineRollupSource = readFileSync(resolve(process.cwd(), 'src/components/modules/pm/PmMachineRollupPanel.tsx'), 'utf8');

describe('PM portfolio compliance planning composition', () => {
  it('keeps portfolio intelligence above machine roll-up and the target schedule list', () => {
    expect(planningSource).toContain("import { PmPortfolioCompliancePanel } from '@/components/modules/pm/PmPortfolioCompliancePanel';");
    const portfolioIndex = planningSource.indexOf('<PmPortfolioCompliancePanel />');
    const rollupIndex = planningSource.indexOf('<PmMachineRollupPanel />');
    const targetListIndex = planningSource.indexOf('<PmAssignmentTargetList groups=');
    expect(portfolioIndex).toBeGreaterThan(-1);
    expect(rollupIndex).toBeGreaterThan(portfolioIndex);
    expect(targetListIndex).toBeGreaterThan(rollupIndex);
  });

  it('does not wrap or restructure the machine roll-up component to add portfolio intelligence', () => {
    expect(machineRollupSource).not.toContain('PmPortfolioCompliancePanel');
  });
});
