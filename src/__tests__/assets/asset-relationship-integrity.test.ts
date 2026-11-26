import {beforeEach,describe,expect,it,vi} from 'vitest';
import {validateAssetRelationships} from '@/lib/assets/asset-relationship-integrity';
import {readFileSync} from 'node:fs';
const asset=vi.fn(),department=vi.fn();
const client={asset:{findUnique:asset},department:{findUnique:department}} as unknown as Parameters<typeof validateAssetRelationships>[0];
beforeEach(()=>vi.resetAllMocks());
describe('machine registration relationship integrity',()=>{
  it('accepts optional blank relationships',async()=>{
    expect(await validateAssetRelationships(client,{plantId:'a',departmentId:'',parentId:null})).toBeNull();
    expect(asset).not.toHaveBeenCalled();expect(department).not.toHaveBeenCalled();
  });
  it('rejects a department belonging to another plant',async()=>{
    department.mockResolvedValueOnce({plantId:'b'});
    expect(await validateAssetRelationships(client,{plantId:'a',departmentId:'foreign'})).toMatch(/department.*plant/i);
  });
  it('rejects a foreign ancestor even if the immediate parent is local',async()=>{
    asset.mockResolvedValueOnce({plantId:'a',parentId:'ancestor'}).mockResolvedValueOnce({plantId:'b',parentId:null});
    expect(await validateAssetRelationships(client,{plantId:'a',parentId:'local'})).toMatch(/parent asset.*plant/i);
  });
  it('rejects descendant reparenting',async()=>{
    asset.mockResolvedValueOnce({plantId:'a',parentId:'machine'});
    expect(await validateAssetRelationships(client,{plantId:'a',parentId:'child',assetId:'machine'})).toMatch(/cycle/i);
  });
  it('rejects existing ancestor cycles and missing parents',async()=>{
    asset.mockResolvedValueOnce({plantId:'a',parentId:'loop'});
    expect(await validateAssetRelationships(client,{plantId:'a',parentId:'loop'})).toMatch(/cycle/i);
    asset.mockResolvedValueOnce(null);
    expect(await validateAssetRelationships(client,{plantId:'a',parentId:'missing'})).toMatch(/parent asset/i);
  });
  it('accepts a valid same-plant department and hierarchy',async()=>{
    department.mockResolvedValueOnce({plantId:'a'});asset.mockResolvedValueOnce({plantId:'a',parentId:null});
    expect(await validateAssetRelationships(client,{plantId:'a',departmentId:'d',parentId:'p'})).toBeNull();
  });
  it('wires both asset mutations and the form into the integrity policy',()=>{
    const create=readFileSync('src/app/api/assets/route.ts','utf8');
    const update=readFileSync('src/app/api/assets/[id]/route.ts','utf8');
    const form=readFileSync('src/components/modules/AssetPages.tsx','utf8');
    expect(create).toContain('validateAssetRelationships(db,{plantId,departmentId,parentId})');
    expect(update).toContain('Moving a registered machine to another plant requires a controlled transfer');
    expect(update).toContain('parentId:body.parentId===undefined?existing.parentId:body.parentId');
    expect(form).toContain("functionalLocationId: '', parentId: ''");
    expect(form).toContain("key={'parent-'+form.plantId}");
  });
});
