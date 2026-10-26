'use client';

import React, { useMemo } from 'react';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { PM_TASK_TYPE_LABELS } from '@/lib/pm-task';
import {
  PM_SCHEDULE_TASK_TIME_UNITS,
  type PmScheduleConditionSourceOption,
  type PmScheduleMeterOption,
  type PmScheduleTaskDraft,
} from '@/lib/pm-schedule-task';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  task: PmScheduleTaskDraft;
  index: number;
  total: number;
  meterOptions: PmScheduleMeterOption[];
  conditionOptions: PmScheduleConditionSourceOption[];
  sourcesLoading?: boolean;
  onChange: (patch: Partial<PmScheduleTaskDraft>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

const CONDITION_OPERATORS = [
  { value: '>', label: 'Greater than' },
  { value: '>=', label: 'Greater than or equal' },
  { value: '<', label: 'Less than' },
  { value: '<=', label: 'Less than or equal' },
  { value: '=', label: 'Equal to' },
  { value: '!=', label: 'Not equal to' },
  { value: 'outside_range', label: 'Outside range' },
] as const;

const TIME_UNIT_LABELS: Record<string, string> = {
  minutes: 'Minutes',
  hours: 'Hours',
  days: 'Days',
  weeks: 'Weeks',
  months: 'Months',
  years: 'Years',
};

function meterKey(meter: Pick<PmScheduleMeterOption, 'meterName' | 'unit'>) {
  return `${meter.meterName}|||${meter.unit}`;
}

function conditionKey(source: PmScheduleConditionSourceOption) {
  return `${source.sourceType}|||${source.sourceId}|||${encodeURIComponent(source.metric)}`;
}

function isTimeUnit(value: string) {
  return (PM_SCHEDULE_TASK_TIME_UNITS as readonly string[]).includes(value);
}

const compactField = 'space-y-1 min-w-0';
const compactLabel = 'text-[10px] font-semibold uppercase tracking-wide text-muted-foreground';
const compactControl = 'h-8 text-xs';

export function PmScheduleTaskCard({ task, index, total, meterOptions, conditionOptions, sourcesLoading = false, onChange, onMove, onRemove }: Props) {
  const selectedMeter = useMemo(
    () => meterOptions.find((meter) => meter.meterName === task.meterName && meter.unit === task.frequencyUnit) || null,
    [meterOptions, task.frequencyUnit, task.meterName],
  );
  const selectedCondition = useMemo(
    () => conditionOptions.find((source) => source.sourceType === task.conditionSourceType && source.sourceId === task.conditionSourceId && source.metric === task.conditionMetric) || null,
    [conditionOptions, task.conditionMetric, task.conditionSourceId, task.conditionSourceType],
  );
  const usesSubDayTime = task.maintenanceMode === 'tbm' && ['minutes', 'hours'].includes(task.frequencyUnit);
  const nextDueInputValue = usesSubDayTime
    ? (task.nextDueDate ? (task.nextDueDate.includes('T') ? task.nextDueDate.slice(0, 16) : `${task.nextDueDate.slice(0, 10)}T00:00`) : '')
    : (task.nextDueDate ? task.nextDueDate.slice(0, 10) : '');

  const changeFrequencyType = (value: PmScheduleTaskDraft['frequencyType']) => {
    if (value === 'meter') {
      onChange({
        frequencyType: 'meter',
        maintenanceMode: 'ubm',
        frequencyUnit: '',
        meterName: '',
        nextDueReading: '',
        nextDueDate: '',
      });
      return;
    }
    onChange({
      frequencyType: 'time_day',
      maintenanceMode: 'tbm',
      frequencyUnit: isTimeUnit(task.frequencyUnit) ? task.frequencyUnit : 'months',
      meterName: '',
      nextDueReading: '',
    });
  };

  const changeMaintenanceMode = (value: PmScheduleTaskDraft['maintenanceMode']) => {
    if (value === 'tbm') {
      onChange({
        maintenanceMode: 'tbm',
        frequencyType: 'time_day',
        frequencyUnit: isTimeUnit(task.frequencyUnit) ? task.frequencyUnit : 'months',
        meterName: '',
        nextDueReading: '',
      });
      return;
    }
    if (value === 'ubm') {
      onChange({
        maintenanceMode: 'ubm',
        frequencyType: 'meter',
        frequencyUnit: task.frequencyType === 'meter' ? task.frequencyUnit : '',
        meterName: task.frequencyType === 'meter' ? task.meterName : '',
        nextDueDate: '',
      });
      return;
    }
    onChange({ maintenanceMode: 'cbm' });
  };

  return (
    <div data-testid="pm-scheduled-task-card" className="rounded-lg border bg-card p-2.5 sm:p-3">
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

      <div data-testid="pm-task-compact-planning-grid" className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <div className={compactField}>
          <Label className={compactLabel}>Frequency Type</Label>
          <Select value={task.frequencyType} onValueChange={(value) => changeFrequencyType(value as PmScheduleTaskDraft['frequencyType'])} disabled={task.maintenanceMode === 'cbm'}>
            <SelectTrigger className={compactControl}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="time_day">Time / Day</SelectItem>
              <SelectItem value="meter">Meter Based</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className={compactField}>
          <Label className={compactLabel}>Frequency Unit</Label>
          {task.frequencyType === 'meter' ? (
            <Select
              value={task.meterName && task.frequencyUnit ? `${task.meterName}|||${task.frequencyUnit}` : undefined}
              onValueChange={(value) => {
                const meter = meterOptions.find((item) => meterKey(item) === value);
                if (meter) onChange({ meterName: meter.meterName, frequencyUnit: meter.unit, nextDueReading: '' });
              }}
              disabled={task.maintenanceMode === 'cbm' || sourcesLoading || meterOptions.length === 0}
            >
              <SelectTrigger className={compactControl}><SelectValue placeholder={sourcesLoading ? 'Loading…' : 'Meter / unit'} /></SelectTrigger>
              <SelectContent>
                {meterOptions.map((meter) => <SelectItem key={meterKey(meter)} value={meterKey(meter)}>{meter.meterName} · {meter.unit}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Select value={isTimeUnit(task.frequencyUnit) ? task.frequencyUnit : 'months'} onValueChange={(value) => onChange({ frequencyUnit: value })} disabled={task.maintenanceMode === 'cbm'}>
              <SelectTrigger className={compactControl}><SelectValue /></SelectTrigger>
              <SelectContent>
                {PM_SCHEDULE_TASK_TIME_UNITS.map((unit) => <SelectItem key={unit} value={unit}>{TIME_UNIT_LABELS[unit]}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {task.frequencyType === 'meter' && selectedMeter && task.maintenanceMode !== 'cbm' && <p className="truncate text-[9px] text-muted-foreground" title={`${selectedMeter.meterName}: ${selectedMeter.value} ${selectedMeter.unit}`}>Now {selectedMeter.value} {selectedMeter.unit}</p>}
        </div>

        <div className={compactField}>
          <Label className={compactLabel}>Frequency Value</Label>
          <Input className={compactControl} type="number" min="0.000001" step={task.frequencyType === 'time_day' ? '1' : 'any'} value={task.frequencyInterval} onChange={(event) => onChange({ frequencyInterval: event.target.value, nextDueReading: '' })} disabled={task.maintenanceMode === 'cbm'} />
        </div>

        <div className={compactField}>
          <Label className={compactLabel}>Inspection Type</Label>
          <Select value={task.equipmentState} onValueChange={(value) => onChange({ equipmentState: value as PmScheduleTaskDraft['equipmentState'] })}>
            <SelectTrigger className={compactControl}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="stopped">Stopped</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className={compactField}>
          <Label className={compactLabel}>Maintenance Mode</Label>
          <Select value={task.maintenanceMode} onValueChange={(value) => changeMaintenanceMode(value as PmScheduleTaskDraft['maintenanceMode'])}>
            <SelectTrigger className={compactControl}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tbm">Time Based</SelectItem>
              <SelectItem value="ubm">Usage Based</SelectItem>
              <SelectItem value="cbm">Condition Based</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className={compactField}>
          <Label className={compactLabel}>Estimated Minutes</Label>
          <Input className={compactControl} type="number" min="0" step="1" value={task.estimatedMinutes} onChange={(event) => onChange({ estimatedMinutes: event.target.value })} placeholder="0" />
        </div>

        <div className={compactField}>
          <Label className={compactLabel}>Lead Days</Label>
          <Input className={compactControl} type="number" min="0" step="1" value={task.leadDays} onChange={(event) => onChange({ leadDays: event.target.value })} />
        </div>

        <div className={compactField}>
          <Label className={compactLabel}>Next Due Date</Label>
          <Input className={compactControl} type={usesSubDayTime ? 'datetime-local' : 'date'} value={nextDueInputValue} onChange={(event) => onChange({ nextDueDate: event.target.value })} disabled={task.maintenanceMode !== 'tbm'} />
        </div>
      </div>

      {task.maintenanceMode === 'cbm' && (
        <div data-testid="pm-task-condition-planning-grid" className="mt-2 grid gap-2 rounded-md border bg-muted/15 p-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <div className={`${compactField} sm:col-span-2`}>
            <Label className={compactLabel}>Condition Source</Label>
            <Select
              value={selectedCondition ? conditionKey(selectedCondition) : undefined}
              onValueChange={(value) => {
                const source = conditionOptions.find((item) => conditionKey(item) === value);
                if (!source) return;
                onChange({
                  conditionSourceType: source.sourceType,
                  conditionSourceId: source.sourceId,
                  conditionMetric: source.metric,
                  conditionUnit: source.unit,
                });
              }}
              disabled={sourcesLoading || conditionOptions.length === 0}
            >
              <SelectTrigger className={compactControl}><SelectValue placeholder={sourcesLoading ? 'Loading…' : 'Select condition source'} /></SelectTrigger>
              <SelectContent>
                {conditionOptions.map((source) => <SelectItem key={conditionKey(source)} value={conditionKey(source)}>{source.label}{source.currentValue == null ? '' : ` · ${source.currentValue} ${source.unit}`}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className={compactField}>
            <Label className={compactLabel}>Operator</Label>
            <Select value={task.conditionOperator} onValueChange={(value) => onChange({ conditionOperator: value as PmScheduleTaskDraft['conditionOperator'] })}>
              <SelectTrigger className={compactControl}><SelectValue /></SelectTrigger>
              <SelectContent>{CONDITION_OPERATORS.map((operator) => <SelectItem key={operator.value} value={operator.value}>{operator.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className={compactField}>
            <Label className={compactLabel}>{task.conditionOperator === 'outside_range' ? 'Lower Threshold' : 'Threshold'}</Label>
            <div className="flex items-center gap-1">
              <Input className={compactControl} type="number" step="any" value={task.conditionThreshold} onChange={(event) => onChange({ conditionThreshold: event.target.value })} />
              {task.conditionUnit && <span className="shrink-0 text-[9px] text-muted-foreground">{task.conditionUnit}</span>}
            </div>
          </div>
          {task.conditionOperator === 'outside_range' && (
            <div className={compactField}>
              <Label className={compactLabel}>Upper Threshold</Label>
              <div className="flex items-center gap-1">
                <Input className={compactControl} type="number" step="any" value={task.conditionThresholdMax} onChange={(event) => onChange({ conditionThresholdMax: event.target.value })} />
                {task.conditionUnit && <span className="shrink-0 text-[9px] text-muted-foreground">{task.conditionUnit}</span>}
              </div>
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
