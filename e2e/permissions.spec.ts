import { test, expect, type Page } from '@playwright/test';
import { signIn, openPage, ADMIN, VIEWER, TECH, PLANNER, dashboardHeading } from './helpers/strict-platform';
async function dashboard(page:Page){await openPage(page,'dashboard',dashboardHeading);}
async function denied(page:Page,route:string,heading:string){
 await page.goto('/#/'+route);
 await expect(page).toHaveURL(/#\/dashboard$/,{timeout:25_000});
 await expect(page.getByRole('main').getByRole('heading',{name:dashboardHeading})).toBeVisible();
 await expect(page.getByRole('main').getByRole('heading',{name:heading,exact:true})).toHaveCount(0);
}
test.describe('Permissions - Viewer Role',()=>{
 test.beforeEach(async({page,request})=>{await signIn(page,request,VIEWER);});
 test('viewer can log in and see dashboard',async({page})=>{await dashboard(page);});
 test('viewer can access assets list page',async({page})=>{await openPage(page,'assets-machines','Asset Register');});
 test('viewer cannot create new assets',async({page,request})=>{
   await openPage(page,'assets-machines','Asset Register');
   await expect(page.getByRole('button',{name:'Add Asset',exact:true})).toHaveCount(0);
   const token=await page.evaluate(()=>localStorage.getItem('eam_token'));
   const r=await request.post('/api/assets',{headers:{Authorization:'Bearer '+token},data:{name:'Forbidden CI record'}});
   expect(r.status()).toBe(403);
 });
 test('viewer cannot access system health settings',async({page})=>{await denied(page,'settings-health','System Health');});
 test('viewer cannot access user management settings',async({page})=>{await denied(page,'settings-users','Users');});
 test('viewer can access work orders list (read-only)',async({page})=>{
   await openPage(page,'maintenance-work-orders','Work Orders');
   await expect(page.getByRole('columnheader',{name:'WO #'})).toBeVisible();
   await expect(page.getByRole('button',{name:'New Work Order'})).toHaveCount(0);
 });
});
test.describe('Permissions - Admin Role',()=>{
 test.beforeEach(async({page,request})=>{await signIn(page,request,ADMIN);});
 test('admin has full access to dashboard',async({page})=>{await dashboard(page);});
 test('admin can access all settings pages',async({page})=>{
   test.setTimeout(120_000);
   for(const [route,heading] of [['settings-general','General Settings'],['settings-users','Users'],['settings-roles','Roles & Permissions'],['settings-health','System Health'],['settings-audit','Audit Logs'],['settings-backup','Backup & Restore'],['settings-security','Security Settings']])
     await openPage(page,route,heading);
 });
 test('admin can see create buttons on assets page',async({page})=>{
   await openPage(page,'assets-machines','Asset Register');
   await expect(page.getByRole('button',{name:'Add Asset',exact:true})).toBeEnabled();
 });
 test('admin can see create buttons on work orders page',async({page})=>{
   await openPage(page,'maintenance-work-orders','Work Orders');
   await expect(page.getByRole('button',{name:'New Work Order',exact:true})).toBeEnabled();
 });
 test('admin can access system health page',async({page})=>{await openPage(page,'settings-health','System Health');});
});
test.describe('Permissions - Technician Role',()=>{
 test.beforeEach(async({page,request})=>{await signIn(page,request,TECH);});
 test('technician can log in and see dashboard',async({page})=>{await dashboard(page);});
 test('technician can access work orders page',async({page})=>{await openPage(page,'maintenance-work-orders','Work Orders');});
 test('technician can access assets page',async({page})=>{await openPage(page,'assets-machines','Asset Register');});
 test('technician has limited settings access',async({page})=>{await denied(page,'settings-users','Users');});
});
test.describe('Permissions - Planner Role',()=>{
 test.beforeEach(async({page,request})=>{await signIn(page,request,PLANNER);});
 test('planner can log in and see dashboard',async({page})=>{await dashboard(page);});
 test('planner can access maintenance requests page',async({page})=>{await openPage(page,'maintenance-requests','Maintenance Requests');});
 test('planner can access work orders page',async({page})=>{await openPage(page,'maintenance-work-orders','Work Orders');});
});
