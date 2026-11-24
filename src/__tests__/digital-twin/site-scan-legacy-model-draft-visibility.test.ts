import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';

const m=vi.hoisted(()=>({
  getSession:vi.fn(),hasPermission:vi.fn(),isAdmin:vi.fn(),
  getPlantScope:vi.fn(),canAccessPlantStrict:vi.fn(),findUnique:vi.fn(),
}));
vi.mock('@/lib/auth',()=>({getSession:m.getSession,hasPermission:m.hasPermission,isAdmin:m.isAdmin}));
vi.mock('@/lib/plant-scope',()=>({getPlantScope:m.getPlantScope,canAccessPlantStrict:m.canAccessPlantStrict}));
vi.mock('@/lib/db',()=>({db:{assetModel:{findUnique:m.findUnique}}}));
import {GET} from '@/app/api/asset-models/[id]/route';

const request=new NextRequest('http://localhost/api/asset-models/model-abc');
const params={params:Promise.resolve({id:'model-abc'})};
beforeEach(()=>{
  vi.clearAllMocks();
  m.getSession.mockReturnValue({userId:'viewer-one'});
  m.isAdmin.mockReturnValue(false);
  m.hasPermission.mockImplementation((_s:unknown,p:string)=>p==='digital_twin.view');
  m.getPlantScope.mockResolvedValue({plantId:'plant-one',denyAccess:false});
  m.canAccessPlantStrict.mockReturnValue(true);
  m.findUnique.mockResolvedValue({
    id:'model-abc',isActive:false,
    filePath:'/api/smart-anatomy/models/model-abc/file',
    asset:{plantId:'plant-one'},bindings:[],name:'Unapproved proprietary OEM scan',
  });
});
describe('legacy asset-model detail endpoint must not disclose private drafts',()=>{
  it('rejects unauthenticated viewers before queries',async()=>{
    m.getSession.mockReturnValue(null);
    expect((await GET(request,params)).status).toBe(401);
    expect(m.findUnique).not.toHaveBeenCalled();
  });
  it('hides unapproved model metadata from ordinary same-plant viewers',async()=>{
    const response=await GET(request,params);
    expect(response.status).toBe(403);
    expect((await response.json()).error).toContain('restricted');
  });
  it('permits privileged plant engineers to examine their drafts',async()=>{
    m.hasPermission.mockReturnValue(true);
    const response=await GET(request,params);
    expect(response.status).toBe(200);
    expect((await response.json()).data.name).toContain('Unapproved');
  });
  it('does not leak a private model across plant boundaries, even for managers',async()=>{
    m.hasPermission.mockReturnValue(true);
    m.canAccessPlantStrict.mockReturnValue(false);
    expect((await GET(request,params)).status).toBe(403);
  });
  it('keeps independently approved models visible to plant viewers',async()=>{
    m.findUnique.mockResolvedValue({
      id:'model-abc',isActive:true,
      asset:{plantId:'plant-one'},bindings:[],
      filePath:'/api/smart-anatomy/models/model-abc/file',name:'Approved geometry',
    });
    expect((await GET(request,params)).status).toBe(200);
  });
});
