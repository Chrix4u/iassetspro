import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
const pipeline = fs.readFileSync('src/services/modelPipeline.service.ts', 'utf8');
const modelCollection = fs.readFileSync('src/app/api/model-library/route.ts', 'utf8');
const modelItem = fs.readFileSync('src/app/api/model-library/[id]/route.ts', 'utf8');
const mappingCollection = fs.readFileSync('src/app/api/mesh-mappings/route.ts', 'utf8');
const mappingItem = fs.readFileSync('src/app/api/mesh-mappings/[id]/route.ts', 'utf8');

describe('enterprise model library and mapping safety contract', () => {
  it('uses the current PostgreSQL ModelLibrary schema instead of the removed ThreeDModel delegate', () => {
    expect(schema).toContain('model ModelLibrary {');
    expect(pipeline).not.toContain('db.threeDModel');
    expect(pipeline).toContain('db.modelLibrary');
    expect(pipeline).toContain('modelProcessingJobs');
    expect(pipeline).toContain('originalFile');
    expect(pipeline).toContain('storedPath');
  });

  it('plant-scopes model-library list and create operations', () => {
    expect(modelCollection).toContain('getPlantScope(req, session)');
    expect(modelCollection).toContain('canAccessPlantStrict(plantScope, requestedPlantId)');
    expect(modelCollection).toContain('canAccessPlantStrict(plantScope, asset.plantId)');
    expect(modelCollection).toContain('plantIds,');
  });

  it('checks plant access before direct model reads, updates, and deletes', () => {
    expect(modelItem).toContain('getPlantScope(req, session)');
    expect(modelItem).toContain('canAccessPlantStrict(plantScope, modelPlantId(');
    expect(modelItem.match(/error: 'Access denied'/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('plant-scopes mesh mapping access through the owning model and validates component targets', () => {
    expect(mappingCollection).toContain('loadAuthorizedModel');
    expect(mappingCollection).toContain('canAccessPlantStrict(plantScope, plantId)');
    expect(mappingCollection).toContain("mapping.mappingType !== 'component'");
    expect(mappingCollection).toContain('targetAssetId !== model.assetId');
    expect(mappingItem).toContain('authorizeMapping');
    expect(mappingItem).toContain('canAccessPlantStrict(plantScope, modelPlantId)');
  });
});
