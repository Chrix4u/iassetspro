import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {normalizeCommissioningParameters,normalizeCommissioningMeters,mergeMachineSpecification,readMachineParameters,partMeterName} from '@/lib/asset-onboarding';
import {ONBOARDING_SHEETS} from '@/lib/asset-onboarding-workbook';
const source=(path:string)=>readFileSync(path,'utf8');
describe('factory machine onboarding — OEM standards and coded hierarchy',()=>{
 it('does not fabricate default temperature or vibration standards',()=>{
  expect(normalizeCommissioningParameters([])).toEqual([]);
  const [temperature]=normalizeCommissioningParameters([{name:'Bearing Temperature',inspectionType:'measurement',unit:'°C',min:'',max:'',reference:'OEM manual'}]);
  expect(temperature.min).toBeNull();
  expect(temperature.max).toBeNull();
  expect(temperature.reference).toBe('OEM manual');
 });
 it('validates manufacturer range, instrument units, visual checks and duplicate keys',()=>{
  expect(normalizeCommissioningParameters([{name:'Vibration',inspectionType:'measurement',unit:'mm/s',min:'0',max:'7.5'}])[0].max).toBe(7.5);
  expect(()=>normalizeCommissioningParameters([{name:'Sound',unit:'',inspectionType:'measurement'}])).toThrow('unit');
  expect(()=>normalizeCommissioningParameters([{name:'Temperature',unit:'°C',min:100,max:50}])).toThrow('minimum exceeds');
  expect(()=>normalizeCommissioningParameters([{name:'Sound',unit:'dB'},{name:'Sound',unit:'dB'}])).toThrow('unique');
  expect(normalizeCommissioningParameters([{name:'Corrosion observation',inspectionType:'visual',unit:'',reference:'Inspect coating visually'}])[0].inspectionType).toBe('visual');
 });
 it('distinguishes identically named run-hour meters on different parts of a machine',()=>{
  const a=partMeterName('MOTOR-01','Running Hours');
  const b=partMeterName('MOTOR-02','Running Hours');
  expect(a).toBe('MOTOR-01 · Running Hours');
  expect(a).not.toBe(b);
  expect(normalizeCommissioningMeters([
    {name:a,meterType:'runtime',unit:'hours',initialValue:250},
    {name:b,meterType:'runtime',unit:'hours',initialValue:70},
  ])).toHaveLength(2);
 });
 it('does not confuse an explicitly observed zero with an unrecorded opening value',()=>{
  const zero=normalizeCommissioningMeters([{name:'Motor Hours',unit:'hours',meterType:'runtime',initialValue:0}])[0];
  const blank=normalizeCommissioningMeters([{name:'Motor Hours',unit:'hours',meterType:'runtime',initialValue:''}])[0];
  expect(zero).toMatchObject({initialValue:0,initialReadingProvided:true});
  expect(blank).toMatchObject({initialValue:0,initialReadingProvided:false});
  expect(normalizeCommissioningMeters([{name:'Motor Hours',unit:'hours',meterType:'runtime'}])[0].initialReadingProvided).toBe(false);
 });
 it('does not confuse cumulative running-hours meters with calculated production time',()=>{
  expect(normalizeCommissioningMeters([{name:'Motor running hours',unit:'hours',meterType:'runtime',initialValue:250}])[0].initialValue).toBe(250);
  expect(()=>normalizeCommissioningMeters([{name:'Runtime',unit:'minutes',meterType:'runtime'}])).toThrow('hours');
  expect(()=>normalizeCommissioningMeters([{name:'Runtime',unit:'hours',meterType:'runtime',initialValue:-2}])).toThrow('Invalid meter');
  expect(()=>normalizeCommissioningMeters([{name:'Tonnage',unit:'tonnes',meterType:'production'},{name:'Tonnage',unit:'tonnes',meterType:'production'}])).toThrow('Duplicate');
 });
 it('preserves other specification metadata when updating machine-level standards',()=>{
  const stored=mergeMachineSpecification('{"ratedKw":44,"voltage":415}',[
   {key:'temperature',name:'Temperature',inspectionType:'measurement',unit:'°C',min:0,max:80,reference:'OEM p.12'}]);
  expect(JSON.parse(stored).ratedKw).toBe(44);
  expect(readMachineParameters(stored)[0].max).toBe(80);
 });
 it('uses a coded functional location, not duplicate legacy free-text building/floor fields',()=>{
  const page=source('src/components/modules/AssetPages.tsx');
  const api=source('src/app/api/assets/route.ts');
  expect(page).toContain('FunctionalLocationPicker');
  expect(page).toContain('functionalLocationId');
  expect(page).not.toContain('<Label>Building</Label>');
  expect(page).not.toContain('<Label>Floor</Label>');
  expect(page).not.toContain('<Label>Area</Label>');
  expect(api).toContain('functionalLocationAssignments:{create:');
  expect(api).toContain('location.hierarchyLevel.allowAssetAssignment');
  expect(api).toContain('db.$transaction');
 });
 it('persists part inspection points and part meters in an atomic component transaction',()=>{
  const api=source('src/app/api/component-registry/route.ts');
  const schema=source('prisma/schema.prisma');
  const migration=source('prisma/migrations/20261116180000_asset_meter_component_binding/migration.sql');
  expect(api).toContain('inspectionPoints:{create:');
  expect(api).toContain('tx.assetMeter.createMany');
  expect(api).toContain('lastReadingAt:m.initialReadingProvided?new Date():null');
  expect(source('src/app/api/assets/onboard-bulk/route.ts')).toContain('lastReadingAt:d.initialReadingProvided?new Date():null');
  expect(source('src/components/assets/MachineCommissioningFields.tsx')).toContain("initialValue:''");
  expect(api).toContain('db.$transaction');
  expect(schema).toContain('componentId   String?');
  expect(migration).toContain('FOREIGN KEY ("componentId")');
 });
 it('supplies separate normalized sheets and rejects partial spreadsheet registration',()=>{
  const bulk=source('src/app/api/assets/onboard-bulk/route.ts');
  expect(Object.keys(ONBOARDING_SHEETS)).toEqual(['Machines','Parts','Parameters','Meters','Visuals']);
  expect(bulk).toContain('body.dryRun===true');
  expect(bulk).toContain('db.$transaction');
  expect(bulk).toContain('parent code must belong to the same machine');
  expect(bulk).toContain('normalizeCommissioningMeters(all)');
 });
 it('uses factual photos, bounded machine-part markers and a guided hierarchy tour',()=>{
  const explorer=source('src/components/digital-twin/MachineVisualExplorer.tsx');
  const photo=source('src/app/api/component-visuals/route.ts');
  expect(explorer).toContain('Attach photo');
  expect(explorer).toContain('Play guided tour');
  expect(explorer).toContain('Place hotspot at clicked image position');
  expect(photo).toContain('componentId');
  expect(photo).toMatch(/!Array\.isArray\(input\)\s*\|\|\s*input\.length\s*>\s*60/);
  expect(photo).toContain('visual.visualType');
  expect(explorer).toContain('AI-generated reference visualization');
 });
});
