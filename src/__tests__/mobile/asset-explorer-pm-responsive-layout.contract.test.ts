import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const explorer = readFileSync('src/components/digital-twin/MachineVisualExplorer.tsx', 'utf8');
const assetDetail = readFileSync('src/components/modules/AssetDetailPage.tsx', 'utf8');
const inspection = readFileSync('src/components/modules/pm/PmInspectionWorksheetPanel.tsx', 'utf8');
const portfolio = readFileSync('src/components/modules/pm/PmPortfolioCompliancePanel.tsx', 'utf8');

describe('mobile asset explorer and preventive maintenance layout', () => {
  it('eliminates 560px empty hierarchy padding and keeps desktop independently scrollable', () => {
    expect(explorer).not.toContain('h-[560px]');
    expect(explorer).toContain('max-h-[min(36dvh,280px)]');
    expect(explorer).toContain('overflow-y-auto overscroll-contain');
    expect(explorer).not.toContain('<ScrollArea');
    expect(explorer).toContain('xl:max-h-none xl:min-h-0 xl:flex-1');
  });

  it('fits the dark schematic within mobile viewport without cutting off a 900px bitmap', () => {
    expect(explorer).toContain('viewBox={`0 0 ${width} ${height}`}');
    expect(explorer).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(explorer).toContain('className="block h-full w-full origin-center');
    expect(explorer).toContain('h-[340px] w-full min-w-0 overflow-hidden');
    expect(explorer).toContain('min-w-0 px-1.5 pt-0 sm:px-6');
    expect(explorer).toContain('relative mt-2 w-full min-w-0 rounded-xl');
  });

  it('keeps both asset hierarchy actions in one mobile row', () => {
    expect(assetDetail).toContain('grid w-full min-w-0 grid-cols-2 gap-2 sm:flex sm:justify-end');
    expect(assetDetail).toContain('value="visual-explorer" className="-mx-2 mt-4 min-w-0 space-y-4 sm:mx-0"');
    expect(assetDetail).toContain('<span className="sm:hidden">Commission</span>');
    expect(assetDetail).toContain('<span className="sm:hidden">Add Item</span>');
    expect(assetDetail).toContain('Commission Hierarchy');
    expect(assetDetail).toContain('Add Hierarchy Item');
  });

  it('renders scheduled PM tasks as compact mobile rows with an accessible View details action', () => {
    expect(inspection).toContain('data-testid="pm-scheduled-compact-row"');
    expect(inspection).toContain('onClick={() => setScheduledDetail(task)}>View</Button>');
    expect(inspection).toContain('open={Boolean(scheduledDetail)}');
    expect(inspection).toContain('aria-label="Scheduled inspection assignments"');
    expect(inspection).toContain('Configure Check');
    expect(inspection).toContain('setPlanComponentId(scheduledDetail.component!.id)');
  });

  it('makes all three PM risk reports mobile-readable while retaining scrollable desktop detail tables', () => {
    expect(portfolio).toContain('data-testid="pm-department-risk-mobile"');
    expect(portfolio).toContain('data-testid="pm-machine-risk-mobile"');
    expect(portfolio).toContain('data-testid="pm-oldest-overdue-mobile"');
    expect(portfolio.match(/className="hidden max-w-full overflow-x-auto overscroll-x-contain sm:block"/g)).toHaveLength(3);
    expect(portfolio).toContain('className="min-w-[600px]"');
    expect(portfolio).toContain('className="min-w-[700px]"');
    expect(portfolio).toContain('className="min-w-[750px]"');
  });
});
