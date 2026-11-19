// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocked=vi.hoisted(()=>({
  getSession:vi.fn(),hasPermission:vi.fn(),isAdmin:vi.fn(),
  getPlantScope:vi.fn(),canAccessPlantStrict:vi.fn(),
  assetFindUnique:vi.fn(),modelCreate:vi.fn(),modelUpdate:vi.fn(),modelDelete:vi.fn(),
  meshDeleteMany:vi.fn(),auditCreate:vi.fn(),sceneFindUnique:vi.fn(),
  sceneFindMany:vi.fn(),sceneCount:vi.fn(),twinFindUnique:vi.fn(),
}));
vi.mock('@/lib/auth',()=>({
  getSession:mocked.getSession,hasPermission:mocked.hasPermission,isAdmin:mocked.isAdmin,
}));
vi.mock('@/lib/plant-scope',()=>({
  getPlantScope:mocked.getPlantScope,canAccessPlantStrict:mocked.canAccessPlantStrict,
}));
vi.mock('@/lib/db',()=>({
  db:{
    asset:{findUnique:mocked.assetFindUnique},
    assetModel:{
      findUnique:mocked.assetFindUnique,
      create:mocked.modelCreate,update:mocked.modelUpdate,delete:mocked.modelDelete,
    },
    assetMeshBinding:{deleteMany:mocked.meshDeleteMany},
    digitalTwinScene:{
      findUnique:mocked.sceneFindUnique,
      findMany:mocked.sceneFindMany,
      count:mocked.sceneCount,
    },
    digitalTwin:{findUnique:mocked.twinFindUnique},
    auditLog:{create:mocked.auditCreate},
  },
}));
import { POST as legacyCreate } from '@/app/api/asset-models/route';
import { PUT as legacyEdit, DELETE as legacyDelete } from '@/app/api/asset-models/[id]/route';
import { GET as scenesGet } from '@/app/api/digital-twin-scenes/route';
import { GET as sceneGet } from '@/app/api/digital-twin-scenes/[id]/route';

const id='f4f9438d-5e92-499a-9abf-b66d6ba591ca';
const privatePath='/api/smart-anatomy/models/'+id+'/file';
const ctx={params:Promise.resolve({id})};
function request(path:string,method='GET',body?:Record<string,unknown>) {
  return new NextRequest('http://localhost'+path,{
    method, ...(body?{body:JSON.stringify(body)}:{}),
  });
}
beforeEach(()=>{
  vi.clearAllMocks();
  mocked.getSession.mockReturnValue({userId:'engineer1'});
  mocked.hasPermission.mockReturnValue(true);
  mocked.isAdmin.mockReturnValue(false);
  mocked.getPlantScope.mockResolvedValue({denyAccess:false,plantId:'plant1'});
  mocked.canAccessPlantStrict.mockImplementation((_scope:unknown,plantId:string)=>plantId==='plant1');
  mocked.assetFindUnique.mockResolvedValue({
    id,assetId:'asset1',filePath:privatePath,isActive:true,
    asset:{plantId:'plant1'},
  });
  mocked.twinFindUnique.mockResolvedValue({
    id:'twin1',asset:{plantId:'plant1'},
  });
  mocked.sceneFindMany.mockResolvedValue([]);
  mocked.sceneCount.mockResolvedValue(0);
});

describe('Smart Anatomy private CAD legacy mutation and published scene routes',()=>{
  it('prevents forging an approved-looking source URL through generic AssetModel POST',async()=>{
    const response=await legacyCreate(request('/api/asset-models','POST',{
      assetId:'asset1',name:'Forged CAD',fileName:'fake.glb',
      filePath:privatePath,fileType:'model/gltf-binary',
    }));
    expect(response.status).toBe(409);
    expect(mocked.modelCreate).not.toHaveBeenCalled();
  });

  it('prevents changing the provenance or deleting an existing protected CAD source',async()=>{
    const edit=await legacyEdit(request('/api/asset-models/'+id,'PUT',{
      filePath:'/uploads/public-forged.glb',meshCount:1,
    }),ctx);
    expect(edit.status).toBe(409);
    expect(mocked.modelUpdate).not.toHaveBeenCalled();

    const deletion=await legacyDelete(request('/api/asset-models/'+id,'DELETE'),ctx);
    expect(deletion.status).toBe(409);
    expect(mocked.modelDelete).not.toHaveBeenCalled();
    expect(mocked.meshDeleteMany).not.toHaveBeenCalled();
  });

  it('queries only active 3D scenes or approved private source models',async()=>{
    const response=await scenesGet(request('/api/digital-twin-scenes?twinId=twin1'));
    expect(response.status).toBe(200);
    const where=mocked.sceneFindMany.mock.calls[0][0].where;
    expect(where.twinId).toBe('twin1');
    expect(where.isActive).toBe(true);
    expect(where.model.OR).toEqual(expect.arrayContaining([{isActive:true}]));
    expect(JSON.stringify(where.model)).toContain('/api/smart-anatomy/models/');
  });

  it('rejects direct access to previously published CAD if approval was withdrawn',async()=>{
    mocked.sceneFindUnique.mockResolvedValue({
      id:'scene1',isActive:false,
      twin:{asset:{plantId:'plant1'}},
      model:{filePath:privatePath,isActive:false,bindings:[]},
    });
    const response=await sceneGet(request('/api/digital-twin-scenes/scene1'),{
      params:Promise.resolve({id:'scene1'}),
    });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('withdrawn');
  });
});
