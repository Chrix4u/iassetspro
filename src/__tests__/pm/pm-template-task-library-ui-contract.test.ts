import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
const picker = read('src/components/modules/pm/PmTemplateTaskPickerDialog.tsx');
const list = read('src/components/modules/pm/PmTemplateTaskList.tsx');
const form = read('src/components/modules/pm/PmTaskFormDialog.tsx');
const bulk = read('src/components/modules/pm/PmTaskBulkDialog.tsx');
const page = read('src/components/modules/MaintenancePages.tsx');

describe('PM template Task Library UX contract', () => {
  it('selects existing active Task Masters with search and discipline filtering', () => {
    expect(picker).toContain('Select Existing Tasks');
    expect(picker).toContain('Search by Task Number or description');
    expect(picker).toContain('Task Type');
    expect(picker).toContain("params.set('active', 'true')");
    expect(picker).toContain("params.set('search', search.trim())");
    expect(picker).toContain("params.set('type', taskType)");
    expect(picker).toContain('api.get<PmTaskPickerRecord[]>');
    expect(picker).toContain('`/api/pm-tasks?${params.toString()}`');
    expect(picker).toContain('selectedTaskIds');
    expect(picker).toContain('onConfirm');
  });

  it('returns created Task Master records from single and bulk Task Library dialogs', () => {
    expect(form).toContain('onSaved: (task: PmTaskFormRecord)');
    expect(form).toContain('await onSaved(response.data as PmTaskFormRecord)');
    expect(bulk).toContain('PmTaskFormRecord[]');
    expect(bulk).toContain('await onSaved(created)');
  });

  it('renders stable Task identity, association sequence, discipline, and legacy status', () => {
    expect(list).toContain('Task #');
    expect(list).toContain('masterTaskNumber');
    expect(list).toContain('sequence');
    expect(list).toContain('discipline');
    expect(list).toContain('Legacy');
    expect(list).toContain('Add to Task Library');
    expect(list).toContain('Remove from Template');
  });

  it('reorders association ids with pointer, touch, and keyboard DnD without editing Task Numbers', () => {
    for (const token of ['DndContext', 'PointerSensor', 'TouchSensor', 'KeyboardSensor', 'SortableContext', 'arrayMove']) {
      expect(list).toContain(token);
    }
    expect(list).toContain('associationIds');
    expect(list).toContain('onReorder');
    expect(list).not.toContain('taskNumber: index');
    expect(list).not.toContain('masterTaskNumber: index');
  });

  it('uses the four approved disciplines for explicit legacy conversion', () => {
    expect(list).toContain('PM_TASK_TYPES');
    expect(list).toContain('onConvertLegacy');
    expect(list).toContain('taskType');
  });

  it('integrates select/create/bulk/reorder/convert/remove actions into PM Templates', () => {
    for (const token of [
      'PmTemplateTaskPickerDialog', 'PmTemplateTaskList', 'PmTaskFormDialog', 'PmTaskBulkDialog',
      'setTemplateTaskPickerOpen(true)', 'setTemplateTaskCreateOpen(true)', 'setTemplateTaskBulkOpen(true)',
      'taskIds:', 'associationIds:', 'convertLegacy:',
    ]) expect(page).toContain(token);
    expect(page).toContain('Select Existing Tasks');
    expect(page).toContain('Add New Task');
    expect(page).toContain('Add Multiple Tasks');
  });
});
