// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocked=vi.hoisted(()=>({
  getSession:vi.fn(),hasPermission:vi.fn(),isAdmin:vi.fn(),
  getPlantScope:vi.fn(),canAccessPlantStrict:vi.fn(),
  modelFindUnique:vi.fn(),bindingFindUnique:vi.fn(),bindingFindFirst:vi.fn(),
  bindingCreate:vi.fn(),bindingUpdate:vi.fn(),bindingDelete:vi.fn(),
  assetFindUnique:vi.fn(),componentFindUnique:vi.fn(),auditFindFirst:vi.fn(),auditCreate:vi.fn(),
}));
vi.mock('@/lib/auth',()=>({
  getSession:mocked.getSession,hasPermission:mocked.hasPermission,isAdmin:mocked.isAdmin,
}));
vi.mock('@/lib/plant-scope',()=>({
  getPlantScope:mocked.getPlantScope,canAccessPlantStrict:mocked.canAccessPlantStrict,
}));
vi.mock('@/lib/db',()=>({
  db:{
    assetModel:{findUnique:mocked.modelFindUnique},
    assetMeshBinding:{
      findUnique:mocked.bindingFindUnique,
      findFirst:mocked.bindingFindFirst,
      create:mocked.bindingCreate,
      update:mocked.bindingUpdate,
      delete:mocked.bindingDelete,
    },
    asset:{findUnique:mocked.assetFindUnique},
    componentRegistry:{findUnique:mocked.componentFindUnique},
    auditLog:{findFirst:mocked.auditFindFirst,create:mocked.auditCreate},
  },
}));

import { POST } from '@/app/api/mesh-bindings/route';
import { PUT, DELETE } from '@/app/api/mesh-bindings/[id]/route';
import { reviewedCadMappingsAreFrozen } from '@/lib/smart-anatomy/reviewed-model';

const modelId='f4f9438d-5e92-499a-9abf-b66d6ba591ca';
const url='/api/smart-anatomy/models/'+modelId+'/file';
const model=(isActive:boolean,filePath=url)=>({
  id:modelId,assetId:'asset-1',filePath,isActive,
  asset:{plantId:'plant-1'},
});
const existing=(active:boolean)=>({
  id:'binding-1',meshName:'Pump/Shaft',modelId,assetId:'asset-1',
  model:model(active),asset:{plantId:'plant-1'},
});
const payload={
  modelId,meshName:'Pump/Shaft',meshPath:'Pump/Shaft',assetId:'asset-1',
  componentId:'part-1',
};
const request=(method:string,path:string,body?:object)=>
  new NextRequest('http://localhost'+path,{
    method,...(body?{body:JSON.stringify(body)}:{}),
  });
const context={params:Promise.resolve({id:'binding-1'})};

beforeEach(()=>{
  vi.clearAllMocks();
  mocked.getSession.mockReturnValue({userId:'engineer-2'});
  mocked.hasPermission.mockReturnValue(true);
  mocked.isAdmin.mockReturnValue(false);
  mocked.getPlantScope.mockResolvedValue({denyAccess:false,plantId:'plant-1'});
  mocked.canAccessPlantStrict.mockImplementation((_scope:unknown,plantId:string)=>plantId==='plant-1');
  mocked.modelFindUnique.mockResolvedValue(model(true));
  mocked.bindingFindUnique.mockResolvedValue(existing(true));
  mocked.assetFindUnique.mockResolvedValue({plantId:'plant-1'});
  mocked.componentFindUnique.mockResolvedValue({id:'part-1',assetId:'asset-1'});
  mocked.auditFindFirst.mockResolvedValue(null);
  mocked.bindingFindFirst.mockResolvedValue(null);
  mocked.bindingCreate.mockResolvedValue({id:'new-binding'});
  mocked.auditCreate.mockResolvedValue({id:'audit-1'});
});

describe('approved CAD exact component mapping immutability',()=>{
  it('denies adding mappings after a source model is approved for inspection',async()=>{
    const res=await POST(request('POST','/api/mesh-bindings',payload));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('immutable');
    expect(mocked.bindingCreate).not.toHaveBeenCalled();
  });

  it('denies editing an approved CAD part link even to a different component',async()=>{
    const res=await PUT(request('PUT','/api/mesh-bindings/binding-1',{
      componentId:'part-2',meshPath:'Pump/Other',
    }),context);
    expect(res.status).toBe(409);
    expect(mocked.bindingUpdate).not.toHaveBeenCalled();
  });

  it('denies deleting a reviewed source mapping through the legacy endpoint',async()=>{
    const res=await DELETE(request('DELETE','/api/mesh-bindings/binding-1'),context);
    expect(res.status).toBe(409);
    expect(mocked.bindingDelete).not.toHaveBeenCalled();
  });

  it('also locks withdrawn CAD revisions even though their isActive flag is false',async()=>{
    mocked.modelFindUnique.mockResolvedValue(model(false));
    mocked.auditFindFirst.mockResolvedValue({id:'withdrawal-audit'});
    const res=await POST(request('POST','/api/mesh-bindings',payload));
    expect(res.status).toBe(409);
    expect(mocked.auditFindFirst).toHaveBeenCalled();
  });

  it('allows an unapproved, not withdrawn private CAD to be mapped for engineer review',async()=>{
    mocked.modelFindUnique.mockResolvedValue(model(false));
    const res=await POST(request('POST','/api/mesh-bindings',payload));
    expect(res.status).toBe(201);
    expect(mocked.bindingCreate).toHaveBeenCalledOnce();
  });

  it('rejects draft private CAD mappings to a different machine in the same plant',async()=>{
    mocked.modelFindUnique.mockResolvedValue(model(false));
    const res=await POST(request('POST','/api/mesh-bindings',{
      ...payload,assetId:'asset-2',componentId:'part-2',
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('source machine asset');
    expect(mocked.bindingCreate).not.toHaveBeenCalled();
  });

  it('rejects editing a draft private CAD link to target another machine',async()=>{
    mocked.bindingFindUnique.mockResolvedValue(existing(false));
    const res=await PUT(request('PUT','/api/mesh-bindings/binding-1',{
      assetId:'asset-2',componentId:'part-2',
    }),context);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('source machine asset');
    expect(mocked.bindingUpdate).not.toHaveBeenCalled();
  });

  it('keeps legacy non-private digital-twin mapping behavior unchanged',async()=>{
    expect(await reviewedCadMappingsAreFrozen(model(true,'/uploads/legacy-pump.glb'))).toBe(false);
    expect(mocked.auditFindFirst).not.toHaveBeenCalled();
  });

  it('does not query approval state for a user lacking authorization',async()=>{
    mocked.getSession.mockReturnValue(null);
    const res=await POST(request('POST','/api/mesh-bindings',payload));
    expect(res.status).toBe(401);
    expect(mocked.modelFindUnique).not.toHaveBeenCalled();
  });
});
