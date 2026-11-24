import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';

const mocks=vi.hoisted(()=>({
  getSession:vi.fn(),hasPermission:vi.fn(),isAdmin:vi.fn(),
  getPlantScope:vi.fn(),canAccessPlantStrict:vi.fn(),
  asset:vi.fn(),location:vi.fn(),component:vi.fn(),
  meters:vi.fn(),photos:vi.fn(),models:vi.fn(),pm:vi.fn(),
  plans:vi.fn(),records:vi.fn(),
}));

vi.mock('@/lib/auth',()=>({
  getSession:mocks.getSession,hasPermission:mocks.hasPermission,isAdmin:mocks.isAdmin,
}));
vi.mock('@/lib/plant-scope',()=>({
  getPlantScope:mocks.getPlantScope,canAccessPlantStrict:mocks.canAccessPlantStrict,
}));
vi.mock('@/lib/db',()=>({db:{
  asset:{findUnique:mocks.asset},
  assetFunctionalLocationAssignment:{count:mocks.location},
  componentRegistry:{count:mocks.component},
  assetMeter:{findMany:mocks.meters},
  componentVisual:{findMany:mocks.photos},
  assetModel:{findMany:mocks.models},
  pmScheduleTask:{findMany:mocks.pm},
  productionShiftPlan:{count:mocks.plans},
  productionShiftRecord:{count:mocks.records},
}}));

import {GET} from '@/app/api/assets/[id]/commissioning-readiness/route';

const machine='machine-a',request=()=>new NextRequest(
  'http://localhost/api/assets/'+machine+'/commissioning-readiness',
);
const params={params:Promise.resolve({id:machine})};

beforeEach(()=>{
  vi.resetAllMocks();
  mocks.getSession.mockReturnValue({userId:'plant-reader'});
  mocks.isAdmin.mockReturnValue(false);
  mocks.hasPermission.mockImplementation((_session:unknown,permission:string)=>
    permission==='assets.view');
  mocks.getPlantScope.mockResolvedValue({denyAccess:false,plantId:'plant-a'});
  mocks.canAccessPlantStrict.mockImplementation((_scope:unknown,plantId:string)=>plantId==='plant-a');
  mocks.asset.mockResolvedValue({
    id:machine,plantId:'plant-a',manufacturer:'OEM',model:'M-2026',
    serialNumber:'SN-100',
    specification:JSON.stringify({inspectionParameters:[{
      key:'rpm',name:'Shaft speed',inspectionType:'measurement',
      unit:'rpm',min:500,max:1500,reference:'OEM document',
    }]}),
  });
  mocks.location.mockResolvedValue(1);
  mocks.component.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
  mocks.meters.mockResolvedValue([{
    meterType:'production',unit:'tonne',lastReadingAt:null,
  }]);
  mocks.photos.mockResolvedValue([
    {cameraData:JSON.stringify({viewpoint:'front'}),sourceProvider:'uploaded',
      imageUrl:'/private-component-photos/factory-photo-f4f9438d-5e92-499a-9abf-b66d6ba591ca.jpg'},
    {cameraData:JSON.stringify({viewpoint:'right'}),sourceProvider:'uploaded',
      imageUrl:'https://example.com/forged-upload.jpg'},
    {cameraData:JSON.stringify({viewpoint:'left'}),sourceProvider:'customer_supplied',
      imageUrl:'https://example.com/customer-reference.jpg'},
    {cameraData:JSON.stringify({viewpoint:'back'}),sourceProvider:'openai',
      imageUrl:'https://example.com/generated.jpg'},
  ]);
  mocks.models.mockResolvedValue([{isActive:false},{isActive:true}]);
  mocks.pm.mockResolvedValue([{basis:'calendar',pmType:'tbm',pmTaskId:'task-1'},
    {basis:'meter',pmType:'ubm',pmTaskId:'task-2'}]);
  mocks.plans.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
  mocks.records.mockResolvedValue(0);
});

describe('plant-scoped live machine commissioning readiness API',()=>{
  it('denies unauthenticated access before any asset or inventory read',async()=>{
    mocks.getSession.mockReturnValue(null);
    const response=await GET(request(),params);
    expect(response.status).toBe(401);
    expect(mocks.asset).not.toHaveBeenCalled();
  });
  it('requires asset view/update or engineering-management permissions',async()=>{
    mocks.hasPermission.mockReturnValue(false);
    const response=await GET(request(),params);
    expect(response.status).toBe(403);
    expect(mocks.asset).not.toHaveBeenCalled();
  });
  it('does not disclose cross-plant machine setup or CAD inventory',async()=>{
    mocks.asset.mockResolvedValueOnce({
      id:machine,plantId:'plant-b',manufacturer:'OEM',model:'PRIVATE',serialNumber:'SN',
      specification:'{}',
    });
    const response=await GET(request(),params);
    expect(response.status).toBe(403);
    expect(mocks.models).not.toHaveBeenCalled();
    expect(mocks.location).not.toHaveBeenCalled();
  });
  it('enforces setup evidence, not uploaded AI photos or unverified manufacturer CAD',async()=>{
    const response=await GET(request(),params);
    expect(response.status).toBe(200);
    const body=await response.json();
    const row=(key:string)=>body.data.checks.find((c:{key:string})=>c.key===key);
    expect(body.data.assetId).toBe(machine);
    expect(body.data.totalChecks).toBe(10);
    expect(row('location').state).toBe('configured');
    expect(row('parameters').state).toBe('configured');
    expect(row('photos').state).toBe('missing');
    expect(row('photos').detail).toContain('back');
    expect(row('cad').state).toBe('review');
    expect(row('cad').detail).toContain('unverified');
    expect(row('meters').state).toBe('review');
    expect(row('shifts').state).toBe('review');
    expect(row('production').state).toBe('missing');
    expect(body.data.physicalAcceptanceComplete).toBe(false);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('queries the selected machine only and the real roster and photo tables',async()=>{
    await GET(request(),params);
    expect(mocks.location).toHaveBeenCalledWith({where:{
      assetId:machine,endedAt:null,
      functionalLocation:{
        status:'active',plantId:'plant-a',
        hierarchySystem:{isActive:true},
        hierarchyLevel:{isActive:true,allowAssetAssignment:true},
      },
    }});
    expect(mocks.component).toHaveBeenCalledWith({where:{assetId:machine,lifecycleStatus:'uncommissioned'}});
    expect(mocks.photos).toHaveBeenCalledWith(expect.objectContaining({
      where:{assetId:machine,visualType:'photo',isActive:true},
    }));
    expect(mocks.models).toHaveBeenCalledWith(expect.objectContaining({
      where:{assetId:machine,filePath:{startsWith:'/api/smart-anatomy/models/'}},
    }));
    expect(mocks.pm).toHaveBeenCalledWith(expect.objectContaining({
      where:{assetId:machine,isActive:true},
      select:{basis:true,pmType:true,pmTaskId:true},
    }));
    expect(mocks.plans).toHaveBeenCalledTimes(2);
  });
});
