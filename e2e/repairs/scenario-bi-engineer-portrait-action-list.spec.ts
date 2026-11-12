import { test, expect } from '@playwright/test';
import { writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { authenticateAs } from './helpers/auth';
import { getToken, lookupPlantId } from './helpers/api';

/** Run manually against the commissioned UAT plant:
 * RUN_LIVE_PM_PORTRAIT_UAT=1 PLAYWRIGHT_BASE_URL=... playwright test ...
 * No inspection values or corrective WOs are created.
 */
test('Live engineer Action List prints as A4 portrait with one-line codes and four full parameters', async ({page,context}) => {
  test.skip(process.env.RUN_LIVE_PM_PORTRAIT_UAT !== '1', 'Requires commissioned UAT plant');
  test.setTimeout(160000);
  const planner=await getToken('planner');
  const plant=await lookupPlantId(planner,'TEMA-UAT-01');
  await authenticateAs(context,'planner');
  await page.goto('/');
  await page.evaluate(id=>localStorage.setItem('user_plant_id',id),plant);
  await page.goto('/#/pm-schedules');
  const panel=page.getByTestId('pm-inspection-worksheet');
  await expect(panel).toBeVisible({timeout:30000});
  const choose=panel.getByTestId('pm-inspection-generate-machine').getByRole('combobox').first();
  if(!(await choose.innerText()).includes('UAT-BFP-501')){
    await choose.click();
    await page.getByText('Multistage Boiler Feed Pump BFP-501 [UAT-BFP-501]',{exact:true}).last().click();
  }
  await panel.getByRole('button',{name:'Generate Action List'}).click();
  const checklist=page.getByTestId('pm-machine-checklist');
  const entry=checklist.getByTestId('pm-industrial-entry-table');
  await expect(entry).toBeVisible({timeout:25000});
  const headers=['BLOCK','PART','V.PART','GT CODE','DESCRIPTION','Temperature','Vibration','Sound','Corrosion','REMARK','TIME'];
  for(const header of headers)await expect(entry.getByRole('columnheader',{name:header,exact:true})).toBeVisible();
  expect(await entry.getByRole('columnheader',{name:'Other',exact:true}).count()).toBe(0);
  const editable=entry.locator('input[data-inspection-matrix-input]:not([disabled])');
  expect(await editable.count()).toBeGreaterThan(4);
  const disabledBlank=entry.locator('input[aria-label^="No configured"]');
  expect(await disabledBlank.count()).toBeGreaterThan(0);
  await page.evaluate(()=>{window.print=()=>undefined;});
  await checklist.getByRole('button',{name:'Print task-grouped blank Action List'}).click();
  const paper=page.getByTestId('pm-machine-inspection-print');
  await expect(paper).toContainText('Task-grouped Action List',{timeout:15000});
  for(const header of headers)await expect(paper.getByRole('columnheader',{name:header,exact:true,includeHidden:true}).first()).toBeAttached();
  expect(await paper.getByRole('columnheader',{name:'Other',includeHidden:true}).count()).toBe(0);
  const rows=paper.getByTestId('pm-paper-field-row');
  expect(await rows.count()).toBeGreaterThanOrEqual(5);
  await page.emulateMedia({media:'print'});
  const styles=await paper.locator('.pm-paper-code').evaluateAll(nodes=>nodes.map(node=>{
    const css=getComputedStyle(node);
    return {space:css.whiteSpace,height:node.getBoundingClientRect().height,scrollHeight:node.scrollHeight};
  }));
  expect(styles.every(item=>item.space==='nowrap')).toBe(true);
  const path='/tmp/iassets-portrait-uat-bfp-501.pdf';
  const pdf=await page.pdf({printBackground:true,preferCSSPageSize:true});
  writeFileSync(path,pdf);
  const info=execFileSync('pdfinfo',[path],{encoding:'utf8'});
  unlinkSync(path);
  expect(info).toMatch(/Page size:\s+595\.\d+ x 841\.\d+ pts \(A4\)/i);
  expect(info).not.toMatch(/842\.\d+ x 595\.\d+/);
  const pageCount=Number(info.match(/Pages:\s+(\d+)/)?.[1]||0);
  expect(pageCount).toBeGreaterThan(0);
  console.log('PORTRAIT_ENGINEER_PRINT_VERIFIED',JSON.stringify({
    machine:'UAT-BFP-501',paperRows:await rows.count(),pdfBytes:pdf.byteLength,
    pageSize:'A4 portrait',pageCount,codeWhiteSpace:'nowrap',
    headings:headers,editableFields:await editable.count()
  }));
});
