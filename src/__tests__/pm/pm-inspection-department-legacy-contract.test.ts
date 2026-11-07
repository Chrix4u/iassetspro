import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const pointRoute = source('src/app/api/pm-inspections/route.ts');
const scheduledRoute = source('src/app/api/pm-inspections/scheduled/route.ts');
const worksheet = source('src/components/modules/pm/PmInspectionWorksheetPanel.tsx');

describe('PM inspection department and legacy-method safeguards', () => {
  it('combines department filtering with the existing plant access boundary', () => {
    expect(pointRoute).toContain("const departmentId = q.get('departmentId')?.trim()");
    expect(pointRoute).toContain('if (departmentId) assetWhere.departmentId = departmentId');
    expect(pointRoute).toContain('else if (!scope.isSystemWide)');
    expect(pointRoute).toContain('where.component = { asset: { is: assetWhere } }');
    expect(scheduledRoute).toContain('if (departmentId) assetWhere.departmentId = departmentId');
    expect(scheduledRoute).toContain('if (!scope.isSystemWide)');
    expect(scheduledRoute).toContain('if (Object.keys(assetWhere).length > 0) where.asset = assetWhere');
  });

  it('applies department selection to both point and scheduled-task lists', () => {
    expect(worksheet).toContain("departmentId: ''");
    expect(worksheet).toContain("scheduledParams.set('departmentId', filters.departmentId)");
    expect(worksheet).toContain("params.set('departmentId', filters.departmentId)");
    expect(worksheet).toContain('fetchOptions={fetchDepartments}');
    expect(worksheet).toContain("...('departmentId' in patch ? { assetId: '', componentId: '' }");
  });

  it('does not misrepresent an unsupported legacy method as a recordable sight inspection', () => {
    expect(worksheet).toContain('Legacy (${point.inspectionType})');
    expect(worksheet).toContain("point.inspectionType === 'visual' || point.inspectionType === 'measurement'");
    expect(worksheet).toContain('This legacy method cannot be recorded in the sight/instrument worksheet.');
    expect(worksheet).toContain('Configure Sight / Instrument');
  });
});
