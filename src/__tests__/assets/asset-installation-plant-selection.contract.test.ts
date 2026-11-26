import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
const picker=readFileSync('src/components/assets/FunctionalLocationPicker.tsx','utf8');
const form=readFileSync('src/components/modules/AssetPages.tsx','utf8');
describe('asset installation plant selection',()=>{
  it('uses the form plant as the request scope and suppresses stale location results',()=>{
    expect(picker).toContain("headers: { 'x-plant-id': plantId }");
    expect(picker).toContain("result?.key === scopeKey ? result.locations : []");
    expect(picker).toContain('cancelled = true');
    expect(picker).toContain('location.hierarchyLevel.isActive !== false');
  });
  it('distinguishes failed requests from an empty hierarchy and provides retry',()=>{
    expect(picker).toContain('Could not load locations for the selected plant.');
    expect(picker).toContain('setRetry(n => n + 1)');
    expect(picker).toContain('No active {allowAssetAssignmentOnly');
    expect(picker).toContain('disabled={disabled || loading || failed || options.length === 0}');
  });
  it('clears incompatible department and location selections and scopes department reads',()=>{
    expect(form).toContain("plantId: v, departmentId: '', functionalLocationId: ''");
    expect(form).toContain('deps={[form.plantId]}');
    expect(form).toContain('/api/departments?plantId=');
    expect(form).toContain("headers: { 'x-plant-id': form.plantId }");
    expect(form).toContain('disabled={saving || locationAssignmentLoading}');
  });
});
