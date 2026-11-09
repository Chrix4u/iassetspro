'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, Download, Loader2, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import type { PmPlanningConflictReport } from '@/lib/pm-planning-conflict';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface PlantOption { id: string; name: string; code?: string | null }
type Report = PmPlanningConflictReport & {windowDays:number;from:string;to:string};
function formatLocal(value:string) {
  const date=new Date(value);
  return Number.isFinite(date.getTime())?date.toLocaleString('en-GH',{
    timeZone:'Africa/Accra',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',
  }):'Invalid time';
}
function csvEscape(value:unknown){
  const raw=String(value??'');
  const clean=/^[=+\-@]/.test(raw.trimStart())?"'"+raw:raw;
  return '"'+clean.replace(/"/g,'""')+'"';
}
/** Advisory scheduling conflict readout. Does NOT create WOs or block real dispatch. */
export function PmSchedulingConflictsPanel() {
  const [report,setReport]=useState<Report|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [windowDays,setWindowDays]=useState<7|30|90>(30);
  const [plantId,setPlantId]=useState('all');
  const [plants,setPlants]=useState<PlantOption[]>([]);
  const [reload,setReload]=useState(0);
  useEffect(()=>{
    let alive=true;
    void api.get<PlantOption[]>('/api/plants').then(response=>{
      if(alive&&response.success&&Array.isArray(response.data))setPlants(response.data);
    }).catch(()=>{});
    return ()=>{alive=false};
  },[]);
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const params=new URLSearchParams({windowDays:String(windowDays)});
      if(plantId!=='all')params.set('plantId',plantId);
      const response=await api.get<Report>('/api/pm-assignments/planning-conflicts?'+params.toString());
      if(!response.success||!response.data)throw new Error(response.error||'Could not load scheduling conflicts');
      setReport(response.data);
    }catch(e){
      setReport(null);
      setError(e instanceof Error?e.message:'Could not load scheduling conflicts');
    }finally{setLoading(false);}
  },[windowDays,plantId]);
  useEffect(()=>{void load()},[load,reload]);
  const exportCsv=()=>{
    if(!report)return;
    const header=['Priority','Issue','WO 1','WO 2','Machine','Overlap From (UTC)','Overlap To (UTC)','Explanation'];
    const rows=report.conflicts.map(x=>[
      x.severity,x.code,x.firstWo,x.secondWo,x.assetName,x.overlapStart,x.overlapEnd,x.explanation,
    ]);
    const csv=[header,...rows].map(x=>x.map(csvEscape).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
    const anchor=document.createElement('a');
    anchor.href=url;anchor.download='iassetspro-pm-conflict-review-'+windowDays+'d.csv';
    document.body.appendChild(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(url);
  };
  const high=report?.conflicts.filter(x=>x.severity==='high').length||0;
  const review=report?.conflicts.filter(x=>x.severity==='review').length||0;
  return <Card className="border shadow-sm" data-testid="pm-scheduling-conflicts">
    <CardHeader className="space-y-3 pb-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-blue-600"/>PM Work-Order Schedule Conflicts
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Review overlapping machine work, operating-state clashes and double-booked technicians
            before approving shutdowns. Findings are advisory, not automatic cancellations.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={loading}
            aria-label="Refresh PM conflict report" onClick={()=>setReload(x=>x+1)}>
            {loading?<Loader2 className="mr-1 h-4 w-4 animate-spin"/>:
              <RefreshCw className="mr-1 h-4 w-4"/>}Refresh
          </Button>
          <Button size="sm" variant="outline" disabled={!report||!report.conflicts.length}
            onClick={exportCsv}><Download className="mr-1 h-4 w-4"/>CSV</Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Scheduling review window</Label>
          <Select value={String(windowDays)} onValueChange={x=>setWindowDays(Number(x) as 7|30|90)}>
            <SelectTrigger aria-label="PM conflict window"><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Next 7 days</SelectItem>
              <SelectItem value="30">Next 30 days</SelectItem>
              <SelectItem value="90">Next 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Plant scope</Label>
          <Select value={plants.some(x=>x.id===plantId)?plantId:'all'} onValueChange={setPlantId}>
            <SelectTrigger aria-label="PM conflict plant filter"><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All permitted plants</SelectItem>
              {plants.map(x=><SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </CardHeader>
    <CardContent className="space-y-3">
      {loading&&<p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin"/>Comparing planned PM work-order windows…
      </p>}
      {error&&<p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
        {error} Choose one authorized plant if the all-plants register exceeds the review limit.</p>}
      {report&&<>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Stat label="Work orders evaluated" value={report.evaluated}/>
          <Stat label="High-priority conflicts" value={high} attention={high>0}/>
          <Stat label="Review-only overlaps" value={review}/>
          <Stat label="Job windows needing setup" value={report.windowIssues.length} attention={report.windowIssues.length>0}/>
        </div>
        {report.overflow&&<p role="alert" className="rounded-lg border border-amber-300 p-3 text-sm">
          More than 4,000 conflicts were detected. The displayed result is incomplete.
          Narrow to a single plant; do not use this partial report for planning sign-off.
        </p>}
        <p className="text-xs text-muted-foreground">
          Overlaps are checked only between eligible PM work orders in your permitted plants,
          with at least one planning date in the selected window. A parallel job can be intentional.
          Times are shown in Ghana local time (GMT).
        </p>
        <div className="overflow-x-auto rounded-lg border" data-testid="pm-conflict-pairs">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-muted/50 text-muted-foreground"><tr>
              <th className="px-3 py-2">Priority</th>
              <th className="px-3 py-2">Work orders</th>
              <th className="px-3 py-2">Planning issue</th>
              <th className="px-3 py-2">Overlap (GMT)</th>
            </tr></thead>
            <tbody className="divide-y">
              {report.conflicts.slice(0,30).map((x,i)=><tr key={x.firstId+'-'+x.secondId+'-'+x.code+'-'+i}>
                <td className="px-3 py-2 align-top">
                  <Badge variant={x.severity==='high'?'destructive':'outline'}>
                    {x.severity==='high'?'High':'Review'}</Badge></td>
                <td className="px-3 py-2 align-top font-medium">{x.firstWo} / {x.secondWo}</td>
                <td className="px-3 py-2 align-top">
                  <p className="font-medium">{x.explanation}</p>
                  <p className="text-muted-foreground">{x.assetName}</p>
                </td>
                <td className="px-3 py-2 align-top">
                  {formatLocal(x.overlapStart)} — {formatLocal(x.overlapEnd)}
                </td>
              </tr>)}
              {report.conflicts.length===0&&<tr><td colSpan={4}
                className="px-3 py-5 text-center text-muted-foreground">
                No overlapping PM jobs detected in the visible, dated work-order set.
              </td></tr>}
            </tbody>
          </table>
        </div>
        {report.conflicts.length>30&&<p className="text-xs text-muted-foreground">
          Showing 30 of {report.conflicts.length} conflicts. Export CSV for the complete scoped list.</p>}
        {report.windowIssues.length>0&&<div className="space-y-1 rounded-lg border p-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-600"/>Incomplete PM work-order planning windows</p>
          <ul className="list-inside list-disc space-y-1 text-xs">
            {report.windowIssues.slice(0,15).map(x=><li key={x.id+'-'+x.code}>
              {x.woNumber}: {x.message}</li>)}
          </ul>
          {report.windowIssues.length>15&&<p className="text-xs text-muted-foreground">
            {report.windowIssues.length-15} additional job windows require planning review.</p>}
        </div>}
        <p className="text-xs text-muted-foreground">
          This is a scheduling review, not permit approval, staff attendance confirmation, stock reservation
          or permission to start machinery work. Existing Repairs, supervisor and planner controls remain authoritative.
        </p>
      </>}
    </CardContent>
  </Card>;
}
function Stat({label,value,attention=false}:{label:string;value:number;attention?:boolean}){
 return <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p>
   <p className={'text-xl font-bold tabular-nums '+(attention?'text-amber-700 dark:text-amber-300':'')}>
     {value.toLocaleString()}</p></div>;
}
