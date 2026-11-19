// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocked = vi.hoisted(() => ({
  getSession: vi.fn(), hasPermission: vi.fn(), isAdmin: vi.fn(),
  getPlantScope: vi.fn(), canAccessPlantStrict: vi.fn(),
  findUnique: vi.fn(), modelUpdate: vi.fn(),
  sceneUpdateMany: vi.fn(), auditCreate: vi.fn(), transaction: vi.fn(),
  queryRaw: vi.fn(), auditFindFirst: vi.fn(),
}));

vi.mock('@/lib/auth',()=>({
  getSession:mocked.getSession,
  hasPermission:mocked.hasPermission,
  isAdmin:mocked.isAdmin,
}));
vi.mock('@/lib/plant-scope',()=>({
  getPlantScope:mocked.getPlantScope,
  canAccessPlantStrict:mocked.canAccessPlantStrict,
}));
vi.mock('@/lib/db',()=>({
  db:{
    assetModel:{findUnique:mocked.findUnique,update:mocked.modelUpdate},
    digitalTwinScene:{updateMany:mocked.sceneUpdateMany},
    auditLog:{create:mocked.auditCreate,findFirst:mocked.auditFindFirst},
    $transaction:mocked.transaction,
  },
}));
import { POST } from '@/app/api/smart-anatomy/models/[id]/withdraw/route';

const id='f4f9438d-5e92-499a-9abf-b66d6ba591ca';
const context={params:Promise.resolve({id})};
const request=(reason='OEM design revision is not approved')=>new NextRequest(
  'http://localhost/api/smart-anatomy/models/'+id+'/withdraw',
  {method:'POST',body:JSON.stringify({reason})},
);
beforeEach(()=>{
  vi.clearAllMocks();
  mocked.getSession.mockReturnValue({userId:'engineer-1'});
  mocked.hasPermission.mockReturnValue(true);
  mocked.isAdmin.mockReturnValue(false);
  mocked.getPlantScope.mockResolvedValue({denyAccess:false,plantId:'plant-1'});
  mocked.canAccessPlantStrict.mockImplementation((_scope:unknown,plantId:string)=>plantId==='plant-1');
  mocked.findUnique.mockResolvedValue({
    id,assetId:'machine-1',filePath:'/api/smart-anatomy/models/'+id+'/file',
    isActive:true,asset:{plantId:'plant-1'},
  });
  mocked.modelUpdate.mockResolvedValue({id,isActive:false});
  mocked.sceneUpdateMany.mockResolvedValue({count:2});
  mocked.auditCreate.mockResolvedValue({id:'audit-1'});
  mocked.auditFindFirst.mockResolvedValue(null);
  mocked.queryRaw.mockResolvedValue([{id}]);
  mocked.transaction.mockImplementation(async (callback:(tx:unknown)=>Promise<unknown>)=>
    callback({
      $queryRaw:mocked.queryRaw,
      assetModel:{findUnique:mocked.findUnique,update:mocked.modelUpdate},
      digitalTwinScene:{updateMany:mocked.sceneUpdateMany},
      auditLog:{findFirst:mocked.auditFindFirst,create:mocked.auditCreate},
    }));
});

describe('Smart Anatomy reviewed CAD withdrawal',()=>{
  it('requires authenticated Digital Twin managers',async()=>{
    mocked.getSession.mockReturnValue(null);
    expect((await POST(request(),context)).status).toBe(401);
    expect(mocked.findUnique).not.toHaveBeenCalled();
  });
  it('refuses unauthorized plants before any scene changes',async()=>{
    mocked.findUnique.mockResolvedValue({
      id,filePath:'/api/smart-anatomy/models/'+id+'/file',
      isActive:true,asset:{plantId:'elsewhere'},
    });
    expect((await POST(request(),context)).status).toBe(403);
    expect(mocked.sceneUpdateMany).not.toHaveBeenCalled();
  });
  it('requires documented engineering withdrawal evidence',async()=>{
    expect((await POST(request('wrong'),context)).status).toBe(400);
    expect(mocked.modelUpdate).not.toHaveBeenCalled();
  });
  it('atomically deactivates the model and all its active scenes without deleting any CAD data',async()=>{
    const response=await POST(request(),context);
    expect(response.status).toBe(200);
    expect((await response.json()).data.scenesWithdrawn).toBe(2);
    expect(mocked.modelUpdate).toHaveBeenCalledWith({
      where:{id},data:{isActive:false},
    });
    expect(mocked.sceneUpdateMany).toHaveBeenCalledWith({
      where:{modelId:id,isActive:true},data:{isActive:false},
    });
    expect(mocked.transaction).toHaveBeenCalledOnce();
    const audit=mocked.auditCreate.mock.calls[0][0].data;
    expect(audit.action).toBe('withdraw');
    expect(JSON.parse(audit.newValues).sourceBytesRetained).toBe(true);
  });
  it('refuses to repeat the withdrawal if another engineer changes approval before lock',async()=>{
    mocked.findUnique.mockResolvedValueOnce({
      id,assetId:'machine-1',filePath:'/api/smart-anatomy/models/'+id+'/file',
      isActive:true,asset:{plantId:'plant-1'},
    }).mockResolvedValueOnce({isActive:false});
    const response=await POST(request(),context);
    expect(response.status).toBe(409);
    expect(mocked.queryRaw).toHaveBeenCalledOnce();
    expect(mocked.modelUpdate).not.toHaveBeenCalled();
    expect(mocked.sceneUpdateMany).not.toHaveBeenCalled();
  });

  it('refuses withdrawal if the audit is already retired after the precheck',async()=>{
    mocked.auditFindFirst.mockResolvedValue({id:'retired'});
    const response=await POST(request(),context);
    expect(response.status).toBe(409);
    expect(mocked.modelUpdate).not.toHaveBeenCalled();
  });

  it('does not allow an already withdrawn or wrong-namespace CAD to be withdrawn again',async()=>{
    mocked.findUnique.mockResolvedValue({
      id,filePath:'/api/smart-anatomy/models/'+id+'/file',
      isActive:false,asset:{plantId:'plant-1'},
    });
    expect((await POST(request(),context)).status).toBe(409);
    mocked.findUnique.mockResolvedValue({
      id,filePath:'/uploads/legacy.gltf',
      isActive:true,asset:{plantId:'plant-1'},
    });
    expect((await POST(request(),context)).status).toBe(404);
    expect(mocked.transaction).not.toHaveBeenCalled();
  });
});
