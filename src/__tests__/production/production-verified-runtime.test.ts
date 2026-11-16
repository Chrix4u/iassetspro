import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { allowedRuntimeMeter, parseProductionSurveyInput, surveyTotals, validateVerifiedRuntimeCounter } from '@/lib/production-shift-survey';
const read=(p:string)=>readFileSync(p,'utf8');
const base={
  assetId:'asset-1', shiftTemplateId:'shift-1', productionDate:'2026-11-15',
  availableMinutes:480,outputQuantity:1200,unit:'yards',breakMinutes:30,repairMinutes:20,
  inputDeliveryMinutes:10,changeoverMinutes:5,startupCleaningMinutes:15,
  otherMinutes:0,preventiveMinutes:0,
};
describe('independently verified runtime meter - production to PM',()=>{
  it('is optional and never copied from calculated productive time',()=>{
    const shift=parseProductionSurveyInput(base);
    expect(shift.runtimeMeterId).toBeNull();
    expect(shift.runtimeCounterHours).toBeNull();
    expect(surveyTotals(shift).productiveMinutes).toBe(400);
  });
  it('requires a real meter, cumulative observation and evidence together',()=>{
    const params={...base,runtimeMeterId:'run-meter-1',runtimeCounterHours:'258.5',runtimeEvidence:'Panel running hours meter H001'};
    const parsed=parseProductionSurveyInput(params);
    expect(parsed.runtimeMeterId).toBe('run-meter-1');
    expect(parsed.runtimeCounterHours).toBe(258.5);
    expect(parsed.runtimeEvidence).toBe('Panel running hours meter H001');
    expect(()=>parseProductionSurveyInput({...params,runtimeCounterHours:''})).toThrow('together');
    expect(()=>parseProductionSurveyInput({...params,runtimeMeterId:'none'})).toThrow('together');
    expect(()=>parseProductionSurveyInput({...params,runtimeEvidence:''})).toThrow('source/evidence');
    expect(()=>parseProductionSurveyInput({...params,runtimeCounterHours:-1})).toThrow();
    expect(()=>parseProductionSurveyInput({...base,runtimeEvidence:'fabricated'})).toThrow();
  });
  it('only accepts approved runtime hour meter types, not output or time proxies',()=>{
    expect(allowedRuntimeMeter('runtime','hours')).toBe(true);
    expect(allowedRuntimeMeter('RUNTIME','h')).toBe(true);
    expect(allowedRuntimeMeter('runtime','hrs')).toBe(true);
    expect(allowedRuntimeMeter('production','hours')).toBe(false);
    expect(allowedRuntimeMeter('runtime','minutes')).toBe(false);
    expect(allowedRuntimeMeter('general','h')).toBe(false);
  });
  it('enforces monotonic cumulative counters and detects intervening readings',()=>{
    const earlier=new Date('2026-11-15T13:00:00Z');
    expect(validateVerifiedRuntimeCounter({
      observed:105.25,previous:100,lastReadingAt:new Date('2026-11-15T08:00:00Z'),recordedAt:earlier
    })).toBe(5.25);
    expect(validateVerifiedRuntimeCounter({observed:100,previous:100,lastReadingAt:null,recordedAt:earlier})).toBe(0);
    expect(()=>validateVerifiedRuntimeCounter({observed:99,previous:100,lastReadingAt:null,recordedAt:earlier})).toThrow('below');
    expect(()=>validateVerifiedRuntimeCounter({observed:111,previous:100,lastReadingAt:new Date('2026-11-15T14:00:00Z'),recordedAt:earlier})).toThrow('newer');
  });
  it('requires independent manager approval, posting both meters once in one transaction',()=>{
    const review=read('src/app/api/production-surveys/[id]/review/route.ts');
    const submit=read('src/app/api/production-surveys/route.ts');
    const correction=read('src/app/api/production-surveys/[id]/route.ts');
    const setup=read('src/app/api/production-surveys/setup/route.ts');
    const pm=read('src/app/api/production-surveys/pm-progress/route.ts');
    const schema=read('prisma/schema.prisma');
    expect(review).toContain("row.recordedById===session.userId");
    expect(review).toContain("row.status==='approved'");
    expect(review).toContain("readingNumber:'MR-RUN-'+row.id");
    expect(review).toContain('validateVerifiedRuntimeCounter');
    expect(review).toContain('runtimeMeterReadingId=reading.id');
    expect(review).toContain('runtimeMeterReadingId,');
    expect(submit).not.toContain('meterReading.create(');
    expect(submit).toContain('allowedRuntimeMeter(runtimeMeter.meterType,runtimeMeter.unit)');
    expect(correction).toContain('latest.runtimeMeterReadingId');
    expect(setup).toContain('runtimeMeters:allMeters.filter');
    expect(pm).toContain('allowedRuntimeMeter(meter.meterType,meter.unit)');
    expect(schema).toContain('@relation("ProductionSurveyRuntimeMeterReading"');
  });
});
