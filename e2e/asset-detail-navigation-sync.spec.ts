import {test,expect} from '@playwright/test';

test('asset detail links switch machines and return to the register on desktop and mobile',async({page,context,request},info)=>{
  test.setTimeout(120_000);
  if(process.env.PLAYWRIGHT_BASE_URL!=='http://127.0.0.1:3000'||!process.env.DATABASE_URL?.includes('/platform_e2e?')){
    if(process.env.CI)throw new Error('Requires isolated platform CI');
    test.skip(true,'Requires isolated platform fixture');
  }
  const login=await request.post('/api/auth/login',{data:{username:'admin',password:'admin123'}});
  expect(login.status()).toBe(200);
  const token=(await login.json()).data.token;
  expect(token).toBeTruthy();
  const assets=await request.get('/api/assets?limit=50',{headers:{Authorization:'Bearer '+token}});
  expect(assets.status()).toBe(200);
  const records=(await assets.json()).data as Array<{id:string;name:string;assetTag:string;plantId:string}>;
  const first=records.find(a=>a.plantId);
  const second=records.find(a=>a.plantId===first?.plantId&&a.id!==first?.id&&a.name!==first?.name);
  expect(first).toBeTruthy();expect(second).toBeTruthy();
  await context.addInitScript(({token,plantId})=>{
    localStorage.setItem('eam_token',token);localStorage.setItem('user_plant_id',plantId);
  },{token,plantId:first!.plantId});
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  const detail=page.getByRole('dialog');
  for(const [width,height] of [[1440,900],[390,844]]){
    await page.setViewportSize({width,height});
    await page.goto('/#/assets-machines?id='+encodeURIComponent(first!.id));
    await expect(detail.getByRole('heading',{name:first!.name,exact:true})).toBeVisible({timeout:30000});
    await page.evaluate(id=>{window.location.hash='#/assets-machines?id='+encodeURIComponent(id)+'&tab=components'},second!.id);
    await expect(detail.getByRole('heading',{name:second!.name,exact:true})).toBeVisible({timeout:30000});
    await expect(detail.getByRole('heading',{name:first!.name,exact:true})).toHaveCount(0);
    await expect(detail.getByRole('tab',{name:/^Components/})).toHaveAttribute('aria-selected','true');
    await expect.poll(()=>detail.evaluate(el=>Math.max(el.getBoundingClientRect().right-window.innerWidth,-el.getBoundingClientRect().left))).toBeLessThanOrEqual(3);
    await page.screenshot({path:info.outputPath('asset-detail-'+width+'.png')});
    await page.evaluate(()=>{window.location.hash='#/assets-machines'});
    await expect(detail).toHaveCount(0);
    await expect(page.getByRole('heading',{name:'Asset Register',exact:true})).toBeVisible();
    expect(errors).toEqual([]);
  }
});
