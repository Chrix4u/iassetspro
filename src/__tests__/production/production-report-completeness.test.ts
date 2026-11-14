import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const report = readFileSync('src/app/api/production-surveys/report/route.ts', 'utf8');
const pm = readFileSync('src/app/api/production-surveys/pm-progress/route.ts', 'utf8');
const page = readFileSync('src/components/modules/ProductionSurveyPage.tsx', 'utf8');

describe('production reporting completeness guards', () => {
  it('fetches one extra report row and rejects partial 20,000+ shift totals', () => {
    expect(report).toContain('take:20001');
    expect(report).toContain('if(records.length>20000)');
    expect(report).toContain('no partial totals were returned');
    expect(report).toContain('truncated:true');
    expect(report).toContain('status:422');
    expect(report).toContain('truncated:false');
    expect(report.indexOf('if(records.length>20000)')).toBeLessThan(report.indexOf('const grouped=new Map'));
  });

  it('ignores stale machine and report requests and clears figures while reloading', () => {
    expect(page).toContain('const refreshRequestRef=useRef(0)');
    expect(page).toContain('const requestId=++refreshRequestRef.current');
    expect(page).toContain('if(requestId!==refreshRequestRef.current)return');
    expect(page).toContain('if(requestId===refreshRequestRef.current)setLoading(false)');
    expect(page).toContain('setRows([]);');
    expect(page).toContain('setReports([]);');
    expect(page).toContain('onValueChange={value=>{refreshRequestRef.current+=1;');
  });

  it('checks for hidden PM assignment rows instead of returning an incomplete machine dashboard', () => {
    expect(pm).toContain("take: 101");
    expect(pm).toContain("take: 201");
    expect(pm).toContain('registeredMeters.length > 100');
    expect(pm).toContain('taskAssignments.length > 200');
    expect(pm).toContain('headerSchedules.length > 100');
    expect(pm).toContain('truncated: true');
    expect(pm).toContain('status: 422');
    expect(pm.indexOf('registeredMeters.length > 100')).toBeLessThan(pm.indexOf('const meters ='));
  });
});
