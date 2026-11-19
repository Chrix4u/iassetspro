// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditedGlbMeshPaths } from '@/lib/smart-anatomy/mesh-source-paths';

const mocked=vi.hoisted(()=>({
  getSession:vi.fn(),hasPermission:vi.fn(),isAdmin:vi.fn(),
  getPlantScope:vi.fn(),canAccessPlantStrict:vi.fn(),
  findUnique:vi.fn(),auditFindFirst:vi.fn(),bindingFindMany:vi.fn(),
  modelUpdate:vi.fn(),auditCreate:vi.fn(),transaction:vi.fn(),
}));
vi.mock('@/lib/auth',()=>({
  getSession:mocked.getSession,hasPermission:mocked.hasPermission,isAdmin:mocked.isAdmin,
}));
vi.mock('@/lib/plant-scope',()=>({
  getPlantScope:mocked.getPlantScope,canAccessPlantStrict:mocked.canAccessPlantStrict,
}));
vi.mock('@/lib/db',()=>({
  db:{
    assetModel:{findUnique:mocked.findUnique,update:mocked.modelUpdate},
    assetMeshBinding:{findMany:mocked.bindingFindMany},
    auditLog:{findFirst:mocked.auditFindFirst,create:mocked.auditCreate},
    $transaction:mocked.transaction,
  },
}));
import { POST } from '@/app/api/smart-anatomy/models/[id]/commission/route';

const id='f4f9438d-5e92-499a-9abf-b66d6ba591ca';
const bytes=readFileSync('public/smart-anatomy-demos/original-centrifugal-pump.glb');
const sha256=createHash('sha256').update(bytes).digest('hex');
const path=[...auditedGlbMeshPaths(bytes)].find(item=>item.endsWith('/Impeller_Hub'))!;
const ctx={params:Promise.resolve({id})};
const request=()=>new NextRequest('http://localhost/api/smart-anatomy/models/'+id+'/commission',{
  method:'POST',
  body:JSON.stringify({
    sourceReviewed:true,geometryReviewed:true,componentMappingReviewed:true,
    reviewNote:'Verified actual source mesh and installed pump mapping',
  }),
});

let folder:string;
let prior:string|undefined;
beforeAll(async()=>{
  prior=process.env.IASSETSPRO_CAD_STORAGE_ROOT;
  folder=await mkdtemp(join(tmpdir(),'smart-anatomy-commission-'));
  process.env.IASSETSPRO_CAD_STORAGE_ROOT=folder;
  await writeFile(join(folder,id+'.glb'),bytes);
});
afterAll(async()=>{
  if(prior===undefined)delete process.env.IASSETSPRO_CAD_STORAGE_ROOT;
  else process.env.IASSETSPRO_CAD_STORAGE_ROOT=prior;
  await rm(folder,{recursive:true,force:true});
});

beforeEach(()=>{
  vi.clearAllMocks();
  mocked.getSession.mockReturnValue({userId:'engineer1'});
  mocked.hasPermission.mockReturnValue(true);
  mocked.isAdmin.mockReturnValue(false);
  mocked.getPlantScope.mockResolvedValue({denyAccess:false,plantId:'plant1'});
  mocked.canAccessPlantStrict.mockImplementation((_scope:unknown,plantId:string)=>plantId==='plant1');
  mocked.findUnique.mockResolvedValue({
    id,assetId:'asset1',uploadedById:'uploader1',
    filePath:'/api/smart-anatomy/models/'+id+'/file',
    fileSize:bytes.length,isActive:false,asset:{plantId:'plant1'},
  });
  mocked.auditFindFirst.mockImplementation(({where}:{where:{action:string}})=>Promise.resolve(
    where.action==='withdraw'?null:{newValues:JSON.stringify({checksum:sha256})},
  ));
  mocked.bindingFindMany.mockResolvedValue([{
    meshPath:path,meshName:path,componentId:'registered-part',
    component:{assetId:'asset1'},
  }]);
  mocked.modelUpdate.mockResolvedValue({id,isActive:true});
  mocked.auditCreate.mockResolvedValue({id:'audit-approved'});
  mocked.transaction.mockImplementation(async(ops:Promise<unknown>[])=>Promise.all(ops));
});

describe('Smart Anatomy source-backed engineering commissioning',()=>{
  it('commissioning approved geometry requires a real model, checksum and registered exact mesh path',async()=>{
    const res=await POST(request(),ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).data.linkedComponents).toBe(1);
    expect(mocked.transaction).toHaveBeenCalledOnce();
    const audit=JSON.parse(mocked.auditCreate.mock.calls[0][0].data.newValues);
    expect(audit.originalSourceIntegrityVerified).toBe(true);
    expect(audit.exactSourcePathMatches).toBe(1);
    expect(audit.maintenanceProcedureApproved).toBe(false);
  });

  it('prohibits approving CAD uploaded by the same engineer, even with full manager permissions',async()=>{
    mocked.findUnique.mockResolvedValue({
      id,assetId:'asset1',uploadedById:'engineer1',
      filePath:'/api/smart-anatomy/models/'+id+'/file',
      fileSize:bytes.length,isActive:false,asset:{plantId:'plant1'},
    });
    const response=await POST(request(),ctx);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('different authorized engineer');
    expect(mocked.modelUpdate).not.toHaveBeenCalled();
    expect(mocked.auditCreate).not.toHaveBeenCalled();
  });

  it('rejects models with no verifiable uploader identity',async()=>{
    mocked.findUnique.mockResolvedValue({
      id,assetId:'asset1',uploadedById:null,
      filePath:'/api/smart-anatomy/models/'+id+'/file',
      fileSize:bytes.length,isActive:false,asset:{plantId:'plant1'},
    });
    expect((await POST(request(),ctx)).status).toBe(409);
  });

  it('refuses fictitious parts absent from the actual uploaded GLB',async()=>{
    mocked.bindingFindMany.mockResolvedValue([{
      meshPath:'FakeAssembly/FakeBearing',meshName:'FakeBearing',
      componentId:'part1',component:{assetId:'asset1'},
    }]);
    expect((await POST(request(),ctx)).status).toBe(409);
    expect(mocked.modelUpdate).not.toHaveBeenCalled();
  });

  it('refuses a component linked to another installed machine',async()=>{
    mocked.bindingFindMany.mockResolvedValue([{
      meshPath:path,meshName:path,componentId:'crossmachine',
      component:{assetId:'othermachine'},
    }]);
    expect((await POST(request(),ctx)).status).toBe(409);
  });

  it('refuses duplicate competing mappings to one imported mesh',async()=>{
    mocked.bindingFindMany.mockResolvedValue([
      {meshPath:path,meshName:path,componentId:'one',component:{assetId:'asset1'}},
      {meshPath:path,meshName:path,componentId:'two',component:{assetId:'asset1'}},
    ]);
    expect((await POST(request(),ctx)).status).toBe(409);
  });

  it('refuses original source tampering even when file length remains unchanged',async()=>{
    const altered=Buffer.from(bytes);
    altered[altered.length-1]^=0xff;
    await writeFile(join(folder,id+'.glb'),altered);
    try{
      expect((await POST(request(),ctx)).status).toBe(409);
      expect(mocked.bindingFindMany).not.toHaveBeenCalled();
    }finally{
      await writeFile(join(folder,id+'.glb'),bytes);
    }
  });

  it('refuses to recommission a withdrawn or unauthorized source revision',async()=>{
    mocked.auditFindFirst.mockImplementation(({where}:{where:{action:string}})=>Promise.resolve(
      where.action==='withdraw'?{id:'revoked'}:{newValues:JSON.stringify({checksum:sha256})},
    ));
    expect((await POST(request(),ctx)).status).toBe(409);
    mocked.getSession.mockReturnValue(null);
    expect((await POST(request(),ctx)).status).toBe(401);
    expect(mocked.modelUpdate).not.toHaveBeenCalled();
  });
});
