import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('PM usability refinements', () => {
  it('offers Add Task from Library in the header only when its original row is outside the visible scroll area', () => {
    const form = read('src/components/modules/pm/PmAssignmentFormDialog.tsx');
    const planner = read('src/components/modules/pm/PmAssignmentTaskPlanner.tsx');
    expect(form).toContain('!taskToolbarVisible');
    expect(form).toContain('pm-sticky-add-task');
    expect(form).toContain('pickerOpen={taskPickerOpen}');
    expect(planner).toContain("closest('.responsive-dialog-body')");
    expect(planner).toContain("addEventListener('scroll', checkVisibility");
    expect(planner).toContain('pm-assignment-task-toolbar');
  });

  it('uses one native date-input helper for all shared date fields', () => {
    const input = read('src/components/ui/input.tsx');
    const datetime = read('src/components/ui/datetime-picker.tsx');
    expect(input).toContain('input.showPicker()');
    expect(input).toContain('event.defaultPrevented');
    expect(input).toContain('en-GB');
    expect(datetime).not.toMatch(/<input\s+type="date"/);
  });

  it('does not duplicate Task Library in the sidebar', () => {
    const sidebar = read('src/components/shared/Sidebar.tsx');
    expect(sidebar.match(/page: 'pm-tasks', label: 'Task Library'/g)?.length).toBe(1);
  });

  it('paginates exceptions and keeps detailed readings behind a view dialog', () => {
    const panel = read('src/components/modules/pm/PmInspectionExceptionsPanel.tsx');
    expect(panel).toContain('limit: \'25\'');
    expect(panel).toContain('pm-exceptions-table-wrapper');
    expect(panel).toContain('setSelectedRecord(record)');
    expect(panel).toContain('<ExceptionDetails record={selectedRecord}/>');
    expect(panel).toContain("params.set('assetId', assetId || filters.machine)");
    expect(panel).toContain('AsyncSearchableSelect');
  });

  it('switches trigger layouts while preserving controlled actions and permissions', () => {
    const page = read('src/components/modules/PmTriggersPage.tsx');
    expect(page).toContain('setViewMode');
    expect(page).toContain('pm-triggers-table');
    expect(page).toContain('viewMode === \'grid\'');
    expect(page).toContain('canEdit');
    expect(page).toContain('canDelete');
  });

  it('includes practical PM guide examples, meaning and safety context', () => {
    const guide = read('src/lib/pm-guide-pages.ts');
    const component = read('src/components/modules/pm/PmPageGuideAssistant.tsx');
    expect(guide).toContain('Scheduled Inspection Tasks');
    expect(guide).toContain('PM Compliance');
    expect(guide).toContain('example:');
    expect(guide).toContain('caution:');
    expect(component).toContain('guide.details.map');
    expect(component).toContain('guide.example');
  });
});
