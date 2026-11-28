import { test, expect } from '@playwright/test';
import { signIn, openPage, VIEWER, dashboardHeading } from './helpers/strict-platform';

const adminPages=[
 ['general settings','settings-general','General Settings'],
 ['users management','settings-users','Users'],
 ['roles and permissions','settings-roles','Roles & Permissions'],
 ['company profile','settings-company','Company Profile'],
 ['system health','settings-health','System Health'],
 ['audit logs','settings-audit','Audit Logs'],
 ['backup settings','settings-backup','Backup & Restore'],
 ['security settings','settings-security','Security Settings'],
 ['integrations settings','settings-integrations','Integrations'],
] as const;
test.describe('Settings Pages',()=>{
 for(const [name,route,heading] of adminPages)test(name+' page loads',async({page,request})=>{
   await signIn(page,request);
   await openPage(page,route,heading);
   await expect(page).toHaveURL(new RegExp('#/'+route+'$'));
 });
});
test.describe('Settings - Viewer Access',()=>{
 test('viewer cannot access admin settings pages',async({page,request})=>{
   await signIn(page,request,VIEWER);
   for(const [,route,heading] of adminPages){
     await page.goto('/#/'+route);
     await expect(page.getByRole('main').getByRole('heading',{name:dashboardHeading})).toBeVisible({timeout:25_000});
     await expect(page.getByRole('main').getByRole('heading',{name:heading,exact:true})).toHaveCount(0);
     await expect(page).toHaveURL(/#\/dashboard$/);
   }
 });
 test('viewer can access and persist their own day-first preferences',async({page,request})=>{
   const headers=await signIn(page,request,VIEWER);
   const original=await request.get('/api/user/preferences',{headers});
   expect(original.status()).toBe(200);
   const before=(await original.json()).data;
   try{
     await page.getByRole('button',{name:'Account menu'}).click();
     await page.getByRole('menuitem',{name:'My Preferences',exact:true}).click();
     await expect(page.getByRole('main').getByRole('heading',{name:'My Preferences'})).toBeVisible();
     const date=page.getByRole('main').getByRole('combobox').filter({hasText:/15[/-]01[/-]2025/});
     await date.click();
     await page.getByRole('option',{name:'15-01-2025',exact:true}).click();
     const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/user/preferences'&&r.request().method()==='PUT');
     await page.getByRole('button',{name:'Save Preferences',exact:true}).click();
     const res=await saved;
     expect(res.status()).toBe(200);
     expect((await res.json()).data.dateTime.dateFormat).toBe('DD-MM-YYYY');
     await page.reload();
     await expect(page.getByRole('main').getByRole('heading',{name:'My Preferences'})).toBeVisible();
     await expect(date).toHaveText('15-01-2025');
     const fetched=await request.get('/api/user/preferences',{headers});
     expect((await fetched.json()).data.dateTime.dateFormat).toBe('DD-MM-YYYY');
   }finally{
     const restored=await request.put('/api/user/preferences',{headers,data:before});
     expect(restored.status()).toBe(200);
   }
 });
});
