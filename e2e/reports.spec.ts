import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { signIn, openPage } from './helpers/strict-platform';
async function maintenance(page:Page){
 const main=await openPage(page,'reports-maintenance','Maintenance Reports');
 await expect(main.getByText('Total Work Orders',{exact:true})).toBeVisible({timeout:25_000});
 return main;
}
test.describe('Reports & Analytics',()=>{
 test.beforeEach(async({page,request})=>{await page.setViewportSize({width:1440,height:900});await signIn(page,request);});
 test('reports page loads successfully',async({page})=>{await openPage(page,'reports-asset','Asset Reports');});
 test('report cards or sections are visible',async({page})=>{
   const main=await openPage(page,'reports-asset','Asset Reports');
   for(const title of ['Total Assets','Critical Assets','Active Assets'])await expect(main.getByText(title,{exact:true})).toBeVisible();
 });
 test('KPI summary indicators are present',async({page})=>{
   const main=await maintenance(page);
   await expect(main.getByText('Completion Rate',{exact:true}).first()).toBeVisible();
   await expect(main.getByText('Avg Completion Time',{exact:true})).toBeVisible();
 });
 test('charts or data visualizations are rendered',async({page,request})=>{
   await maintenance(page);
   await page.getByRole('tab',{name:'Overview',exact:true}).click();
   await expect(page.getByText('Work Orders by Type',{exact:true})).toBeVisible();
   await expect(page.getByText('Work Orders by Priority',{exact:true})).toBeVisible();
   await expect(page.getByText('Monthly WO Trend',{exact:true})).toBeVisible();
   // A chart is required when the backend has report data; the real empty-state
   // message is valid for a date range that contains no work orders.
   const panel=page.getByRole('tabpanel',{name:'Overview'});
   await expect(panel.locator('.recharts-wrapper').first().or(panel.getByText('No type data',{exact:true}))).toBeVisible();
 });
 test('export or download buttons are available',async({page})=>{
   await maintenance(page);
   await expect(page.getByRole('button',{name:'Excel',exact:true}).first()).toBeEnabled();
   await expect(page.getByRole('button',{name:'PDF',exact:true}).first()).toBeEnabled();
 });
});
test.describe('Reports - Maintenance Reports',()=>{
 test.beforeEach(async({page,request})=>{await signIn(page,request);await maintenance(page);});
 test('maintenance reports page loads successfully',async({page})=>{await expect(page.getByRole('heading',{name:'Maintenance Reports',exact:true})).toBeVisible();});
 test('date range picker or filter controls are present',async({page})=>{
   await expect(page.getByRole('main').getByText('Date Range',{exact:true})).toBeVisible();
 });
 test('can interact with date range controls',async({page})=>{
   await page.setViewportSize({width:390,height:844});
   const fields=page.getByRole('main').locator('input[type=date]');
   await expect(fields).toHaveCount(2);
   await fields.nth(0).fill('2024-01-01');
   await fields.nth(1).fill('2024-12-31');
   const response=page.waitForResponse(r=>{
     const u=new URL(r.url());return u.pathname==='/api/reports/maintenance'&&u.searchParams.get('startDate')==='2024-01-01'&&u.searchParams.get('endDate')==='2024-12-31';
   });
   // Auto-fetch can run after changing either input; explicitly regenerate too.
   await page.getByRole('button',{name:'Generate Report'}).click();
   expect((await response).status()).toBe(200);
   await expect(fields.nth(0)).toHaveValue('2024-01-01');
   await expect(fields.nth(1)).toHaveValue('2024-12-31');
   await expect(page.getByText('Total Work Orders',{exact:true})).toBeVisible();
 });
 test('generate report button is present',async({page})=>{
   const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/reports/maintenance');
   await page.getByRole('button',{name:'Generate Report'}).click();
   expect((await response).status()).toBe(200);
   await expect(page.getByText('Total Work Orders',{exact:true})).toBeVisible();
 });
 test('maintenance KPI cards are displayed',async({page})=>{
   for(const title of ['Total Work Orders','Completion Rate','Avg Completion Time','Avg Cost / WO','SLA Compliance','Overdue'])
     await expect(page.getByRole('main').getByText(title,{exact:true}).first()).toBeVisible();
 });
 test('report tabs or sections are available',async({page})=>{
   for(const name of ['Overview','Technician Productivity','Materials & Costs','Downtime','Detailed Data']){
     const tab=page.getByRole('tab',{name,exact:true});
     await tab.click();
     await expect(tab).toHaveAttribute('aria-selected','true');
     await expect(page.getByRole('tabpanel',{name,exact:true})).toBeVisible();
   }
 });
 test('export buttons (PDF/CSV) download real files',async({page})=>{
   await page.getByRole('tab',{name:'Overview',exact:true}).click();
   const csvWait=page.waitForEvent('download');
   await page.getByRole('button',{name:'Excel',exact:true}).click();
   const csv=await csvWait;
   expect(csv.suggestedFilename()).toMatch(/\.csv$/i);
   expect((await readFile((await csv.path())!,'utf8'))).toContain('Work Orders by Type');
   const pdfWait=page.waitForEvent('download');
   await page.getByRole('button',{name:'PDF',exact:true}).click();
   const pdf=await pdfWait;
   expect(pdf.suggestedFilename()).toMatch(/\.pdf$/i);
   expect((await readFile((await pdf.path())!)).subarray(0,5).toString()).toBe('%PDF-');
 });
});
