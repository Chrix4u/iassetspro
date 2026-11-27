'use client';
import {useEffect,useState,useCallback} from 'react';
import {api} from '@/lib/api';
import {ResponsiveDialog} from '@/components/shared/ResponsiveDialog';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {toast} from 'sonner';
type Rate={id:string;plantId:string;normalHourlyRate:number;overtimeHourlyRate:number|null;currency:string;effectiveFrom:string;effectiveTo:string|null};
type Plant={id:string;name:string;code:string};
type RateData={plants:Plant[];rates:Rate[]};
export function UserLaborRateDialog({user,onClose}:{user:{id:string;fullName:string};onClose:()=>void}){
 const [data,setData]=useState<RateData|null>(null);
 const [plantId,setPlantId]=useState('');
 const [normal,setNormal]=useState('');
 const [overtime,setOvertime]=useState('');
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const endpoint='/api/users/'+encodeURIComponent(user.id)+'/labor-rates';
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{const res=await api.get<RateData>(endpoint);if(!res.success||!res.data){setError(res.error||'Unable to load rates');return;}setData(res.data);setPlantId(p=>res.data!.plants.some(x=>x.id===p)?p:res.data!.plants[0]?.id||'');}catch{setError('Unable to load rates');}finally{setLoading(false);}
 },[endpoint]);
 useEffect(()=>{void load();},[load]);
 const rates=data?.rates.filter(r=>r.plantId===plantId)||[];
 const active=rates.find(r=>new Date(r.effectiveFrom).getTime()<=Date.now()&&(!r.effectiveTo||new Date(r.effectiveTo).getTime()>=Date.now()));
 useEffect(()=>{setNormal(active?String(active.normalHourlyRate):'');setOvertime(active?.overtimeHourlyRate==null?'':String(active.overtimeHourlyRate));},[plantId,active]);
 const save=async()=>{
  if(saving||!plantId||!normal.trim())return;
  setSaving(true);setError('');
  try{const res=await api.post(endpoint,{plantId,normalHourlyRate:Number(normal),overtimeHourlyRate:overtime.trim()?Number(overtime):null});if(!res.success){setError(res.error||'Unable to save rate');return;}toast.success('Labor rate saved');await load();}catch{setError('Unable to save labor rate');}finally{setSaving(false);}
 };
 const money=(value:number,currency:string)=>currency==='GHS'?'₵'+value.toLocaleString('en-GH',{minimumFractionDigits:2,maximumFractionDigits:2}):currency+' '+value.toFixed(2);
 return <ResponsiveDialog open onOpenChange={open=>{if(!open&&!saving)onClose();}} title="Labor rates" description={user.fullName+' · plant-specific hourly costing'} footer={<div className="flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={onClose}>Close</Button><Button disabled={saving||loading||!plantId||!normal.trim()} onClick={save}>{saving?'Saving…':'Save rate'}</Button></div>}>
  <div className="space-y-4 min-w-0">
   {error&&<div role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error}<Button variant="ghost" size="sm" onClick={load}>Reload</Button></div>}
   {loading?<p className="text-sm text-muted-foreground">Loading rates…</p>:data&&data.plants.length===0?<p className="text-sm">No active assigned plant is available. Select the worker’s plant or assign plant access first.</p>:data&&<>
    <div className="space-y-1"><Label htmlFor="worker-rate-plant">Plant</Label><Select value={plantId} onValueChange={setPlantId}><SelectTrigger id="worker-rate-plant" className="w-full"><SelectValue placeholder="Select plant"/></SelectTrigger><SelectContent>{data.plants.map(p=><SelectItem key={p.id} value={p.id}>{p.name} ({p.code})</SelectItem>)}</SelectContent></Select></div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
     <div className="space-y-1"><Label htmlFor="normal-rate">Normal hourly rate (₵)</Label><Input id="normal-rate" type="number" min="0.01" step="0.01" value={normal} onChange={e=>setNormal(e.target.value)}/></div>
     <div className="space-y-1"><Label htmlFor="overtime-rate">Overtime rate (₵, optional)</Label><Input id="overtime-rate" type="number" min="0.01" step="0.01" value={overtime} onChange={e=>setOvertime(e.target.value)}/></div>
    </div>
    <p className="text-xs text-muted-foreground">New rates take effect when saved. Prior rates remain available for historical costing. Overtime is stored for future use; current work-order costing uses the normal hourly rate.</p>
    <div className="border rounded-lg p-3 space-y-2"><h3 className="text-sm font-semibold">Rate history</h3>{rates.length===0?<p className="text-sm text-muted-foreground">No user-specific rate. A configured trade rate may still apply.</p>:rates.map(r=><div key={r.id} className="flex flex-wrap justify-between gap-1 border-t pt-2 text-sm"><div><strong>{money(r.normalHourlyRate,r.currency)}/hour</strong><div className="text-xs text-muted-foreground">{new Date(r.effectiveFrom).toLocaleString()} – {r.effectiveTo?new Date(r.effectiveTo).toLocaleString():'Current'}</div></div>{r.overtimeHourlyRate!=null&&<span className="text-xs">OT: {money(r.overtimeHourlyRate,r.currency)}</span>}</div>)}</div>
   </>}
  </div>
 </ResponsiveDialog>;
}
