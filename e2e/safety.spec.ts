import { test, expect } from '@playwright/test';
import { signIn, openPage } from './helpers/strict-platform';
for(const item of [
 {route:'safety-incidents',heading:'Safety Incidents',entity:'incidents',metric:'Total Incidents',column:'Severity',create:'Report Incident',dialog:'Report New Incident',empty:'No incidents found'},
 {route:'safety-inspections',heading:'Safety Inspections',entity:'inspections',metric:'Total Inspections',column:'Status',create:'New Inspection',dialog:'Create Inspection',empty:'No inspections found'},
]){
 test.describe('Safety Module - '+item.heading,()=>{
   test.beforeEach(async({page,request})=>{
     await page.setViewportSize({width:1440,height:900});
     await signIn(page,request);
     await openPage(page,item.route,item.heading);
     await expect(page.getByRole('columnheader',{name:'Title',exact:true})).toBeVisible();
   });
   test(item.entity+' page loads successfully',async({page})=>{
     await expect(page.getByRole('main').getByText(item.metric,{exact:true})).toBeVisible();
   });
   test(item.entity+' list or table is visible',async({page})=>{
     await expect(page.getByRole('columnheader',{name:'ID',exact:true})).toBeVisible();
     await expect(page.getByRole('columnheader',{name:item.column,exact:true})).toBeVisible();
   });
   test(item.entity+' severity or status indicators are present',async({page})=>{
     if(item.entity==='incidents')await expect(page.getByRole('main').getByText('Severity Breakdown',{exact:true})).toBeVisible();
     else for(const label of ['Passed','Failed','Scheduled'])await expect(page.getByRole('main').getByText(label,{exact:true}).first()).toBeVisible();
   });
   test('create '+item.entity+' button is present',async({page})=>{
     await page.getByRole('button',{name:item.create,exact:true}).click();
     await expect(page.getByRole('dialog',{name:item.dialog,exact:true})).toBeVisible();
   });
   test('search or filter controls are available on '+item.entity+' page',async({page})=>{
     const search=page.getByPlaceholder('Search '+item.entity+'...');
     await search.fill('CI-no-such-safety-record-'+Date.now());
     await expect(page.getByText(item.empty,{exact:true})).toBeVisible();
     await search.clear();
     await expect(page.getByRole('combobox').filter({hasText:'All Types'})).toBeVisible();
     await expect(page.getByRole('combobox').filter({hasText:'All Status'})).toBeVisible();
   });
 });
}
