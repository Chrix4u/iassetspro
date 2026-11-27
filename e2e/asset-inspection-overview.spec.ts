import {test,expect} from '@playwright/test';
test('registered inspection parameters are readable in machine details at desktop and mobile widths',async({page,context,request},info)=>{
 test.setTimeout(120000);
 if(process.env.CI!=='true'||process.env.PLAYWRIGHT_BASE_URL!=='http://127.0.0.1:3000'||!process.env.DATABASE_URL?.includes('/platform_e2e?')){
  if(process.env.CI)throw new Error('Requires isolated platform CI');
  test.skip(true,'Only isolated platform CI');
 }
 const login=await request.post('/api/auth/login',{data:{username:'admin',password:'admin123'}});
 expect(login.status()).toBe(200);
 const token=(await login.json()).data.token;
 const auth={Authorization:'Bearer '+token};
 const assets=await request.get('/api/assets?limit=50',{headers:auth});
 expect(assets.status()).toBe(200);
 const plantId=(await assets.json()).data.find((a:{plantId?:string})=>a.plantId)?.plantId;
 const categories=await request.get('/api/asset-categories',{headers:auth});
 expect(categories.status()).toBe(200);
 const categoryId=(await categories.json()).data[0]?.id;
 expect(plantId).toBeTruthy();expect(categoryId).toBeTruthy();
 const created=await request.post('/api/assets',{headers:auth,data:{
  name:'Synthetic inspection overview '+Date.now(),assetTag:'CI-INSP-'+Date.now(),plantId,categoryId,status:'operational',
  machineParameters:[{name:'Vibration',inspectionType:'measurement',unit:'mm/s',min:0,max:4.5,reference:'Synthetic engineering limit'},{name:'Abnormal noise',inspectionType:'visual',unit:'',reference:'Synthetic visual inspection'}],
 }});
 expect(created.status(),await created.text()).toBe(201);
 const id=(await created.json()).data.id;
 await context.addInitScript(({token,plantId})=>{localStorage.setItem('eam_token',token);localStorage.setItem('user_plant_id',plantId);},{token,plantId});
 for(const [width,height] of [[1440,900],[390,844]]){
  await page.setViewportSize({width,height});
  await page.goto('/#/asset-detail?id='+encodeURIComponent(id));
  const overview=page.getByTestId('machine-inspection-overview');
  await expect(overview).toBeVisible({timeout:30000});
  // Section names are visible headings; locate their actual containing section.
  const instrument=overview.locator('section').filter({has:overview.getByRole('heading',{name:'Vibration',exact:true})});
  await expect(instrument.getByText('Instrument',{exact:true})).toBeVisible();
  await expect(instrument.getByText('0',{exact:true})).toBeVisible();
  await expect(instrument.getByText('4.5',{exact:true})).toBeVisible();
  await expect(instrument.getByText('mm/s',{exact:true})).toBeVisible();
  await expect(overview.getByText('Visual',{exact:true})).toBeVisible();
  await expect(page.getByRole('dialog').getByText('inspection Parameters',{exact:true})).toHaveCount(0);
  await expect.poll(()=>overview.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(3);
  await page.screenshot({path:info.outputPath('inspection-overview-'+width+'.png')});
 }
});
