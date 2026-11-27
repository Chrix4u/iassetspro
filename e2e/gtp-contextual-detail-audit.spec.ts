import {test,expect} from '@playwright/test';

const routes=['asset-detail','mr-detail','wo-detail','digital-twin-viewer'] as const;
for(const route of routes){
 test('Contextual route audit: '+route+' uses real records at desktop and mobile widths',async({page,context,request},info)=>{
  test.setTimeout(120000);
  if(process.env.PLAYWRIGHT_BASE_URL!=='http://127.0.0.1:3000'||!process.env.DATABASE_URL?.includes('/platform_e2e?')){
   if(process.env.CI)throw new Error('Requires isolated platform CI');
   test.skip(true,'Requires isolated platform fixture');
  }
  const login=await request.post('/api/auth/login',{data:{username:'admin',password:'admin123'}});
  expect(login.status()).toBe(200);
  const token=(await login.json()).data.token;
  expect(token).toBeTruthy();
  const auth={Authorization:'Bearer '+token};
  const response=await request.get('/api/assets?limit=50',{headers:auth});
  expect(response.status()).toBe(200);
  const assets=(await response.json()).data as Array<{id:string;name:string;plantId:string}>;
  const asset=assets.find(x=>x.plantId);
  expect(asset).toBeTruthy();
  let plantId=asset!.plantId;
  let id=asset!.id;
  let heading=asset!.name;
  let title=heading;
  if(route==='mr-detail'||route==='wo-detail'){
   const list=await request.get(route==='mr-detail'?'/api/maintenance-requests?limit=50':'/api/work-orders?limit=50',{headers:auth});
   expect(list.status()).toBe(200);
   const rows=(await list.json()).data as Array<{id:string;plantId:string;title:string;requestNumber?:string}>;
   const record=rows.find(x=>x.plantId&&x.title&&(route!=='mr-detail'||x.requestNumber));
   expect(record,'seeded maintenance record is required').toBeTruthy();
   plantId=record!.plantId;id=record!.id;title=record!.title;
   heading=route==='mr-detail'?record!.requestNumber!:title;
  }
  if(route==='digital-twin-viewer'){
   // Create an explicitly model-free twin only in disposable CI. A blank twin is
   // not claimed as OEM geometry; the viewer must present its true empty state.
   const list=await request.get('/api/digital-twins?limit=100',{headers:auth});
   expect(list.status()).toBe(200);
   const existing=(await list.json()).data as Array<{id:string;assetId:string}>;
   const available=assets.find(a=>a.plantId&&!existing.some(t=>t.assetId===a.id));
   expect(available,'an unused seeded asset is required').toBeTruthy();
   plantId=available!.plantId;
   const create=await request.post('/api/digital-twins',{headers:{...auth,'X-Plant-ID':plantId},data:{assetId:available!.id,name:'Contextual CI Twin '+Date.now()+'-'+info.retry,type:'other'}});
   expect(create.status(),await create.text()).toBe(201);
   const twin=(await create.json()).data as {id:string;name:string};
   id=twin.id;heading=twin.name+' — 3D Viewer';
  }
  await context.addInitScript(({token,plantId})=>{localStorage.setItem('eam_token',token);localStorage.setItem('user_plant_id',plantId);},{token,plantId});
  const errors:string[]=[];const failures:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&/EAM RENDER ERROR|UNHANDLED ERROR|UNHANDLED PROMISE REJECTION|\[PageSwitcher\] Failed/.test(message.text()))errors.push(message.text());});
  page.on('response',response=>{const url=new URL(response.url());if(url.origin==='http://127.0.0.1:3000'&&url.pathname.startsWith('/api/')&&response.status()>=500)failures.push(response.status()+' '+url.pathname);});
  for(const [width,height] of [[1440,900],[390,844]]){
   await page.setViewportSize({width,height});
   const params=route==='digital-twin-viewer'?'view=viewer&twinId='+encodeURIComponent(id):'id='+encodeURIComponent(id);
   await page.goto('/#/'+route+'?'+params);
   const panel=route==='asset-detail'||route==='mr-detail'?page.getByRole('dialog'):page.getByRole('main');
   await expect(panel.getByRole('heading',{name:heading,exact:true}).first()).toBeVisible({timeout:30000});
   if(route==='mr-detail')await expect(panel.getByText(title,{exact:true}).first()).toBeVisible();
   if(route==='asset-detail')await expect(panel.getByRole('tab',{name:/^Components/})).toBeVisible();
   if(route==='digital-twin-viewer'){
    await expect(panel.getByRole('button',{name:'Back to Twins'})).toBeVisible();
    await expect(panel.getByRole('heading',{name:'No Scenes Available',exact:true})).toBeVisible({timeout:30000});
    await expect(panel.getByText(/has no 3D scenes yet/)).toBeVisible();
    await expect(panel.getByText('Failed to Load Scene',{exact:true})).toHaveCount(0);
    await expect(panel.getByRole('button',{name:'Reset Camera',exact:true})).toBeVisible();
   }
   await expect(page.getByText(/Something went wrong|Page failed to load|Application Error/i)).toHaveCount(0);
   await expect.poll(()=>panel.evaluate(el=>Math.max(document.documentElement.scrollWidth-window.innerWidth,el.getBoundingClientRect().right-window.innerWidth,-el.getBoundingClientRect().left))).toBeLessThanOrEqual(3);
   await page.screenshot({path:info.outputPath(route+'-'+width+'.png'),animations:'disabled'});
   expect(errors,route+' runtime errors').toEqual([]);
   expect(failures,route+' API failures').toEqual([]);
  }
 });
}
