import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {getToken,lookupAssetId,lookupPlantId} from './helpers/api';
import {authenticateAs} from './helpers/auth';

/**
 * Full private-GLB/hotspot/independent-approval API transport test.
 * CAUTION: ALL names, the model and the engineer attestations below are
 * SYNTHETIC QA FIXTURES inside the disposable CI Repairs UAT database.
 * This explicitly does NOT establish that any customer machine was scanned,
 * that OEM drawings are real, or that a physical engineer has certified them.
 */
test('UAT: private synthetic scan, real RBAC, maker-checker and plant-safe approved hotspots',async({request,page,context})=>{
  test.skip(process.env.CI!=='true'||!(process.env.DATABASE_URL||'').includes('repairs_uat'),
    'Never upload illustrative QA geometry to a real customer machine database');
  test.setTimeout(150_000);

  const engineerA=await getToken('engineer_a');
  const engineerB=await getToken('engineer_b');
  const viewer=await getToken('plant_a_user');
  const plantB=await getToken('plant_b_user');
  const assetId=await lookupAssetId(engineerA,'UAT-PUMP-001');
  const plantId=await lookupPlantId(engineerA,'PLANT-A');
  const headersA={Authorization:'Bearer '+engineerA,'X-Plant-ID':plantId};
  const headersB={Authorization:'Bearer '+engineerB,'X-Plant-ID':plantId};
  const readHeaders={Authorization:'Bearer '+viewer,'X-Plant-ID':plantId};
  const otherPlantHeaders={Authorization:'Bearer '+plantB};

  const dummyOriginalGeometry=readFileSync('public/smart-anatomy-demos/original-centrifugal-pump.glb');
  expect(dummyOriginalGeometry.length).toBeGreaterThan(256);
  const fixtureName='CI synthetic machine-scan '+randomUUID()+' — NOT physical plant evidence';
  const upload=await request.post('/api/smart-anatomy/models',{headers:headersA,multipart:{
    assetId,
    name:fixtureName,
    sourceOrigin:'site-owned-scan',
    sourceNote:'Synthetic automated integration mesh only; not captured from any actual installed customer machine.',
    captureMethod:'photogrammetry',
    capturedAt:new Date().toISOString().slice(0,10),
    captureDevice:'CI test harness: simulated scanner',
    sourceUnit:'m',
    metreScaleReference:'CI simulated external measurement of 1.250 m; not a field-certified measurement',
    metresConfirmed:'true',
    visibleSurfacesOnly:'true',
    file:{
      name:'ci-illustrative-synthetic-not-real-machine.glb',
      mimeType:'model/gltf-binary',
      buffer:dummyOriginalGeometry,
    },
  }});
  expect(upload.status(),await upload.text()).toBe(201);
  const uploaded=(await upload.json()).data as {
    id:string;filePath:string;commissioned:boolean;meshCount:number;
  };
  expect(uploaded.id).toBeTruthy();
  expect(uploaded.meshCount).toBeGreaterThan(0);
  expect(uploaded.commissioned).toBe(false);

  // Private model is inaccessible without a session, including correct URL.
  expect((await request.get(uploaded.filePath)).status()).toBe(401);
  const authorRead=await request.get(uploaded.filePath,{headers:headersA});
  expect(authorRead.status(),await authorRead.text()).toBe(200);
  const returnedBytes=await authorRead.body();
  expect(returnedBytes.equals(dummyOriginalGeometry)).toBe(true);
  const otherPlantPreview=await request.get(uploaded.filePath,{headers:otherPlantHeaders});
  expect(otherPlantPreview.status()).not.toBe(200);

  // Ordinary plant viewer cannot see an uncommissioned visual evidence model.
  const viewerDraft=await request.get(uploaded.filePath,{headers:readHeaders});
  expect(viewerDraft.status()).not.toBe(200);

  const componentCode='UAT-3DSCAN-ASM-'+Date.now().toString(36);
  const hierarchy=await request.post('/api/component-registry/bulk',{headers:headersA,data:{
    assetId,rows:[{
      componentCode,name:'CI simulated physical surface target',
      componentType:'assembly',criticality:'medium',
    }],
  }});
  expect(hierarchy.status(),await hierarchy.text()).toBe(201);
  const parts=await request.get('/api/component-registry?assetId='+
    encodeURIComponent(assetId)+'&search='+encodeURIComponent(componentCode)+'&limit=20',{
    headers:headersA,
  });
  expect(parts.status(),await parts.text()).toBe(200);
  const part=(await parts.json()).data.find((entry:{componentCode:string})=>
    entry.componentCode===componentCode);
  expect(part?.id).toBeTruthy();

  const markerUrl='/api/smart-anatomy/scans/'+encodeURIComponent(uploaded.id)+'/hotspots';
  const saved=await request.post(markerUrl,{headers:headersA,data:{
    componentId:part.id,label:'CI simulated scan surface marker',
    position:{x:0.25,y:0.50,z:0.75},
    sourceMeshPath:'SyntheticSurface/CI_Fixture',
  }});
  expect(saved.status(),await saved.text()).toBe(201);
  const marker=(await saved.json()).data as {id:string;isApproved:boolean};
  expect(marker.isApproved).toBe(false);

  const reviewUrl=markerUrl+'/'+encodeURIComponent(marker.id)+'/review';
  const reviewData={
    // CI maker-checker mechanics only; not evidence of a real site inspection.
    physicalComponentMatched:true,
    modelScaleChecked:true,
    reviewNote:'CI simulation: independent test actor checked a synthetic geometry fixture, not a plant machine',
  };
  const selfApproval=await request.post(reviewUrl,{headers:headersA,data:reviewData});
  expect(selfApproval.status()).toBe(409);
  const reviewed=await request.post(reviewUrl,{headers:headersB,data:reviewData});
  expect(reviewed.status(),await reviewed.text()).toBe(200);
  expect((await reviewed.json()).data.isApproved).toBe(true);

  const uploadedSourceSelfApproval=await request.post(
    '/api/smart-anatomy/models/'+encodeURIComponent(uploaded.id)+'/commission',
    {headers:headersA,data:{
      sourceReviewed:true,geometryReviewed:true,componentMappingReviewed:true,
      unmappedNodesAcknowledged:true,scanCapturedMachineVerified:true,
      scanScaleReviewed:true,reviewNote:'CI synthetic simulation only; not a real machine scan',
    }},
  );
  expect(uploadedSourceSelfApproval.status()).toBe(409);

  const approved=await request.post(
    '/api/smart-anatomy/models/'+encodeURIComponent(uploaded.id)+'/commission',
    {headers:headersB,data:{
      sourceReviewed:true,geometryReviewed:true,componentMappingReviewed:true,
      unmappedNodesAcknowledged:true,scanCapturedMachineVerified:true,
      scanScaleReviewed:true,
      reviewNote:'CI acceptance simulation of the site scan approval mechanics for disposable fixture only',
    }},
  );
  expect(approved.status(),await approved.text()).toBe(200);

  const readMarker=await request.get(markerUrl,{headers:readHeaders});
  expect(readMarker.status(),await readMarker.text()).toBe(200);
  const visible=(await readMarker.json()).data as Array<{
    id:string;componentId:string;isApproved:boolean;
  }>;
  expect(visible.some(item=>item.id===marker.id&&item.componentId===part.id&&item.isApproved)).toBe(true);
  expect((await request.get(uploaded.filePath,{headers:readHeaders})).status()).toBe(200);
  expect((await request.get(markerUrl,{headers:otherPlantHeaders})).status()).not.toBe(200);
  expect((await request.get(uploaded.filePath,{headers:otherPlantHeaders})).status()).not.toBe(200);

  const alignment=await request.get(
    '/api/smart-anatomy/scans/'+encodeURIComponent(uploaded.id)+'/alignment',
    {headers:readHeaders},
  );
  expect(alignment.status(),await alignment.text()).toBe(200);
  expect((await alignment.json()).data).toBeNull();

  // Exercise the REAL browser GLTFLoader, not only the JSON API client.
  // GLTFLoader previously omitted Bearer and could not load private models.
  // Rendering must not depend on an external HDRI CDN. Abort any such request
  // instead of letting internet availability determine release readiness.
  const externalLightingRequests:string[]=[];
  await page.route(/\.(hdr|exr)(?:\?|$)/i,async route=>{
    externalLightingRequests.push(route.request().url());
    await route.abort();
  });
  await authenticateAs(context,'engineer_b');
  await page.goto('/');
  await page.evaluate(id=>localStorage.setItem('user_plant_id',id),plantId);
  await page.goto('/#/asset-detail?id='+encodeURIComponent(assetId));
  await expect(page.getByText('UAT Test Pump').first()).toBeVisible({timeout:20000});
  await page.getByRole('tab',{name:'Visual Explorer',exact:true}).click();
  await page.getByRole('tab',{name:/Real 3D Scan/i}).click();

  const panel=page.getByTestId('smart-anatomy-site-scan');
  await expect(panel).toBeVisible();
  const fileResponse=page.waitForResponse(response=>
    response.url().endsWith(uploaded.filePath)&&response.status()===200,{
    timeout:30000,
  });
  await panel.getByRole('combobox').first().click();
  await page.getByRole('option',{name:fixtureName+' · Approved',exact:true}).click();
  const fileLoaded=await fileResponse;
  const sentAuthorization=fileLoaded.request().headers()['authorization']||'';
  expect(sentAuthorization).toMatch(/^Bearer\s+\S+/);
  expect(fileLoaded.request().headers()['x-plant-id']).toBe(plantId);
  expect(fileLoaded.headers()['content-type']).toContain('model/gltf-binary');
  await expect(panel.getByText(/As-built exterior scan|As-built scan \+ verified CAD/i).first())
    .toBeVisible({timeout:30000});
  expect(externalLightingRequests).toEqual([]);
  await expect(page.getByRole('heading',{name:'Runtime Error',exact:true})).toHaveCount(0);
});
