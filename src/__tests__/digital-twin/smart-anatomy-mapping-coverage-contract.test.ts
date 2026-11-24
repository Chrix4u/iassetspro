import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const viewer=readFileSync('src/components/digital-twin/DigitalTwinViewer.tsx','utf8');
const explorer=readFileSync('src/components/digital-twin/MachineVisualExplorer.tsx','utf8');
const suggestion=readFileSync('src/components/digital-twin/anatomyMappingSuggestions.ts','utf8');

describe('Smart Anatomy review-before-linking workflow',()=>{
  it('passes only real imported source nodes and source model identity into the inspector',()=>{
    expect(viewer).toContain('onAnatomyMeshList?: (meshes: ImportedAnatomyMesh[], modelId?: string) => void;');
    expect(viewer).toContain('onAnatomyMeshList?.(next, previewAssetModelId || currentScene?.modelId)');
    expect(explorer).toContain('onAnatomyMeshList={onAnatomyMeshList}');
    expect(explorer).toContain('suggestAnatomyMappings(importedAnatomy, components)');
  });

  it('never directly writes a candidate into the maintenance database',()=>{
    expect(suggestion).not.toContain('fetch(');
    expect(suggestion).not.toContain('db.');
    expect(suggestion).not.toContain('api.');
    expect(explorer).toContain('Review proposed link');
    expect(explorer).toContain('setAnatomyTargetId(candidate.target.id)');
    expect(explorer).toContain('setInspectedAnatomy({...candidate.mesh,modelId:importedAnatomyModelId})');
    expect(explorer).toContain('mapInspectedAnatomy()');
    expect(explorer).toContain('canLinkAnatomy');
    expect(explorer).toContain('Suggestions compare source names to registered codes/descriptions');
  });

  it('bounds the list, keeps the scroll independent and clears stale model suggestions',()=>{
    expect(explorer).toContain('anatomyCoverage.candidates.slice(0,50)');
    expect(explorer).toContain('max-h-64 space-y-2 overflow-y-auto');
    expect(explorer).toContain('setImportedAnatomy([])');
    expect(explorer).toContain('setImportedAnatomyModelId(undefined)');
    expect(explorer).toContain('data-testid="smart-anatomy-mapping-coverage"');
  });
});
