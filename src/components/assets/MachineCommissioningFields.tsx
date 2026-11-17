'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type ParameterDraft={
  id?:string;key:string;name:string;inspectionType:'measurement'|'visual';unit:string;
  min:string;max:string;reference:string;
};
export type MeterDraft={name:string;meterType:string;unit:string;initialValue:string};
export const blankParameter=():ParameterDraft=>({
  key:'',name:'',inspectionType:'measurement',unit:'',min:'',max:'',reference:'',
});
export const blankMeter=():MeterDraft=>({name:'',meterType:'runtime',unit:'hours',initialValue:'0'});
const updateAt=<T,>(items:T[],index:number,patch:Partial<T>)=>items.map((item,i)=>i===index?{...item,...patch}:item);

export function CommissioningParameterFields({items,onChange,subject='machine'}:{
  items:ParameterDraft[];onChange:(items:ParameterDraft[])=>void;subject?:string;
}){
  return <section className="space-y-3 rounded-lg border p-3" data-testid="commissioning-parameters">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="text-sm font-semibold">{subject==='machine'?'Machine':'Part'} inspection parameters</h3>
        <p className="text-xs text-muted-foreground">Enter manufacturer or engineering limits; do not guess values. Leave limits blank where not specified. Visual inspections may use an observation note without numeric ranges.</p>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={()=>onChange([...items,blankParameter()])}><Plus className="mr-1 h-3.5 w-3.5"/>Add parameter</Button>
    </div>
    {items.map((p,i)=><div key={i} className="space-y-2 rounded-md border bg-muted/20 p-2.5">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[10rem] flex-1 space-y-1"><Label>Parameter name *</Label><Input value={p.name} placeholder="Temperature, vibration, sound, pressure..." onChange={e=>onChange(updateAt(items,i,{name:e.target.value}))}/></div>
        <div className="w-36 space-y-1"><Label>Inspection</Label><Select value={p.inspectionType} onValueChange={v=>onChange(updateAt(items,i,{inspectionType:v as ParameterDraft['inspectionType']}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="measurement">Instrument</SelectItem><SelectItem value="visual">Visual</SelectItem></SelectContent></Select></div>
        <Button type="button" variant="ghost" size="icon" aria-label={'Remove parameter '+(i+1)} onClick={()=>onChange(items.filter((_,j)=>i!==j))}><Trash2 className="h-4 w-4"/></Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1"><Label>Unit {p.inspectionType==='measurement'?'*':''}</Label><Input value={p.unit} placeholder="°C, mm/s, dB, bar, A..." onChange={e=>onChange(updateAt(items,i,{unit:e.target.value}))}/></div>
        <div className="space-y-1"><Label>Acceptable minimum</Label><Input type="number" step="any" value={p.min} onChange={e=>onChange(updateAt(items,i,{min:e.target.value}))}/></div>
        <div className="space-y-1"><Label>Acceptable maximum</Label><Input type="number" step="any" value={p.max} onChange={e=>onChange(updateAt(items,i,{max:e.target.value}))}/></div>
      </div>
      <div className="space-y-1"><Label>OEM specification or engineering reference</Label><Input value={p.reference} placeholder="Manufacturer manual, section / document reference" onChange={e=>onChange(updateAt(items,i,{reference:e.target.value}))}/></div>
    </div>)}
    {!items.length&&<p className="text-sm text-muted-foreground">No parameters yet. Add only those specified for this equipment; they may be configured later.</p>}
  </section>;
}
export function CommissioningMeterFields({items,onChange,subject='machine'}:{
  items:MeterDraft[];onChange:(items:MeterDraft[])=>void;subject?:string;
}){
  return <section className="space-y-3 rounded-lg border p-3" data-testid="commissioning-meters">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="text-sm font-semibold">{subject==='machine'?'Machine':'Part'} meters</h3><p className="text-xs text-muted-foreground">Register physical cumulative counters for usage-based PM; initial values must be measured. Part meters are uniquely identified by their part code in the PM meter list.</p></div>
      <Button size="sm" type="button" variant="outline" onClick={()=>onChange([...items,blankMeter()])}><Plus className="mr-1 h-3.5 w-3.5"/>Add meter</Button>
    </div>
    {items.map((m,i)=><div key={i} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1.3fr_1fr_1fr_1fr_auto]">
      <div className="space-y-1"><Label>Meter name *</Label><Input value={m.name} placeholder="Motor run hours" onChange={e=>onChange(updateAt(items,i,{name:e.target.value}))}/></div>
      <div className="space-y-1"><Label>Type</Label><Select value={m.meterType} onValueChange={v=>onChange(updateAt(items,i,{meterType:v,unit:v==='runtime'?'hours':m.unit}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{['runtime','cycles','production','energy','distance','general'].map(v=><SelectItem key={v} value={v}>{v==='runtime'?'Running hours':v}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>Unit *</Label><Input value={m.unit} onChange={e=>onChange(updateAt(items,i,{unit:e.target.value}))}/></div>
      <div className="space-y-1"><Label>Observed initial reading</Label><Input type="number" min="0" step="any" value={m.initialValue} onChange={e=>onChange(updateAt(items,i,{initialValue:e.target.value}))}/></div>
      <Button type="button" variant="ghost" size="icon" className="self-end" aria-label={'Remove meter '+(i+1)} onClick={()=>onChange(items.filter((_,j)=>j!==i))}><Trash2 className="h-4 w-4"/></Button>
    </div>)}
    {!items.length&&<p className="text-sm text-muted-foreground">No meters yet. You can add them later under the asset's Meters tab.</p>}
  </section>;
}
