import {test,expect} from '@playwright/test';
import {getToken,lookupAssetId,lookupPlantId} from './helpers/api';

/**
 * A real multipart file-to-hotspot API journey in disposable Repairs UAT.
 * This synthetic pixel is a transport fixture, never an alleged machine photo.
 * No writes to the live plant, releases or asset records.
 */
test('UAT: private machine photo upload, registered part hotspot and plant-safe retrieval',async ({request})=>{
  test.skip(process.env.CI!=='true'||!(process.env.DATABASE_URL||'').includes('repairs_uat'),
    'Only the disposable CI Repairs UAT database may receive this test photo');
  test.setTimeout(120_000);
  const planner=await getToken('planner');
  const assetId=await lookupAssetId(planner,'UAT-PUMP-001');
  const plantId=await lookupPlantId(planner,'PLANT-A');
  const headers={Authorization:'Bearer '+planner,'X-Plant-ID':plantId};
  const code='UAT-PHOTO-ASM-'+Date.now().toString(36);
  const hierarchy=await request.post('/api/component-registry/bulk',{headers,data:{
    assetId,rows:[{componentCode:code,name:'UAT photo hotspot assembly',
      componentType:'assembly',criticality:'medium'}],
  }});
  expect(hierarchy.status(),await hierarchy.text()).toBe(201);
  const components=await request.get('/api/component-registry?assetId='+encodeURIComponent(assetId)+
    '&search='+encodeURIComponent(code)+'&limit=20',{headers});
  expect(components.status()).toBe(200);
  const component=(await components.json()).data.find((c:{componentCode:string})=>c.componentCode===code);
  expect(component?.id).toBeTruthy();

  // The fixture proves private image-byte handling, not OEM authenticity.
  const pixel=Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAOqvCwAAAABJRU5ErkJggg==','base64');
  const uploaded=await request.post('/api/component-visuals/upload',{headers,multipart:{
    assetId,componentId:component.id,title:'Synthetic front elevation access-control test',
    viewpoint:'front',
    file:{name:'ci-synthetic-test.png',mimeType:'image/png',buffer:pixel},
  }});
  expect(uploaded.status(),await uploaded.text()).toBe(201);
  const photo=(await uploaded.json()).data;
  expect(photo.id).toBeTruthy();
  expect(photo.imageUrl).toMatch(/^\/private-component-photos\/factory-photo-/);
  expect(photo.assetId).toBe(assetId);
  expect(photo.componentId).toBe(component.id);
  expect(JSON.parse(photo.cameraData).viewpoint).toBe('front');

  const invalidElevation=await request.post('/api/component-visuals/upload',{headers,multipart:{
    assetId,componentId:component.id,title:'Rejected unknown elevation',
    viewpoint:'diagonal-fictional',
    file:{name:'test-invalid-angle.png',mimeType:'image/png',buffer:pixel},
  }});
  expect(invalidElevation.status()).toBe(400);

  const privateRoute='/api/component-visuals/photo/'+encodeURIComponent(photo.id);
  expect((await request.get(privateRoute)).status()).toBe(401);
  const read=await request.get(privateRoute,{headers});
  expect(read.status(),await read.text()).toBe(200);
  expect((await read.body()).equals(pixel)).toBe(true);
  expect(read.headers()['cache-control']).toContain('no-store');
  expect(read.headers()['content-type']).toContain('image/png');

  const otherPlantUser=await getToken('plant_b_user');
  const offPlantRead=await request.get(privateRoute,{headers:{Authorization:'Bearer '+otherPlantUser}});
  expect(offPlantRead.status()).not.toBe(200);

  const markers=[{componentId:component.id,x:0.36,y:0.58}];
  const saved=await request.patch('/api/component-visuals',{headers,data:{id:photo.id,hotspotData:markers}});
  expect(saved.status(),await saved.text()).toBe(200);
  expect(JSON.parse((await saved.json()).data.hotspotData)).toEqual(markers);
  const list=await request.get('/api/component-visuals?assetId='+encodeURIComponent(assetId),{headers});
  expect(list.status()).toBe(200);
  const item=(await list.json()).data.find((v:{id:string})=>v.id===photo.id);
  expect(item).toBeTruthy();
  expect(JSON.parse(item.hotspotData)).toEqual(markers);

  const wrongPart=await request.patch('/api/component-visuals',{headers,data:{
    id:photo.id,hotspotData:[{componentId:'not-a-registered-part',x:0.5,y:0.5}],
  }});
  expect(wrongPart.status()).toBe(400);
  const wrongPosition=await request.patch('/api/component-visuals',{headers,data:{
    id:photo.id,hotspotData:[{componentId:component.id,x:1.5,y:0.5}],
  }});
  expect(wrongPosition.status()).toBe(400);

  // A second elevation must not delete or overwrite the first photo/hotspots.
  const another=await request.post('/api/component-visuals/upload',{headers,multipart:{
    assetId,componentId:component.id,title:'Synthetic top elevation test',
    viewpoint:'top',
    file:{name:'ci-second-test.png',mimeType:'image/png',buffer:pixel},
  }});
  expect(another.status(),await another.text()).toBe(201);
  const top=(await another.json()).data;
  expect(JSON.parse(top.cameraData).viewpoint).toBe('top');
  expect(top.id).not.toBe(photo.id);
  const listBoth=await request.get('/api/component-visuals?assetId='+encodeURIComponent(assetId),{headers});
  expect(listBoth.status()).toBe(200);
  const byId=new Map((await listBoth.json()).data.map((v:{id:string})=>[v.id,v]));
  expect(JSON.parse((byId.get(photo.id) as {cameraData:string}).cameraData).viewpoint).toBe('front');
  expect(JSON.parse((byId.get(top.id) as {cameraData:string}).cameraData).viewpoint).toBe('top');
  expect(JSON.parse((byId.get(photo.id) as {hotspotData:string}).hotspotData)).toEqual(markers);
});
