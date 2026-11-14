import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { allowedProductionMeter, parseProductionSurveyInput, reportingWeekStart, surveyTotals } from '@/lib/production-shift-survey';
const file=(path:string)=>readFileSync(path,'utf8');
const entry=file('src/app/api/production-surveys/route.ts');
const review=file('src/app/api/production-surveys/[id]/review/route.ts');
const correction=file('src/app/api/production-surveys/[id]/route.ts');
const setup=file('src/app/api/production-surveys/setup/route.ts');
const report=file('src/app/api/production-surveys/report/route.ts');
const schema=file('prisma/schema.prisma');
const migration=file('prisma/migrations/20261114105000_production_shift_survey_pm_meter/migration.sql');
const sidebar=file('src/components/shared/Sidebar.tsx');
const proxy=file('src/proxy.ts');
const access=file('src/lib/page-access.ts');
const frontend=file('src/components/modules/ProductionSurveyPage.tsx');
const defaultInput={
  assetId:'machine-1',shiftTemplateId:'morning-id',productionDate:'2026-11-14',
  outputQuantity:5000,unit:'tonnes',availableMinutes:480,
  breakMinutes:30,repairMinutes:45,inputDeliveryMinutes:10,changeoverMinutes:15,
  startupCleaningMinutes:20,otherMinutes:0,preventiveMinutes:10,
};

describe('production survey and PM usage integration',()=>{
 it('preserves workbook stoppage categories and derives productive time, utilization and production speed',()=>{
   const parsed=parseProductionSurveyInput(defaultInput);
   expect(parsed.outputQuantity).toBe(5000);
   expect(parsed.unit).toBe('tonnes');
   expect(parsed.targetQuantity).toBeNull();
   expect(surveyTotals(parsed)).toEqual({
     downtimeMinutes:130,productiveMinutes:350,utilizationPct:100*350/480,speedPerMinute:5000/350,
   });
 });
 it('does not accept negative output, fractional stoppage minutes, overbooked time or impossible calendar dates',()=>{
   expect(()=>parseProductionSurveyInput({...defaultInput,outputQuantity:-1})).toThrow();
   expect(()=>parseProductionSurveyInput({...defaultInput,breakMinutes:1.5})).toThrow('whole minutes');
   expect(()=>parseProductionSurveyInput({...defaultInput,repairMinutes:481})).toThrow();
   expect(()=>parseProductionSurveyInput({...defaultInput,productionDate:'2026-02-30'})).toThrow();
   expect(()=>parseProductionSurveyInput({...defaultInput,outputQuantity:5000,availableMinutes:130})).toThrow('Positive production');
 });
 it('calculates a zero-minute shift without division-by-zero, and never imputes an absent shift',()=>{
   const zero=parseProductionSurveyInput({...defaultInput,outputQuantity:0,availableMinutes:0,
     breakMinutes:0,repairMinutes:0,inputDeliveryMinutes:0,changeoverMinutes:0,
     startupCleaningMinutes:0,otherMinutes:0,preventiveMinutes:0});
   expect(surveyTotals(zero)).toMatchObject({downtimeMinutes:0,productiveMinutes:0,utilizationPct:null,speedPerMinute:null});
   expect(schema).toContain('@@unique([assetId, productionDate, shiftTemplateId])');
   expect(frontend).toContain('An absent shift is not treated as zero output');
 });
 it('uses the engineer workbook Sunday–Saturday reporting week',()=>{
   expect(reportingWeekStart(new Date('2026-11-14T00:00:00Z'))).toBe('2026-11-08');
   expect(reportingWeekStart(new Date('2026-11-15T00:00:00Z'))).toBe('2026-11-15');
 });
 it('allows configurable shifts and only tenant-approved production asset meters',()=>{
   expect(setup).toContain('productionShiftTemplate.createMany');
   expect(setup).toContain("code:'morning'");
   expect(setup).toContain("code:'afternoon'");
   expect(setup).toContain("code:'night'");
   expect(setup).toContain('code,name,startsAt,endsAt');
   expect(allowedProductionMeter('production')).toBe(true);
   expect(allowedProductionMeter('runtime')).toBe(false);
   expect(entry).toContain('canAccessPlantStrict(scope,asset.plantId)');
   expect(entry).toContain('shiftTemplateId:');
   expect(entry).toContain("status:'submitted'");
   expect(migration).toContain('production_shift_records_assetId_productionDate_shiftTemplateId_key');
 });
 it('posts output only after an independent, idempotent manager review',()=>{
   expect(review).toContain("hasPermission(session,'production_surveys.manage')");
   expect(review).toContain("row.recordedById===session.userId");
   expect(review).toContain("row.status==='approved'");
   expect(review).toContain("row.status!=='submitted'");
   expect(review).toContain('pg_advisory_xact_lock(hashtext($1))');
   expect(review).toContain("readingNumber:'MR-PRD-'+row.id");
   expect(review).toContain('previousValue');
   expect(review).toContain('consumption:row.outputQuantity');
   expect(review).toContain('readingDate:at');
   expect(review).toContain('currentValue:newValue');
   expect(review).toContain('meterReadingId=reading.id');
   expect(entry).not.toContain('meterReading.create(');
   expect(entry).toContain("hasPermission(session,'production_surveys.create')");
   expect(correction).toContain("hasPermission(session,'production_surveys.update')");
   expect(migration).toContain('production_shift_records_meterReadingId_key');
 });
 it('allows rejected operator corrections without rewriting an approved or posted meter',()=>{
   expect(correction).toContain("original.recordedById!==session.userId");
   expect(correction).toContain("original.status!=='rejected'||original.meterReadingId");
   expect(correction).toContain("latest.status!=='rejected'||latest.meterReadingId");
   expect(correction).toContain("status:'submitted',reviewNote:null");
   expect(frontend).toContain('Correct & Resubmit');
   expect(frontend).toContain('Resubmit corrected shift');
 });
 it('does not sum unlike production units into a false total',()=>{
   expect(frontend).toContain('mixed units');
   expect(frontend).toContain('reportSingleUnit');
 });
 it('reports approved day/week amounts only and reuses existing canonical meter PM source',()=>{
   expect(report).toContain("status:'approved'");
   expect(report).toContain("group==='week'?reportingWeekStart");
   expect(report).toContain('meterLinkedOutput');
   expect(frontend).toContain('Daily / weekly production reports');
   expect(frontend).toContain('Export CSV');
   expect(frontend).toContain('Shift production entry');
   const seed=file('prisma/seed.ts');
   expect(seed).toContain("production_operator: [");
   expect(seed).toContain("'production_surveys.create'");
   expect(seed).toContain("production_manager: [");
   expect(seed).toContain("'production_surveys.manage'");
   expect(sidebar).toContain("page: 'production-survey'");
   expect(proxy).toContain("{ prefix: '/api/production-surveys', modules: ['production'] }");
   expect(access).toContain("'production-survey': ['production_surveys.view']");
   expect(access).toContain("'production-survey': 'production'");
   const pm=file('src/services/pm/meterTriggerEngine.ts');
   expect(pm).toContain("config.source === 'asset_meter_reading'");
   expect(pm).toContain('tx.meterReading.findFirst');
 });
});
