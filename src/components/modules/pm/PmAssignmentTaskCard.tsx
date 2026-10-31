'use client';

import React, { useEffect, useMemo } from 'react';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { PM_TASK_TYPE_LABELS } from '@/lib/pm-task';
import {
  PM_ASSIGNMENT_TIME_UNITS,
  type PmAssignmentAssetMeterOption,
  type PmAssignmentConditionSourceOption,
  type PmAssignmentTaskDraft,
} from '@/lib/pm-assignment-draft';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { displayDate } from '@/components/ui/datetime-picker';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  task: PmAssignmentTaskDraft;
  index: number;
  total: number;
  meters: PmAssignmentAssetMeterOption[];
  conditions: PmAssignmentConditionSourceOption[];
  sourcesLoading?: boolean;
  onChange: (patch: Partial<PmAssignmentTaskDraft>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

const TIME_UNIT_LABELS: Record<string, string> = {
  minutes: 'Minutes',
  hours: 'Hours',
  days: 'Days',
  weeks: 'Weeks',
  months: 'Months',
  years: 'Years',
};

const ACTIVITY_MODES = [
  ['inspection', 'Inspection'],
  ['lubrication', 'Lubrication'],
  ['servicing', 'Servicing'],
  ['replacement', 'Replacement'],
] as const;

const CONDITION_OPERATORS = [
  ['>', 'Greater than'],
  ['>=', 'Greater than or equal'],
  ['<', 'Less than'],
  ['<=', 'Less than or equal'],
  ['=', 'Equal to'],
  ['!=', 'Not equal to'],
  ['outside_range', 'Outside range'],
] as const;

const compactField = 'min-w-0 space-y-1';
const frequencyTypeField = `${compactField} col-span-5 md:col-span-4 lg:col-span-1 xl:col-span-1`;
const frequencyUnitField = `${compactField} col-span-5 md:col-span-4 lg:col-span-1 xl:col-span-1`;
const intervalField = `${compactField} col-span-2 md:col-span-4 lg:col-span-1 xl:col-span-1`;
const standardField = `${compactField} col-span-6 md:col-span-4 lg:col-span-1 xl:col-span-1`;
const inspectionTypeField = `${compactField} col-span-7 md:col-span-4 lg:col-span-1 xl:col-span-1`;
const estimatedMinutesField = `${compactField} col-span-5 md:col-span-4 lg:col-span-1 xl:col-span-1`;
const leadDaysField = `${compactField} col-span-4 md:col-span-4 lg:col-span-1 xl:col-span-1`;
const nextDueDateField = `${compactField} col-span-8 md:col-span-4 lg:col-span-2 xl:col-span-1`;
const compactLabel = 'text-[10px] font-semibold uppercase tracking-wide text-muted-foreground';
const compactControl = 'h-9 w-full min-w-0 px-2 text-xs';

function conditionKey(source: PmAssignmentConditionSourceOption) {
  return `${source.sourceType}|||${source.sourceId}|||${source.metric}`;
}

export function PmAssignmentTaskCard({ task, index, total, meters, conditions, sourcesLoading = false, onChange, onMove, onRemove }: Props) {
  const selectedMeter = useMemo(() => meters.find((meter) => meter.id === task.assetMeterId) || null, [meters, task.assetMeterId]);
  const selectedCondition = useMemo(
    () => conditions.find((source) => source.sourceType === task.conditionSourceType && source.sourceId === task.conditionSourceId && source.metric === task.conditionMetric) || null,
    [conditions, task.conditionMetric, task.conditionSourceId, task.conditionSourceType],
  );
  const usesSubDayTime = task.pmType === 'tbm' && (task.frequencyUnit === 'minutes' || task.frequencyUnit === 'hours');
  const cadenceDisabled = task.pmType === 'cbm' || task.pmType === 'fbm';
  const interval = Number(task.value);
  const nextMeterDue = selectedMeter && Number.isFinite(interval) && interval > 0 ? Number(selectedMeter.currentValue) + interval : null;
  const dueTime = task.nextDueDate.includes('T') ? task.nextDueDate.split('T')[1]?.slice(0, 5) || '' : '';
  const dueDateDisplay = task.nextDueDate
    ? `${displayDate(task.nextDueDate)}${usesSubDayTime ? ` ${dueTime || '00:00'}` : ''}`
    : usesSubDayTime ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy';

  useEffect(() => {
    if (task.pmType !== 'ubm' || task.assetMeterId || sourcesLoading || meters.length !== 1) return;
    const meter = meters[0];
    onChange({ assetMeterId: meter.id, frequencyUnit: meter.unit });
  }, [meters, onChange, sourcesLoading, task.assetMeterId, task.pmType]);

  const setFrequencyType = (frequencyType: PmAssignmentTaskDraft['frequencyType']) => {
    if (frequencyType === 'meter') {
      const meter = meters.length === 1 ? meters[0] : null;
      onChange({
        frequencyType: 'meter',
        pmType: 'ubm',
        assetMeterId: meter?.id || '',
        frequencyUnit: meter?.unit || '',
        nextDueDate: '',
      });
      return;
    }
    onChange({
      frequencyType: 'time_day',
      pmType: 'tbm',
      assetMeterId: '',
      frequencyUnit: (PM_ASSIGNMENT_TIME_UNITS as readonly string[]).includes(task.frequencyUnit) ? task.frequencyUnit : 'months',
    });
  };

  const setPmType = (pmType: PmAssignmentTaskDraft['pmType']) => {
    if (pmType === 'tbm') {
      onChange({
        pmType,
        frequencyType: 'time_day',
        assetMeterId: '',
        frequencyUnit: (PM_ASSIGNMENT_TIME_UNITS as readonly string[]).includes(task.frequencyUnit) ? task.frequencyUnit : 'months',
      });
      return;
    }
    if (pmType === 'ubm') {
      const meter = selectedMeter || (meters.length === 1 ? meters[0] : null);
      onChange({ pmType, frequencyType: 'meter', assetMeterId: meter?.id || '', frequencyUnit: meter?.unit || '', nextDueDate: '' });
      return;
    }
    onChange({ pmType, assetMeterId: '', nextDueDate: '' });
  };

  return (
    <div data-testid="pm-assignment-task-card" className="rounded-lg border bg-card p-2.5 sm:p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-[11px] font-bold">Task #{task.taskNumber}</span>
          <Badge variant="secondary" className="h-5 px-1.5 text-[9px]">{PM_TASK_TYPE_LABELS[task.taskType]}</Badge>
          <p className="min-w-0 flex-1 basis-60 truncate text-sm font-semibold" title={task.description}>{task.description}</p>
        </div>
        <div className="flex shrink-0 gap-0.5">
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move Task #${task.taskNumber} up`}><ChevronUp className="h-3.5 w-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={index === total - 1} onClick={() => onMove(1)} aria-label={`Move Task #${task.taskNumber} down`}><ChevronDown className="h-3.5 w-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={onRemove} aria-label={`Remove Task #${task.taskNumber}`}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <div data-testid="pm-assignment-task-planning-grid" className="mt-2 grid grid-cols-12 gap-2 md:grid-cols-12 lg:grid-cols-4 xl:grid-cols-[1.15fr_1.1fr_.55fr_1.45fr_1.15fr_1.1fr_.75fr_.65fr_1.8fr]">
        <div className={frequencyTypeField}>
          <Label className={compactLabel}>Frequency Type</Label>
          <Select value={task.frequencyType} onValueChange={(value) => setFrequencyType(value as PmAssignmentTaskDraft['frequencyType'])} disabled={cadenceDisabled}>
            <SelectTrigger className={compactControl}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="time_day">Time / Day</SelectItem>
              <SelectItem value="meter">Meter Based</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className={frequencyUnitField}>
          <Label className={compactLabel}>Frequency Unit</Label>
          {task.frequencyType === 'meter' && !cadenceDisabled ? (
            <Select
              value={task.assetMeterId || undefined}
              onValueChange={(assetMeterId) => {
                const meter = meters.find((item) => item.id === assetMeterId);
                onChange({ assetMeterId, frequencyUnit: meter?.unit || '' });
              }}
              disabled={sourcesLoading || meters.length === 0}
            >
              <SelectTrigger className={compactControl}><SelectValue placeholder={sourcesLoading ? 'Loading…' : 'Select meter'} /></SelectTrigger>
              <SelectContent>{meters.map((meter) => <SelectItem key={meter.id} value={meter.id}>{meter.name} · {meter.unit}</SelectItem>)}</SelectContent>
            </Select>
          ) : (
            <Select value={(PM_ASSIGNMENT_TIME_UNITS as readonly string[]).includes(task.frequencyUnit) ? task.frequencyUnit : 'months'} onValueChange={(frequencyUnit) => onChange({ frequencyUnit, ...(frequencyUnit === 'minutes' || frequencyUnit === 'hours' ? { leadDays: '0' } : {}) })} disabled={cadenceDisabled}>
              <SelectTrigger className={compactControl}><SelectValue /></SelectTrigger>
              <SelectContent>{PM_ASSIGNMENT_TIME_UNITS.map((unit) => <SelectItem key={unit} value={unit}>{TIME_UNIT_LABELS[unit]}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {task.frequencyType === 'meter' && selectedMeter && !cadenceDisabled && (
            <p className="truncate text-[9px] text-muted-foreground" title={`${selectedMeter.name}: ${selectedMeter.currentValue} ${selectedMeter.unit}`}>
              Current {selectedMeter.currentValue} {selectedMeter.unit}{nextMeterDue == null ? '' : ` · Next due ${nextMeterDue} ${selectedMeter.unit}`}
            </p>
          )}
          {task.frequencyType === 'meter' && !sourcesLoading && meters.length === 0 && !cadenceDisabled && <p className="text-[9px] text-amber-600">No meter is configured for this asset.</p>}
        </div>

        <div className={intervalField}>
          <Label className={compactLabel}>Interval</Label>
          <Input className={compactControl} type="number" min="0.000001" step={task.pmType === 'tbm' ? '1' : 'any'} value={task.value} onChange={(event) => onChange({ value: event.target.value })} disabled={cadenceDisabled} />
        </div>

        <div className={standardField}>
          <Label className={compactLabel}>PM Type</Label>
          <Select value={task.pmType} onValueChange={(value) => setPmType(value as PmAssignmentTaskDraft['pmType'])}>
            <SelectTrigger className={compactControl}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tbm">TBM · Time Based</SelectItem>
              <SelectItem value="ubm">UBM · Usage Based</SelectItem>
              <SelectItem value="cbm">CBM · Condition Based</SelectItem>
              <SelectItem value="fbm">FBM · Failure Based</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className={standardField}>
          <Label className={compactLabel}>Activity Mode</Label>
          <Select value={task.activityMode} onValueChange={(activityMode) => onChange({ activityMode: activityMode as PmAssignmentTaskDraft['activityMode'] })}>
            <SelectTrigger className={compactControl}><SelectValue /></SelectTrigger>
            <SelectContent>{ACTIVITY_MODES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <div className={inspectionTypeField}>
          <Label className={compactLabel}>Inspection Type</Label>
          <Select value={task.inspectionType} onValueChange={(inspectionType) => onChange({ inspectionType: inspectionType as PmAssignmentTaskDraft['inspectionType'] })}>
            <SelectTrigger className={compactControl}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="running">Running</SelectItem><SelectItem value="standstill">Standstill</SelectItem></SelectContent>
          </Select>
        </div>

        <div className={estimatedMinutesField}>
          <Label className={compactLabel}>Est. Minutes</Label>
          <Input className={compactControl} type="number" min="0" step="1" value={task.estimatedMinutes} onChange={(event) => onChange({ estimatedMinutes: event.target.value })} placeholder="0" />
        </div>

        <div className={leadDaysField}>
          <Label className={compactLabel}>Lead Days</Label>
          <Input className={compactControl} type="number" min="0" step="1" value={usesSubDayTime ? '0' : task.leadDays} disabled={usesSubDayTime || task.pmType === 'fbm'} onChange={(event) => onChange({ leadDays: event.target.value })} />
        </div>

        <div className={nextDueDateField}>
          <Label className={compactLabel}>Next Due Date</Label>
          <div className={`relative h-9 w-full min-w-0 rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 ${task.pmType !== 'tbm' ? 'opacity-50' : ''}`}>
            <div aria-hidden="true" className="pointer-events-none flex h-9 min-w-0 items-center truncate px-2 text-xs">
              {dueDateDisplay}
            </div>
            <input
              aria-label="Next Due Date"
              className="absolute inset-0 h-9 w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              lang="en-GB"
              type={usesSubDayTime ? 'datetime-local' : 'date'}
              value={task.nextDueDate}
              onClick={(event) => {
                const input = event.currentTarget as HTMLInputElement & { showPicker?: () => void };
                if (typeof input.showPicker === 'function') input.showPicker();
              }}
              onChange={(event) => onChange({ nextDueDate: event.target.value })}
              disabled={task.pmType !== 'tbm'}
            />
          </div>
        </div>
      </div>

      {task.pmType === 'cbm' && (
        <div data-testid="pm-assignment-condition-planning-grid" className="mt-2 grid gap-2 rounded-md border bg-muted/15 p-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className={`${compactField} sm:col-span-2`}>
            <Label className={compactLabel}>Condition Source</Label>
            <Select
              value={selectedCondition ? conditionKey(selectedCondition) : undefined}
              onValueChange={(value) => {
                const source = conditions.find((item) => conditionKey(item) === value);
                if (!source) return;
                onChange({ conditionSourceType: source.sourceType, conditionSourceId: source.sourceId, conditionMetric: source.metric, conditionUnit: source.unit });
              }}
              disabled={sourcesLoading || conditions.length === 0}
            >
              <SelectTrigger className={compactControl}><SelectValue placeholder={sourcesLoading ? 'Loading…' : 'Select condition source'} /></SelectTrigger>
              <SelectContent>{conditions.map((source) => <SelectItem key={conditionKey(source)} value={conditionKey(source)}>{source.label}{source.currentValue == null ? '' : ` · ${source.currentValue} ${source.unit}`}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className={compactField}>
            <Label className={compactLabel}>Operator</Label>
            <Select value={task.conditionOperator} onValueChange={(conditionOperator) => onChange({ conditionOperator: conditionOperator as PmAssignmentTaskDraft['conditionOperator'] })}>
              <SelectTrigger className={compactControl}><SelectValue /></SelectTrigger>
              <SelectContent>{CONDITION_OPERATORS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className={compactField}>
            <Label className={compactLabel}>{task.conditionOperator === 'outside_range' ? 'Lower Threshold' : 'Threshold'}</Label>
            <div className="flex items-center gap-1"><Input className={compactControl} type="number" step="any" value={task.conditionThreshold} onChange={(event) => onChange({ conditionThreshold: event.target.value })} />{task.conditionUnit && <span className="shrink-0 text-[9px] text-muted-foreground">{task.conditionUnit}</span>}</div>
          </div>
          {task.conditionOperator === 'outside_range' && (
            <div className={compactField}>
              <Label className={compactLabel}>Upper Threshold</Label>
              <div className="flex items-center gap-1"><Input className={compactControl} type="number" step="any" value={task.conditionThresholdMax} onChange={(event) => onChange({ conditionThresholdMax: event.target.value })} />{task.conditionUnit && <span className="shrink-0 text-[9px] text-muted-foreground">{task.conditionUnit}</span>}</div>
            </div>
          )}
          <div className={compactField}>
            <Label className={compactLabel}>Evaluation (min)</Label>
            <Input className={compactControl} type="number" min="0" step="1" value={task.evaluationCadenceMinutes} onChange={(event) => onChange({ evaluationCadenceMinutes: event.target.value })} placeholder="Optional" />
          </div>
        </div>
      )}
    </div>
  );
}
