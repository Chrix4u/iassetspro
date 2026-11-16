import {test,expect} from '@playwright/test';

test('isolated UAT: factory workbook atomically commissions machine, coded location, parts, OEM limits and part meters',async ({request})=>{
 test.skip(process.env.CI!=='true'||!process.env.DATABASE_URL?.includes('/platform_e2e?schema=public')||
  process.env.PLAYWRIGHT_BASE_URL!=='http://127.0.0.1:3000','Only isolated platform CI may create commissioning fixtures');
 test.setTimeout(95_000);
 const login=await request.post('/api/auth/login',{data:{username:'admin',password:'admin123'}});
 expect(login.status()).toBe(200);
 const token=(await login.json()).data.token as string;
 const headers={Authorization:'Bearer '+token};
 const [plantsRes,categoriesRes]=await Promise.all([
  request.get('/api/plants',{headers}),request.get('/api/asset-categories',{headers})]);
 expect(plantsRes.status()).toBe(200);
 expect(categoriesRes.status()).toBe(200);
 const plants=(await plantsRes.json()).data as Array<{id:string;code:string}>;
 const categories=(await categoriesRes.json()).data as Array<{id:string;code:string}>;
 expect(plants.length).toBeGreaterThan(0);expect(categories.length).toBeGreaterThan(0);
 const plant=plants[0],category=categories[0],suffix=String(Date.now());
 const hierarchy=await request.post('/api/hierarchy-systems',{headers,data:{
  name:'CI Commissioning '+suffix,code:'CI'+suffix,purpose:'functional_location',
  codeMode:'generated',isPrimary:false,levels:[{order:1,label:'CI Machine Location',allowAssetAssignment:true}],
 }});
 expect(hierarchy.status()).toBe(201);
 const system=(await hierarchy.json()).data as {id:string;levels:Array<{id:string}>};
 expect(system.levels.length).toBe(1);
 const loc=await request.post('/api/functional-locations',{headers,data:{
  hierarchySystemId:system.id,hierarchyLevelId:system.levels[0].id,
  name:'CI Test Installation '+suffix,codeSegment:'CI'+suffix,plantId:plant.id,
 }});
 expect(loc.status(),await loc.text()).toBe(201);
 const locationCode=(await loc.json()).data.locationCode as string;
 const machineCode='CI-ONB-'+suffix,partCode='CI-ONB-MOTOR-'+suffix;
 const data={
  Machines:[{machineCode,machineName:'Isolated CI Machine',plantCode:plant.code,
    categoryCode:category.code,locationCode,manufacturer:'CI simulated OEM',model:'Isolation',
    serialNumber:'CI-SN-'+suffix,criticality:'high',description:'No customer production data'}],
  Parts:[{machineCode,componentCode:partCode,name:'Motor bearing',componentType:'part',
   parentCode:'',manufacturer:'CI',modelNumber:'CI-M-1',criticality:'high'}],
  Parameters:[
   {ownerType:'machine',ownerCode:machineCode,name:'Temperature',inspectionType:'measurement',
    unit:'°C',min:0,max:90,reference:'CI reference only'},
   {ownerType:'part',ownerCode:partCode,name:'Vibration',inspectionType:'measurement',
    unit:'mm/s',min:0,max:4.2,reference:'CI-only threshold'}],
  Meters:[{ownerType:'part',ownerCode:partCode,name:'Motor running hours '+suffix,meterType:'runtime',unit:'hours',initialValue:155}],
  Visuals:[],
 };
 const invalid=await request.post('/api/assets/onboard-bulk',{headers,data:{
  ...data,Parts:[{...data.Parts[0],parentCode:'NOT-A-REAL-PARENT'}],dryRun:true}});
 expect(invalid.status()).toBe(400);
 const missing=await request.get('/api/assets?search='+machineCode,{headers});
 expect((await missing.json()).data.some((a:{assetTag:string})=>a.assetTag===machineCode)).toBe(false);
 const dry=await request.post('/api/assets/onboard-bulk',{headers,data:{...data,dryRun:true}});
 expect(dry.status(),await dry.text()).toBe(200);
 expect((await dry.json()).data.counts).toMatchObject({machines:1,parts:1,parameters:2,meters:1});
 const commit=await request.post('/api/assets/onboard-bulk',{headers,data:{...data,dryRun:false}});
 expect(commit.status(),await commit.text()).toBe(201);
 const imported=(await commit.json()).data;
 expect(imported.counts.machines).toBe(1);
 const machineId=imported.machineIds[0] as string;
 const detail=await request.get('/api/assets/'+machineId,{headers});
 expect(detail.status()).toBe(200);
 const m=(await detail.json()).data;
 expect(m.assetTag).toBe(machineCode);
 expect(JSON.parse(m.specification).inspectionParameters[0].max).toBe(90);
 const list=await request.get('/api/component-registry?assetId='+machineId,{headers});
 expect(list.status()).toBe(200);
 const parts=(await list.json()).data as Array<{id:string;componentCode:string}>;
 const part=parts.find(p=>p.componentCode===partCode);
 expect(part?.id).toBeTruthy();
 const checks=await request.get('/api/component-registry/'+part!.id+'/inspections',{headers});
 expect(checks.status(),await checks.text()).toBe(200);
 const rows=(await checks.json()).data;
 expect(rows.some((row:{name:string;normalRange:string})=>row.name==='Vibration'&&JSON.parse(row.normalRange).max===4.2)).toBe(true);
 const meter=await request.get('/api/assets/'+machineId+'/meters',{headers});
 expect(meter.status(),await meter.text()).toBe(200);
 expect((await meter.json()).data.some((r:{componentId:string;currentValue:number})=>r.componentId===part!.id&&r.currentValue===155)).toBe(true);
 const duplicate=await request.post('/api/assets/onboard-bulk',{headers,data:{...data,dryRun:false}});
 expect(duplicate.status()).toBe(409);
});
