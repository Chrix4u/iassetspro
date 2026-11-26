import { test, expect } from '@playwright/test';

test('isolated UAT: machine creation form opens wider and aligns fields on desktop and mobile', async ({ page, request }) => {
  // Only the isolated, seeded platform database may run this regression.
  test.skip(process.env.CI !== 'true'
      || !process.env.DATABASE_URL?.includes('/platform_e2e?schema=public')
      || process.env.PLAYWRIGHT_BASE_URL !== 'http://127.0.0.1:3000',
    'Run against isolated seeded platform CI database only');
  test.setTimeout(100_000);

  const login = await request.post('/api/auth/login', { data: { username: 'admin', password: 'admin123' } });
  expect(login.status()).toBe(200);
  const session = await login.json();
  expect(session.success).toBe(true);

  await page.goto('/');
  await page.evaluate((token: string) => localStorage.setItem('eam_token', token), session.data.token);
  // Reload so the SPA initializes its auth store from the persisted token.
  // A same-document hash navigation may preserve the unauthenticated store.
  await page.reload();
  await page.goto('/#/assets-machines');
  await expect(page.getByRole('heading', { name: 'Asset Register' })).toBeVisible({ timeout: 30_000 });
  // Location breadcrumbs belong in asset details, not the compact register.
  await page.setViewportSize({ width: 1440, height: 900 });
  const registerTable = page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: 'Asset Tag', exact: true }) });
  await expect(registerTable).toHaveCount(1);
  await expect(registerTable.getByRole('columnheader')).toHaveText([
    'Asset Tag', 'Name', 'Category', 'Status', 'Criticality', 'Condition', 'Health', 'Actions',
  ]);
  await expect(registerTable.getByRole('columnheader', { name: /location|path/i })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add Asset', exact: true }).click();

  const form = page.getByTestId('asset-create-form');
  await expect(form).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Create Asset' })).toBeVisible();

  // Add a real blank meter row so the long "Observed initial reading" label
  // is present; this test never submits or changes the database.
  await form.getByRole('button', { name: 'Add meter' }).click();

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 850, height: 820 },
    { width: 390, height: 820 },
  ]) {
    await page.setViewportSize(viewport);
    const dialog = page.getByRole('dialog').filter({ has: form });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    // Chromium can keep the prior width for a frame immediately after
    // page.setViewportSize(). The CSS cap must settle to the NEW viewport;
    // poll the real DOM box instead of sampling a single transition frame.
    await expect.poll(() => page.evaluate(() => window.innerWidth), {
      message: `Browser viewport must settle at ${viewport.width}px`, timeout: 10_000,
    }).toBe(viewport.width);
    await expect.poll(async () => {
      const rect = await dialog.boundingBox();
      return rect?.width ?? Number.POSITIVE_INFINITY;
    }, {
      message: `Machine modal must fit within ${viewport.width}px after viewport change`,
      timeout: 10_000,
    }).toBeLessThanOrEqual(viewport.width + 1);
    if (viewport.width === 1440) {
      const rect = await dialog.boundingBox();
      expect(rect).not.toBeNull();
      expect(rect!.width).toBeGreaterThan(950);
    }

    // Measure each pair in one animation frame. Radix dialogs/sheets animate
    // when their viewport changes; separate boundingBox calls can capture
    // different animation frames and report a false vertical mismatch.
    // The geometry threshold remains strict (3px); poll until layout settles.
    await expect.poll(async () => form.evaluate((node, width) => {
      const inputs = node.querySelectorAll('input');
      const name = inputs[0]?.getBoundingClientRect();
      const tag = inputs[1]?.getBoundingClientRect();
      if (!name || !tag) return false;
      return width === 390
        ? tag.y > name.y + 8
        : Math.abs(tag.y - name.y) <= 3 && tag.x > name.x;
    }, viewport.width), { message: 'Asset name and tag inputs must align at settled viewport width', timeout: 8000 }).toBe(true);

    // Locate the actual fields by their accessible placeholders, not by a
    // label ancestor inside the dynamic dialog. Measure real browser boxes
    // directly so the test reports the pixel offset if alignment regresses.
    const meters = form.getByTestId('commissioning-meters');
    const meterName = meters.getByPlaceholder('Motor run hours', { exact: true });
    const openingReading = meters.getByPlaceholder('Blank = not yet measured', { exact: true });
    await expect(meterName).toHaveCount(1);
    await expect(openingReading).toHaveCount(1);
    await expect.poll(async () => {
      const [first, second] = await Promise.all([meterName.boundingBox(), openingReading.boundingBox()]);
      if (!first || !second) return Number.POSITIVE_INFINITY;
      return viewport.width === 1440
        ? Math.abs(second.y - first.y)
        : first.y + 8 - second.y;
    }, { message: `Machine meter vertical offset at ${viewport.width}px width`, timeout: 8000 })
      .toBeLessThanOrEqual(viewport.width === 1440 ? 3 : -0.01);

    const scroll = await dialog.evaluate(node => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    }));
    expect(scroll.scrollWidth, 'Modal should never overflow horizontally').toBeLessThanOrEqual(scroll.clientWidth + 3);

    // The save action stays available in the fixed dialog footer after scrolling.
    await form.evaluate(node => node.scrollIntoView({ block: 'end' }));
    await expect(dialog.getByRole('button', { name: 'Create Asset', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
  }
});


test('machine form uses the chosen plant for locations and departments and recovers from location fetch failure', async ({page,context,request})=>{
  test.skip(process.env.CI!=='true'||!process.env.DATABASE_URL?.includes('/platform_e2e?schema=public')||
    process.env.PLAYWRIGHT_BASE_URL!=='http://127.0.0.1:3000','Isolated platform fixture only');
  test.setTimeout(90_000);
  const login=await request.post('/api/auth/login',{data:{username:'admin',password:'admin123'}});
  expect(login.status()).toBe(200);
  const token=(await login.json()).data.token as string;
  const list=await request.get('/api/plants',{headers:{Authorization:'Bearer '+token}});
  expect(list.status()).toBe(200);
  const plants=(await list.json()).data as Array<{id:string;name:string}>;
  expect(plants.length).toBeGreaterThanOrEqual(2);
  const [original,selected]=plants;
  await context.addInitScript(({token,plantId})=>{
    localStorage.setItem('eam_token',token);
    localStorage.setItem('user_plant_id',plantId);
  },{token,plantId:original.id});
  const calls:Array<{plant:string|null;header:string}>=[];
  let failNext=true;
  // Simulate a recoverable transport failure, then use the actual scoped API.
  await page.route('**/api/functional-locations?**',async route=>{
    const url=new URL(route.request().url());
    if(url.searchParams.get('plantId')!==selected.id)return route.continue();
    calls.push({plant:url.searchParams.get('plantId'),header:route.request().headers()['x-plant-id']||''});
    if(failNext){
      failNext=false;
      return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,error:'Synthetic temporary outage'})});
    }
    return route.continue();
  });
  await page.goto('/#/assets-machines');
  await expect(page.getByRole('heading',{name:'Asset Register',exact:true})).toBeVisible({timeout:30_000});
  await page.getByRole('button',{name:'Add Asset',exact:true}).click();
  const form=page.getByTestId('asset-create-form');
  const plant=form.getByRole('combobox',{name:'Select plant',exact:true});
  await expect(plant).toBeEnabled({timeout:10_000});
  await plant.click();
  await page.getByPlaceholder('Search plants...').fill(selected.name);
  const departmentRequest=page.waitForRequest(req=>new URL(req.url()).pathname==='/api/departments'&&new URL(req.url()).searchParams.get('plantId')===selected.id);
  await page.getByRole('option').filter({hasText:selected.name}).first().click();
  expect((await departmentRequest).headers()['x-plant-id']).toBe(selected.id);
  await expect(form.getByText('Could not load locations for the selected plant.',{exact:true})).toBeVisible({timeout:15_000});
  await expect(form.getByRole('combobox',{name:'Functional Location / Installed At'})).toBeDisabled();
  const retry=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/functional-locations'&&new URL(response.url()).searchParams.get('plantId')===selected.id);
  await form.getByRole('button',{name:'Retry',exact:true}).click();
  expect((await retry).status()).toBe(200);
  await expect(form.getByText('Could not load locations for the selected plant.',{exact:true})).toHaveCount(0);
  expect(calls.length).toBeGreaterThanOrEqual(2);
  expect(calls.every(call=>call.plant===selected.id&&call.header===selected.id)).toBe(true);
  // This is a form-only check; no synthetic machine is submitted.
});
