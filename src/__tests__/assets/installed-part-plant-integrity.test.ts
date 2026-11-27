import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const m=vi.hoisted(()=>({component:vi.fn(),item:vi.fn(),material:vi.fn(),wo:vi.fn(),findMany:vi.fn(),findFirst:vi.fn(),aggregate:vi.fn(),create:vi.fn(),update:vi.fn(),scope:vi.fn(),access:vi.fn(),audit:vi.fn()}));
vi.mock('@/lib/db',()=>({db:{componentRegistry:{findUnique:m.component},inventoryItem:{findUnique:m.item},repairMaterialRequest:{findUnique:m.material},workOrder:{findUnique:m.wo},installedSparePart:{findMany:m.findMany,findFirst:m.findFirst,aggregate:m.aggregate,create:m.create,update:m.update}}}));
vi.mock('@/lib/auth',()=>({getSession:()=>({userId:'engineer'}),hasPermission:()=>true,isAdmin:()=>false}));
vi.mock('@/lib/plant-scope',()=>({getPlantScope:m.scope,canAccessPlantStrict:m.access}));
vi.mock('@/lib/audit',()=>({createAuditLog:m.audit}));
import {GET,POST} from '@/app/api/component-registry/[id]/installed-parts/route';
import {PATCH} from '@/app/api/component-registry/[id]/installed-parts/[installedPartId]/route';
const params={params:Promise.resolve({id:'part-a'})};
const url='http://localhost/api/component-registry/part-a/installed-parts';
const post=(body:object)=>POST(new NextRequest(url,{method:'POST',body:JSON.stringify({partName:'Bearing',...body})}),params);
beforeEach(()=>{
 vi.resetAllMocks();
 m.scope.mockResolvedValue({denyAccess:false});
 m.access.mockImplementation((scope:{denyAccess?:boolean},plantId:string)=>!scope.denyAccess&&plantId==='plant-a');
 m.component.mockResolvedValue({id:'part-a',assetId:'asset-a',asset:{plantId:'plant-a'}});
 m.item.mockResolvedValue({id:'item-a',itemCode:'A',name:'Bearing',plantId:'plant-a',isActive:true});
 m.wo.mockResolvedValue({id:'wo-a',assetId:'asset-a',plantId:'plant-a'});
 m.material.mockResolvedValue({id:'mr-a',plantId:'plant-a',workOrderId:'wo-a',itemId:'item-a',itemName:'Bearing',componentRegistryId:'part-a',quantityIssued:2,quantityReturned:0,consumedQty:1,status:'issued'});
 m.aggregate.mockResolvedValue({_sum:{quantity:0}});
 m.findMany.mockResolvedValue([]);
 m.findFirst.mockResolvedValue(null);
 m.create.mockResolvedValue({id:'installed-a'});
});
describe('installed part plant and source integrity',()=>{
 it('denies out-of-scope components and orphan components',async()=>{
  for(const asset of [{plantId:'plant-b'},null]){
   m.component.mockResolvedValue({id:'part-a',asset});
   expect((await GET(new NextRequest(url),params)).status).toBe(403);
   expect((await post({})).status).toBe(403);
  }
  expect(m.findMany).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();
 });
 it('filters legacy links before returning related inventory and work order information',async()=>{
  expect((await GET(new NextRequest(url),params)).status).toBe(200);
  expect(m.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{componentId:'part-a',AND:[
   {OR:[{inventoryItemId:null},{inventoryItem:{plantId:'plant-a'}}]},
   {OR:[{workOrderId:null},{workOrder:{plantId:'plant-a'}}]},
   {OR:[{materialRequestId:null},{materialRequest:{AND:[{OR:[{plantId:'plant-a'},{plantId:null}]},{workOrder:{plantId:'plant-a'}}]}}]},
  ]}}));
 });
 it('rejects foreign inventory',async()=>{m.item.mockResolvedValue({id:'item-a',plantId:'plant-b',isActive:true});expect((await post({inventoryItemId:'item-a'})).status).toBe(400);expect(m.create).not.toHaveBeenCalled();});
 it('rejects inactive direct inventory links',async()=>{m.item.mockResolvedValue({id:'item-a',plantId:'plant-a',isActive:false});expect((await post({inventoryItemId:'item-a'})).status).toBe(400);expect(m.create).not.toHaveBeenCalled();});
 it('rejects foreign work orders even if their asset is unassigned',async()=>{m.wo.mockResolvedValue({id:'wo-a',assetId:null,plantId:'plant-b'});expect((await post({workOrderId:'wo-a'})).status).toBe(400);expect(m.create).not.toHaveBeenCalled();});
 it('rejects foreign material requests',async()=>{m.material.mockResolvedValue({id:'mr-a',plantId:'plant-b'});expect((await post({materialRequestId:'mr-a'})).status).toBe(400);expect(m.create).not.toHaveBeenCalled();});
 it('rejects fabricated material provenance',async()=>{expect((await post({sourceType:'material_request'})).status).toBe(400);expect(m.create).not.toHaveBeenCalled();});
 it('rejects boolean quantities',async()=>{expect((await post({quantity:true})).status).toBe(400);expect(m.create).not.toHaveBeenCalled();});
 it('accepts valid same-plant issued material and preserves fractional quantities',async()=>{expect((await post({materialRequestId:'mr-a',quantity:0.5})).status).toBe(201);expect(m.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({quantity:0.5,sourceType:'material_request',workOrderId:'wo-a',inventoryItemId:'item-a'})}));});
 it('denies foreign part scrap disposition',async()=>{m.findFirst.mockResolvedValue({id:'installed-a',status:'installed',component:{asset:{plantId:'plant-b'}}});expect((await PATCH(new NextRequest(url+'/installed-a',{method:'PATCH',body:JSON.stringify({status:'scrapped',removalReason:'Damaged'})}),{params:Promise.resolve({id:'part-a',installedPartId:'installed-a'})})).status).toBe(403);expect(m.update).not.toHaveBeenCalled();});
});
