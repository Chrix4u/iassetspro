import { test, expect } from '@playwright/test';
import { signIn, openPage } from './helpers/strict-platform';
test.describe('System Observability',()=>{
 test.beforeEach(async({page,request})=>{await signIn(page,request);await openPage(page,'observability-dashboard','Observability Dashboard');});
 test('observability dashboard loads successfully',async({page})=>{await expect(page.getByRole('heading',{name:'Observability Dashboard'})).toBeVisible();});
 test('observability dashboard shows metrics or status indicators',async({page})=>{
   await expect(page.getByRole('heading',{name:/System Status:/})).toBeVisible();
   for(const text of ['Response Time','Heap Memory','RSS Memory'])await expect(page.getByText(text,{exact:true})).toBeVisible();
 });
 test('observability dashboard has data visualization',async({page})=>{
   for(const text of ['Request Throughput','Error Breakdown','Service Health','Resource Usage'])
     await expect(page.getByText(text,{exact:true})).toBeVisible();
 });
 test('observability page has filter or refresh controls',async({page})=>{
   const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/observability/health');
   await page.getByRole('button',{name:'Refresh',exact:true}).click();
   expect((await response).status()).toBe(200);
   await page.getByRole('tab',{name:'Log Stream'}).click();
   const search=page.getByPlaceholder('Search logs...');
   await search.fill('CI-no-such-log-'+Date.now());
   await expect(search).toHaveValue(/CI-no-such-log-/);
   await expect(page.getByText('No log entries found',{exact:true})).toBeVisible();
 });
});
test.describe('Connectivity Dashboard',()=>{
 test.beforeEach(async({page,request})=>{await signIn(page,request);await openPage(page,'connectivity','Industrial Connectivity');});
 test('connectivity dashboard loads successfully',async({page})=>{await expect(page.getByText('Gateways Online',{exact:true})).toBeVisible();});
 test('connectivity status indicators are visible',async({page})=>{
   for(const text of ['Gateways Online','Active Sources','Throughput','Error Rate'])await expect(page.getByText(text,{exact:true})).toBeVisible();
 });
 test('device or connection list is present',async({page})=>{
   await page.getByRole('tab',{name:'Data Sources',exact:true}).click();
   for(const text of ['Name','Protocol','Status'])await expect(page.getByRole('columnheader',{name:text,exact:true})).toBeVisible();
 });
 test('source refresh and tab controls are functional',async({page})=>{
   const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/connectivity/sources');
   await page.getByRole('button',{name:'Refresh',exact:true}).click();
   expect((await response).status()).toBe(200);
   await page.getByRole('tab',{name:'Gateways',exact:true}).click();
   await expect(page.getByRole('columnheader',{name:'Gateway',exact:true})).toBeVisible();
 });
});
test.describe('Historian Page',()=>{
 test.beforeEach(async({page,request})=>{await signIn(page,request);await openPage(page,'historian-dashboard','Historian Dashboard');});
 test('historian page loads successfully',async({page})=>{await expect(page.getByRole('heading',{name:'Historian Dashboard'})).toBeVisible();});
 test('historian page shows time-related controls',async({page})=>{
   await page.getByRole('tab',{name:'Trends'}).click();
   await expect(page.getByText('Trend Viewer',{exact:true})).toBeVisible();
   await expect(page.getByRole('button',{name:'24H',exact:true}).first()).toBeVisible();
 });
 test('historian page has data visualization (charts or tables)',async({page})=>{
   await expect(page.getByText('Ingestion Rate',{exact:true})).toBeVisible();
   await expect(page.getByText('Data Completeness (1h)',{exact:true})).toBeVisible();
   await expect(page.getByRole('columnheader',{name:'Latest Value',exact:true})).toBeVisible();
 });
 test('historian page shows data points or an honest empty state',async({page,request})=>{
   const token=await page.evaluate(()=>localStorage.getItem('eam_token'));
   const res=await request.get('/api/historian/dashboard?view=full',{headers:{Authorization:'Bearer '+token}});
   expect(res.status()).toBe(200);
   const body=await res.json();
   expect(Array.isArray(body.data.tagMonitor)).toBe(true);
   await expect(page.getByRole('columnheader',{name:'Source ID',exact:true})).toBeVisible();
   if(body.data.tagMonitor.length===0)await expect(page.getByText('No tags found',{exact:true})).toBeVisible();
   else await expect(page.getByRole('cell',{name:body.data.tagMonitor[0].sourceId,exact:true})).toBeVisible();
   const search=page.getByPlaceholder('Search tags...');
   await search.fill('CI-no-such-tag-'+Date.now());
   await expect(page.getByText('No tags found',{exact:true})).toBeVisible();
 });
 test('historian can interact with time range selection',async({page})=>{
   await page.getByRole('tab',{name:'Trends'}).click();
   const day=page.getByRole('button',{name:'24H',exact:true}).first();
   await day.click();
   await expect(day).toHaveClass(/bg-emerald-600/);
   const week=page.getByRole('button',{name:'7D',exact:true}).first();
   await week.click();
   await expect(week).toHaveClass(/bg-emerald-600/);
   await expect(day).not.toHaveClass(/bg-emerald-600/);
 });
});
