import { test, expect } from '@playwright/test';

// GTP demonstration page audit. These are CI-only synthetic fixtures, not a
// production login or a certification of real installed equipment.
const pages = [
  [
    "assets",
    "assets-condition-monitoring",
    "Condition Monitoring"
  ],
  [
    "assets",
    "system-diagrams",
    "System Diagrams"
  ],
  [
    "assets",
    "ai-history",
    "AI Generation History"
  ],
  [
    "maintenance",
    "maintenance-risk-assessment",
    "Risk Assessment"
  ],
  [
    "repairs",
    "repairs-analytics",
    "Repairs Analytics"
  ],
  [
    "repairs",
    "repairs-damaged-tools",
    "Damaged Tool Reports"
  ],
  [
    "repairs",
    "repairs-detail-report",
    "Repair Detail Report"
  ],
  [
    "reports",
    "wo-reports",
    "Work Order Reports"
  ],
  [
    "analytics",
    "analytics-oee",
    "OEE Dashboard"
  ],
  [
    "analytics",
    "analytics-energy",
    "Energy Analytics"
  ],
  [
    "operations",
    "operations-training",
    "Training"
  ],
  [
    "operations",
    "operations-shift-handover",
    "Shift Handover"
  ],
  [
    "reliability",
    "reliability-engineering",
    "Reliability Engineering"
  ],
  [
    "alias",
    "assets",
    "Asset Register"
  ],
  [
    "alias",
    "inventory",
    "Inventory"
  ],
  [
    "alias",
    "analytics",
    "Analytics"
  ]
] as const;

for (const [phase, route, heading] of pages) {
  test(`Final route audit ${phase}: ${route} renders at desktop and mobile widths`, async ({page,context,request},info) => {
    test.setTimeout(90_000);
    if (process.env.PLAYWRIGHT_BASE_URL !== 'http://127.0.0.1:3000' ||
        !process.env.DATABASE_URL?.includes('/platform_e2e?')) {
      if (process.env.CI) throw new Error('Demonstration audit requires the isolated platform database');
      test.skip(true, 'Requires isolated platform fixture');
    }
    const login = await request.post('/api/auth/login',{data:{username:'admin',password:'admin123'}});
    expect(login.status()).toBe(200);
    const body=await login.json();
    expect(body.success).toBe(true);
    expect(body.data.token).toBeTruthy();
    await context.addInitScript(token=>localStorage.setItem('eam_token',token),body.data.token);
    const errors:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{
      if(message.type()==='error' && /EAM RENDER ERROR|UNHANDLED ERROR|UNHANDLED PROMISE REJECTION|\[PageSwitcher\] Failed/.test(message.text()))
        errors.push(message.text());
    });
    const serverFailures:string[]=[];
    page.on('response',response=>{
      if(new URL(response.url()).origin==='http://127.0.0.1:3000' &&
        new URL(response.url()).pathname.startsWith('/api/') && response.status()>=500)
        serverFailures.push(response.status()+' '+new URL(response.url()).pathname);
    });
    for(const [width,height] of [[1440,900],[390,844]]) {
      await page.setViewportSize({width,height});
      await page.goto('/#/'+route);
      const main=page.getByRole('main');
      await expect(main.getByRole('heading',{name:route==='ai-history'?/^AI Generation History(?:\s+\d+)?$/:heading,exact:true}).first()).toBeVisible({timeout:25_000});
      await expect(page).toHaveURL(new RegExp('#/'+route+'$'));
      await expect(page.getByText(/Something went wrong|Page failed to load|Application Error/i)).toHaveCount(0);
      // Capture the seeded rendered page, including its real tables/forms.
      await page.screenshot({path:info.outputPath(route+'-'+width+'.png'),animations:'disabled'});
      await expect.poll(async()=>main.evaluate(el=>{
        const rect=el.getBoundingClientRect();
        return Math.max(document.documentElement.scrollWidth-window.innerWidth,
          rect.right-window.innerWidth,-rect.left);
      }),{message:route+' must fit the application viewport at '+width}).toBeLessThanOrEqual(3);
      expect(errors,route+' runtime errors').toEqual([]);
      expect(serverFailures,route+' backend failures').toEqual([]);
    }
  });
}


test('maintenance request shortcut opens creation form at desktop and mobile widths',async({page,context,request},info)=>{
  test.setTimeout(90000);
  if(process.env.PLAYWRIGHT_BASE_URL!=='http://127.0.0.1:3000'||!process.env.DATABASE_URL?.includes('/platform_e2e?')){
    if(process.env.CI)throw new Error('Requires isolated platform CI');
    test.skip(true,'Requires isolated platform fixture');
  }
  const login=await request.post('/api/auth/login',{data:{username:'admin',password:'admin123'}});
  expect(login.status()).toBe(200);
  const token=(await login.json()).data.token;
  expect(token).toBeTruthy();
  await context.addInitScript(token=>localStorage.setItem('eam_token',token),token);
  for(const [width,height] of [[1440,900],[390,844]]){
    await page.setViewportSize({width,height});
    await page.goto('/#/create-mr');
    const form=page.getByRole('dialog',{name:'Create Maintenance Request'});
    await expect(form).toBeVisible({timeout:30000});
    await expect(form.getByRole('button',{name:'Submit Request'})).toBeVisible();
    await page.screenshot({path:info.outputPath('create-mr-'+width+'.png')});
    await page.keyboard.press('Escape');
    await expect(form).toHaveCount(0);
    await expect(page).toHaveURL(/#\/maintenance-requests$/);
  }
});
