import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';

const mocks=vi.hoisted(()=>({
  getSession:vi.fn(),hasPermission:vi.fn(),isAdmin:vi.fn(),
  getPlantScope:vi.fn(),canAccessPlantStrict:vi.fn(),
  asset:vi.fn(),components:vi.fn(),component:vi.fn(),
  createVisual:vi.fn(),updateMany:vi.fn(),audit:vi.fn(),lock:vi.fn(),transaction:vi.fn(),
}));
vi.mock('@/lib/auth',()=>({
  getSession:mocks.getSession,hasPermission:mocks.hasPermission,isAdmin:mocks.isAdmin,
}));
vi.mock('@/lib/plant-scope',()=>({
  getPlantScope:mocks.getPlantScope,canAccessPlantStrict:mocks.canAccessPlantStrict,
}));
vi.mock('@/lib/db',()=>({db:{
  asset:{findUnique:mocks.asset},
  componentRegistry:{findMany:mocks.components,findUnique:mocks.component},
  componentVisual:{create:mocks.createVisual,updateMany:mocks.updateMany},
  $transaction:mocks.transaction,
}}));
import {POST} from '@/app/api/component-visuals/route';

const assetId='machine-a';
const payload=(hotspots:unknown,options:Record<string,unknown>={})=>({
  assetId,visualType:'photo',title:'Actual factory machine photograph',
  imageUrl:'https://example.com/site-real-machine.jpg',
  sourceProvider:'customer_supplied',cameraData:{viewpoint:'front'},
  hotspotData:hotspots,...options,
});
const req=(data:unknown)=>new NextRequest('http://localhost/api/component-visuals',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),
});

beforeEach(()=>{
  vi.resetAllMocks();
  mocks.getSession.mockReturnValue({userId:'engineer'});
  mocks.hasPermission.mockImplementation((_session:unknown,permission:string)=>permission==='digital_twin.manage');
  mocks.isAdmin.mockReturnValue(false);
  mocks.getPlantScope.mockResolvedValue({denyAccess:false,plantId:'plant-a'});
  mocks.canAccessPlantStrict.mockImplementation((_scope:unknown,plantId:string)=>plantId==='plant-a');
  mocks.asset.mockResolvedValue({plantId:'plant-a'});
  mocks.components.mockResolvedValue([{id:'part-a'}]);
  mocks.createVisual.mockResolvedValue({id:'photo-a',assetId});
  mocks.audit.mockResolvedValue({id:'audit-a'});
  mocks.transaction.mockImplementation(async(callback:(tx:unknown)=>Promise<unknown>)=>
    callback({componentVisual:{create:mocks.createVisual,updateMany:mocks.updateMany},
      auditLog:{create:mocks.audit},$executeRawUnsafe:mocks.lock}));
});

describe('photo hotspot registration validates actual machine parts at first write',()=>{
  it('does not let a JSON URL impersonate a protected factory upload',async()=>{
    const response=await POST(req(payload([], {sourceProvider:'uploaded'})));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('protected factory photo upload');
    expect(mocks.asset).not.toHaveBeenCalled();
    expect(mocks.createVisual).not.toHaveBeenCalled();
  });
  it('saves external references without calling them protected uploads',async()=>{
    const external=payload([], {sourceProvider:'external_reference'});
    const response=await POST(req(external));
    expect(response.status).toBe(201);
    expect(mocks.createVisual).toHaveBeenCalledWith({data:expect.objectContaining({
      sourceProvider:'external_reference',
    })});
  });
  it('does not attempt a DB lookup without a valid session',async()=>{
    mocks.getSession.mockReturnValue(null);
    const response=await POST(req(payload([{componentId:'part-a',x:0.5,y:0.5}])));
    expect(response.status).toBe(401);
    expect(mocks.asset).not.toHaveBeenCalled();
  });
  it('refuses a foreign-plant photo and never validates or saves its component refs',async()=>{
    mocks.asset.mockResolvedValueOnce({plantId:'plant-b'});
    const response=await POST(req(payload([{componentId:'part-a',x:0.5,y:0.5}])));
    expect(response.status).toBe(404);
    expect(mocks.components).not.toHaveBeenCalled();
    expect(mocks.createVisual).not.toHaveBeenCalled();
  });
  it('rejects cross-machine component links before creating any visual',async()=>{
    mocks.components.mockResolvedValueOnce([]);
    const response=await POST(req(payload([{componentId:'foreign-part',x:0.5,y:0.5}])));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('components of this machine');
    expect(mocks.components).toHaveBeenCalledWith({
      where:{assetId,id:{in:['foreign-part']}},select:{id:true},
    });
    expect(mocks.createVisual).not.toHaveBeenCalled();
  });
  it.each([
    [[{componentId:'part-a',x:-0.3,y:0.5}]],
    [[{componentId:'part-a',x:1.1,y:0.5}]],
    [[{componentId:'part-a',x:'0.5',y:0.5}]],
    [[{componentId:'part-a',x:null,y:0.5}]],
    [[{componentId:'part-a',x:0.5,y:NaN}]],
    ['not-an-array'],
  ])('rejects malformed, missing or off-image hotspot coordinates',async markers=>{
    const response=await POST(req(payload(markers)));
    expect(response.status).toBe(400);
    expect(mocks.createVisual).not.toHaveBeenCalled();
  });
  it('commits primary photo replacement, new visual and audit in one transaction',async()=>{
    const response=await POST(req(payload([{componentId:'part-a',x:0.3,y:0.7}],
      {isPrimary:true})));
    expect(response.status).toBe(201);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.lock).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      'iassetspro:component-visual-primary:machine-a:machine:photo',
    );
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where:{isPrimary:true,visualType:'photo',assetId,componentId:null},
      data:{isPrimary:false},
    });
    expect(mocks.createVisual).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledWith({data:expect.objectContaining({
      entityType:'component_visual',entityId:'photo-a',action:'create',
    })});
  });

  it('persists only normalized machine-scoped hotspot coordinates',async()=>{
    const response=await POST(req(payload([{componentId:' part-a ',x:0.15,y:0.85}])));
    expect(response.status).toBe(201);
    expect(mocks.components).toHaveBeenCalledWith({
      where:{assetId,id:{in:['part-a']}},select:{id:true},
    });
    expect(mocks.createVisual).toHaveBeenCalledWith({data:expect.objectContaining({
      assetId,visualType:'photo',
      hotspotData:JSON.stringify([{componentId:'part-a',x:0.15,y:0.85}]),
    })});
  });
});
