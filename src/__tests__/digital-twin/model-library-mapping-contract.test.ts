import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const modelService = fs.readFileSync('src/services/modelPipeline.service.ts', 'utf8');
const mappingService = fs.readFileSync('src/services/componentMapping.service.ts', 'utf8');
const modelRoute = fs.readFileSync('src/app/api/model-library/route.ts', 'utf8');
const modelItemRoute = fs.readFileSync('src/app/api/model-library/[id]/route.ts', 'utf8');
const mappingRoute = fs.readFileSync('src/app/api/mesh-mappings/route.ts', 'utf8');
const mappingItemRoute = fs.readFileSync('src/app/api/mesh-mappings/[id]/route.ts', 'utf8');
const modelManager = fs.readFileSync('src/components/digital-twin/ModelManagerPanel.tsx', 'utf8');
const mappingEditor = fs.readFileSync('src/components/digital-twin/ComponentMappingEditor.tsx', 'utf8');

describe('enterprise digital twin model/mapping contracts', () => {
  it('uses the current PostgreSQL ModelLibrary schema rather than the removed threeDModel delegate', () => {
    expect(modelService).toContain('db.modelLibrary.findMany');
    expect(modelService).toContain('db.modelLibrary.create');
    expect(modelService).toContain('originalFile');
    expect(modelService).toContain('storedPath');
    expect(modelService).toContain('_count: { select: { scenes: true, versions: true } }');
    expect(modelService).not.toContain('db.threeDModel');
  });

  it('plant-scopes model library list/create/direct operations', () => {
    expect(modelRoute).toContain('getPlantScope(req, session)');
    expect(modelRoute).toContain('canAccessPlantStrict(plantScope, requestedPlantId)');
    expect(modelRoute).toContain('plantIds:');
    expect(modelItemRoute).toContain('modelPlantId');
    expect(modelItemRoute).toContain('canAccessPlantStrict(plantScope, modelPlantId(');
  });

  it('uses the current MeshComponentMapping schema and exposes type counts', () => {
    expect(mappingService).toContain('meshName: string');
    expect(mappingService).toContain('targetId: string');
    expect(mappingService).toContain('db.meshComponentMapping.groupBy');
    expect(mappingService).toContain('typeCounts:');
    expect(mappingService).not.toContain('meshId: string');
    expect(mappingService).not.toContain('componentId?: string');
    expect(mappingService).not.toContain('confidence?: number');
  });

  it('authorizes mappings through their model and validates component targets', () => {
    expect(mappingRoute).toContain('loadAuthorizedModel');
    expect(mappingRoute).toContain('validateComponentTarget');
    expect(mappingRoute).toContain('Component target does not belong to the model asset');
    expect(mappingItemRoute).toContain('authorizeMapping');
    expect(mappingItemRoute).toContain('existing.model.assetId');
  });

  it('aligns UI response handling and write controls with the API contract', () => {
    expect(modelManager).toContain('setModels(Array.isArray(res.data) ? res.data : [])');
    expect(modelManager).toContain('setStats((res.stats as Record<string, unknown> | undefined) || null)');
    expect(modelManager).toContain("hasPermission('digital_twin.manage')");
    expect(mappingEditor).toContain("await api.post('/api/mesh-mappings', { modelId, ...addForm })");
    expect(mappingEditor).toContain('setMappings(Array.isArray(res.data) ? res.data : [])');
    expect(mappingEditor).toContain("hasPermission('digital_twin.manage')");
  });
});
