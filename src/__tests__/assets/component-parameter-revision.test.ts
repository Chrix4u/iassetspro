import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { assertPointRevisionAllowed, hasPermanentPointEvidence, parameterRange, pointChanges, parameterRevisionSnapshot } from '@/lib/component-parameter-revision';
const base={id:'p-1',name:'Motor vibration',parameterKey:'vibration',inspectionType:'measurement',
  description:'OEM manual section 4',normalRange:'{"unit":"mm/s","max":4.5,"min":0}',
  _count:{records:0,pmTaskLinks:0}};
const next={key:'vibration',name:'Motor vibration',inspectionType:'measurement' as const,
  unit:'mm/s',min:0,max:4.5,reference:'OEM manual section 4'};
describe('OEM part parameter revision safety',()=>{
  it('rejects stale versions of part checkpoints without relying on row order',()=>{
    const first=parameterRevisionSnapshot([base,{...base,id:'p-2',name:'Sound'}]);
    const reordered=parameterRevisionSnapshot([{...base,id:'p-2',name:'Sound'},base]);
    expect(first).toBe(reordered);
    expect(parameterRevisionSnapshot([base])).not.toBe(first);
    expect(parameterRevisionSnapshot([{...base,normalRange:'{"min":0,"max":9,"unit":"mm/s"}'}]))
      .not.toBe(parameterRevisionSnapshot([base]));
  });
  it('ignores JSON field order and does not modify unchanged calibrated ranges',()=>{
    expect(pointChanges(base,next)).toBe(false);
    expect(parameterRange(next)).toBe('{"min":0,"max":4.5,"unit":"mm/s"}');
  });
  it('preserves legacy checkpoints whose parameter key was originally null',()=>{
    const legacy={...base,parameterKey:null,_count:{records:3,pmTaskLinks:1}};
    expect(()=>assertPointRevisionAllowed(legacy,next)).not.toThrow();
    expect(()=>assertPointRevisionAllowed(legacy,{...next,max:7})).toThrow(/controlled engineering revision/i);
  });
  it('permits unused checkpoint edits but blocks historic inspection overwrites',()=>{
    assertPointRevisionAllowed(base,{...next,max:5});
    const recorded={...base,_count:{records:1,pmTaskLinks:0}};
    expect(hasPermanentPointEvidence(recorded)).toBe(true);
    expect(()=>assertPointRevisionAllowed(recorded,next)).not.toThrow();
    expect(()=>assertPointRevisionAllowed(recorded,{...next,max:5})).toThrow(/controlled engineering revision/i);
    expect(()=>assertPointRevisionAllowed(recorded)).toThrow(/Cannot retire/i);
  });
  it('protects PM task links, including checkpoints without prior measurements',()=>{
    const linked={...base,_count:{records:0,pmTaskLinks:1}};
    expect(()=>assertPointRevisionAllowed(linked,{...next,inspectionType:'visual' as const,unit:''})).toThrow(/PM task links/i);
    expect(()=>assertPointRevisionAllowed(linked)).toThrow(/PM task links/i);
  });
  it('uses the same manufacturer parameter editor and a transactionally audited route',()=>{
    const ui=readFileSync('src/components/assets/ComponentParameterEditor.tsx','utf8');
    const page=readFileSync('src/components/modules/AssetDetailPage.tsx','utf8');
    const api=readFileSync('src/app/api/component-registry/[id]/inspections/route.ts','utf8');
    expect(ui).toContain('CommissioningParameterFields');
    expect(ui).toContain("api.patch(");
    expect(page).toContain('canEditComponentParameters');
    expect(page).toContain('<ComponentParameterEditor');
    expect(api).toContain('assertPointRevisionAllowed');
    expect(api).toContain('tx.auditLog.create');
    expect(api).toContain('Serializable');
    expect(api).toContain('getComponentPlantAccess');
    expect(api).toContain('if (!plant?.asset?.plantId)');
    expect(api).toContain('parameterRevisionSnapshot(existing) !== payload.expectedSnapshot');
    expect(ui).toContain('unsupportedMethods.length > 0');
  });
});
