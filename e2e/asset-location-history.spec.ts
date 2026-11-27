import {test,expect} from '@playwright/test';

test('isolated commissioning preserves independent locations and relocation history',async({request})=>{
 if(process.env.CI!=='true'||process.env.PLAYWRIGHT_BASE_URL!=='http://127.0.0.1:3000'||!process.env.DATABASE_URL?.includes('/platform_e2e?')){
  if(process.env.CI)throw new Error('Requires isolated platform CI');
  test.skip(true,'Only isolated platform CI');
 }
 test.setTimeout(120000);
 const login=await request.post('/api/auth/login',{data:{username:'admin',password:'admin123'}});
 expect(login.status()).toBe(200);
 const headers={Authorization:'Bearer '+(await login.json()).data.token};
 const suffix=String(Date.now());
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
 const plantId=(await get('/api/plants'))[0]?.id;
 const categoryId=(await get('/api/asset-categories'))[0]?.id;
 expect(plantId).toBeTruthy();expect(categoryId).toBeTruthy();
 const primary=(await get('/api/hierarchy-systems')).find((s:{isPrimary:boolean})=>s.isPrimary);
 expect(primary?.id).toBeTruthy();
 const system=async(code:string,purpose:string)=>{
  const created=await post('/api/hierarchy-systems',{name:'CI '+code+suffix,code:code+suffix,purpose,codeMode:'generated',isPrimary:false,levels:[{order:1,label:'Position',allowAssetAssignment:true}]});
  expect(created.isPrimary).toBe(false);
  return created;
 };
 const a=await system('CIA','process'),b=await system('CIB','electrical');
 const location=async(s:{id:string;levels:{id:string}[]},code:string)=>
  (await post('/api/functional-locations',{hierarchySystemId:s.id,hierarchyLevelId:s.levels[0].id,name:'CI '+code,codeSegment:code+suffix,plantId})).id as string;
 const first=await location(a,'FIRST'),next=await location(a,'NEXT'),independent=await location(b,'OTHER');
 const asset=await post('/api/assets',{name:'CI location history '+suffix,assetTag:'CI-LOC-'+suffix,plantId,categoryId,status:'operational',functionalLocationId:first});
 const url='/api/assets/'+asset.id+'/functional-locations';
 const initial=await get(url);
 expect(initial.primary).toBeNull();
 expect(initial.current).toHaveLength(1);
 expect(initial.current[0].functionalLocationId).toBe(first);
 const originalId=initial.current[0].id;
 const other=await post(url,{functionalLocationId:independent,reason:'Independent electrical location'});
 const moved=await post(url,{functionalLocationId:next,reason:'Isolated relocation'});
 const replay=await post(url,{functionalLocationId:next,reason:'Idempotent replay'});
 expect(replay.id).toBe(moved.id);
 const final=await get(url);
 expect(final.primary).toBeNull();
 expect(final.current).toHaveLength(2);
 expect(final.current.map((x:{id:string})=>x.id).sort()).toEqual([other.id,moved.id].sort());
 expect(final.history).toHaveLength(3);
 const previous=final.history.find((x:{id:string})=>x.id===originalId);
 expect(previous).toMatchObject({functionalLocationId:first});
 expect(previous.endedAt).toBeTruthy();
 expect(previous.endedById).toBeTruthy();
 expect(final.history.find((x:{id:string})=>x.id===moved.id)).toMatchObject({functionalLocationId:next,endedAt:null,reason:'Isolated relocation'});
 expect((await get('/api/hierarchy-systems')).find((s:{isPrimary:boolean})=>s.isPrimary).id).toBe(primary.id);
});
