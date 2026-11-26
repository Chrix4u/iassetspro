import {test,expect,type Locator} from '@playwright/test';
async function expectInsideViewport(control:Locator,width:number){
  await expect(control).toBeVisible();
  await expect.poll(async()=>{
    const rect=await control.boundingBox();
    return !!rect && rect.x>=-1 && rect.x+rect.width<=width+1;
  }).toBe(true);
}
test('isolated responsive audit: mobile account controls and digital twin actions remain on-screen',async({page,context,request})=>{
  if(process.env.PLAYWRIGHT_BASE_URL!=='http://127.0.0.1:3000'||!process.env.DATABASE_URL?.includes('/platform_e2e?')){
    if(process.env.CI)throw new Error('Responsive audit requires isolated platform CI');
    test.skip(true,'Requires isolated fixture');
  }
  test.setTimeout(90_000);
  const login=await request.post('/api/auth/login',{data:{username:'admin',password:'admin123'}});
  expect(login.status()).toBe(200);
  const session=await login.json();
  expect(session.success).toBe(true);
  await context.addInitScript(token=>localStorage.setItem('eam_token',token),session.data.token);
  await page.goto('/#/assets-machines');
  await expect(page.getByRole('main').getByRole('heading',{name:'Asset Register',exact:true})).toBeVisible({timeout:30_000});
  await page.evaluate(()=>{window.location.hash='#/assets-digital-twin';});
  const main=page.getByRole('main');
  await expect(main.getByRole('heading',{name:'Digital Twin',exact:true})).toBeVisible({timeout:25_000});
  const header=page.locator('header').first();
  for(const width of [320,360,390,768,1440]){
    await page.setViewportSize({width,height:844});
    await expectInsideViewport(header.getByRole('button',{name:'Account menu',exact:true}),width);
    await expectInsideViewport(header.getByRole('button',{name:'Toggle theme',exact:true}),width);
    await expectInsideViewport(main.getByRole('button',{name:'Upload Model',exact:true}),width);
    if(width<1024)await expectInsideViewport(header.getByRole('button',{name:'Open navigation',exact:true}),width);
  }
  await page.setViewportSize({width:390,height:844});
  await header.getByRole('button',{name:'Account menu',exact:true}).click();
  await expect(page.getByRole('menuitem',{name:'Sign Out',exact:true})).toBeVisible();
});
