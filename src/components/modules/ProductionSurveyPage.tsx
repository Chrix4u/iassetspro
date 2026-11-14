'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AsyncSearchableSelect, type SearchableOption } from '@/components/ui/searchable-select';
import { Badge } from '@/components/ui/badge';
import { formatUiDate } from '@/lib/date-display';
import { ClipboardCheck, Factory, Gauge, Plus, RefreshCw, Download } from 'lucide-react';

type Shift = {id:string;code:string;name:string;startsAt:string|null;endsAt:string|null};
type Meter = {id:string;name:string;unit:string;currentValue:number};
type Setup = {asset:{id:string;name:string;assetTag:string;plantId:string};shifts:Shift[];meters:Meter[]};
type Row = {
 id:string;assetId:string;shiftTemplateId:string;productionDate:string;outputQuantity:number;unit:string;targetQuantity:number|null;notes:string|null;
 availableMinutes:number;breakMinutes:number;repairMinutes:number;inputDeliveryMinutes:number;
 changeoverMinutes:number;startupCleaningMinutes:number;otherMinutes:number;preventiveMinutes:number;
 status:string;reviewNote:string|null;meterReadingId:string|null;assetMeterId:string|null;
 recordedById:string;asset:{name:string;assetTag:string};shift:{name:string};
 recordedBy:{fullName:string};reviewedBy:{fullName:string}|null;
};
type PmThreshold = {
 id:string; source:'task'|'schedule'; description:string; scheduleTitle:string|null;
 meterId:string; meterName:string; unit:string;
 autoGenerateWO:boolean; state:'due'|'approaching'|'upcoming'|'awaiting_reading';
 currentValue:number|null; nextDueReading:number; remaining:number|null; progressPercent:number|null;
};
type PmProgress = {meters:Array<{id:string;name:string;unit:string;currentValue:number}>;thresholds:PmThreshold[]};
type ReportRow = {
 period:string;assetId:string;machine:string;assetTag:string;unit:string;shifts:number;
 output:number;target:number;availableMinutes:number;downtimeMinutes:number;productiveMinutes:number;
 repairMinutes:number;preventiveMinutes:number;breakMinutes:number;meterLinkedOutput:number;
 utilizationPct:number|null;speedPerMinute:number|null;targetAchievementPct:number|null;
 shiftNames:string[];
};
const today=()=>new Date().toISOString().slice(0,10);
const sixDaysAgo=()=>new Date(Date.now()-6*86400000).toISOString().slice(0,10);
const freshForm=()=>({
 productionDate:today(),shiftTemplateId:'',assetMeterId:'none',unit:'',outputQuantity:'',
 targetQuantity:'',availableMinutes:'480',breakMinutes:'0',repairMinutes:'0',
 inputDeliveryMinutes:'0',changeoverMinutes:'0',startupCleaningMinutes:'0',
 otherMinutes:'0',preventiveMinutes:'0',notes:'',
});
const stoppageFields=[
 ['breakMinutes','Breaks'],['repairMinutes','Repair / maintenance'],
 ['inputDeliveryMinutes','Input / delivery problems'],['changeoverMinutes','Changeover'],
 ['startupCleaningMinutes','Start-up / cleaning'],['otherMinutes','Other stoppages'],
 ['preventiveMinutes','Preventive maintenance'],
] as const;
const csvValue=(value:unknown)=>{
 const text=String(value??'');
 const safe=/^[=+@-]/.test(text)?"'"+text:text;
 return '"'+safe.replace(/"/g,'""')+'"';
};
function dayLabel(value:string) {
 const date=value.slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return value;
 return formatUiDate(new Date(date+'T00:00:00.000Z'));
}
const amount=(number:number)=>number.toLocaleString('en-GH',{maximumFractionDigits:2});
const pct=(number:number|null)=>number==null?'—':number.toFixed(1)+'%';

export default function ProductionSurveyPage(){
 const {hasPermission,isAdmin}=useAuthStore();
 const canEnter=isAdmin()||hasPermission('production_surveys.create');
 const canManage=isAdmin()||hasPermission('production_surveys.manage');
 const [assetId,setAssetId]=useState('');
 const [setup,setSetup]=useState<Setup|null>(null);
 const [form,setForm]=useState(freshForm);
 const [from,setFrom]=useState(sixDaysAgo);
 const [to,setTo]=useState(today);
 const [period,setPeriod]=useState<'day'|'week'>('day');
 const [rows,setRows]=useState<Row[]>([]);
 const [reports,setReports]=useState<ReportRow[]>([]);
 const [loading,setLoading]=useState(false);
 const [saving,setSaving]=useState(false);
 const [editingId,setEditingId]=useState<string|null>(null);
 const [reviewing,setReviewing]=useState<string|null>(null);
 const [shiftName,setShiftName]=useState('');
 const [shiftCode,setShiftCode]=useState('');
 const [configuring,setConfiguring]=useState(false);
 const [pmProgress,setPmProgress]=useState<PmProgress|null>(null);
 const [pmProgressError,setPmProgressError]=useState<string|null>(null);
 const [pmProgressLoading,setPmProgressLoading]=useState(false);

 const searchMachines=useCallback(async(search:string):Promise<SearchableOption[]>=>{
   const res=await api.get<Array<{id:string;name:string;assetTag:string}>>('/api/assets?limit=100&search='+encodeURIComponent(search));
   return res.success&&Array.isArray(res.data)?
     res.data.map(x=>({value:x.id,label:x.name+' ['+x.assetTag+']'})):[];
 },[]);
 const refresh=useCallback(async()=>{
   setLoading(true);
   try{
     const query=new URLSearchParams({from,to,group:period});
     if(assetId)query.set('assetId',assetId);
     const recordParams=new URLSearchParams({from,to,limit:'100'});
     if(assetId)recordParams.set('assetId',assetId);
     const [records,report]=await Promise.all([
       api.get<Row[]>('/api/production-surveys?'+recordParams),
       api.get<ReportRow[]>('/api/production-surveys/report?'+query),
     ]);
     if(!records.success||!report.success)throw new Error(records.error||report.error||'Unable to load the production survey');
     setRows(Array.isArray(records.data)?records.data:[]);
     setReports(Array.isArray(report.data)?report.data:[]);
   }catch(error){toast.error(error instanceof Error?error.message:'Unable to load production survey');}
   finally{setLoading(false);}
 },[assetId,from,to,period]);
 useEffect(()=>{void refresh();},[refresh]);
 const loadSetup=useCallback(async()=>{
   if(!assetId){setSetup(null);return;}
   const res=await api.get<Setup>('/api/production-surveys/setup?assetId='+encodeURIComponent(assetId));
   if(res.success&&res.data)setSetup(res.data);
   else{setSetup(null);toast.error(res.error||'Unable to load machine shift and meters');}
 },[assetId]);
 useEffect(()=>{void loadSetup();if(!editingId)setForm(f=>({...f,shiftTemplateId:'',assetMeterId:'none',unit:''}));},[loadSetup,editingId]);
 // Help operators avoid accidentally leaving a single production-output meter unlinked.
 // They can still explicitly choose "Reporting only" for non-PM production figures.
 useEffect(()=>{
   if(setup?.meters.length===1&&!editingId){
     const only=setup.meters[0];
     setForm(current=>current.assetMeterId==='none'
       ? {...current,assetMeterId:only.id,unit:only.unit}:current);
   }
 },[setup,editingId]);
 const loadPmProgress=useCallback(async()=>{
   if(!assetId){setPmProgress(null);setPmProgressError(null);return;}
   setPmProgressLoading(true);
   try{
     const response=await api.get<PmProgress>('/api/production-surveys/pm-progress?assetId='+encodeURIComponent(assetId));
     if(!response.success||!response.data)throw new Error(response.error||'Could not load PM usage progress');
     setPmProgress(response.data);setPmProgressError(null);
   }catch(error){
     setPmProgress(null);
     setPmProgressError(error instanceof Error?error.message:'Could not load PM usage progress');
   }finally{setPmProgressLoading(false);}
 },[assetId]);
 useEffect(()=>{void loadPmProgress();},[loadPmProgress]);
 const selectedMeter=setup?.meters.find(x=>x.id===form.assetMeterId);
 const chosenUnit=selectedMeter?.unit||form.unit;
 const available=Number(form.availableMinutes)||0;
 const stopped=stoppageFields.reduce((n,[key])=>n+(Number(form[key])||0),0);
 const productive=available-stopped;
 const preparedReport=useMemo(()=>reports.reduce((sum,row)=>({
    output:sum.output+row.output,shifts:sum.shifts+row.shifts,
    stoppage:sum.stoppage+row.downtimeMinutes,linked:sum.linked+row.meterLinkedOutput,
   }),{output:0,shifts:0,stoppage:0,linked:0}),[reports]);
 const reportSingleUnit=reports.length>0&&reports.every(x=>x.unit===reports[0].unit);
 const reportUnit=reportSingleUnit?reports[0].unit:'';
 const outputSummary=reports.length===0?'—':reportSingleUnit?amount(preparedReport.output)+' '+reportUnit:'See machine rows · mixed units';
 const postedSummary=reports.length===0?'—':reportSingleUnit?amount(preparedReport.linked)+' '+reportUnit:'See machine rows · mixed units';

 const configure=async(initialize:boolean)=>{
   if(!setup||!canManage)return;
   setConfiguring(true);
   try{
     const payload=initialize?{plantId:setup.asset.plantId,initialize:true}:{
       plantId:setup.asset.plantId,name:shiftName.trim(),code:shiftCode.trim().toLowerCase(),
     };
     const res=await api.post('/api/production-surveys/setup',payload);
     if(!res.success)throw new Error(res.error||'Could not configure shifts');
     toast.success('Shift configuration saved');
     setShiftName('');setShiftCode('');await loadSetup();
   }catch(error){toast.error(error instanceof Error?error.message:'Could not configure shifts');}
   finally{setConfiguring(false);}
 };
 const submit=async()=>{
   if(!setup||!canEnter)return;
   setSaving(true);
   try{
     const payload={...form,assetId:setup.asset.id,assetMeterId:form.assetMeterId==='none'?null:form.assetMeterId,
       unit:chosenUnit,outputQuantity:form.outputQuantity,targetQuantity:form.targetQuantity,
     };
     const res=editingId?await api.put('/api/production-surveys/'+encodeURIComponent(editingId),payload):await api.post('/api/production-surveys',payload);
     if(!res.success)throw new Error(res.error||'Failed to submit shift production');
     toast.success('Shift production submitted for independent verification. The PM meter has not changed.');
     setEditingId(null);
     setForm(current=>({...freshForm(),productionDate:current.productionDate,
       shiftTemplateId:current.shiftTemplateId,assetMeterId:current.assetMeterId,unit:current.unit}));
     await refresh();
   }catch(error){toast.error(error instanceof Error?error.message:'Failed to submit shift production');}
   finally{setSaving(false);}
 };
 const beginCorrection=(row:Row)=>{
   setEditingId(row.id);
   setAssetId(row.assetId);
   setForm({
     productionDate:row.productionDate.slice(0,10),shiftTemplateId:row.shiftTemplateId,
     assetMeterId:row.assetMeterId||'none',unit:row.unit,
     outputQuantity:String(row.outputQuantity),targetQuantity:row.targetQuantity==null?'':String(row.targetQuantity),
     availableMinutes:String(row.availableMinutes),breakMinutes:String(row.breakMinutes),repairMinutes:String(row.repairMinutes),
     inputDeliveryMinutes:String(row.inputDeliveryMinutes),changeoverMinutes:String(row.changeoverMinutes),
     startupCleaningMinutes:String(row.startupCleaningMinutes),otherMinutes:String(row.otherMinutes),
     preventiveMinutes:String(row.preventiveMinutes),notes:row.notes||'',
   });
   window.scrollTo({top:0,behavior:'smooth'});
 };
 const review=async(row:Row,action:'approve'|'reject')=>{
   if(!canManage)return;
   const note=action==='reject'?window.prompt('Reason for rejecting this production entry:'):'';
   if(action==='reject'&&!note?.trim())return;
   if(action==='approve'&&!window.confirm('Approve '+amount(row.outputQuantity)+' '+row.unit+' for '+row.asset.name+'? This will advance its linked PM meter if configured.'))return;
   setReviewing(row.id);
   try{
     const res=await api.post('/api/production-surveys/'+encodeURIComponent(row.id)+'/review',{action,note});
     if(!res.success)throw new Error(res.error||'Review failed');
     const data=res.data as {meterPosted?:boolean;duplicate?:boolean}|undefined;
     toast.success(action==='approve'?(data?.meterPosted?'Approved and posted to the PM production meter':'Approved for reporting (no PM meter selected)'):'Returned to production for correction');
     await refresh();await loadSetup();await loadPmProgress();
   }catch(error){toast.error(error instanceof Error?error.message:'Review failed');}
   finally{setReviewing(null);}
 };
 const exportCsv=()=>{
   const headers=['Period','Machine','Machine Code','Shifts Entered','Shift Names','Unit','Output','Target','Available Min','Stoppage Min','Productive Min','Utilization %','Speed per Min','Repair Min','PM Min','PM Meter Output'];
   const lines=[headers,...reports.map(r=>[dayLabel(r.period),r.machine,r.assetTag,r.shifts,r.shiftNames.join(' / '),r.unit,r.output,r.target,r.availableMinutes,r.downtimeMinutes,r.productiveMinutes,
     r.utilizationPct??'',r.speedPerMinute??'',r.repairMinutes,r.preventiveMinutes,r.meterLinkedOutput])];
   const blob=new Blob(['\uFEFF'+lines.map(x=>x.map(csvValue).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
   const url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download='production-survey-'+period+'-'+from+'-'+to+'.csv';
   document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 return <div className="page-content min-w-0 space-y-4" data-testid="production-shift-survey">
   <div className="flex flex-wrap items-center justify-between gap-2">
     <div><h1 className="text-2xl font-bold tracking-tight">Production Survey & PM Usage</h1>
       <p className="text-sm text-muted-foreground">Record actual production per machine and shift. An absent shift is not treated as zero output. Manager-approved quantities feed cumulative PM meters.</p></div>
     <Button variant="outline" onClick={()=>void refresh()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button>
   </div>
   <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Factory className="h-4 w-4"/>Select machine</CardTitle>
     <CardDescription>Use a registered asset, not an unlinked text work-centre code, so its production can contribute to meter-based PM.</CardDescription></CardHeader>
     <CardContent><AsyncSearchableSelect value={assetId} onValueChange={setAssetId} fetchOptions={searchMachines} placeholder="Find machine by name or code"/></CardContent>
   </Card>
   {assetId&&setup&&<div data-testid="production-pm-progress">
     <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-2">
       <div><CardTitle className="flex items-center gap-2 text-base"><Gauge className="h-4 w-4"/>Production output → PM thresholds</CardTitle>
       <CardDescription>Read-only status from your registered machine meters. Recalculates after a manager approves a shift.</CardDescription></div>
       <Button size="sm" variant="outline" disabled={pmProgressLoading} onClick={()=>void loadPmProgress()}><RefreshCw className="mr-1 h-4 w-4"/>Refresh usage</Button>
     </div></CardHeader>
     <CardContent className="space-y-3">
       {pmProgressError&&<p role="alert" className="text-sm text-destructive">{pmProgressError}</p>}
       {!pmProgressError&&pmProgressLoading&&!pmProgress&&<p className="text-sm text-muted-foreground">Loading maintenance meter thresholds…</p>}
       {pmProgress?.meters.length===0&&<p className="text-sm text-muted-foreground">No production-output meter registered on this machine. The engineering team can add a Production Output meter under Assets → Meters, then choose it in this survey.</p>}
       {pmProgress&&pmProgress.meters.length>0&&pmProgress.thresholds.length===0&&
         <p className="text-sm text-muted-foreground">Production meters are registered, but no active usage-based PM threshold is linked. A maintenance planner can assign a meter-based task or schedule using these machine meters.</p>}
       {pmProgress&&pmProgress.thresholds.length>0&&<div className="grid gap-3 sm:grid-cols-2">
         {pmProgress.thresholds.map(item=><div key={item.source+':'+item.id} className="min-w-0 rounded-lg border p-3 space-y-2" data-testid="production-pm-threshold">
           <div className="flex flex-wrap items-start justify-between gap-2">
             <div className="min-w-0"><p className="font-semibold text-sm break-words">{item.description}</p>
               <p className="text-xs text-muted-foreground">{item.source==='task'?'PM task':'Machine PM schedule'} · {item.meterName} ({item.unit})</p></div>
             <Badge variant={item.state==='due'?'destructive':item.state==='approaching'?'outline':'secondary'}>
               {item.state==='due'?'Threshold reached':item.state==='approaching'?'Approaching due':
                 item.state==='awaiting_reading'?'Awaiting reading':'Upcoming'}
             </Badge>
           </div>
           <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs">
             <span>Approved meter: <strong>{item.currentValue===null?'No reading':amount(item.currentValue)+' '+item.unit}</strong></span>
             <span>Next threshold: <strong>{amount(item.nextDueReading)} {item.unit}</strong></span>
           </div>
           {item.progressPercent!==null&&<div className="h-2 rounded-full bg-muted overflow-hidden" role="progressbar"
             aria-label={'Progress toward '+item.description} aria-valuemin={0} aria-valuemax={100}
             aria-valuenow={Math.round(item.progressPercent)}>
             <div className="h-full bg-emerald-600" style={{width:item.progressPercent+'%'}}/>
           </div>}
           <p className="text-xs text-muted-foreground">
             {item.remaining===null?'A reviewed first meter reading is needed before the due state can be evaluated.':
               item.remaining===0?'The meter threshold has been reached. Check PM work-order status with the planner.':
               amount(item.remaining)+' '+item.unit+' remaining before this PM threshold.'}
             {!item.autoGenerateWO&&' Planner review may be required.'}
           </p>
         </div>)}
       </div>}
       <p className="text-xs text-muted-foreground">A due meter reading does not prove that a PM work order has already been created or completed. Use PM → Work Orders to confirm the work order and next cycle.</p>
     </CardContent></Card>
   </div>}
   {assetId&&setup&&<Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Gauge className="h-4 w-4"/>Shift production entry</CardTitle>
     <CardDescription>{setup.asset.name} · {setup.asset.assetTag}. Submit one record per machine, shift and production date. A reviewer verifies it before PM meters advance.</CardDescription></CardHeader>
     <CardContent className="space-y-4">
       {setup.shifts.length===0&&<div className="rounded-lg border border-amber-300 p-3 text-sm">
         No shifts have been configured for this plant. Morning, Afternoon and Night are optional templates, not mandatory daily entries.
         {canManage&&<Button className="ml-2" size="sm" variant="outline" disabled={configuring} onClick={()=>void configure(true)}>Create standard shifts</Button>}
       </div>}
       <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
         <div className="space-y-1"><Label>Production date</Label><Input type="date" value={form.productionDate} onChange={e=>setForm(f=>({...f,productionDate:e.target.value}))}/></div>
         <div className="space-y-1"><Label>Shift / session</Label><Select value={form.shiftTemplateId} onValueChange={v=>setForm(f=>({...f,shiftTemplateId:v}))}>
           <SelectTrigger><SelectValue placeholder="Select recorded shift"/></SelectTrigger>
           <SelectContent>{setup.shifts.map(s=><SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
         </Select></div>
         <div className="space-y-1"><Label>Production meter (optional)</Label><Select value={form.assetMeterId} onValueChange={v=>setForm(f=>({...f,assetMeterId:v,unit:setup.meters.find(m=>m.id===v)?.unit||f.unit}))}>
           <SelectTrigger><SelectValue placeholder="Select PM output meter"/></SelectTrigger><SelectContent>
             <SelectItem value="none">Reporting only · no PM posting</SelectItem>
             {setup.meters.map(m=><SelectItem key={m.id} value={m.id}>{m.name} ({m.unit}, current {amount(m.currentValue)})</SelectItem>)}
           </SelectContent></Select></div>
         <div className="space-y-1"><Label>Output unit</Label><Input value={chosenUnit} disabled={Boolean(selectedMeter)} onChange={e=>setForm(f=>({...f,unit:e.target.value}))} placeholder="tonnes, yards, pieces"/></div>
         <div className="space-y-1"><Label>Actual production *</Label><Input type="number" min="0" step="any" value={form.outputQuantity} onChange={e=>setForm(f=>({...f,outputQuantity:e.target.value}))}/></div>
         <div className="space-y-1"><Label>Production target (optional)</Label><Input type="number" min="0" step="any" value={form.targetQuantity} onChange={e=>setForm(f=>({...f,targetQuantity:e.target.value}))}/></div>
         <div className="space-y-1"><Label>Available minutes *</Label><Input type="number" min="0" max="1440" step="1" value={form.availableMinutes} onChange={e=>setForm(f=>({...f,availableMinutes:e.target.value}))}/></div>
         <div className="rounded-lg bg-muted/40 p-3 text-sm"><p>Productive time</p><strong>{productive>=0?productive.toLocaleString()+' min':'Invalid stoppage totals'}</strong>
           <p className="text-xs text-muted-foreground">Downtime: {stopped} min</p></div>
       </div>
       <div className="space-y-2"><p className="text-sm font-semibold">Stoppages (minutes, from engineer's survey)</p>
         <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
           {stoppageFields.map(([key,label])=><div key={key} className="space-y-1"><Label>{label}</Label>
             <Input type="number" min="0" max="1440" step="1" value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}/></div>)}
         </div>
       </div>
       <div className="space-y-1"><Label>Operator notes / observations</Label><Textarea rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Abnormal sound, input shortage, breakdown, production constraints..."/></div>
       {editingId&&<p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">Correcting a rejected shift. Submit again for a different production manager to verify. This does not touch any approved meter reading.</p>}
       <div className="flex flex-wrap justify-between gap-2">
         <p className="max-w-xl text-xs text-muted-foreground">{selectedMeter?'After independent approval, output increments the selected meter; existing usage-based PM tasks read its cumulative value.':'No production meter selected. This record will appear in reports but cannot trigger a quantity-based PM schedule.'}</p>
         <div className="flex flex-wrap gap-2">
           {editingId&&<Button variant="outline" onClick={()=>{setEditingId(null);setForm(freshForm());}}>Cancel correction</Button>}
           {canEnter&&<Button onClick={()=>void submit()} disabled={saving||!form.shiftTemplateId||!form.outputQuantity||!chosenUnit||productive<0}>
             <ClipboardCheck className="mr-2 h-4 w-4"/>{saving?'Submitting…':editingId?'Resubmit corrected shift':'Submit shift production'}
           </Button>}
         </div>
       </div>
       {canManage&&<div className="rounded-lg border p-3 space-y-2"><p className="text-sm font-semibold">Configure another shift (optional)</p>
         <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
           <Input placeholder="Shift name e.g. Weekend A" value={shiftName} onChange={e=>setShiftName(e.target.value)}/>
           <Input placeholder="Code e.g. weekend_a" value={shiftCode} onChange={e=>setShiftCode(e.target.value)}/>
           <Button variant="outline" disabled={configuring||!shiftName.trim()||!shiftCode.trim()} onClick={()=>void configure(false)}><Plus className="mr-1 h-4 w-4"/>Add Shift</Button>
         </div><p className="text-xs text-muted-foreground">Shifts can be configured without forcing production entries for every shift every day.</p>
       </div>}
     </CardContent></Card>}
   <Card><CardHeader><CardTitle className="text-base">Daily / weekly production reports</CardTitle>
     <CardDescription>Approved production only. Sunday–Saturday weekly groups follow the engineer's workbook. A missing shift is not a zero.</CardDescription></CardHeader>
     <CardContent className="space-y-3">
       <div className="flex flex-wrap items-end gap-3">
         <div className="space-y-1"><Label>From</Label><Input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></div>
         <div className="space-y-1"><Label>To</Label><Input type="date" value={to} onChange={e=>setTo(e.target.value)}/></div>
         <div className="space-y-1"><Label>Report period</Label><Select value={period} onValueChange={v=>setPeriod(v as 'day'|'week')}>
           <SelectTrigger className="w-36"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="day">Daily</SelectItem><SelectItem value="week">Weekly</SelectItem></SelectContent>
         </Select></div>
         <Button variant="outline" onClick={exportCsv} disabled={!reports.length}><Download className="mr-2 h-4 w-4"/>Export CSV</Button>
       </div>
       <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
         {[[ 'Verified output',outputSummary],['Recorded shifts',preparedReport.shifts],['Downtime',amount(preparedReport.stoppage)+' min'],['Posted to PM meters',postedSummary]].map(([label,value])=>
           <div key={String(label)} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="font-bold text-lg">{value}</p></div>)}
       </div>
       <div className="overflow-x-auto rounded-lg border">
         <table className="w-full min-w-[900px] text-sm"><thead className="bg-muted/50 text-left"><tr>
           {['Period','Machine','Shifts','Output','Target','Unit','Downtime','Productive','Utilization','PM-linked'].map(name=><th key={name} className="p-2 font-semibold">{name}</th>)}
         </tr></thead><tbody>{reports.map(r=><tr key={r.period+':'+r.assetId+':'+r.unit} className="border-t">
           <td className="p-2 whitespace-nowrap">{dayLabel(r.period)}</td><td className="p-2">{r.machine}<span className="block text-xs text-muted-foreground">{r.assetTag}</span></td>
           <td className="p-2">{r.shifts}<span className="block text-xs text-muted-foreground">{r.shiftNames.join(', ')}</span></td>
           <td className="p-2 text-right tabular-nums">{amount(r.output)}</td><td className="p-2 text-right tabular-nums">{amount(r.target)}</td>
           <td className="p-2">{r.unit}</td><td className="p-2 text-right tabular-nums">{r.downtimeMinutes}</td>
           <td className="p-2 text-right tabular-nums">{r.productiveMinutes}</td><td className="p-2">{pct(r.utilizationPct)}</td>
           <td className="p-2 text-right tabular-nums">{amount(r.meterLinkedOutput)}</td>
         </tr>)}</tbody></table>
         {!reports.length&&<div className="p-6 text-center text-sm text-muted-foreground">No approved production entries match this report window. Unreported shifts are not counted as zero.</div>}
       </div>
     </CardContent></Card>
   <Card><CardHeader><CardTitle className="text-base">Recorded shifts & independent approval</CardTitle>
     <CardDescription>Submitted figures are visible before review but never advance the PM meter. A second user must verify the report.</CardDescription></CardHeader>
     <CardContent className="overflow-x-auto">
       <table className="w-full min-w-[800px] text-sm"><thead className="bg-muted/50 text-left"><tr>
         {['Date','Machine','Shift','Output','Unit','Status','PM Meter','Operator','Review'].map(name=><th key={name} className="p-2">{name}</th>)}
       </tr></thead><tbody>{rows.map(row=><tr key={row.id} className="border-t">
         <td className="p-2 whitespace-nowrap">{dayLabel(row.productionDate)}</td>
         <td className="p-2">{row.asset.name}<span className="block text-xs text-muted-foreground">{row.asset.assetTag}</span></td>
         <td className="p-2">{row.shift.name}</td><td className="p-2 tabular-nums">{amount(row.outputQuantity)}</td><td className="p-2">{row.unit}</td>
         <td className="p-2"><Badge variant={row.status==='approved'?'secondary':row.status==='rejected'?'destructive':'outline'}>{row.status}</Badge></td>
         <td className="p-2">{row.meterReadingId?'Posted':row.assetMeterId?'Pending approval':'Not linked'}</td>
         <td className="p-2">{row.recordedBy.fullName}</td>
         <td className="p-2">{canManage&&row.status==='submitted'&&row.recordedById!==useAuthStore.getState().user?.id?
           <div className="flex gap-1"><Button disabled={reviewing===row.id} size="sm" onClick={()=>void review(row,'approve')}>Approve</Button>
             <Button disabled={reviewing===row.id} variant="outline" size="sm" onClick={()=>void review(row,'reject')}>Reject</Button></div>:
           row.status==='rejected'&&row.recordedById===useAuthStore.getState().user?.id?
             <div className="space-y-1"><p className="max-w-48 break-words text-xs text-destructive">{row.reviewNote}</p>
               <Button size="sm" variant="outline" onClick={()=>beginCorrection(row)}>Correct & Resubmit</Button></div>:
           <span className="text-xs text-muted-foreground">{row.reviewedBy?.fullName||'Awaiting other reviewer'}</span>}</td>
       </tr>)}</tbody></table>
       {!rows.length&&<p className="p-4 text-sm text-muted-foreground">No shift entries for this selection. This does not prove that production was zero.</p>}
     </CardContent>
   </Card>
 </div>;
}
