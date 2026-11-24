import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';

const m=vi.hoisted(()=>({
  getSession:vi.fn(),hasPermission:vi.fn(),isAdmin:vi.fn(),
  getPlantScope:vi.fn(),canAccessPlantStrict:vi.fn(),
  model:vi.fn(),source:vi.fn(),component:vi.fn(),
  markerList:vi.fn(),markerCount:vi.fn(),markerCreate:vi.fn(),
  markerFind:vi.fn(),markerUpdate:vi.fn(),markerDelete:vi.fn(),
  auditCreate:vi.fn(),transaction:vi.fn(),lock:vi.fn(),
}));
vi.mock('@/lib/auth',()=>({getSession:m.getSession,hasPermission:m.hasPermission,isAdmin:m.isAdmin}));
vi.mock('@/lib/plant-scope',()=>({
  getPlantScope:m.getPlantScope,canAccessPlantStrict:m.canAccessPlantStrict,
}));
vi.mock('@/lib/db',()=>({db:{
  assetModel:{findUnique:m.model},
  auditLog:{findFirst:m.source,create:m.auditCreate},
  componentRegistry:{findUnique:m.component},
  siteScanHotspot:{findMany:m.markerList,count:m.markerCount,create:m.markerCreate},
  $transaction:m.transaction,
}}));
import {GET,POST,DELETE} from '@/app/api/smart-anatomy/scans/[id]/hotspots/route';
import {POST as review} from '@/app/api/smart-anatomy/scans/[id]/hotspots/[hotspotId]/review/route';

const id='f4f9438d-5e92-499a-9abf-b66d6ba591ca';
const hotspotId='hotspot-001';
const route='/api/smart-anatomy/scans/'+id+'/hotspots';
const context={params:Promise.resolve({id})};
const reviewCtx={params:Promise.resolve({id,hotspotId})};
const request=(method:string,body?:unknown)=>new NextRequest('https://localhost'+route,{
  method,...(body===undefined?{}:{body:JSON.stringify(body),headers:{'content-type':'application/json'}}),
});
const reviewRequest=(body:unknown)=>new NextRequest('https://localhost'+route+'/'+hotspotId+'/review',{
  method:'POST',body:JSON.stringify(body),headers:{'content-type':'application/json'},
});
const goodBody={
  componentId:'part-a',label:'Visible main bearing cover',
  position:{x:1.5,y:0.5,z:-0.25},sourceMeshPath:'Scan/Housing',
};
const reviewBody={
  physicalComponentMatched:true,modelScaleChecked:true,
  reviewNote:'Verified physical bearing cover and measured scan dimensions at the factory',
};

beforeEach(()=>{
  vi.clearAllMocks();
  m.getSession.mockReturnValue({userId:'independent-engineer'});
  m.hasPermission.mockImplementation((_s:unknown,p:string)=>p==='digital_twin.manage'||p==='digital_twin.view');
  m.isAdmin.mockReturnValue(false);
  m.getPlantScope.mockResolvedValue({denyAccess:false,plantId:'plant-a'});
  m.canAccessPlantStrict.mockImplementation((_scope:unknown,plantId:string)=>plantId==='plant-a');
  m.model.mockResolvedValue({
    id,assetId:'asset-a',isActive:false,uploadedById:'uploader-a',
    filePath:'/api/smart-anatomy/models/'+id+'/file',asset:{plantId:'plant-a'},
  });
  m.source.mockImplementation(async(input:{where:{action:string}})=>input.where.action==='create'?{
    newValues:JSON.stringify({sourceOrigin:'site-owned-scan',scanCapture:{
      method:'photogrammetry',geometryUnits:'m',visibleSurfacesOnly:true,
    }}),
  }:null);
  m.component.mockResolvedValue({id:'part-a',assetId:'asset-a'});
  m.markerList.mockResolvedValue([]);
  m.markerCount.mockResolvedValue(0);
  m.markerCreate.mockResolvedValue({id:hotspotId,isApproved:false,modelId:id});
  m.markerFind.mockResolvedValue({id:hotspotId,componentId:'part-a',
    createdById:'marker-author',isApproved:false,
    positionX:1.5,positionY:0.5,positionZ:-0.25,label:'Bearing cover',
    component:{assetId:'asset-a',lifecycleStatus:'operational'},
  });
  m.markerUpdate.mockResolvedValue({id:hotspotId,isApproved:true});
  m.auditCreate.mockResolvedValue({id:'audit'});
  m.lock.mockResolvedValue([]);
  m.transaction.mockImplementation(async(fn:(client:unknown)=>Promise<unknown>)=>fn({
    $queryRaw:m.lock,
    siteScanHotspot:{
      count:m.markerCount,create:m.markerCreate,findFirst:m.markerFind,
      update:m.markerUpdate,delete:m.markerDelete,
    },
    auditLog:{create:m.auditCreate,findFirst:m.source},
  }));
});

describe('site-owned scan spatial hotspot permissions and provenance',()=>{
  it('rejects anonymous and non-manager marker placement before DB access',async()=>{
    m.getSession.mockReturnValue(null);
    expect((await POST(request('POST',goodBody),context)).status).toBe(401);
    m.getSession.mockReturnValue({userId:'viewer'});
    m.hasPermission.mockImplementation((_s:unknown,p:string)=>p==='digital_twin.view');
    expect((await POST(request('POST',goodBody),context)).status).toBe(403);
    expect(m.markerCreate).not.toHaveBeenCalled();
  });
  it('does not reveal an unapproved scan to an ordinary authorized plant viewer',async()=>{
    m.hasPermission.mockImplementation((_s:unknown,p:string)=>p==='digital_twin.view');
    expect((await GET(request('GET'),context)).status).toBe(404);
    expect(m.markerList).not.toHaveBeenCalled();
  });
  it('returns ONLY approved hotspots to ordinary viewers of approved scans',async()=>{
    m.model.mockResolvedValue({
      id,assetId:'asset-a',isActive:true,uploadedById:'uploader-a',
      filePath:'/api/smart-anatomy/models/'+id+'/file',asset:{plantId:'plant-a'},
    });
    m.hasPermission.mockImplementation((_s:unknown,p:string)=>p==='digital_twin.view');
    expect((await GET(request('GET'),context)).status).toBe(200);
    expect(m.markerList.mock.calls[0][0].where).toMatchObject({
      assetId:'asset-a',modelId:id,isApproved:true,
    });
  });
  it('denies cross-plant access even with correct UUID',async()=>{
    m.canAccessPlantStrict.mockReturnValue(false);
    expect((await POST(request('POST',goodBody),context)).status).toBe(404);
    expect(m.markerCreate).not.toHaveBeenCalled();
  });
  it('cannot annotate a manufacturer CAD file as a site scan',async()=>{
    m.source.mockResolvedValue({newValues:JSON.stringify({sourceOrigin:'licensed-oem'})});
    expect((await POST(request('POST',goodBody),context)).status).toBe(404);
  });
  it('does not link a marker to a component from another installed machine',async()=>{
    m.component.mockResolvedValue({id:'part-a',assetId:'asset-b'});
    expect((await POST(request('POST',goodBody),context)).status).toBe(409);
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it('rejects forged and out-of-range coordinates',async()=>{
    expect((await POST(request('POST',{...goodBody,position:{x:Infinity,y:1,z:0}}),context)).status).toBe(400);
    expect((await POST(request('POST',{...goodBody,position:{x:501,y:1,z:0}}),context)).status).toBe(400);
  });
  it('writes only unapproved draft markers with the machine asset and audit in one transaction',async()=>{
    const response=await POST(request('POST',goodBody),context);
    expect(response.status).toBe(201);
    expect(m.markerCreate.mock.calls[0][0].data).toMatchObject({
      assetId:'asset-a',modelId:id,componentId:'part-a',
      positionX:1.5,positionY:0.5,positionZ:-0.25,
      isApproved:false,createdById:'independent-engineer',
    });
    expect(m.lock).toHaveBeenCalledOnce();
    expect(m.auditCreate).toHaveBeenCalledOnce();
  });
  it('does not approve unreviewed or uploader-authored hotspots',async()=>{
    expect((await review(reviewRequest({}),reviewCtx)).status).toBe(400);
    m.markerFind.mockResolvedValue({
      id:hotspotId,createdById:'independent-engineer',isApproved:false,
      componentId:'part-a',component:{assetId:'asset-a',lifecycleStatus:'operational'},
    });
    expect((await review(reviewRequest(reviewBody),reviewCtx)).status).toBe(409);
    expect(m.markerUpdate).not.toHaveBeenCalled();
  });
  it('requires a commissioned registered component before physical marker review',async()=>{
    m.markerFind.mockResolvedValue({
      id:hotspotId,createdById:'marker-author',isApproved:false,
      componentId:'part-a',component:{assetId:'asset-a',lifecycleStatus:'uncommissioned'},
    });
    expect((await review(reviewRequest(reviewBody),reviewCtx)).status).toBe(409);
  });
  it('rejects a marker that races with scan withdrawal after the model lock',async()=>{
    let withdrawReads=0;
    m.source.mockImplementation(async(input:{where:{action:string}})=>{
      if(input.where.action==='create')return {newValues:JSON.stringify({
        sourceOrigin:'site-owned-scan',scanCapture:{method:'lidar',geometryUnits:'m',visibleSurfacesOnly:true},
      })};
      return ++withdrawReads>=2?{id:'withdraw-audit'}:null;
    });
    expect((await POST(request('POST',goodBody),context)).status).toBe(409);
    expect(m.markerCreate).not.toHaveBeenCalled();
    expect(m.auditCreate).not.toHaveBeenCalled();
  });
  it('refuses approving a hotspot if the scan is withdrawn between precheck and lock',async()=>{
    let withdrawReads=0;
    m.source.mockImplementation(async(input:{where:{action:string}})=>{
      if(input.where.action==='create')return {newValues:JSON.stringify({
        sourceOrigin:'site-owned-scan',scanCapture:{method:'lidar',geometryUnits:'m',visibleSurfacesOnly:true},
      })};
      return ++withdrawReads>=2?{id:'withdraw-audit'}:null;
    });
    expect((await review(reviewRequest(reviewBody),reviewCtx)).status).toBe(409);
    expect(m.markerUpdate).not.toHaveBeenCalled();
    expect(m.auditCreate).not.toHaveBeenCalled();
  });
  it('prevents deletion of independently approved physical evidence',async()=>{
    m.markerFind.mockResolvedValue({id:hotspotId,componentId:'part-a',isApproved:true});
    const response=await DELETE(request('DELETE',{
      hotspotId,reason:'Actual scan hotspot correction needed for machine',
    }),context);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('immutable');
    expect(m.markerDelete).not.toHaveBeenCalled();
  });
  it('allows audited withdrawal of a private, unapproved draft marker',async()=>{
    const response=await DELETE(request('DELETE',{
      hotspotId,reason:'Incorrect draft position; recreate before review',
    }),context);
    expect(response.status).toBe(200);
    expect(m.markerDelete).toHaveBeenCalledOnce();
    expect(m.auditCreate.mock.calls[0][0].data.action).toBe('delete');
  });
  it('independent engineer signs approval with immutable site-scan audit',async()=>{
    expect((await review(reviewRequest(reviewBody),reviewCtx)).status).toBe(200);
    expect(m.markerUpdate.mock.calls[0][0].data).toMatchObject({
      isApproved:true,reviewedById:'independent-engineer',
    });
    expect(m.auditCreate.mock.calls[0][0].data).toMatchObject({
      action:'approve',entityType:'site_scan_hotspot',
    });
  });
});
