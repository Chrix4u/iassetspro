import { test, expect } from '@playwright/test';

// GTP demonstration page audit. These are CI-only synthetic fixtures, not a
// production login or a certification of real installed equipment.
const pages = [
  [
    "1",
    "settings-company",
    "Company Profile"
  ],
  [
    "1",
    "settings-plants",
    "Plants"
  ],
  [
    "1",
    "settings-departments",
    "Departments"
  ],
  [
    "1",
    "settings-users",
    "Users"
  ],
  [
    "1",
    "settings-roles",
    "Roles & Permissions"
  ],
  [
    "1",
    "production-work-centers",
    "Work Centers"
  ],
  [
    "1",
    "assets-hierarchy",
    "Asset & Location Hierarchy"
  ],
  [
    "2",
    "assets-machines",
    "Asset Register"
  ],
  [
    "3",
    "assets-bom",
    "Bill of Materials"
  ],
  [
    "4",
    "ai-hub",
    "AI Intelligence Hub"
  ],
  [
    "4",
    "assets-digital-twin",
    "Digital Twin"
  ],
  [
    "5–7",
    "production-survey",
    "Production Survey & PM Usage"
  ],
  [
    "8",
    "pm-tasks",
    "PM Task Library"
  ],
  [
    "8",
    "pm-templates",
    "PM Templates"
  ],
  [
    "8",
    "pm-schedules",
    "PM Schedules"
  ],
  [
    "8",
    "pm-calendar",
    "PM Calendar"
  ],
  [
    "8",
    "pm-triggers",
    "PM Triggers"
  ],
  [
    "8",
    "pm-inspections",
    "Inspection Readings"
  ],
  [
    "8",
    "pm-action-lists",
    "Machine Action Lists"
  ],
  [
    "8",
    "pm-scheduled-inspections",
    "Scheduled Inspection Tasks"
  ],
  [
    "8",
    "pm-machine-planning",
    "Machine Planning & Work Bundles"
  ],
  [
    "8",
    "pm-forward-planning",
    "Forward Planning & Conflicts"
  ],
  [
    "8",
    "pm-inspection-exceptions",
    "Inspection Exceptions"
  ],
  [
    "8",
    "pm-compliance",
    "Maintenance Compliance"
  ],
  [
    "9",
    "maintenance-requests",
    "Maintenance Requests"
  ],
  [
    "9",
    "maintenance-work-orders",
    "Work Orders"
  ],
  [
    "9",
    "planner-workbench",
    "Planner Workbench"
  ],
  [
    "10",
    "inventory-items",
    "Inventory"
  ],
  [
    "10",
    "inventory-categories",
    "Inventory Categories"
  ],
  [
    "10",
    "maintenance-tools",
    "Tools"
  ],
  [
    "10",
    "repairs-material-requests",
    "Material Requests"
  ],
  [
    "10",
    "repairs-tool-requests",
    "Tool Requests"
  ],
  [
    "10",
    "repairs-spare-part-returns",
    "Spare Part Returns"
  ],
  [
    "10",
    "repairs-completion",
    "Work Order Completion & Closure"
  ],
  [
    "10",
    "inventory-transactions",
    "Inventory Transactions"
  ],
  [
    "11",
    "dashboard",
    "Dashboard"
  ],
  [
    "11",
    "reports-asset",
    "Asset Reports"
  ],
  [
    "11",
    "reports-maintenance",
    "Maintenance Reports"
  ],
  [
    "11",
    "reports-inventory",
    "Inventory Reports"
  ],
  [
    "11",
    "repairs-reports",
    "Repairs / RWOP Reporting"
  ],
  [
    "11",
    "equipment-history",
    "Equipment History"
  ],
  [
    "11",
    "settings-audit",
    "Audit Logs"
  ]
] as const;

for (const [phase, route, heading] of pages) {
  test(`GTP phase ${phase}: ${route} renders at desktop and mobile widths`, async ({page,context,request},info) => {
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
      // The dashboard's main heading is deliberately personalized, unlike its navigation label.
      const actualHeading = route==='dashboard' ? /^Welcome back,\s+\S/ : heading;
      await expect(main.getByRole('heading',{name:actualHeading,exact:true}).first()).toBeVisible({timeout:25_000});
      if(route==='dashboard')await expect(main.getByText('Operations Dashboard',{exact:true})).toBeVisible();
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
