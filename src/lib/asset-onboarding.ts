/** Manufacturer-sourced inspection settings, not estimated operating readings. */
export type CommissioningParameter = {
  key: string;
  name: string;
  inspectionType: 'measurement' | 'visual';
  unit: string;
  min: number | null;
  max: number | null;
  reference: string;
};
export type CommissioningMeter = {
  name: string;
  meterType: string;
  unit: string;
  initialValue: number;
  /** Explicit opening observation, including a verified zero. */
  initialReadingProvided: boolean;
};
const types = new Set(['general', 'runtime', 'cycles', 'production', 'energy', 'distance']);
const text=(value:unknown)=>typeof value === 'string'?value.trim():'';
export function normalizeCommissioningParameters(value:unknown):CommissioningParameter[] {
  if(value==null)return [];
  if(!Array.isArray(value)||value.length>40)throw new Error('Provide at most 40 manufacturer inspection parameters');
  const keys=new Set<string>();
  return value.map((item,index)=>{
    if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('Invalid parameter at row '+(index+1));
    const input=item as Record<string,unknown>;
    const name=text(input.name);
    const key=(text(input.key)||name.toLowerCase().replace(/[^a-z0-9]+/g,'_')).slice(0,80);
    const inspectionType=input.inspectionType==='visual'?'visual':'measurement';
    const unit=text(input.unit);
    const reference=text(input.reference);
    if(!name||name.length>120||!key||keys.has(key))throw new Error('Parameter name/key must be unique and nonempty');
    keys.add(key);
    if(unit.length>32||reference.length>255)throw new Error('Parameter unit or reference is too long');
    const parse=(v:unknown,label:string)=>{
      if(v==null||v==='')return null;
      const n=typeof v==='number'?v:Number(v);
      if(!Number.isFinite(n))throw new Error('Parameter '+name+' '+label+' must be numeric');
      return n;
    };
    const min=parse(input.min,'minimum'),max=parse(input.max,'maximum');
    if(min!==null&&max!==null&&min>max)throw new Error('Parameter '+name+' minimum exceeds maximum');
    if(inspectionType==='measurement'&&!unit)throw new Error('Parameter '+name+' needs a measurement unit');
    return {key,name,inspectionType,unit,min,max,reference};
  });
}
export function normalizeCommissioningMeters(value:unknown):CommissioningMeter[] {
  if(value==null)return [];
  if(!Array.isArray(value)||value.length>20)throw new Error('Provide at most 20 meter definitions');
  const seen=new Set<string>();
  return value.map((item,index)=>{
    if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('Invalid meter at row '+(index+1));
    const r=item as Record<string,unknown>,name=text(r.name),unit=text(r.unit),meterType=(text(r.meterType)||'general').toLowerCase();
    const initialReadingProvided=r.initialValue!==null&&r.initialValue!==undefined&&r.initialValue!=='';
    const initialValue=initialReadingProvided?Number(r.initialValue):0;
    if(!name||!unit||name.length>120||unit.length>32||!types.has(meterType)||!Number.isFinite(initialValue)||initialValue<0)
      throw new Error('Invalid meter name, type, unit or initial value at row '+(index+1));
    if(meterType==='runtime'&&!['h','hr','hrs','hour','hours'].includes(unit.toLowerCase()))
      throw new Error('Running-hour meters must use hours');
    const key=name.toLowerCase()+'|'+unit.toLowerCase();
    if(seen.has(key))throw new Error('Duplicate meter '+name+' ('+unit+')');
    seen.add(key);
    return {name,unit,meterType,initialValue,initialReadingProvided};
  });
}
export function mergeMachineSpecification(current:unknown,params:CommissioningParameter[]):string {
  let old:Record<string,unknown>={};
  try{
    const parsed=typeof current==='string'?JSON.parse(current):current;
    if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))old=parsed as Record<string,unknown>;
  }catch{ /* legacy free-text is preserved as a separate description field */ old={legacySpecification:String(current||'')}; }
  return JSON.stringify({...old,inspectionParameters:params});
}
export function readMachineParameters(value:unknown):CommissioningParameter[]{
  try {
    const parsed=typeof value==='string'?JSON.parse(value):value;
    return normalizeCommissioningParameters((parsed as {inspectionParameters?:unknown})?.inspectionParameters||[]);
  }catch{return [];}
}

/**
 * Part counters live in the asset-level canonical meter registry. Qualify their
 * source names by the immutable component code to prevent two bearings/motors
 * from sharing an ambiguous UBM source or violating the per-asset uniqueness key.
 */
export function partMeterName(componentCode:string, meterName:string):string {
  const code=componentCode.trim(),name=meterName.trim();
  if(!code||!name)throw new Error('Component code and meter name are required');
  return code+' · '+name;
}
