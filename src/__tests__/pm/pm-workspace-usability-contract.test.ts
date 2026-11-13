import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
describe('PM workspace usability regressions', () => {
  it('does not duplicate the Task Library navigation item', () => {
    const sidebar = source('src/components/shared/Sidebar.tsx');
    expect(sidebar.match(/page: 'pm-tasks', label: 'Task Library'/g)?.length).toBe(1);
  });
  it('keeps the library button available at the modal header only when its row has scrolled away', () => {
    const modal = source('src/components/modules/pm/PmAssignmentFormDialog.tsx');
    const planner = source('src/components/modules/pm/PmAssignmentTaskPlanner.tsx');
    expect(modal).toContain("step === 'tasks' && !libraryRowVisible");
    expect(modal).toContain('pm-assignment-sticky-add-task');
    expect(planner).toContain("row.closest('.responsive-dialog-body')");
    expect(planner).toContain('IntersectionObserver');
    expect(planner).toContain('setPickerOpen(true)');
  });
  it('opens native date and datetime picker from the entire shared input', () => {
    const input = source('src/components/ui/input.tsx');
    expect(input).toContain('event.currentTarget.showPicker?.()');
    expect(input).toContain('type === "date" || type === "datetime-local"');
    expect(input).toContain('onClick?.(event)');
  });
  it('offers compact exception rows with a real View detail modal and machine search', () => {
    const panel = source('src/components/modules/pm/PmInspectionExceptionsPanel.tsx');
    expect(panel).toContain('pm-inspection-exceptions-table');
    expect(panel).toContain('pm-inspection-exception-row');
    expect(panel).toContain('<ExceptionDetails record={selected} />');
    expect(panel).toContain('Filter inspection exceptions by machine');
    expect(panel).toContain("params.set('assetId', assetId || filters.machineId)");
  });
  it('provides optional grid and table trigger views with compact actions', () => {
    const triggerPage = source('src/components/modules/PmTriggersPage.tsx');
    expect(triggerPage).toContain("viewMode === 'table'");
    expect(triggerPage).toContain('pm-trigger-table-row');
    expect(triggerPage).toContain('gap-0.5');
    expect(triggerPage).toContain('h-7 w-7');
  });
  it('explains Scheduled Checks, machine bundles, forward planning and compliance in detail', () => {
    const guide = source('src/lib/pm-guide-pages.ts');
    for (const topic of ['Scheduled Inspection Tasks', 'Machine Planning & Work Bundles', 'PM Forward Planning', 'Maintenance Compliance']) {
      expect(guide).toContain(topic);
    }
    expect(source('src/components/modules/pm/PmPageGuideAssistant.tsx')).toContain('pm-guide-details');
  });
});
