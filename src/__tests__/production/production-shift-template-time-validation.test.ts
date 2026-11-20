import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks=vi.hoisted(()=>({
  getSession:vi.fn(),hasPermission:vi.fn(),isAdmin:vi.fn(),
  getPlantScope:vi.fn(),canAccessPlantStrict:vi.fn(),
  plantFindUnique:vi.fn(),shiftCreate:vi.fn(),
}));
vi.mock('@/lib/auth',()=>({
  getSession:mocks.getSession,hasPermission:mocks.hasPermission,isAdmin:mocks.isAdmin,
}));
vi.mock('@/lib/plant-scope',()=>({
  getPlantScope:mocks.getPlantScope,canAccessPlantStrict:mocks.canAccessPlantStrict,
}));
vi.mock('@/lib/db',()=>({
  db:{
    plant:{findUnique:mocks.plantFindUnique},
    productionShiftTemplate:{create:mocks.shiftCreate},
  },
}));
import { POST } from '@/app/api/production-surveys/setup/route';

const base={
  plantId:'plant-1',code:'shift1',name:'Shift 1',startsAt:'08:00',endsAt:'16:00',
};
const submit=(change:Record<string,unknown>={})=>POST(new NextRequest('http://localhost/api/production-surveys/setup',{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...base,...change}),
}));

beforeEach(()=>{
  vi.clearAllMocks();
  mocks.getSession.mockReturnValue({userId:'planner-1'});
  mocks.hasPermission.mockReturnValue(true);
  mocks.isAdmin.mockReturnValue(false);
  mocks.getPlantScope.mockResolvedValue({denyAccess:false});
  mocks.canAccessPlantStrict.mockReturnValue(true);
  mocks.plantFindUnique.mockResolvedValue({id:'plant-1'});
  mocks.shiftCreate.mockImplementation(async({data})=>({id:'saved-shift',...data}));
});

describe('production shift template time validation',()=>{
  it.each([
    {startsAt:'24:00',endsAt:'08:00'},
    {startsAt:'25:00',endsAt:'09:00'},
    {startsAt:'08:60',endsAt:'17:00'},
    {startsAt:'not-a-time',endsAt:'still-invalid'},
    {startsAt:800,endsAt:1600},
    {startsAt:'08:00',endsAt:'08:00:00'},
  ])('rejects explicitly invalid times %j without writing',async(change)=>{
    const response=await submit(change);
    expect(response.status).toBe(400);
    expect(mocks.shiftCreate).not.toHaveBeenCalled();
  });
  it.each([
    {startsAt:'08:00',endsAt:null},
    {startsAt:null,endsAt:'16:00'},
    {startsAt:'08:00',endsAt:'08:00'},
  ])('rejects incomplete or identical shift clock times %j',async(change)=>{
    const response=await submit(change);
    expect(response.status).toBe(400);
    expect(mocks.shiftCreate).not.toHaveBeenCalled();
  });
  it('accepts an overnight shift and preserves both supplied times',async()=>{
    const response=await submit({startsAt:' 22:00 ',endsAt:' 06:00 '});
    expect(response.status).toBe(201);
    expect(mocks.shiftCreate).toHaveBeenCalledWith({data:expect.objectContaining({
      startsAt:'22:00',endsAt:'06:00',
    })});
  });
  it('still permits a reusable unscheduled template when both times are blank',async()=>{
    const response=await submit({startsAt:null,endsAt:''});
    expect(response.status).toBe(201);
    expect(mocks.shiftCreate).toHaveBeenCalledWith({data:expect.objectContaining({
      startsAt:null,endsAt:null,
    })});
  });
  it('keeps valid explicit daytime clock values unchanged',async()=>{
    const response=await submit();
    expect(response.status).toBe(201);
    expect(mocks.shiftCreate).toHaveBeenCalledWith({data:expect.objectContaining({
      startsAt:'08:00',endsAt:'16:00',
    })});
  });
});
