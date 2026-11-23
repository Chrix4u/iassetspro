// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditedGlbMeshPaths } from '@/lib/smart-anatomy/mesh-source-paths';
import { convertStlToGlb } from '@/lib/smart-anatomy/offline-stl-converter';

const mocked=vi.hoisted(()=>({
  getSession:vi.fn(),hasPermission:vi.fn(),isAdmin:vi.fn(),
  getPlantScope:vi.fn(),canAccessPlantStrict:vi.fn(),
  findUnique:vi.fn(),auditFindFirst:vi.fn(),bindingFindMany:vi.fn(),
  modelUpdate:vi.fn(),auditCreate:vi.fn(),transaction:vi.fn(),queryRaw:vi.fn(),
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
  mocked.queryRaw.mockResolvedValue([{id}]);
  mocked.transaction.mockImplementation(async(callback:(tx:unknown)=>Promise<unknown>)=>
    callback({
      $queryRaw:mocked.queryRaw,
      assetModel:{findUnique:mocked.findUnique,update:mocked.modelUpdate},
      auditLog:{findFirst:mocked.auditFindFirst,create:mocked.auditCreate},
    }));
});

describe('Smart Anatomy source-backed engineering commissioning',()=>{
  it('commissioning approved geometry requires a real model, checksum and registered exact mesh path',async()=>{
    const res=await POST(request(),ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).data.linkedComponents).toBe(1);
    expect(mocked.transaction).toHaveBeenCalledOnce();
    const audit=JSON.parse(mocked.auditCreate.mock.calls[0][0].data.newValues);
    expect(audit.uploadedGlbIntegrityVerified).toBe(true);
    expect(audit.originalCadFileChecksumVerified).toBe(false);
    expect(audit).not.toHaveProperty('originalSourceIntegrityVerified');
    expect(audit.exactSourcePathMatches).toBe(1);
    expect(audit.maintenanceProcedureApproved).toBe(false);
  });

  it('accepts a real offline STL conversion only through the separate manual engineer-review path',async()=>{
    const input = new TextEncoder().encode([
      'solid workshop-scan',
      'facet normal 0 0 1',
      'outer loop',
      'vertex 0 0 0',
      'vertex 1000 0 0',
      'vertex 0 1000 0',
      'endloop',
      'endfacet',
      'endsolid workshop-scan',
    ].join('\n'));
    const converted = convertStlToGlb(input, 'mm');
    const checksum=createHash('sha256').update(converted.glb).digest('hex');
    await writeFile(join(folder,id+'.glb'),converted.glb);
    try {
      mocked.findUnique.mockResolvedValue({
        id,assetId:'asset1',uploadedById:'uploader1',
        filePath:'/api/smart-anatomy/models/'+id+'/file',
        fileSize:converted.glb.byteLength,isActive:false,asset:{plantId:'plant1'},
      });
      mocked.auditFindFirst.mockImplementation(({where}:{where:{action:string}})=>Promise.resolve(
        where.action==='withdraw'?null:{newValues:JSON.stringify({checksum})},
      ));
      const authenticPaths=[...auditedGlbMeshPaths(converted.glb)];
      expect(authenticPaths).toEqual(['STL_Geometry_unverified_single_solid']);
      mocked.bindingFindMany.mockResolvedValue([{
        meshPath:authenticPaths[0],meshName:authenticPaths[0],
        componentId:'registered-part',component:{assetId:'asset1'},
      }]);
      const response=await POST(request(),ctx);
      expect(response.status).toBe(200);
      const audit=JSON.parse(mocked.auditCreate.mock.calls[0][0].data.newValues);
      expect(audit.independentEngineerReview).toBe(true);
      expect(audit.maintenanceProcedureApproved).toBe(false);
      expect(audit.exactSourcePathMatches).toBe(1);
      expect(audit.uploadedGlbIntegrityVerified).toBe(true);
    expect(audit.originalCadFileChecksumVerified).toBe(false);
    expect(audit).not.toHaveProperty('originalSourceIntegrityVerified');
    } finally {
      await writeFile(join(folder,id+'.glb'),bytes);
    }
  });

  it('requires licensed OEM drawing source claims to match the complete registered machine nameplate',async()=>{
    const declared={
      sourceOrigin:'licensed-oem',
      sourceMachineClaim:{
        oemManufacturer:'Siemens',oemModel:'S100-M2',nameplateSerial:'SN-001',
        drawingRevision:'Rev B',
      },
      checksum:sha256,
    };
    mocked.auditFindFirst.mockImplementation(({where}:{where:{action:string}})=>Promise.resolve(
      where.action==='withdraw'?null:{newValues:JSON.stringify(declared)},
    ));
    const registered={
      id,assetId:'asset1',uploadedById:'uploader1',
      filePath:'/api/smart-anatomy/models/'+id+'/file',
      fileSize:bytes.length,isActive:false,
      asset:{plantId:'plant1',manufacturer:'SIEMENS',model:'s100-m2',serialNumber:'sn-001'},
    };
    mocked.findUnique.mockResolvedValue(registered);
    const approved=await POST(request(),ctx);
    expect(approved.status).toBe(200);
    const audit=JSON.parse(mocked.auditCreate.mock.calls[0][0].data.newValues);
    expect(audit.oemNameplateSourceClaimMatched).toBe(true);
    expect(audit.uploadedGlbIntegrityVerified).toBe(true);
    expect(audit.originalCadFileChecksumVerified).toBe(false);
    expect(audit.verifiedDrawingRevision).toBeNull();

    vi.clearAllMocks();
    mocked.auditFindFirst.mockImplementation(({where}:{where:{action:string}})=>Promise.resolve(
      where.action==='withdraw'?null:{newValues:JSON.stringify(declared)},
    ));
    mocked.findUnique.mockResolvedValue({...registered,asset:{...registered.asset,serialNumber:'SN-WRONG'}});
    const rejected=await POST(request(),ctx);
    expect(rejected.status).toBe(409);
    expect((await rejected.json()).error).toContain('nameplate');
    expect(mocked.modelUpdate).not.toHaveBeenCalled();
  });

  it('refuses licensed OEM model approval when installed machine nameplate is incomplete',async()=>{
    mocked.auditFindFirst.mockImplementation(({where}:{where:{action:string}})=>Promise.resolve(
      where.action==='withdraw'?null:{newValues:JSON.stringify({
        checksum:sha256,sourceOrigin:'licensed-oem',
        sourceMachineClaim:{
          oemManufacturer:'Siemens',oemModel:'S100-M2',drawingRevision:'Rev B',
          nameplateSerial:'SN-001',
        },
      })},
    ));
    mocked.findUnique.mockResolvedValue({
      id,assetId:'asset1',uploadedById:'uploader1',
      filePath:'/api/smart-anatomy/models/'+id+'/file',
      fileSize:bytes.length,isActive:false,
      asset:{plantId:'plant1',manufacturer:null,model:'S100-M2',serialNumber:'SN-001'},
    });
    const response=await POST(request(),ctx);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('manufacturer');
    expect(mocked.modelUpdate).not.toHaveBeenCalled();
  });

  it('does not resurrect a withdrawn revision if withdrawal commits after the initial check',async()=>{
    let withdrawnChecks=0;
    mocked.auditFindFirst.mockImplementation(({where}:{where:{action:string}})=>{
      if(where.action==='withdraw') {
        withdrawnChecks++;
        return Promise.resolve(withdrawnChecks===1?null:{id:'withdrawn-in-race'});
      }
      return Promise.resolve({newValues:JSON.stringify({checksum:sha256})});
    });
    const response=await POST(request(),ctx);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('withdrawn');
    expect(mocked.queryRaw).toHaveBeenCalledOnce();
    expect(mocked.modelUpdate).not.toHaveBeenCalled();
    expect(mocked.auditCreate).not.toHaveBeenCalled();
  });

  it('does not duplicate an engineering approval if another engineer wins the lock',async()=>{
    mocked.findUnique.mockResolvedValueOnce({
      id,assetId:'asset1',uploadedById:'uploader1',
      filePath:'/api/smart-anatomy/models/'+id+'/file',
      fileSize:bytes.length,isActive:false,asset:{plantId:'plant1'},
    }).mockResolvedValueOnce({isActive:true});
    const response=await POST(request(),ctx);
    expect(response.status).toBe(409);
    expect(mocked.modelUpdate).not.toHaveBeenCalled();
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
