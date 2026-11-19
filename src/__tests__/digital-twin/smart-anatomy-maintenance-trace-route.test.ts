// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditedGlbMeshPaths } from '@/lib/smart-anatomy/mesh-source-paths';

const mocks=vi.hoisted(()=>({
  session:vi.fn(),permission:vi.fn(),admin:vi.fn(),scope:vi.fn(),authorized:vi.fn(),
  model:vi.fn(),audit:vi.fn(),bindings:vi.fn(),
}));
vi.mock('@/lib/auth',()=>({
  getSession:mocks.session,hasPermission:mocks.permission,isAdmin:mocks.admin,
}));
vi.mock('@/lib/plant-scope',()=>({
  getPlantScope:mocks.scope,canAccessPlantStrict:mocks.authorized,
}));
vi.mock('@/lib/db',()=>({
  db:{
    assetModel:{findUnique:mocks.model},
    auditLog:{findFirst:mocks.audit},
    assetMeshBinding:{findMany:mocks.bindings},
  },
}));
import { GET } from '@/app/api/smart-anatomy/models/[id]/maintenance-trace/route';

const id='f4f9438d-5e92-499a-9abf-b66d6ba591ca';
const bytes=readFileSync('public/smart-anatomy-demos/original-centrifugal-pump.glb');
const checksum=createHash('sha256').update(bytes).digest('hex');
const sourcePath=[...auditedGlbMeshPaths(bytes)].find(path=>path.endsWith('/Impeller_Hub'))!;
const ctx={params:Promise.resolve({id})};
const request=()=>new NextRequest('http://localhost/api/smart-anatomy/models/'+id+'/maintenance-trace');
const source=()=>({newValues:JSON.stringify({checksum,sourceOrigin:'site-owned-scan'})});
const approval=()=>({newValues:JSON.stringify({
  independentEngineerReview:true,reviewedById:'engineer-checker',
})});
const binding=()=>({
  id:'binding-1',meshPath:sourcePath,meshName:'Impeller Hub',componentId:'part-1',
  component:{
    id:'part-1',assetId:'machine-1',componentCode:'IMP-01',
    name:'Impeller',componentType:'component',
    pmSchedules:[{id:'pm-1',title:'Inspect impeller',frequencyType:'meter',
      frequencyValue:5000,nextDueDate:null,priority:'high'}],
    sparePartLinks:[{id:'link-1',sparePartCode:'S-01',sparePartName:'Impeller kit',
      quantityRequired:1,inventoryItemId:'stock-1',
      inventoryItem:{id:'stock-1',plantId:'plant-1',itemCode:'S-01',name:'Impeller kit',currentStock:3}}],
    toolRequirements:[{id:'tool-req',toolCode:'TORQUE-01',toolName:'Torque wrench',
      quantityRequired:1,toolId:'tool-1'}],
    workOrderComponents:[{id:'wolink',workOrder:{
      id:'wo-1',assetId:'machine-1',plantId:'plant-1',
      woNumber:'WO-0001',title:'Inspect impeller',status:'planned',type:'preventive',
    }}],
  },
});
let root:string,prior:string|undefined;
beforeAll(async()=>{
  prior=process.env.IASSETSPRO_CAD_STORAGE_ROOT;
  root=await mkdtemp(join(tmpdir(),'cad-maintenance-trace-'));
  process.env.IASSETSPRO_CAD_STORAGE_ROOT=root;
  await writeFile(join(root,id+'.glb'),bytes);
});
afterAll(async()=>{
  if(prior===undefined)delete process.env.IASSETSPRO_CAD_STORAGE_ROOT;
  else process.env.IASSETSPRO_CAD_STORAGE_ROOT=prior;
  await rm(root,{recursive:true,force:true});
});
beforeEach(()=>{
  vi.clearAllMocks();
  mocks.session.mockReturnValue({userId:'engineer-checker'});
  mocks.admin.mockReturnValue(false);
  mocks.permission.mockReturnValue(true);
  mocks.scope.mockResolvedValue({denyAccess:false,plantId:'plant-1'});
  mocks.authorized.mockImplementation((_scope:unknown,plantId:string)=>plantId==='plant-1');
  mocks.model.mockResolvedValue({
    id,assetId:'machine-1',name:'Centrifugal pump',uploadedById:'uploader-1',
    filePath:'/api/smart-anatomy/models/'+id+'/file',fileSize:bytes.length,isActive:true,
    asset:{plantId:'plant-1',assetTag:'PUMP-001',name:'Pump A'},
  });
  mocks.audit.mockImplementation(({where}:{where:{action:string}})=>Promise.resolve(
    where.action==='create'?source():where.action==='withdraw'?null:approval(),
  ));
  mocks.bindings.mockResolvedValue([binding()]);
});

describe('plant-scoped source-verified CAD to maintenance trace',()=>{
  it('returns actual registered part, PM, inventory, tool and existing WO references',async()=>{
    const response=await GET(request(),ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const json=await response.json();
    expect(json.data.model.engineeringStatus).toBe('approved');
    expect(json.data.model.sha256).toBe(checksum);
    expect(json.data.model.physicalMaintenanceProcedureApproved).toBe(false);
    expect(json.data.entries).toHaveLength(1);
    const linked=json.data.entries[0];
    expect(linked.sourceMeshPath).toBe(sourcePath);
    expect(linked.registeredComponent.code).toBe('IMP-01');
    expect(linked.pmSchedules[0].id).toBe('pm-1');
    expect(linked.spareParts[0].currentStock).toBe(3);
    expect(linked.tools[0].code).toBe('TORQUE-01');
    expect(linked.workOrders[0].woNumber).toBe('WO-0001');
    expect(json.data.mapping.sourceMeshCount).toBeGreaterThan(1);
    expect(mocks.bindings).toHaveBeenCalledWith(expect.objectContaining({
      where:{modelId:id,assetId:'machine-1',componentId:{not:null}},
    }));
  });

  it('does not query CAD or report mappings for anonymous or unprivileged sessions',async()=>{
    mocks.session.mockReturnValue(null);
    expect((await GET(request(),ctx)).status).toBe(401);
    expect(mocks.model).not.toHaveBeenCalled();
    mocks.session.mockReturnValue({userId:'other'});
    mocks.permission.mockReturnValue(false);
    expect((await GET(request(),ctx)).status).toBe(403);
    expect(mocks.model).not.toHaveBeenCalled();
  });

  it('does not expose another plant model even when its UUID is known',async()=>{
    mocks.authorized.mockReturnValue(false);
    expect((await GET(request(),ctx)).status).toBe(403);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.bindings).not.toHaveBeenCalled();
  });

  it('rejects invented CAD mesh paths and cross-machine component associations',async()=>{
    mocks.bindings.mockResolvedValue([{...binding(),meshPath:'Imagined/OEM_Bearing'}]);
    expect((await GET(request(),ctx)).status).toBe(409);
    mocks.bindings.mockResolvedValue([{...binding(),
      component:{...binding().component,assetId:'another-machine'}}]);
    expect((await GET(request(),ctx)).status).toBe(409);
  });

  it('does not disclose inventory or work-order records of another plant or machine',async()=>{
    const foreignStock=binding();
    foreignStock.component.sparePartLinks[0].inventoryItem.plantId='plant-2';
    mocks.bindings.mockResolvedValue([foreignStock]);
    expect((await GET(request(),ctx)).status).toBe(409);

    const foreignWo=binding();
    foreignWo.component.workOrderComponents[0].workOrder.plantId='plant-2';
    mocks.bindings.mockResolvedValue([foreignWo]);
    expect((await GET(request(),ctx)).status).toBe(409);

    const foreignAssetWo=binding();
    foreignAssetWo.component.workOrderComponents[0].workOrder.assetId='another-machine';
    mocks.bindings.mockResolvedValue([foreignAssetWo]);
    expect((await GET(request(),ctx)).status).toBe(409);
  });

  it('rejects duplicate mappings and excludes unapproved suggestions from the report',async()=>{
    mocks.bindings.mockResolvedValue([binding(),{...binding(),id:'binding-2'}]);
    expect((await GET(request(),ctx)).status).toBe(409);
  });

  it('rejects same-size modified CAD bytes despite an unchanged database record',async()=>{
    const corrupted=Buffer.from(bytes);corrupted[corrupted.length-1]^=0x0f;
    await writeFile(join(root,id+'.glb'),corrupted);
    try{
      expect((await GET(request(),ctx)).status).toBe(409);
      expect(mocks.bindings).not.toHaveBeenCalled();
    }finally{await writeFile(join(root,id+'.glb'),bytes);}
  });

  it('marks withdrawn revisions as historical, never reapproved maintenance work',async()=>{
    mocks.audit.mockImplementation(({where}:{where:{action:string}})=>Promise.resolve(
      where.action==='create'?source():
      where.action==='withdraw'?{id:'withdrawn-1'}:approval(),
    ));
    mocks.model.mockResolvedValue({
      id,assetId:'machine-1',name:'Centrifugal pump',uploadedById:'uploader-1',
      filePath:'/api/smart-anatomy/models/'+id+'/file',fileSize:bytes.length,isActive:false,
      asset:{plantId:'plant-1',assetTag:'PUMP-001',name:'Pump A'},
    });
    const response=await GET(request(),ctx);
    expect(response.status).toBe(200);
    expect((await response.json()).data.model.engineeringStatus).toBe('withdrawn');
  });

  it('rejects lost original source attestation and invalid source model identifiers',async()=>{
    mocks.audit.mockResolvedValue(null);
    expect((await GET(request(),ctx)).status).toBe(409);
    const result=await GET(request(),{params:Promise.resolve({id:'../private'})});
    expect(result.status).toBe(400);
  });
});
