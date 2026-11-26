import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const m=vi.hoisted(()=>({department:vi.fn(),create:vi.fn(),update:vi.fn(),plant:vi.fn(),scope:vi.fn(),access:vi.fn(),audit:vi.fn()}));
vi.mock('@/lib/db',()=>({db:{department:{findUnique:m.department,create:m.create,update:m.update},plant:{findUnique:m.plant},auditLog:{create:m.audit}}}));
vi.mock('@/lib/auth',()=>({getSession:()=>({userId:'admin-fixture'}),isAdmin:()=>true}));
vi.mock('@/lib/plant-scope',()=>({getPlantScope:m.scope,canAccessPlantStrict:m.access,getPlantFilterWhere:()=>({})}));
vi.mock('@/lib/maintenance-approvers',()=>({getMaintenanceApproverEligibility:async()=>({eligible:true}),maintenanceApproverErrorMessage:()=>''}));
import {POST} from '../route';
import {GET,PUT} from '../[id]/route';
const url='http://localhost/api/departments';
const params={params:Promise.resolve({id:'dept'})};
const existing={id:'dept',plantId:'a',parentId:null,supervisorId:null,children:[],name:'Department',code:'D'};
const put=(body:object)=>PUT(new NextRequest(url+'/dept',{method:'PUT',body:JSON.stringify(body)}),params);
const post=(body:object)=>POST(new NextRequest(url,{method:'POST',body:JSON.stringify({name:'Child',code:'C',plantId:'a',...body})}));
beforeEach(()=>{
  vi.resetAllMocks();
  m.plant.mockResolvedValue({id:'a'});
  m.scope.mockResolvedValue({denyAccess:false});
  m.access.mockImplementation((_s:unknown,id:string)=>id==='a');
  m.update.mockResolvedValue(existing);
  m.create.mockResolvedValue(existing);
});
describe('department setup integrity',()=>{
  it('denies direct detail lookup outside the selected plant',async()=>{
    m.department.mockResolvedValueOnce({...existing,plantId:'b'});
    expect((await GET(new NextRequest(url+'/dept'),params)).status).toBe(403);
  });
  it('filters inconsistent legacy child links from detail results',async()=>{
    m.department.mockResolvedValueOnce({...existing,children:[{id:'valid',plantId:'a'},{id:'foreign',plantId:'b'}]});
    const response=await GET(new NextRequest(url+'/dept'),params);
    expect(response.status).toBe(200);
    expect((await response.json()).data.children).toEqual([{id:'valid',plantId:'a'}]);
  });
  it('rejects cross-plant parent on creation',async()=>{
    m.department.mockResolvedValueOnce({plantId:'b',parentId:null});
    expect((await post({parentId:'foreign'})).status).toBe(400);
    expect(m.create).not.toHaveBeenCalled();
  });
  it('rejects circular reparenting through a descendant',async()=>{
    m.department.mockResolvedValueOnce(existing).mockResolvedValueOnce({plantId:'a',parentId:'dept'});
    expect((await put({parentId:'descendant'})).status).toBe(400);
    expect(m.update).not.toHaveBeenCalled();
  });
  it('rejects moving a department with assigned assets',async()=>{
    m.department.mockResolvedValueOnce(existing).mockResolvedValueOnce({_count:{children:0,assets:1,pmSchedules:0}});
    expect((await put({plantId:'b'})).status).toBe(409);
    expect(m.update).not.toHaveBeenCalled();
  });
  it('rejects retaining a parent from the old plant during reassignment',async()=>{
    m.department.mockResolvedValueOnce({...existing,parentId:'parent'}).mockResolvedValueOnce({_count:{children:0,assets:0,pmSchedules:0}}).mockResolvedValueOnce({plantId:'a',parentId:null});
    expect((await put({plantId:'b'})).status).toBe(400);
    expect(m.update).not.toHaveBeenCalled();
  });
  it('allows a valid same-plant parent',async()=>{
    m.department.mockResolvedValueOnce(existing).mockResolvedValueOnce({plantId:'a',parentId:null});
    expect((await put({parentId:'parent'})).status).toBe(200);
    expect(m.update).toHaveBeenCalledOnce();
  });
});
