import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const mocks=vi.hoisted(()=>({component:vi.fn(),item:vi.fn(),findMany:vi.fn(),findFirst:vi.fn(),create:vi.fn(),remove:vi.fn(),scope:vi.fn(),access:vi.fn(),audit:vi.fn()}));
vi.mock('@/lib/db',()=>({db:{componentRegistry:{findUnique:mocks.component},inventoryItem:{findUnique:mocks.item},componentSparePart:{findMany:mocks.findMany,findFirst:mocks.findFirst,create:mocks.create,delete:mocks.remove}}}));
vi.mock('@/lib/auth',()=>({getSession:()=>({userId:'engineer'}),hasPermission:()=>true,isAdmin:()=>false}));
vi.mock('@/lib/plant-scope',()=>({getPlantScope:mocks.scope,canAccessPlantStrict:mocks.access}));
vi.mock('@/lib/audit',()=>({createAuditLog:mocks.audit}));
import {GET,POST,DELETE} from '@/app/api/component-registry/[id]/spare-parts/route';
const params={params:Promise.resolve({id:'part-a'})};
const url='http://localhost/api/component-registry/part-a/spare-parts';
const post=(body:object)=>POST(new NextRequest(url,{method:'POST',body:JSON.stringify({sparePartName:'Bearing',...body})}),params);
beforeEach(()=>{
  vi.resetAllMocks();
  mocks.scope.mockResolvedValue({denyAccess:false});
  mocks.access.mockImplementation((_scope:unknown,plantId:string)=>plantId==='plant-a');
  mocks.component.mockResolvedValue({id:'part-a',asset:{plantId:'plant-a'}});
  mocks.item.mockResolvedValue({id:'item-a',plantId:'plant-a',isActive:true});
  mocks.findFirst.mockResolvedValue(null);
  mocks.findMany.mockResolvedValue([]);
  mocks.create.mockResolvedValue({id:'link-a'});
});
describe('component spare part plant and quantity integrity',()=>{
  it('denies cross-plant removal before reading or deleting a link',async()=>{
    mocks.component.mockResolvedValue({id:'part-a',asset:{plantId:'plant-b'}});
    expect((await DELETE(new NextRequest(url+'?sparePartId=link-a',{method:'DELETE'}),params)).status).toBe(403);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('denies cross-plant inventory links',async()=>{
    mocks.item.mockResolvedValue({id:'item-a',plantId:'plant-b',isActive:true});
    expect((await post({inventoryItemId:'item-a'})).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('rejects inactive inventory',async()=>{
    mocks.item.mockResolvedValue({id:'item-a',plantId:'plant-a',isActive:false});
    expect((await post({inventoryItemId:'item-a'})).status).toBe(400);
  });
  it('filters existing inventory links to the selected component plant',async()=>{
    expect((await GET(new NextRequest(url),params)).status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{componentId:'part-a',OR:[{inventoryItemId:null},{inventoryItem:{plantId:'plant-a'}}]}}));
  });
  it.each([{quantityRequired:0},{quantityRequired:-1},{quantityRequired:1.5},{quantityRequired:'2abc'},{unitCost:-1},{leadTimeDays:-1},{leadTimeDays:1.5}])('rejects invalid quantity, cost or lead time %j',async values=>{
    expect((await post(values)).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('preserves explicit zero cost and lead time with a valid quantity',async()=>{
    expect((await post({inventoryItemId:'item-a',quantityRequired:2,unitCost:0,leadTimeDays:0})).status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({quantityRequired:2,unitCost:0,leadTimeDays:0})}));
  });
});
