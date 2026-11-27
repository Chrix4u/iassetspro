import { test, expect } from '@playwright/test';

// GTP demonstration page audit. These are CI-only synthetic fixtures, not a
// production login or a certification of real installed equipment.
const pages = [
  [
    "assets",
    "assets-health",
    "Asset Health"
  ],
  [
    "maintenance",
    "maintenance-dashboard",
    "Maintenance Dashboard"
  ],
  [
    "maintenance",
    "maintenance-analytics",
    "Maintenance Analytics"
  ],
  [
    "maintenance",
    "maintenance-calibration",
    "Calibration"
  ],
  [
    "maintenance",
    "repairs-tool-transfers",
    "Tool Transfers"
  ],
  [
    "maintenance",
    "repairs-downtime",
    "Downtime Tracking"
  ],
  [
    "maintenance",
    "technician-timesheet",
    "Timesheet"
  ],
  [
    "operations",
    "operations-meter-readings",
    "Meter Readings"
  ],
  [
    "operations",
    "operations-surveys",
    "Surveys"
  ],
  [
    "operations",
    "operations-time-logs",
    "Time Logs"
  ],
  [
    "operations",
    "operations-checklists",
    "Checklists"
  ],
  [
    "quality",
    "quality-inspections",
    "Quality Inspections"
  ],
  [
    "quality",
    "quality-ncr",
    "Non-Conformance Reports"
  ],
  [
    "quality",
    "quality-audits",
    "Quality Audits"
  ],
  [
    "quality",
    "quality-control-plans",
    "Quality Control Plans"
  ],
  [
    "quality",
    "quality-spc",
    "Statistical Process Control"
  ],
  [
    "quality",
    "quality-capa",
    "Corrective & Preventive Actions"
  ],
  [
    "safety",
    "safety-incidents",
    "Safety Incidents"
  ],
  [
    "safety",
    "safety-inspections",
    "Safety Inspections"
  ],
  [
    "safety",
    "safety-training",
    "Safety Training"
  ],
  [
    "safety",
    "safety-equipment",
    "Safety Equipment"
  ],
  [
    "safety",
    "safety-permits",
    "Safety Permits"
  ],
  [
    "iot",
    "iot-devices",
    "IoT Devices"
  ],
  [
    "iot",
    "iot-monitoring",
    "IoT Monitoring"
  ],
  [
    "iot",
    "iot-rules",
    "IoT Rules"
  ],
  [
    "iot",
    "connectivity",
    "Industrial Connectivity"
  ],
  [
    "analytics",
    "analytics-kpi",
    "KPI Dashboard"
  ],
  [
    "analytics",
    "analytics-downtime",
    "Downtime Analysis"
  ],
  [
    "reports",
    "reports-quality",
    "Quality Reports"
  ],
  [
    "reports",
    "reports-safety",
    "Safety Reports"
  ],
  [
    "reports",
    "enterprise-reports",
    "Reporting"
  ],
  [
    "admin",
    "settings-queues",
    "Queue Manager"
  ],
  [
    "admin",
    "observability-dashboard",
    "Observability Dashboard"
  ],
  [
    "admin",
    "historian-dashboard",
    "Historian Dashboard"
  ],
  [
    "admin",
    "notifications",
    "Notification Center"
  ],
  [
    "admin",
    "chat",
    "Messages"
  ]
] as const;

for (const [phase, route, heading] of pages) {
  test(`Operational audit ${phase}: ${route} renders at desktop and mobile widths`, async ({page,context,request},info) => {
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
      await expect(main.getByRole('heading',{name:heading,exact:true}).first()).toBeVisible({timeout:25_000});
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
