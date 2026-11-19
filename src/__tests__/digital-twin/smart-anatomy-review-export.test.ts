import { describe, expect, it } from 'vitest';
import { buildAnatomyReviewCsv, safeAnatomyExportFilename } from '@/components/digital-twin/anatomyReviewExport';
import type { ImportedAnatomyMesh } from '@/components/digital-twin/anatomyBindings';

const meshes: ImportedAnatomyMesh[] = [
  {id:'bearing-1',path:'Pump/Drive/Bearing',meshName:'Bearing',selectionKey:'Pump/Drive/Bearing',
    componentId:null,assetId:null,verified:false},
  {id:'casing-1',path:'Pump/Casing',meshName:'Casing',selectionKey:'Pump/Casing',
    componentId:'component-2',assetId:'asset-1',componentCode:'CSG',verified:true},
  {id:'danger-1',path:'=HYPERLINK("https://bad.example")',meshName:'=SUM(1,2)',
    selectionKey:'=HYPERLINK',componentId:null,assetId:null,verified:false},
];

const render=()=>buildAnatomyReviewCsv({
  assetTag:'PMP-001',modelId:'model-1',reportDate:'19-11-2026',meshes,
  components:[
    {id:'component-2',componentCode:'CSG',name:'Casing'},
    {id:'component-1',componentCode:'BRG',name:'Bearing'},
  ],
  candidates:[{
    mesh:meshes[0],target:{id:'component-1',componentCode:'BRG',name:'Bearing'},
    confidence:0.95,reason:'exact-component-name',
  }],
});

describe('Smart Anatomy engineer-reviewed CAD mesh CSV export',()=>{
  it('exports one factual line per actual imported mesh in deterministic order',()=>{
    const csv=render();
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines=csv.trim().split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('Imported source mesh path');
    expect(lines[0]).toContain('Proposal text-match %');
    expect(csv).toContain('"Pump/Drive/Bearing"');
    expect(csv).toContain('"Pump/Casing"');
    expect(csv).toContain('"19-11-2026"');
  });

  it('never labels a proposed mechanical identity as engineer approved',()=>{
    const csv=render();
    expect(csv).toContain('"Proposed; requires engineering review"');
    expect(csv).toContain('"exact-component-name"');
    expect(csv).toContain('"95"');
    expect(csv).toContain('"Linked to registered component","CSG","Casing"');
    expect(csv).toContain('"Visual-only; needs manual review"');
  });

  it('escapes spreadsheet formulas, quotes and comma-bearing imported CAD labels',()=>{
    const csv=render();
    expect(csv).toContain("'=SUM(1,2)");
    expect(csv).toContain("'=HYPERLINK(");
    expect(csv).toContain('""https://bad.example""');
    expect(csv).not.toContain(',"=SUM(1,2)"');
  });

  it('sanitizes filenames without relying on raw asset tags or nonstandard dates',()=>{
    expect(safeAnatomyExportFilename('PMP/1:2','19-11-2026'))
      .toBe('iAssetsPro-CAD-Review-PMP_1_2-19-11-2026.csv');
    expect(safeAnatomyExportFilename('', '2026-11-19'))
      .toBe('iAssetsPro-CAD-Review-Machine-undated.csv');
  });

  it('produces a header-only sheet when no CAD nodes were imported',()=>{
    const csv=buildAnatomyReviewCsv({
      assetTag:'PMP-001',modelId:'model-1',reportDate:'19-11-2026',
      meshes:[],components:[],candidates:[],
    });
    expect(csv.trim().split('\r\n')).toHaveLength(1);
  });
});
