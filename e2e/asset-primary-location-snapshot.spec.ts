import {test,expect} from '@playwright/test';

test('isolated primary relocation preserves historical request and work order location snapshots',async({request})=>{
 if(process.env.CI!=='true'||process.env.PLAYWRIGHT_BASE_URL!=='http://127.0.0.1:3000'||!process.env.DATABASE_URL?.includes('/platform_e2e?')){
  if(process.env.CI)throw new Error('Requires isolated platform CI');
  test.skip(true,'Only isolated platform CI');
 }
 test.setTimeout(120000);
 const login=await request.post('/api/auth/login',{data:{username:'admin',password:'admin123'}});
 expect(login.status()).toBe(200);
 const headers={Authorization:'Bearer '+(await login.json()).data.token};
 const get=async(url:string)=>{
  const response=await request.get(url,{headers});
  expect(response.status(),await response.text()).toBe(200);
  return (await response.json()).data;
 };
 const post=async(url:string,data:Record<string,unknown>)=>{
  const response=await request.post(url,{headers,data});
  expect(response.status(),await response.text()).toBe(201);
  return (await response.json()).data;
 };
 const suffix=Date.now().toString(36).toUpperCase();
 const plantId=(await get('/api/plants'))[0]?.id;
 const categoryId=(await get('/api/asset-categories'))[0]?.id;
 expect(plantId).toBeTruthy();expect(categoryId).toBeTruthy();
 const system=(await get('/api/hierarchy-systems')).find((s:{isPrimary:boolean;isActive:boolean})=>s.isPrimary&&s.isActive);
 expect(system?.id).toBeTruthy();
 const levels=(system.levels as {id:string;order:number;isActive:boolean;allowAssetAssignment:boolean}[]).filter(l=>l.isActive).sort((a,b)=>a.order-b.order);
 const index=levels.findIndex(l=>l.allowAssetAssignment);
 expect(index).toBeGreaterThanOrEqual(0);
 let parentId:string|null=null;
 const location=(levelId:string,parentId:string|null,name:string,codeSegment:string)=>post('/api/functional-locations',{
  hierarchySystemId:system.id,hierarchyLevelId:levelId,parentId,plantId,name,codeSegment,
 });
 for(let i=0;i<index;i++){
  const node=await location(levels[i].id,parentId,'CI parent '+suffix+' '+i,i===0?'CI'+suffix:'L'+i);
  parentId=node.id;
 }
 const first=await location(levels[index].id,parentId,'CI original '+suffix,'A'+suffix);
 const next=await location(levels[index].id,parentId,'CI destination '+suffix,'B'+suffix);
 const asset=await post('/api/assets',{name:'CI snapshot '+suffix,assetTag:'CI-SNAP-'+suffix,plantId,categoryId,status:'operational',functionalLocationId:first.id});
 const assignmentUrl='/api/assets/'+asset.id+'/functional-locations';
 expect((await get(assignmentUrl)).primary.functionalLocationId).toBe(first.id);
 const mr=await post('/api/maintenance-requests',{title:'CI before move '+suffix,assetId:asset.id,plantId});
 const wo=await post('/api/work-orders',{title:'CI before move '+suffix,assetId:asset.id,plantId,type:'corrective'});
 const snapshot=(loc:{id:string;name:string;locationCode:string})=>({
  functionalLocationIdSnapshot:loc.id,functionalLocationNameSnapshot:loc.name,functionalLocationCodeSnapshot:loc.locationCode,functionalLocationSourceSnapshot:'structured',
 });
 expect(mr).toMatchObject(snapshot(first));
 expect(wo).toMatchObject(snapshot(first));
 expect(mr.functionalLocationPathSnapshot).toContain(first.name);
 expect(wo.functionalLocationPathSnapshot).toContain(first.name);
 await post(assignmentUrl,{functionalLocationId:next.id,reason:'CI primary relocation'});
 expect((await get(assignmentUrl)).primary.functionalLocationId).toBe(next.id);
 const oldRequest=await get('/api/maintenance-requests/'+mr.id);
 const oldOrder=await get('/api/work-orders/'+wo.id);
 expect(oldRequest).toMatchObject(snapshot(first));
 expect(oldOrder).toMatchObject(snapshot(first));
 expect(oldRequest.functionalLocationPathSnapshot).toBe(mr.functionalLocationPathSnapshot);
 expect(oldOrder.functionalLocationPathSnapshot).toBe(wo.functionalLocationPathSnapshot);
 expect(oldRequest.asset.functionalLocation.id).toBe(next.id);
 const after=await post('/api/maintenance-requests',{title:'CI after move '+suffix,assetId:asset.id,plantId});
 expect(after).toMatchObject(snapshot(next));
 expect(after.functionalLocationPathSnapshot).toContain(next.name);
});
