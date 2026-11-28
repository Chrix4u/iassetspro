import { test, expect } from '@playwright/test';
import { signIn, openPage, dashboardHeading } from './helpers/strict-platform';
const pages=[
 ['Dashboard','dashboard',dashboardHeading],
 ['Assets','assets-machines','Asset Register'],
 ['Work Orders','maintenance-work-orders','Work Orders'],
 ['Inventory','inventory-items','Inventory'],
 ['Safety Incidents','safety-incidents','Safety Incidents'],
 ['Maintenance Requests','maintenance-requests','Maintenance Requests'],
 ['Reports','reports-maintenance','Maintenance Reports'],
] as const;
test.describe('Navigation & Routing',()=>{
 test.beforeEach(async({page,request})=>{
   await page.setViewportSize({width:1440,height:900});
   await signIn(page,request);
   await openPage(page,'dashboard',dashboardHeading);
 });
 test('sidebar navigation - navigate to each main page',async({page})=>{
   test.setTimeout(120_000);
   for(const [,route,heading] of pages) await openPage(page,route,heading);
 });
 test('sidebar contains navigation links for main sections',async({page})=>{
   for(const label of ['Dashboard','Assets','Repairs Maintenance','PM Maintenance'])
     await expect(page.locator('aside').first().getByText(label,{exact:true})).toBeVisible();
 });
 test('sidebar navigation links are clickable',async({page})=>{
   await openPage(page,'assets-machines','Asset Register');
   await page.locator('aside').first().getByText('Dashboard',{exact:true}).click();
   await expect(page.getByRole('main').getByRole('heading',{name:dashboardHeading})).toBeVisible();
 });
 test('browser back button navigates to previous page',async({page})=>{
   await openPage(page,'assets-machines','Asset Register');
   await page.goBack();
   await expect(page.getByRole('main').getByRole('heading',{name:dashboardHeading})).toBeVisible();
 });
 test('browser forward button navigates to next page',async({page})=>{
   await openPage(page,'assets-machines','Asset Register');
   await page.goBack();
   await expect(page.getByRole('main').getByRole('heading',{name:dashboardHeading})).toBeVisible();
   await page.goForward();
   await expect(page.getByRole('main').getByRole('heading',{name:'Asset Register',exact:true})).toBeVisible();
 });
 for(const [name,route,heading] of pages) test('direct URL access works for '+name,async({page})=>{
   await openPage(page,route,heading);
   await expect(page).toHaveURL(new RegExp('#/'+route+'$'));
 });
 test('rapid navigation between pages does not crash the app',async({page})=>{
   const errors:string[]=[];
   page.on('pageerror',error=>errors.push(error.message));
   for(const [,route] of pages) await page.evaluate(value=>location.hash='/'+value,route);
   await expect(page.getByRole('main').getByRole('heading',{name:'Maintenance Reports',exact:true})).toBeVisible({timeout:25_000});
   expect(errors).toEqual([]);
 });
 test('page content updates when navigating between sections',async({page})=>{
   await openPage(page,'assets-machines','Asset Register');
   await openPage(page,'safety-incidents','Safety Incidents');
   await expect(page.getByRole('main').getByRole('heading',{name:'Asset Register',exact:true})).toHaveCount(0);
 });
});
