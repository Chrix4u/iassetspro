import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { findProductionShiftConflict } from '@/lib/production-shift-conflicts';

const date=(day:string)=>new Date(day+'T00:00:00.000Z');
const current={
  assetId:'machine-A',shiftTemplateId:'morning',productionDate:date('2026-11-20'),
  startsAt:'08:00',endsAt:'16:00',crewUserIds:['operator-A','team-leader'],
};
const prior=(overrides: Record<string, unknown> = {})=>({
  id:'shift-1',assetId:'machine-B',shiftTemplateId:'day',
  productionDate:date('2026-11-20'),startsAt:'10:00',endsAt:'14:00',
  shift:{startsAt:null,endsAt:null},crew:[{userId:'operator-A'}],
  ...overrides,
});
const find=(change:Partial<typeof current>, schedules:ReturnType<typeof prior>[]) =>
  findProductionShiftConflict({...current,...change},schedules);

describe('production shift scheduling conflict detection',()=>{
  it('rejects overlapping worker assignments even on another machine or plant',()=>{
    expect(find({},[prior()])).toEqual({kind:'worker',date:'2026-11-20'});
  });
  it('rejects overlapping shifts for one machine even with different crews',()=>{
    expect(find({},[prior({assetId:'machine-A',crew:[{userId:'operator-C'}]})]))
      .toEqual({kind:'machine',date:'2026-11-20'});
  });
  it('allows sequential shifts touching at their exact boundaries',()=>{
    expect(find({},[prior({startsAt:'16:00',endsAt:'23:00'})])).toBeNull();
    expect(find({},[prior({startsAt:'00:00',endsAt:'08:00'})])).toBeNull();
  });
  it('rejects a preceding overnight shift that overlaps the morning',()=>{
    expect(find({},[prior({productionDate:date('2026-11-19'),startsAt:'22:00',endsAt:'09:00'})]))
      .toEqual({kind:'worker',date:'2026-11-19'});
  });
  it('allows a night shift ending before the new shift',()=>{
    expect(find({},[prior({productionDate:date('2026-11-19'),startsAt:'22:00',endsAt:'08:00'})])).toBeNull();
  });
  it('detects a next-day shift overlapping a requested overnight shift',()=>{
    expect(find({startsAt:'22:00',endsAt:'06:00'},[
      prior({productionDate:date('2026-11-21'),startsAt:'05:00',endsAt:'13:00'}),
    ])).toEqual({kind:'worker',date:'2026-11-21'});
  });
  it('never blocks editing the same plan composite identity',()=>{
    expect(find({},[prior({
      assetId:'machine-A',shiftTemplateId:'morning',startsAt:'08:00',endsAt:'16:00',
    })])).toBeNull();
  });
  it('allows another worker to run a different machine simultaneously',()=>{
    expect(find({},[prior({crew:[{userId:'operator-B'}]})])).toBeNull();
  });
  it('uses the legacy shift-template times when plan times are absent',()=>{
    expect(find({},[prior({startsAt:null,endsAt:null,
      shift:{startsAt:'07:00',endsAt:'15:00'}})]))
      .toEqual({kind:'worker',date:'2026-11-20'});
  });
  it('fails closed for a same-day legacy schedule without clock times',()=>{
    expect(find({},[prior({startsAt:null,endsAt:null})]))
      .toEqual({kind:'worker',date:'2026-11-20'});
  });
  it('ignores un-timed schedules on other days without making up clock times',()=>{
    expect(find({},[prior({productionDate:date('2026-11-19'),startsAt:null,endsAt:null})])).toBeNull();
  });
  it('requires valid candidate shift times',()=>{
    expect(()=>find({startsAt:'25:00'},[])).toThrow('valid');
    expect(()=>find({startsAt:'08:00',endsAt:'08:00'},[])).toThrow('distinct');
  });
  it('enforces checks in the planner API inside transaction after serialized locks',()=>{
    const route=readFileSync('src/app/api/production-surveys/plans/route.ts','utf8');
    expect(route).toContain('findProductionShiftConflict({');
    expect(route).toContain('scheduleLocks');
    expect(route).toContain('schedule-worker:');
    expect(route).toContain('productionShiftPlan.findMany({');
    expect(route.indexOf('for(const key of scheduleLocks)')).toBeLessThan(route.indexOf('const relatedPlans='));
    expect(route).toContain('overlapping shift');
    expect(route).toContain('new Date(first.getTime()-86400000)');
  });
});
