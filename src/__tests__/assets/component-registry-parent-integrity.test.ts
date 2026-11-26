import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks=vi.hoisted(()=>({findUnique:vi.fn(),findMany:vi.fn(),update:vi.fn(),asset:vi.fn(),audit:vi.fn()}));
vi.mock('@/lib/db',()=>({db:{componentRegistry:{findUnique:mocks.findUnique,findMany:mocks.findMany,update:mocks.update},asset:{findUnique:mocks.asset}}}));
vi.mock('@/lib/auth',()=>({getSession:()=>({userId:'engineer'})}));
vi.mock('@/lib/component-registry-permissions',()=>({canUpdateComponentHierarchy:()=>true,canDeleteComponentHierarchy:()=>true,canViewComponentHierarchy:()=>true}));
vi.mock('@/lib/plant-scope',()=>({getPlantScope:async()=>({denyAccess:false}),canAccessPlant:()=>true}));
vi.mock('@/lib/audit',()=>({createAuditLog:mocks.audit}));
import { PUT } from '@/app/api/component-registry/[id]/route';
const row=(id:string,assetId:string|null,parentId:string|null)=>({id,assetId,parentId,asset:{plantId:'plant'},name:id});
const call=(body:object)=>PUT(new NextRequest('http://localhost/api/component-registry/part',{method:'PUT',body:JSON.stringify(body)}),{params:Promise.resolve({id:'part'})});
beforeEach(()=>{
  vi.resetAllMocks();
  mocks.asset.mockResolvedValue({plantId:'plant'});
  mocks.findMany.mockResolvedValue([]);
  mocks.update.mockResolvedValue({id:'part'});
});
describe('component hierarchy parent integrity',()=>{
  it('rejects changing asset while retaining an incompatible parent',async()=>{
    mocks.findUnique.mockResolvedValueOnce(row('part','machine-a','assembly')).mockResolvedValueOnce(row('assembly','machine-a',null));
    expect((await call({assetId:'machine-b'})).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('rejects attaching an unassigned child while retaining an unassigned parent',async()=>{
    mocks.findUnique.mockResolvedValueOnce(row('part',null,'assembly')).mockResolvedValueOnce(row('assembly',null,null));
    expect((await call({assetId:'machine-a'})).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('rejects moving a parent whose children would be left behind',async()=>{
    mocks.findUnique.mockResolvedValueOnce(row('part','machine-a',null));
    mocks.findMany.mockResolvedValueOnce([{assetId:'machine-a'}]);
    expect((await call({assetId:'machine-b'})).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('rejects a pre-existing ancestor cycle',async()=>{
    mocks.findUnique.mockResolvedValueOnce(row('part','machine-a',null))
      .mockResolvedValueOnce(row('a','machine-a','b')).mockResolvedValueOnce(row('b','machine-a','a'))
      .mockResolvedValueOnce(row('a','machine-a','b'));
    expect((await call({parentId:'a'})).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('permits normal reparenting within one valid machine',async()=>{
    mocks.findUnique.mockResolvedValueOnce(row('part','machine-a',null)).mockResolvedValueOnce(row('assembly','machine-a',null));
    expect((await call({parentId:'assembly'})).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledOnce();
  });
});
