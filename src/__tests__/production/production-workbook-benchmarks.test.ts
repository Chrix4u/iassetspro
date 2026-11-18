import {describe,it,expect} from 'vitest';
import {getWorkbookBenchmark,WORKBOOK_PRODUCTION_BENCHMARKS} from '@/lib/production-survey-workbook-benchmarks';

describe('PRODUCTION SURVEY 2026.xlsx machine benchmark import',()=>{
  it('retains all 44 workbook work-centre codes and exact standard values',()=>{
    expect(Object.keys(WORKBOOK_PRODUCTION_BENCHMARKS)).toHaveLength(44);
    expect(getWorkbookBenchmark('312/1')).toMatchObject({machine:'SINGEING M/C',utilizationPct:90,speedYardsPerMinute:130});
    expect(getWorkbookBenchmark('304/1-14')?.speedYardsPerMinute).toBe(0.55);
    expect(getWorkbookBenchmark('387/1-8')?.speedYardsPerMinute).toBe(0);
    expect(getWorkbookBenchmark('340/2')?.utilizationPct).toBe(95);
  });
  it('never guesses benchmark matches for an unknown machine tag',()=>{
    expect(getWorkbookBenchmark('unknown')).toBeNull();
    expect(getWorkbookBenchmark('  312/1  ')?.speedYardsPerMinute).toBe(130);
  });
});
