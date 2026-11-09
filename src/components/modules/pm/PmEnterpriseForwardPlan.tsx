'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarRange, Download, Factory, Gauge, Loader2, RefreshCw, Users } from 'lucide-react';
import { api } from '@/lib/api';
import {
  buildPmForwardPlan, pmCapacityForWeek,
  type PmCapacityScenario, type PmForwardRow, type PmForwardTask,
} from '@/lib/pm-forward-capacity';
import { projectFixedCalendarRepeats } from '@/lib/pm-fixed-recurrence-scenario';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ForwardFeed { generatedAt: string; items: PmForwardTask[] }
interface PlantOption { id: string; name: string; code?: string | null }
const DEFAULT_SCENARIO: PmCapacityScenario = {
  crews: 2, hoursPerShift: 8, workingDaysPerWeek: 5, productivePercent: 80,
};
const STATUS_LABEL: Record<PmForwardRow['status'], string> = {
  overdue: 'Overdue · calendar', due_calendar: 'Due in horizon',
  due_meter: 'Meter threshold reached', later: 'Not due in horizon',
  needs_calendar_date: 'Next due date missing',
  needs_meter: 'Meter value/threshold missing',
  legacy_review: 'Legacy frequency review',
};
const formatHours = (minutes: number) =>
  (Math.round(minutes / 60 * 10) / 10).toLocaleString('en-GH', { maximumFractionDigits: 1 });
function csvCell(value: unknown) {
  const raw = String(value ?? '');
  const safe = /^[=+@-]/.test(raw.trimStart()) ? "'" + raw : raw;
  return '"' + safe.replace(/"/g, '""') + '"';
}
function day(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('en-GB', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' })
    : '—';
}
export function PmEnterpriseForwardPlan() {
  const [feed, setFeed] = useState<ForwardFeed | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [windowDays, setWindowDays] = useState<7 | 30 | 90>(30);
  const [plantId, setPlantId] = useState('all');
  const [availablePlants, setAvailablePlants] = useState<PlantOption[]>([]);
  const [search, setSearch] = useState('');
  const [scenario, setScenario] = useState<PmCapacityScenario>(DEFAULT_SCENARIO);
  const [includeRecurringScenario, setIncludeRecurringScenario] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const endpoint = '/api/pm-assignments/forward-plan' +
        (plantId === 'all' ? '' : '?plantId=' + encodeURIComponent(plantId));
      const response = await api.get<ForwardFeed>(endpoint);
      if (!response.success || !response.data || !Array.isArray(response.data.items)) {
        throw new Error(response.error || 'Could not load the plant-wide PM register');
      }
      setFeed(response.data);
    } catch (caught) {
      setFeed(null);
      setError(caught instanceof Error ? caught.message : 'Could not load PM forward plan');
    } finally { setLoading(false); }
  }, [plantId]);
  useEffect(() => { void load(); }, [load, reload]);
  useEffect(() => {
    let current = true;
    void api.get<PlantOption[]>('/api/plants').then((response) => {
      if (current && response.success && Array.isArray(response.data)) {
        setAvailablePlants(response.data);
      }
    }).catch(() => {});
    return () => { current = false; };
  }, []);
  const plants = useMemo(() => {
    const map = new Map<string, string>();
    for (const plant of availablePlants) map.set(plant.id, plant.name);
    for (const item of feed?.items || []) map.set(item.plantId, item.plantName);
    return [...map].sort((a, b) => a[1].localeCompare(b[1]));
  }, [availablePlants, feed]);
  const scopedTasks = useMemo(() =>
    (feed?.items || []).filter((task) => plantId === 'all' || task.plantId === plantId),
  [feed, plantId]);
  const plan = useMemo(() => buildPmForwardPlan(scopedTasks, windowDays,
    feed?.generatedAt ? new Date(feed.generatedAt) : new Date()),
  [scopedTasks, windowDays, feed?.generatedAt]);
  const repeats = useMemo(() => projectFixedCalendarRepeats(scopedTasks, windowDays,
    feed?.generatedAt ? new Date(feed.generatedAt) : new Date()),
  [scopedTasks, windowDays, feed?.generatedAt]);
  const actionableRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return plan.rows.filter((item) => item.status !== 'later').filter((item) => !term ||
      [item.assetName, item.assetCode, item.componentName || '', item.componentCode || '',
        item.description, item.plantName, item.openWorkOrder?.woNumber || '']
        .join(' ').toLowerCase().includes(term));
  }, [plan.rows, search]);
  const exportCsv = () => {
    const headers = ['Plant','Machine','Machine Code','Criticality','Asset Status',
      'Part','Part Code','Task Number','Task Description','Operating State',
      'Activity','Frequency Type','Next Due UTC','Meter Reading','Meter Threshold',
      'Meter Unit','Due Status','Task Duration Hours (estimated only)','Linked Work Order','WO Status','Horizon Days'];
    const values = plan.rows.map((item) => [
      item.plantName,item.assetName,item.assetCode,item.assetCriticality,item.assetStatus,
      item.componentName || '',item.componentCode || '',item.taskNumber,item.description,
      item.equipmentState,item.activityMode,
      item.basis === 'calendar' ? 'Calendar/Time' : item.basis === 'meter' ? 'Meter/Usage' : 'Legacy - review',
      item.dueAt || '', item.meterValue, item.nextDueReading,item.meterUnit || '',
      STATUS_LABEL[item.status],item.effortMinutes === null ? 'UNESTIMATED' : formatHours(item.effortMinutes),
      item.openWorkOrder?.woNumber || '',item.openWorkOrder?.status || '',windowDays,
    ]);
    const csv = [headers,...values].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'iassetspro-pm-forward-plan-'+windowDays+'d-'+new Date().toISOString().slice(0,10)+'.csv';
    document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
  };
  const update = (key: keyof PmCapacityScenario, raw: string) => {
    const numeric = Number(raw);
    setScenario((old) => ({...old,[key]:Number.isFinite(numeric) ? numeric : 0}));
  };
  return <Card className="border shadow-sm" data-testid="pm-enterprise-forward-plan">
    <CardHeader className="space-y-3 pb-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarRange className="h-4 w-4 text-blue-600"/>Enterprise PM Workload & Capacity Outlook
          </CardTitle>
          <p className="text-xs text-muted-foreground">Plant-wide planning across 7, 30 and 90 days.
            One next occurrence per task; meter due dates are never guessed.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={loading}
            onClick={() => setReload((x) => x+1)} aria-label="Refresh PM forward outlook">
            {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-1 h-4 w-4"/>}Refresh
          </Button>
          <Button variant="outline" size="sm" disabled={!feed || !feed.items.length}
            onClick={exportCsv} aria-label="Export full PM forward register to CSV">
            <Download className="mr-1 h-4 w-4"/>Export full register
          </Button>
        </div>
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Planning horizon</Label>
          <Select value={String(windowDays)} onValueChange={(v) => setWindowDays(Number(v) as 7 | 30 | 90)}>
            <SelectTrigger aria-label="PM planning horizon"><SelectValue/></SelectTrigger>
            <SelectContent><SelectItem value="7">Next 7 days</SelectItem>
              <SelectItem value="30">Next 30 days</SelectItem>
              <SelectItem value="90">Next 90 days</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Plant</Label>
          <Select value={plants.some(([id])=>id===plantId) ? plantId : 'all'} onValueChange={setPlantId}>
            <SelectTrigger aria-label="PM outlook plant filter"><SelectValue/></SelectTrigger>
            <SelectContent><SelectItem value="all">All permitted plants</SelectItem>
              {plants.map(([id,name])=><SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Search machine, part, task or WO</Label>
          <Input aria-label="Search PM forward risks" placeholder="Find risk / overdue work"
            value={search} onChange={(e)=>setSearch(e.target.value)}/>
        </div>
      </div>
    </CardHeader>
    <CardContent className="space-y-4">
      {error && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
        {error} If the all-plants register is too large, choose an authorized plant above to load a complete plant-level plan.
      </p>}
      {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Analyzing assignments and current-cycle work orders…</p>}
      {feed && <>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Metric label="Active PM tasks" value={plan.summary.totalAssignments}/>
          <Metric label="Due now / in horizon" value={plan.summary.dueTasks}/>
          <Metric label="Overdue calendar tasks" value={plan.summary.overdueCalendar} warning={plan.summary.overdueCalendar>0}/>
          <Metric label="Meter thresholds reached" value={plan.summary.meterDueNow} warning={plan.summary.meterDueNow>0}/>
          <Metric label="High / critical due" value={plan.summary.highOrCriticalDue} warning={plan.summary.highOrCriticalDue>0}/>
          <Metric label="Linked to open WO" value={plan.summary.linkedOpenWorkOrders}/>
          <Metric label="No current-cycle WO link" value={plan.summary.awaitingWorkOrder} warning={plan.summary.awaitingWorkOrder>0}/>
          <Metric label="Due with unknown effort" value={plan.summary.unestimatedDueTasks} warning={plan.summary.unestimatedDueTasks>0}/>
        </div>
        <p className="text-sm"><strong>{formatHours(plan.summary.knownMinutes)} estimated task-hours</strong> due
          within the selected horizon, including overdue and already-triggered meter work.
          {plan.summary.unestimatedDueTasks>0 && <span className="text-amber-700 dark:text-amber-300">
            {' '}{plan.summary.unestimatedDueTasks} tasks still lack effort estimates; true workload is uncertain.</span>}
        </p>
        {(plan.summary.calendarWithoutDate>0||plan.summary.meterWithoutLiveValue>0||plan.summary.legacyFrequencyForReview>0) &&
          <p className="flex items-start gap-2 rounded-lg border border-amber-300/60 p-3 text-xs"
            data-testid="pm-forward-config-warning">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600"/>
            Planning setup: {plan.summary.calendarWithoutDate} missing calendar due dates;
            {' '}{plan.summary.meterWithoutLiveValue} missing live meter values or thresholds;
            {' '}{plan.summary.legacyFrequencyForReview} legacy frequency records requiring conversion to Calendar or Meter.
            These are not silently counted as completed.
          </p>}
        <div className="space-y-3 rounded-lg border p-3" data-testid="pm-crew-capacity-scenario">
          <div className="flex flex-wrap items-center gap-2">
            <Users className="h-4 w-4 text-blue-600"/>
            <p className="font-semibold text-sm">Crew capacity scenario</p>
            <Badge variant="outline">Illustrative — not actual staffing</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Enter planning assumptions (one crew per task as a provisional approximation). Capacity does not claim real technician availability,
            confirmed shutdown windows, safety permits, spare parts or tools.
            Working days are counted from Monday.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <CapacityInput label="Available crews" value={scenario.crews} min={0} max={100}
              onChange={(v)=>update('crews',v)}/>
            <CapacityInput label="Hours / crew / shift" value={scenario.hoursPerShift} min={1} max={24}
              onChange={(v)=>update('hoursPerShift',v)}/>
            <CapacityInput label="Working days / week" value={scenario.workingDaysPerWeek} min={1} max={7}
              onChange={(v)=>update('workingDaysPerWeek',v)}/>
            <CapacityInput label="Productive time %" value={scenario.productivePercent} min={0} max={100}
              onChange={(v)=>update('productivePercent',v)}/>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2.5"
            data-testid="pm-repeat-scenario-toggle">
            <Button size="sm" variant={includeRecurringScenario ? 'default' : 'outline'}
              aria-pressed={includeRecurringScenario}
              onClick={() => setIncludeRecurringScenario((previous) => !previous)}>
              {includeRecurringScenario ? 'Exclude' : 'Include'} additional fixed-calendar repeats
            </Button>
            <p className="text-xs text-muted-foreground">
              {repeats.summary.additionalOccurrences.toLocaleString()} potential repeat tasks,
              {' '}{formatHours(repeats.summary.estimatedMinutes)} estimated task-hours beyond
              the first due occurrence, from {repeats.summary.eligibleFixedCalendarTasks} fixed-schedule
              assignments.
            </p>
            {includeRecurringScenario && (
              <p role="note" className="w-full text-xs text-amber-700 dark:text-amber-300">
                Scenario only: assumes future fixed-calendar cycles occur on time.
                These are not generated or authorized work orders.
                {repeats.summary.afterCompletionExcluded} after-completion tasks,
                {' '}{repeats.summary.meterExcluded} meter tasks and
                {' '}{repeats.summary.overdueAwaitingCompletion} overdue fixed-calendar tasks
                cannot be projected safely.
                {repeats.summary.unestimatedOccurrences} potential repeat tasks lack valid effort estimates.
                {repeats.summary.limited && ' Recurrence projection exceeded a safety cap; counts may be incomplete.'}
              </p>
            )}
          </div>
          <div className="space-y-2">
            {plan.weeks.map((week)=>{
              const repeatWeek = repeats.weeks[week.index];
              const capacityMinutes = week.knownMinutes +
                (includeRecurringScenario ? repeatWeek.estimatedMinutes : 0);
              const unknownEffort = week.unknownEffortTasks +
                (includeRecurringScenario ? repeatWeek.unestimatedOccurrences : 0);
              const c=pmCapacityForWeek({ ...week, knownMinutes: capacityMinutes },scenario);
              const pct=c.availableHours>0?Math.min(100,c.demandHours/c.availableHours*100):
                c.demandHours>0?100:0;
              return <div key={week.index} className="grid gap-1.5 border-t pt-2 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_minmax(0,11rem)] sm:items-center"
                data-testid="pm-forward-week">
                <div className="text-xs"><p className="font-semibold">Week {week.index+1} · {week.from} to {week.through}</p>
                  <p className="text-muted-foreground">{week.taskCount} next-due tasks · {week.committedTasks} with WO</p>
                  {includeRecurringScenario && repeatWeek.additionalOccurrences > 0 && (
                    <p className="text-amber-700 dark:text-amber-300">
                      +{repeatWeek.additionalOccurrences.toLocaleString()} hypothetical repeats
                    </p>
                  )}
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted"
                  aria-label={'Week '+(week.index+1)+' known work demand'}>
                  <div className={'h-full rounded-full '+(c.overCapacity?'bg-rose-500':'bg-blue-500')}
                    style={{width:String(pct)+'%'}}/></div>
                <div className="text-xs sm:text-right">
                  <p className={c.overCapacity?'font-semibold text-rose-600':'font-medium'}>
                    {c.demandHours.toLocaleString()}h / {c.availableHours.toLocaleString()}h
                    {c.loadPercent!==null && ' ('+c.loadPercent+'%)'}
                  </p>
                  <p className="text-muted-foreground">{unknownEffort
                    ? '+'+unknownEffort+' unestimated task occurrences' : 'Known estimates only'}</p>
                </div>
              </div>;
            })}
          </div>
        </div>
        <div className="space-y-2" data-testid="pm-forward-risk-register">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="flex items-center gap-2 text-sm font-semibold">
              <Factory className="h-4 w-4"/>PM priority queue</h3>
              <p className="text-xs text-muted-foreground">
                Top {Math.min(30,actionableRows.length)} of {actionableRows.length} due or configuration-blocked tasks.
                Export the full scoped register for Excel.
              </p></div>
            <Badge variant="outline">{windowDays}-day view</Badge>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground"><tr>
                <th className="px-3 py-2">Machine / criticality</th>
                <th className="px-3 py-2">Part / PM instruction</th>
                <th className="px-3 py-2">Due / meter</th>
                <th className="px-3 py-2">Effort</th>
                <th className="px-3 py-2">Linked WO</th>
              </tr></thead>
              <tbody className="divide-y">
                {actionableRows.slice(0,30).map((item)=><tr key={item.id}>
                  <td className="px-3 py-2 align-top"><p className="font-semibold">{item.assetName}</p>
                    <p className="text-muted-foreground">{item.assetCode} · {item.plantName}</p>
                    <Badge variant={item.assetCriticality==='critical'?'destructive':'outline'}>
                      {item.assetCriticality} criticality</Badge></td>
                  <td className="px-3 py-2 align-top"><p className="font-medium">
                    #{item.taskNumber} · {item.description}</p>
                    <p className="text-muted-foreground">{item.componentCode||'Whole machine'} · {item.componentName||item.activityMode}</p>
                    <p className="text-muted-foreground">{item.equipmentState}</p></td>
                  <td className="px-3 py-2 align-top">
                    <p className={item.status==='overdue'||item.status==='due_meter'?'font-semibold text-rose-600':'font-medium'}>
                      {STATUS_LABEL[item.status]}</p>
                    {item.basis==='calendar'?<p>{day(item.dueAt)}</p>:
                      item.basis==='meter'?<p className="flex items-center gap-1"><Gauge className="h-3 w-3"/>
                        {item.meterValue??'No reading'} / {item.nextDueReading??'No threshold'} {item.meterUnit||''}</p>:null}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {item.effortMinutes===null?'Not estimated':formatHours(item.effortMinutes)+'h'}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {item.openWorkOrder?<><p className="font-medium">{item.openWorkOrder.woNumber}</p>
                      <p className="text-muted-foreground">{item.openWorkOrder.status}</p></>:
                      <span className="text-muted-foreground">No current-cycle WO link</span>}
                  </td>
                </tr>)}
                {actionableRows.length===0&&<tr><td colSpan={5} className="p-5 text-center text-muted-foreground">
                  {feed.items.length?'No due or blocked PM tasks match this filter.':'No active assignments found for your permitted plants.'}
                </td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Read-only planning outlook: does not dispatch crews, generate or approve WOs, reserve inventory,
          or change PM due dates. Use Machine PM Roll-up and standard approvals to execute the plan.
          Estimates are task durations, not verified person-hours or remaining work on in-progress jobs. Meter tasks enter the workload only when an observed value reaches its configured threshold;
          unestimated hours are not guessed.
        </p>
      </>}
    </CardContent>
  </Card>;
}
function Metric({label,value,warning=false}:{label:string;value:number;warning?:boolean}) {
  return <div className="rounded-lg border p-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className={'text-xl font-bold tabular-nums '+(warning?'text-amber-700 dark:text-amber-300':'')}>
      {value.toLocaleString()}</p>
  </div>;
}
function CapacityInput({label,value,min,max,onChange}:{
  label:string;value:number;min:number;max:number;onChange:(v:string)=>void;
}) {
  return <div className="min-w-0 space-y-1">
    <Label className="text-xs">{label}</Label>
    <Input type="number" inputMode="numeric" min={min} max={max} step="1"
      value={value} className="w-full" aria-label={label}
      onChange={(event)=>onChange(event.target.value)}/>
  </div>;
}
