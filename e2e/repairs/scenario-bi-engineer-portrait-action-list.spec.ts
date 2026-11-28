import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { authenticateAs } from './helpers/auth';
import { apiCallWithPlant, getToken, lookupPlantId } from './helpers/api';

/** Isolated CI uses a synthetic machine commissioned through planner APIs.
 * Explicit manual UAT retains the real commissioned-machine acceptance path.
 * Printing issues a blank worksheet; no readings or corrective WOs are created.
 */
test('Engineer Action List prints as A4 portrait with one-line codes and four full parameters', async ({page,context}, testInfo) => {
  const isolatedCI = process.env.CI === 'true' &&
    (process.env.DATABASE_URL || '').includes('/repairs_uat?') &&
    process.env.PLAYWRIGHT_BASE_URL === 'http://127.0.0.1:3000';
  if (process.env.CI === 'true' && !isolatedCI) throw new Error('Portrait fixture requires isolated Repairs CI');
  test.skip(!isolatedCI && process.env.RUN_LIVE_PM_PORTRAIT_UAT !== '1', 'Requires isolated Repairs CI or explicit commissioned UAT');
  test.setTimeout(160000);
  const planner=await getToken('planner');
  const plant=await lookupPlantId(planner,isolatedCI?'PLANT-A':'TEMA-UAT-01');
  let machineTag='UAT-BFP-501';
  let machineName='Multistage Boiler Feed Pump BFP-501';
  if(isolatedCI){
    const stamp=randomUUID().slice(0,6).toUpperCase();
    machineTag='CI-PRINT-'+stamp;
    machineName='CI synthetic inspection pump '+stamp;
    const get=async(path:string)=>{
      const r=await apiCallWithPlant(planner,'GET',path,plant);
      expect(r.status,JSON.stringify(r.data)).toBe(200);
      return r.data.data;
    };
    const post=async(path:string,payload:Record<string,unknown>)=>{
      const r=await apiCallWithPlant(planner,'POST',path,plant,payload);
      expect(r.status,JSON.stringify(r.data)).toBe(201);
      return r.data.data;
    };
    const categories=await get('/api/asset-categories');
    expect(categories[0]?.id).toBeTruthy();
    const machine=await post('/api/assets',{name:machineName,assetTag:machineTag,plantId:plant,categoryId:categories[0].id,status:'operational'});
    const block='B'+stamp,sub='S'+stamp,component='C'+stamp;
    const partCodes=Array.from({length:5},(_,i)=>'P'+stamp+'-'+(i+1));
    const rows=[
      {componentCode:block,name:'CI block',componentType:'assembly'},
      {componentCode:sub,name:'CI part group',componentType:'subassembly',parentCode:block},
      {componentCode:component,name:'CI virtual part',componentType:'component',parentCode:sub},
      ...partCodes.map((code,i)=>({componentCode:code,name:'CI inspection part '+(i+1),componentType:'part',parentCode:component})),
    ];
    await post('/api/component-registry/bulk',{assetId:machine.id,rows});
    const components=await get('/api/component-registry?assetId='+encodeURIComponent(machine.id)+'&limit=100');
    const task=await post('/api/pm-tasks',{description:'CI inspect pump assembly '+stamp,taskType:'mechanical'});
    const due=new Date(Date.now()+7*86400000).toISOString();
    for(const [index,code] of partCodes.entries()){
      const part=components.find((item:{componentCode:string})=>item.componentCode===code);
      expect(part?.id).toBeTruthy();
      await post('/api/pm-assignments',{assetId:machine.id,componentId:part.id,pmTaskId:task.id,
        pmType:'tbm',activityMode:'inspection',inspectionType:'running',frequencyType:'time_day',
        value:1,unit:'weeks',nextDueDate:due,estimatedMinutes:5});
      const checks=index===0
        ? [{key:'temperature',unit:'C',max:80},{key:'vibration',unit:'mm/s',max:4.5},
           {key:'sound',unit:'dB',max:85},{key:'corrosion',unit:'mm',max:1}]
        : [{key:'temperature',unit:'C',max:80}];
      for(const check of checks)await post('/api/pm-inspections',{componentId:part.id,name:check.key,
        inspectionType:'measurement',frequency:'weekly',parameterKey:check.key,unit:check.unit,min:0,max:check.max,nextInspection:due});
    }
    const checklist=await get('/api/pm-inspections/checklist?assetId='+encodeURIComponent(machine.id)+'&equipmentState=running');
    expect(checklist.totalAssignments).toBe(5);
    expect(checklist.totalConfiguredPoints).toBe(8);
  }
  await authenticateAs(context,'planner');
  await page.goto('/');
  await page.evaluate(id=>localStorage.setItem('user_plant_id',id),plant);
  await page.goto('/#/pm-action-lists');
  const panel=page.getByTestId('pm-inspection-worksheet');
  await expect(panel).toBeVisible({timeout:30000});
  const choose=panel.getByTestId('pm-inspection-generate-machine').getByRole('combobox').first();
  if(!(await choose.innerText()).includes(machineTag)){
    await choose.click();
    await page.getByPlaceholder('Search...', {exact:true}).fill(machineTag);
    await page.getByText(machineName+' ['+machineTag+']',{exact:true}).last().click();
  }
  await panel.getByRole('button',{name:'Generate Action List'}).click();
  const checklist=page.getByTestId('pm-machine-checklist');
  const entry=checklist.getByTestId('pm-industrial-entry-table');
  await expect(entry).toBeVisible({timeout:25000});
  const headers=['BLOCK','PART','V.PART','GT CODE','DESCRIPTION','Temperature','Vibration','Sound','Corrosion','TIME'];
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
  expect(await paper.getByRole('columnheader',{name:'REMARK',includeHidden:true}).count()).toBe(0);
  expect(await entry.getByRole('columnheader',{name:'REMARK'}).count()).toBe(0);
  const rows=paper.getByTestId('pm-paper-field-row');
  expect(await rows.count()).toBeGreaterThanOrEqual(5);
  await page.emulateMedia({media:'print'});
  const split=await paper.locator('.pm-print-heading-columns').first().evaluate(node=>{
    const columns=[...node.children].slice(0,2).map(child=>child.getBoundingClientRect());
    return {
      ratio: columns[0].width/(columns[0].width+columns[1].width),
      gap: columns[1].left-columns[0].right,
      firstRight: columns[0].right,
      secondLeft: columns[1].left,
    };
  });
  expect(split.ratio,'machine description takes 65% and does not squeeze right-hand details').toBeGreaterThan(0.63);
  expect(split.ratio).toBeLessThan(0.67);
  expect(split.gap,'machine description must not overlap the adjacent details').toBeGreaterThanOrEqual(0);
  await expect(paper.getByTestId('pm-print-planned-date')).toHaveText(/^\d{2}[\/-]\d{2}[\/-]\d{4}$/);
  const styles=await paper.locator('.pm-paper-code').evaluateAll(nodes=>nodes.map(node=>{
    const css=getComputedStyle(node);
    return {space:css.whiteSpace,height:node.getBoundingClientRect().height,scrollHeight:node.scrollHeight};
  }));
  expect(styles.every(item=>item.space==='nowrap')).toBe(true);
  const codeMetrics=await paper.locator('.pm-paper-code-text').evaluateAll(nodes=>nodes.map(node=>{
    const text=node.textContent?.trim()||'';
    const cell=node.closest('td');
    if(!text || !cell) return {text,overflow:0};
    const textRect=node.getBoundingClientRect();
    const cellRect=cell.getBoundingClientRect();
    return {text,overflow:Math.max(0,textRect.right-cellRect.right)};
  }));
  const overlaps=codeMetrics.filter(code=>code.overflow>1);
  expect(overlaps,'codes must fit within their own cells without intruding into next code').toEqual([]);
  const clippedCodes=await paper.locator('.pm-paper-code-text').evaluateAll(nodes=>
    nodes.filter(node=>(node.textContent||'').trim() && node.scrollWidth>node.clientWidth+1)
      .map(node=>({code:node.textContent,width:node.clientWidth,content:node.scrollWidth})));
  expect(clippedCodes,'all printed hierarchy codes should be visible, not clipped').toEqual([]);
  const pdf=await page.pdf({printBackground:true,preferCSSPageSize:true});
  // Chromium emits readable PDF page dictionaries; validate every MediaBox
  // without requiring an unrelated system package install on CI runners.
  const dictionaries=pdf.toString('latin1');
  const boxes=[...dictionaries.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)];
  const pageCount=[...dictionaries.matchAll(/\/Type\s*\/Page\b/g)].length;
  expect(pageCount).toBeGreaterThan(0);
  expect(boxes).toHaveLength(pageCount);
  for(const box of boxes){
    expect(Number(box[1])).toBeGreaterThanOrEqual(594);
    expect(Number(box[1])).toBeLessThanOrEqual(596);
    expect(Number(box[2])).toBeGreaterThanOrEqual(841);
    expect(Number(box[2])).toBeLessThanOrEqual(843);
  }
  if(isolatedCI)await testInfo.attach('synthetic-A4-portrait-action-list',{body:pdf,contentType:'application/pdf'});
  console.log('PORTRAIT_ENGINEER_PRINT_VERIFIED',JSON.stringify({
    machine:machineTag,synthetic:isolatedCI,paperRows:await rows.count(),pdfBytes:pdf.byteLength,
    pageSize:'A4 portrait',pageCount,codeWhiteSpace:'nowrap',
    headings:headers,editableFields:await editable.count()
  }));
});
