import { describe, expect, it } from 'vitest';
import { suggestAnatomyMappings } from '@/components/digital-twin/anatomyMappingSuggestions';
import type { ImportedAnatomyMesh } from '@/components/digital-twin/anatomyBindings';

const mesh = (name:string,path:string,linked=false):ImportedAnatomyMesh => ({
  id:path,meshName:name,path,selectionKey:path,
  componentId:linked?'comp-100':null,assetId:linked?'asset-1':null,verified:linked,
});
const components = [
  {id:'c1',componentCode:'IMP-104',name:'Primary Impeller'},
  {id:'c2',componentCode:'BEARING-2',name:'Drive Bearing'},
  {id:'c3',componentCode:'SHAFT-03',name:'Main Pump Shaft'},
];

describe('Smart Anatomy engineering-review mapping suggestions', () => {
  it('matches explicit part codes with high confidence but never writes approvals',()=>{
    const result=suggestAnatomyMappings([mesh('IMP-104','Drive/IMP-104')],components);
    expect(result.total).toBe(1);
    expect(result.candidates[0]?.target.id).toBe('c1');
    expect(result.candidates[0]?.reason).toBe('exact-part-code');
    expect(result.candidates[0]?.confidence).toBe(0.99);
    expect(result.linked).toBe(0);
  });

  it('compares normalized component names and ignores arbitrary scene path matches',()=>{
    const result=suggestAnatomyMappings([
      mesh('Main-Pump_Shaft','Main Pump Shaft/System/Main-Pump_Shaft'),
      mesh('Unrelated part','Main Pump Shaft/System/Unrelated part'),
    ],components);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.target.id).toBe('c3');
    expect(result.unmatched).toBe(1);
  });

  it('refuses ambiguous repeated component descriptions',()=>{
    const same=[
      {id:'bearing1',componentCode:'BRG-A',name:'Bearing'},
      {id:'bearing2',componentCode:'BRG-B',name:'Bearing'},
    ];
    const result=suggestAnatomyMappings([mesh('Bearing','Casing/Bearing')],same);
    expect(result.candidates).toHaveLength(0);
    expect(result.ambiguous).toBe(1);
  });

  it('does not treat one generic shared term as a confident mapping',()=>{
    const result=suggestAnatomyMappings([
      mesh('Bearing A','Pump/Drive/Bearing A'),
      mesh('Part 01','Housing/Part 01'),
    ],components);
    expect(result.candidates).toHaveLength(0);
    expect(result.unmatched).toBe(2);
  });

  it('treats already verified mesh records as linked and excludes them from suggestions',()=>{
    const result=suggestAnatomyMappings([
      mesh('IMP-104','Drive/IMP-104',true),
      mesh('BEARING-2','Drive/BEARING-2'),
    ],components);
    expect(result.linked).toBe(1);
    expect(result.visualOnly).toBe(1);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.target.id).toBe('c2');
  });
});
