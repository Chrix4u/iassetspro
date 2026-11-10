import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
const maintenanceSource = read('src/components/modules/MaintenancePages.tsx');
const assignmentSource = read('src/components/modules/pm/PmAssignmentFormDialog.tsx');
const targetSource = read('src/components/modules/pm/PmTargetTreePicker.tsx');
const planningSource = read('src/components/modules/pm/PmPlanningPage.tsx');
const targetListSource = read('src/components/modules/pm/PmAssignmentTargetList.tsx');
const detailSource = read('src/components/modules/pm/PmAssignmentTargetDetailDialog.tsx');

describe('PM schedule exact hierarchy targeting contract', () => {
  it('uses server-side asset search and paginates through all accessible matches', () => {
    expect(assignmentSource).toContain('const fetchAssets = async (query: string) => {');
    expect(assignmentSource).toContain('let page = 1;');
    expect(assignmentSource).toContain("api.get(`/api/assets?search=${encodeURIComponent(query)}&page=${page}&limit=100`)");
    expect(assignmentSource).toContain('response.pagination?.totalPages');
    expect(assignmentSource).toContain('while (page <= totalPages)');
    expect(assignmentSource).toContain('setAssetCache((current) => ({ ...current, ...next }))');
    expect(assignmentSource).toContain('onValueChange={changeAsset}');
    expect(assignmentSource).toContain('setComponentId(null);');
  });

  it('keeps the main PM form bounded and moves hierarchy selection into the visual explorer', () => {
    expect(assignmentSource).toContain('size="extra-wide"');
    expect(targetSource).toContain('Choose PM Target');
    expect(targetSource).toContain('size="explorer"');
    expect(targetSource).toContain('<MachineVisualExplorer');
    expect(targetSource).toContain('selectionMode');
    expect(targetSource).toContain('onSelectionChange={setDraft}');
    expect(targetSource).toContain('draft.component?.id || null');
    expect(targetSource).toContain('Use Selected Target');
  });

  it('keeps View universally available and opens the target-level read-only detail dialog', () => {
    expect(targetListSource).toContain('onSelect={() => onView(group)}');
    expect(targetListSource).toContain('<DropdownMenuItem onSelect={() => onView(group)}>');
    expect(targetListSource).toContain('<Eye');
    expect(planningSource).toContain('onView={setViewTarget}');
    expect(planningSource).toContain('<PmAssignmentTargetDetailDialog');
    expect(detailSource).toContain("title={group ? `PM Schedule · ${group.targetName}` : 'PM Schedule'}");
    expect(detailSource).toContain('Frequency Type');
    expect(detailSource).toContain('Estimated Minutes');
  });

  it('preserves the direct-assignment asset, Task Library and exact-target browser contracts', () => {
    const scenario = read('e2e/repairs/scenario-n-frontend-hierarchy-pm.spec.ts');

    expect(assignmentSource).toContain('searchPlaceholder="Search asset name or tag..."');
    expect(assignmentSource).toContain('searchPlaceholder="Search PM templates..."');
    expect(assignmentSource).toContain('PmAssignmentTaskPlanner');
    expect(assignmentSource).toContain("'New PM Assignment'");
    expect(scenario).toContain("getByRole('button', { name: /Add PM Schedule/i })");
    expect(scenario).toContain("page.getByPlaceholder('Search asset name or tag...')");
    expect(scenario).toContain("page.getByPlaceholder('Search PM templates...')");
    expect(scenario).toContain('expandParentCode?: string');
    expect(scenario).toContain("filter({ hasText: expandParentCode }).first()");
    expect(scenario).toContain("getByRole('button', { name: 'Use Selected Target', exact: true })");
    expect(scenario).toContain('/api/pm-assignments?assetId=${encodeURIComponent(assetId)}');
    expect(scenario).toContain("apiCall(plannerToken, 'POST', '/api/pm-schedules'");
    expect(scenario).not.toContain("getByText('Legacy PM Schedules', { exact: true })");
    expect(maintenanceSource).toContain('PmPlanningPage');
  });
});
