import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {solveCadToScanAlignment} from '@/lib/smart-anatomy/cad-scan-alignment';

const m=vi.hoisted(()=>({
  getSession:vi.fn(),hasPermission:vi.fn(),isAdmin:vi.fn(),
  plant:vi.fn(),plantAccess:vi.fn(),model:vi.fn(),auditFind:vi.fn(),
  alignmentFind:vi.fn(),alignmentCreate:vi.fn(),alignmentUpdate:vi.fn(),
  auditCreate:vi.fn(),lock:vi.fn(),transaction:vi.fn(),
}));
vi.mock('@/lib/auth',()=>({getSession:m.getSession,hasPermission:m.hasPermission,isAdmin:m.isAdmin}));
vi.mock('@/lib/plant-scope',()=>({
  getPlantScope:m.plant,canAccessPlantStrict:m.plantAccess,
}));
vi.mock('@/lib/db',()=>({db:{
  assetModel:{findUnique:m.model},
  auditLog:{findFirst:m.auditFind,create:m.auditCreate},
  siteScanAlignment:{findUnique:m.alignmentFind,create:m.alignmentCreate,update:m.alignmentUpdate},
  $transaction:m.transaction,
}}));
import {GET,POST} from '@/app/api/smart-anatomy/scans/[id]/alignment/route';
import {POST as approve} from '@/app/api/smart-anatomy/scans/[id]/alignment/approve/route';

const id='f4f9438d-5e92-499a-9abf-b66d6ba591ca';
const cadId='3bb673fb-b0ef-4654-82e0-53576ae7df4b';
const ctx={params:Promise.resolve({id})};
const landmarks=[
  {label:'Measured drum end A',cad:{x:0,y:0,z:0},scan:{x:2,y:1,z:0}},
  {label:'Measured drum end B',cad:{x:2,y:0,z:0},scan:{x:2,y:3,z:0}},
  {label:'Measured reference bearing C',cad:{x:0,y:3,z:0},scan:{x:-1,y:1,z:0}},
  {label:'Measured elevated drive D',cad:{x:1,y:1,z:2},scan:{x:1,y:2,z:2}},
];
const solution=solveCadToScanAlignment(landmarks).solution;
const route='/api/smart-anatomy/scans/'+id+'/alignment';
const json=(method:string,url=route,body?:unknown)=>new NextRequest('https://localhost'+url,{
  method,...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)}),
});
const draftBody={cadModelId:cadId,landmarks};
const reviewBody={
  cadRevisionMatched:true,scanScaleReviewed:true,
  landmarkEvidenceReviewed:true,
  reviewNote:'Independently inspected correct OEM drawing revision, measured scan scale and 4 physical landmarks',
};
const alignmentRow={
  id:'scan-alignment-record',scanModelId:id,cadModelId:cadId,assetId:'asset-one',
  landmarks:JSON.stringify(landmarks),
  translationX:solution.translation.x,translationY:solution.translation.y,translationZ:solution.translation.z,
  rotationX:solution.rotation[0],rotationY:solution.rotation[1],
  rotationZ:solution.rotation[2],rotationW:solution.rotation[3],
  rmsErrorMetres:solution.rmsErrorMetres,maxErrorMetres:solution.maxErrorMetres,
  maxRelativeDistanceError:solution.maxRelativeDistanceError,
  createdById:'original-engineer',reviewedById:null,
  isApproved:false,reviewNote:null,
};
beforeEach(()=>{
  vi.clearAllMocks();
  m.getSession.mockReturnValue({userId:'second-engineer'});
  m.hasPermission.mockImplementation((_s:unknown,p:string)=>p==='digital_twin.manage'||p==='digital_twin.view');
  m.isAdmin.mockReturnValue(false);
  m.plant.mockResolvedValue({denyAccess:false,plantId:'plant-one'});
  m.plantAccess.mockReturnValue(true);
  m.model.mockImplementation(async({where}:{where:{id:string}})=>{
    if(where.id===id)return{
      id,assetId:'asset-one',isActive:true,uploadedById:'scan-uploader',
      filePath:'/api/smart-anatomy/models/'+id+'/file',
      asset:{plantId:'plant-one'},
    };
    if(where.id===cadId)return {
      id:cadId,assetId:'asset-one',isActive:true,uploadedById:'cad-uploader',
      filePath:'/api/smart-anatomy/models/'+cadId+'/file',
      asset:{plantId:'plant-one'},
    };
    return null;
  });
  m.auditFind.mockImplementation(async({where}:{where:{action:string;entityId?:unknown}})=>{
    if(where.action==='withdraw')return null;
    return {newValues:JSON.stringify({
      sourceOrigin:where.entityId===id?'site-owned-scan':'licensed-oem',
      scanCapture:where.entityId===id?{
        method:'lidar',geometryUnits:'m',visibleSurfacesOnly:true,
      }:null,
    })};
  });
  m.alignmentFind.mockResolvedValue(null);
  m.alignmentCreate.mockResolvedValue({...alignmentRow});
  m.alignmentUpdate.mockResolvedValue({...alignmentRow,isApproved:true,reviewedById:'second-engineer'});
  m.auditCreate.mockResolvedValue({id:'audit-event'});
  m.lock.mockResolvedValue([]);
  m.transaction.mockImplementation(async(fn:(tx:unknown)=>Promise<unknown>)=>fn({
    $queryRaw:m.lock,assetModel:{findUnique:m.model},
    siteScanAlignment:{
      findUnique:m.alignmentFind,
      create:m.alignmentCreate,update:m.alignmentUpdate,
    },
    auditLog:{findFirst:m.auditFind,create:m.auditCreate},
  }));
});
describe('CAD-to-scan registration: plant scope, genuine source and maker-checker',()=>{
  it('blocks anonymous and ordinary viewers from registration',async()=>{
    m.getSession.mockReturnValue(null);
    expect((await POST(json('POST',route,draftBody),ctx)).status).toBe(401);
    m.getSession.mockReturnValue({userId:'viewer'});
    m.hasPermission.mockImplementation((_s:unknown,p:string)=>p==='digital_twin.view');
    expect((await POST(json('POST',route,draftBody),ctx)).status).toBe(403);
  });
  it('refuses cross-plant and cross-machine source pairing',async()=>{
    m.plantAccess.mockReturnValue(false);
    expect((await POST(json('POST',route,draftBody),ctx)).status).toBe(404);
    m.plantAccess.mockReturnValue(true);
    m.model.mockImplementation(async({where}:{where:{id:string}})=>({
      id:where.id,assetId:where.id===cadId?'another-machine':'asset-one',
      uploadedById:'different-uploader',isActive:true,
      filePath:'/api/smart-anatomy/models/'+where.id+'/file',
      asset:{plantId:'plant-one'},
    }));
    expect((await POST(json('POST',route,draftBody),ctx)).status).toBe(409);
  });
  it('rejects a training picture or a photogrammetry model posing as OEM CAD',async()=>{
    m.auditFind.mockImplementation(async({where}:{where:{action:string;entityId?:unknown}})=>
      where.action==='withdraw'?null:{
        newValues:JSON.stringify({
          sourceOrigin:'site-owned-scan',
          scanCapture:{method:'lidar',geometryUnits:'m',visibleSurfacesOnly:true},
        }),
      });
    expect((await POST(json('POST',route,draftBody),ctx)).status).toBe(409);
    expect(m.alignmentCreate).not.toHaveBeenCalled();
  });
  it('rejects invalid physical landmarks and never writes a guess',async()=>{
    const badPairs=landmarks.map(p=>({
      ...p,scan:{...p.scan,x:p.scan.x*3},
    }));
    expect((await POST(json('POST',route,{cadModelId:cadId,landmarks:badPairs}),ctx)).status).toBe(400);
    expect(m.alignmentCreate).not.toHaveBeenCalled();
  });
  it('atomically records a draft physical registration with audit and no auto-approval',async()=>{
    const response=await POST(json('POST',route,draftBody),ctx);
    expect(response.status).toBe(201);
    const body=await response.json();
    expect(body.data.isApproved).toBe(false);
    expect(m.alignmentCreate.mock.calls[0][0].data).toMatchObject({
      scanModelId:id,cadModelId:cadId,assetId:'asset-one',
      createdById:'second-engineer',isApproved:false,
    });
    expect(m.auditCreate).toHaveBeenCalledOnce();
    expect(m.lock).toHaveBeenCalledOnce();
  });
  it('does not expose unapproved alignment data to ordinary viewers',async()=>{
    m.alignmentFind.mockResolvedValue({...alignmentRow});
    m.hasPermission.mockImplementation((_s:unknown,p:string)=>p==='digital_twin.view');
    const response=await GET(json('GET'),ctx);
    expect(response.status).toBe(200);
    expect((await response.json()).data).toBeNull();
  });
  it('independent manager cannot self-approve uploaded/registered alignment',async()=>{
    m.alignmentFind.mockResolvedValue({...alignmentRow});
    m.getSession.mockReturnValue({userId:'original-engineer'});
    expect((await approve(json('POST',route+'/approve',reviewBody),ctx)).status).toBe(409);
    expect(m.alignmentUpdate).not.toHaveBeenCalled();
  });
  it('rejects alignment approval if its landmark geometry was tampered with',async()=>{
    m.alignmentFind.mockResolvedValue({...alignmentRow,translationX:100});
    expect((await approve(json('POST',route+'/approve',reviewBody),ctx)).status).toBe(409);
    expect(m.alignmentUpdate).not.toHaveBeenCalled();
  });
  it('allows independent verified geometry approval and immutable audit',async()=>{
    m.alignmentFind.mockResolvedValue({...alignmentRow});
    const response=await approve(json('POST',route+'/approve',reviewBody),ctx);
    expect(response.status).toBe(200);
    expect(m.alignmentUpdate.mock.calls[0][0].data).toMatchObject({
      isApproved:true,reviewedById:'second-engineer',
    });
    expect(m.auditCreate.mock.calls[0][0].data).toMatchObject({
      entityType:'site_scan_alignment',action:'approve',
    });
  });
  it('does not expose reference geometry if its source is withdrawn',async()=>{
    m.alignmentFind.mockResolvedValue({...alignmentRow,isApproved:true});
    m.auditFind.mockImplementation(async({where}:{where:{action:string;entityId?:unknown}})=>{
      if(where.action==='withdraw'&&where.entityId===cadId)return{id:'withdraw-cad'};
      if(where.action==='withdraw')return null;
      return {newValues:JSON.stringify({
        sourceOrigin:where.entityId===id?'site-owned-scan':'licensed-oem',
        scanCapture:where.entityId===id?{
          method:'lidar',geometryUnits:'m',visibleSurfacesOnly:true,
        }:null,
      })};
    });
    expect((await GET(json('GET'),ctx)).status).toBe(409);
  });
});
