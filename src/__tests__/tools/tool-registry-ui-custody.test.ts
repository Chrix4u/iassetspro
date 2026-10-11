import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src/components/modules/MaintenancePages.tsx'), 'utf8');
const start = source.indexOf('export function MaintenanceToolsPage()');
const end = source.indexOf('// ============================================================================\n// PM TEMPLATES PAGE', start);
const tools = source.slice(start, end);
const editStart = tools.indexOf('const handleEdit = async () => {');
const editEnd = tools.indexOf('const handleDelete = async () => {', editStart);
const editHandler = tools.slice(editStart, editEnd);

describe('Tool Registry custody-safe edit UI', () => {
  it('submits descriptive metadata only from Edit Tool', () => {
    expect(editHandler).not.toContain('condition: editForm.condition');
    expect(editHandler).not.toContain('status: editForm.status');
    expect(editHandler).not.toContain('plantId: editForm.plantId');
    expect(editHandler).not.toContain('assignedToId: editForm.assignedToId');
    expect(editHandler).not.toContain('quantity: parseInt(editForm.quantity)');
    expect(editHandler).toContain('purchaseCost: editForm.purchaseCost');
  });

  it('explains that custody values are workflow-managed in edit mode', () => {
    expect(tools).toContain('Custody is workflow-managed');
    expect(tools).toContain('Issue, return, repair/QC, transfer, or retirement workflows');
  });
});
