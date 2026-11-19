import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const route = readFileSync('src/app/api/model-library/[id]/jobs/route.ts', 'utf8');

describe('CAD processing job visibility and tenant isolation', () => {
  it('requires a valid session and explicit Digital Twin view permission', () => {
    expect(route).toContain('getSession(req)');
    expect(route).toContain("hasPermission(session, 'digital_twin.view')");
    expect(route).toContain("isAdmin(session)");
    expect(route).toContain('status: 401');
    expect(route).toContain('status: 403');
  });

  it('checks plant permissions and model existence before reading processing jobs', () => {
    expect(route).toContain('getPlantScope(req, session)');
    expect(route).toContain('canAccessPlantStrict(plantScope, effectivePlantId)');
    expect(route).toContain('assetPlantId !== model.plantId');
    expect(route).toContain('status: 404');
    expect(route.indexOf('canAccessPlantStrict(plantScope, effectivePlantId)'))
      .toBeLessThan(route.indexOf('modelPipelineService.getModelJobs(id)'));
  });

  it('does not expose raw database or storage errors to clients', () => {
    expect(route).not.toContain('error.message ||');
    expect(route).toContain('Failed to get model processing jobs');
  });
});
