import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const planningSource = read('src/components/modules/pm/PmPlanningPage.tsx');
const workspaceSource = read('src/components/modules/pm/PmWorkspacePages.tsx');
const machineRollupSource = read('src/components/modules/pm/PmMachineRollupPanel.tsx');

describe('PM portfolio compliance planning composition', () => {
  it('keeps the PM schedule overview focused on schedules and assignments, not a long inspection/report feed', () => {
    expect(planningSource).toContain("view === 'overview'");
    expect(planningSource).toContain('<PmAssignmentTargetList groups=');
    expect(planningSource).not.toContain('<PmInspectionWorksheetPanel />');
    expect(planningSource).not.toContain('<PmMachineRollupPanel />');
    expect(planningSource).not.toContain('pm-more-planning-reports');
  });

  it('moves portfolio reports, machine work bundles and Action Lists to dedicated PM workspaces', () => {
    expect(planningSource).toContain("view === 'planning'");
    expect(planningSource).toContain('<PmEnterpriseForwardPlan />');
    expect(planningSource).toContain('<PmSchedulingConflictsPanel />');
    expect(planningSource).toContain("view === 'compliance'");
    expect(planningSource).toContain('<PmPortfolioCompliancePanel />');

    expect(workspaceSource).toContain('export function PmMachinePlanningPage()');
    expect(workspaceSource).toContain('<PmMachineRollupPanel />');
    expect(workspaceSource).toContain('export function PmActionListsPage()');
    expect(workspaceSource).toContain('<PmInspectionWorksheetPanel mode="action-lists"/>');
    expect(workspaceSource).toContain('export function PmInspectionReadingsPage()');
    expect(workspaceSource).toContain('<PmGroupedReadingsPage />');
  });

  it('does not wrap or restructure the machine roll-up component to add portfolio intelligence', () => {
    expect(machineRollupSource).not.toContain('PmPortfolioCompliancePanel');
  });
});
