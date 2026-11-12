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
  it('matches BLOCK / PART / V.PART / GT CODE arrangement in both print and entry',()=>{
    for(const heading of ['BLOCK','PART','V.PART','GT CODE','DESCRIPTION','REMARK','TIME']){
      expect(printed).toContain('<th>'+heading+'</th>');
      expect(entry).toContain('>'+heading+'</th>');
    }
    expect(printed).not.toContain('<th>Other</th>');
    expect(entry).not.toContain('>Other</th>');
  });
  it('only shows four full measurement headings; keeps other configured checks in Remark',()=>{
    expect(INDUSTRIAL_INSPECTION_COLUMNS.map(c=>c.title)).toEqual(
      ['Temperature','Vibration','Sound','Corrosion']);
    expect(industrialInspectionColumn({parameter:'pressure_bar',checkName:'Pressure'})).toBe('other');
    expect(printed).toContain('const otherChecks=part.checks.other');
    expect(entry).toContain('part.checks.other.map');
  });
  it('never prints literal dash placeholders for unassigned measurements',()=>{
    expect(printed).toContain("className={part.checks[col.key].length?'':'pm-paper-cell-empty'}");
    expect(printed).toContain(")) : null}");
    expect(entry).toContain('data-inspection-matrix-input');
    expect(entry).toContain('disabled value="" readOnly');
  });
  it('uses exactly eleven portrait table columns totaling 100 percent',()=>{
    const match=printed.match(/\{\[([\d,]+)\]\.map\(\(width,index\)/);
    expect(match).toBeTruthy();
    const cols=match![1].split(',').map(Number);
    expect(cols).toHaveLength(11);
    expect(cols.reduce((total,value)=>total+value,0)).toBe(100);
  });
});
