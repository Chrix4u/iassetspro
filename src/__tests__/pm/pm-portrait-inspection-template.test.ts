import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {INDUSTRIAL_INSPECTION_COLUMNS,industrialInspectionColumn} from '@/lib/pm-industrial-inspection-matrix';

const source=(file:string)=>readFileSync(resolve(process.cwd(),file),'utf8');
const printed=source('src/components/modules/pm/PmMachineInspectionPrint.tsx');
const entry=source('src/components/modules/pm/PmIndustrialInspectionTable.tsx');

describe('Engineer-requested A4 portrait inspection template',()=>{
  it('prints in A4 portrait, not landscape, with narrow margins and single-line codes',()=>{
    expect(printed).toContain('@page { size: A4 portrait;');
    expect(printed).not.toContain('A4 landscape');
    expect(printed).toContain('.pm-paper-code');
    expect(printed).toContain('white-space: nowrap !important;');
    expect(printed).toContain('pm-paper-row');
  });
  it('keeps machine description to 65% and print dates day-first',()=>{
    expect(printed).toContain('grid-template-columns: minmax(0, 65fr) minmax(0, 35fr)');
    expect(printed).toContain('pm-print-machine-description');
    expect(printed).toContain('overflow-wrap: anywhere !important;');
    expect(printed).toContain('formatUiDate(printedIssue.plannedForDate)');
    expect(printed).toContain('formatUiDateTime(printedIssue.issuedAt)');
  });
  it('matches BLOCK / PART / V.PART / GT CODE arrangement in both print and entry',()=>{
    for(const heading of ['BLOCK','PART','V.PART','GT CODE','DESCRIPTION','TIME']){
      expect(printed).toContain('<th>'+heading+'</th>');
      expect(entry).toContain('>'+heading+'</th>');
    }
    expect(printed).not.toContain('<th>Other</th>');
    expect(entry).not.toContain('>Other</th>');
  });
  it('only shows four full measurement headings, with other configured checks separately',()=>{
    expect(INDUSTRIAL_INSPECTION_COLUMNS.map(c=>c.title)).toEqual(
      ['Temperature','Vibration','Sound','Corrosion']);
    expect(industrialInspectionColumn({parameter:'pressure_bar',checkName:'Pressure'})).toBe('other');
    expect(printed).toContain('pm-paper-extra-checks');
    expect(entry).toContain('pm-industrial-extra-checks');
  });
  it('never prints literal dash placeholders for unassigned measurements',()=>{
    expect(printed).toContain("className={part.checks[col.key].length?'':'pm-paper-cell-empty'}");
    expect(printed).toContain(")) : null}");
    expect(entry).toContain('data-inspection-matrix-input');
    expect(entry).toContain('disabled value="" readOnly');
  });
  it('uses exactly ten portrait columns with more room for hierarchy codes and narrower Vibration/Corrosion',()=>{
    const match=printed.match(/\{\[([\d,]+)\]\.map\(\(width,index\)/);
    expect(match).toBeTruthy();
    const cols=match![1].split(',').map(Number);
    expect(cols).toHaveLength(10);
    expect(cols).toEqual([9,10,10,14,18,9,8,8,7,7]);
    expect(cols.reduce((total,value)=>total+value,0)).toBe(100);
    expect(printed).toContain('overflow: hidden !important;');
    expect(printed).toContain('pm-paper-code-text');
    expect(entry).toContain('min-w-[1420px]');
    expect(printed).not.toContain('<th>REMARK</th>');
    expect(entry).not.toContain('>REMARK</th>');
  });
});
