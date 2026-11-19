import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const scenes = readFileSync('src/app/api/digital-twin-scenes/route.ts','utf8');
const sceneItem = readFileSync('src/app/api/digital-twin-scenes/[id]/route.ts','utf8');
const explorer = readFileSync('src/components/digital-twin/MachineVisualExplorer.tsx','utf8');

describe('Smart Anatomy engineering review to Digital Twin scene publication',()=>{
  it('denies creating Digital Twin scenes from unreviewed private CAD',()=>{
    expect(scenes).toContain("model.filePath.startsWith('/api/smart-anatomy/models/') && !model.isActive");
    expect(scenes).toContain('Private CAD must pass engineering review before attachment');
    expect(scenes.indexOf('Private CAD must pass engineering review'))
      .toBeLessThan(scenes.indexOf('const scene = await db.digitalTwinScene.create('));
    expect(scenes).toContain('model.assetId !== twin.assetId');
    expect(scenes).toContain('canAccessPlantStrict(plantScope, model.asset.plantId)');
    expect(sceneItem).toContain("model.filePath.startsWith('/api/smart-anatomy/models/') && !model.isActive");
    expect(sceneItem).toContain('Private CAD must pass engineering review before attachment');
  });

  it('only publishes approved CAD through existing twin and scene APIs',()=>{
    expect(explorer).toContain('!selectedModel?.isActive');
    expect(explorer).toContain('canLinkAnatomy');
    expect(explorer).toContain("api.post<{id:string;name:string}>('/api/digital-twins'");
    expect(explorer).toContain("api.post<{id:string}>('/api/digital-twin-scenes'");
    expect(explorer).toContain('modelId:selectedModel.id');
    expect(explorer).toContain("key={twinId+'-'+twinRevision}");
    expect(explorer).toContain('setPrivateCadModel(null)');
  });
});
