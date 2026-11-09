import { beforeEach,describe,expect,it,vi } from 'vitest';
import { NextRequest } from 'next/server';
const m=vi.hoisted(()=>({
  session:vi.fn(),admin:vi.fn(),permission:vi.fn(),scope:vi.fn(),access:vi.fn(),orders:vi.fn(),
}));
vi.mock('@/lib/auth',()=>({getSession:m.session,isAdmin:m.admin,hasPermission:m.permission}));
vi.mock('@/lib/plant-scope',()=>({getPlantScope:m.scope,canAccessPlantStrict:m.access}));
vi.mock('@/lib/db',()=>({db:{workOrder:{findMany:m.orders}}}));
import { GET } from '@/app/api/pm-assignments/planning-conflicts/route';
const req=(query='')=>new NextRequest('http://localhost/api/pm-assignments/planning-conflicts'+query);
const first={
  id:'wo-1',woNumber:'WO-1',assetId:'asset-1',assetName:'C314',
  plantId:'plant-1',status:'planned',plannedStart:new Date('2026-11-10T09:00:00Z'),
  plannedEnd:new Date('2026-11-10T11:00:00Z'),assignedTo:'tech-1',teamLeaderId:null,
  taskExecutions:[{pmScheduleTaskId:'task-1',pmScheduleTask:{equipmentState:'running'}}],
};
describe('read-only enterprise PM scheduling conflicts API',()=>{
 beforeEach(()=>{
   vi.clearAllMocks();
   m.session.mockReturnValue({userId:'planner-1'});
   m.admin.mockReturnValue(false);
   m.permission.mockReturnValue(true);
   m.scope.mockResolvedValue({isSystemWide:false,isScoped:false,plantId:null,
     accessiblePlantIds:['plant-1'],denyAccess:false});
   m.access.mockImplementation((_scope,id)=>id==='plant-1');
   m.orders.mockResolvedValue([first,{...first,id:'wo-2',woNumber:'WO-2',
     assignedTo:'tech-2',taskExecutions:[{pmScheduleTaskId:'task-2',
       pmScheduleTask:{equipmentState:'standstill'}}]}]);
 });
 it('rejects unauthenticated and insufficient-permission callers before DB access',async()=>{
   m.session.mockReturnValue(null);
   expect((await GET(req())).status).toBe(401);
   m.session.mockReturnValue({userId:'planner-1'});
   m.permission.mockReturnValue(false);
   expect((await GET(req())).status).toBe(403);
   expect(m.orders).not.toHaveBeenCalled();
 });
 it('fails closed on unauthorized plant selection',async()=>{
   const res=await GET(req('?plantId=plant-2'));
   expect(res.status).toBe(403);
   expect(m.orders).not.toHaveBeenCalled();
 });
 it('narrowly queries the accessible plant list and reports same-machine state conflicts',async()=>{
   const res=await GET(req('?windowDays=30'));
   const payload=await res.json();
   expect(res.status).toBe(200);
   expect(m.orders).toHaveBeenCalledWith(expect.objectContaining({
     where:expect.objectContaining({
       plantId:{in:['plant-1']},status:{notIn:['completed','verified','closed','cancelled']},
     }),
     select:expect.objectContaining({taskExecutions:expect.anything()}),
   }));
   expect(payload.data.conflicts).toMatchObject([{code:'incompatible_machine_state',severity:'high'}]);
   expect(payload.data.evaluated).toBe(2);
 });
 it('filters by one explicitly permitted plant',async()=>{
   const res=await GET(req('?plantId=plant-1&windowDays=7'));
   expect(res.status).toBe(200);
   expect(m.orders).toHaveBeenCalledWith(expect.objectContaining({
     where:expect.objectContaining({plantId:'plant-1'}),
   }));
 });
 it('does not infer conflicts for users with zero plant assignments',async()=>{
   m.scope.mockResolvedValue({isSystemWide:false,isScoped:false,
     plantId:null,accessiblePlantIds:[],denyAccess:false});
   m.orders.mockResolvedValue([]);
   const res=await GET(req());
   expect(res.status).toBe(200);
   expect(m.orders).toHaveBeenCalledWith(expect.objectContaining({
     where:expect.objectContaining({plantId:{in:[]}}),
   }));
 });
 it('enforces allowed planning horizons and avoids unbounded database reads',async()=>{
   expect((await GET(req('?windowDays=5'))).status).toBe(400);
   expect(m.orders).not.toHaveBeenCalled();
 });
 it('returns 422 instead of silently truncating large multi-plant conflict reports',async()=>{
   m.orders.mockResolvedValue(Array(1501).fill(first));
   const res=await GET(req());
   expect(res.status).toBe(422);
   expect((await res.json()).error).toMatch(/never silently truncated/);
 });
});
