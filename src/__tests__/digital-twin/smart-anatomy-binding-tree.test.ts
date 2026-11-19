import { describe, expect, it } from 'vitest';
import { buildImportedAnatomyTree, matchImportedMeshBinding, type ImportedAnatomyMesh } from '@/components/digital-twin/anatomyBindings';

const binding = (meshName: string, meshPath?: string) => ({
  meshName, meshPath, assetId: 'pump-1', assetName: 'Pump',
  componentId: 'part-1', componentCode: 'IMP-1',
});

describe('Smart Anatomy exact CAD paths', () => {
  it('links duplicate raw names only through explicit independent source paths', () => {
    const bindings = [binding('Pump/Impeller[1]', 'Pump/Impeller[1]'), binding('Pump/Impeller[2]', 'Pump/Impeller[2]')];
    expect(matchImportedMeshBinding('Impeller', 'Pump/Impeller[1]', true, bindings)?.meshName).toBe('Pump/Impeller[1]');
    expect(matchImportedMeshBinding('Impeller', 'Pump/Impeller[2]', true, bindings)?.meshName).toBe('Pump/Impeller[2]');
    expect(matchImportedMeshBinding('Impeller', 'Pump/Impeller[3]', true, bindings)).toBeUndefined();
  });

  it('never lets a legacy name binding or mismatched node path bind to the wrong component', () => {
    expect(matchImportedMeshBinding('Rotor', 'Pump/Rotor[2]', true, [binding('Rotor')])).toBeUndefined();
    expect(matchImportedMeshBinding('Rotor', 'Pump/Rotor', false,
      [binding('Rotor', 'Other/Rotor')])).toBeUndefined();
    expect(matchImportedMeshBinding('Rotor', 'Pump/Rotor', false,
      [binding('Rotor')])?.componentId).toBe('part-1');
  });

  it('builds a genuine nested CAD assembly tree retaining mapped and unmapped statuses', () => {
    const meshes: ImportedAnatomyMesh[] = [
      {id:'1',path:'Pump/Drive/Shaft',meshName:'Shaft',selectionKey:'Shaft',componentId:'part-1',assetId:'pump-1',verified:true},
      {id:'2',path:'Pump/Drive/Bearing',meshName:'Bearing',selectionKey:'Pump/Drive/Bearing',componentId:null,assetId:null,verified:false},
      {id:'3',path:'Pump/Casing',meshName:'Casing',selectionKey:'Casing',componentId:null,assetId:null,verified:false},
    ];
    const tree=buildImportedAnatomyTree(meshes);
    expect(tree).toHaveLength(1);
    expect(tree[0].children.map(c=>c.name)).toEqual(['Drive','Casing']);
    expect(tree[0].children[0].children.map(c=>c.mesh?.selectionKey)).toEqual(['Shaft','Pump/Drive/Bearing']);
  });
});
