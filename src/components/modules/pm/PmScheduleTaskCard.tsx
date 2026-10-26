'use client';

import React, { useMemo } from 'react';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { PM_TASK_TYPE_LABELS } from '@/lib/pm-task';
import {
  PM_SCHEDULE_TASK_TIME_UNITS,
  formatPmScheduleTaskPlanningSummary,
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

function meterKey(meter: Pick<PmScheduleMeterOption, 'meterName' | 'unit'>) {
  return `${meter.meterName}|||${meter.unit}`;
}

function conditionKey(source: PmScheduleConditionSourceOption) {
  return `${source.sourceType}|||${source.sourceId}|||${encodeURIComponent(source.metric)}`;
}

export function PmScheduleTaskCard({ task, index, total, meterOptions, conditionOptions, sourcesLoading = false, onChange, onMove, onRemove }: Props) {
  const selectedMeter = useMemo(
    () => meterOptions.find((meter) => meter.meterName === task.meterName && meter.unit === task.frequencyUnit) || null,
    [meterOptions, task.frequencyUnit, task.meterName],
  );
  const selectedCondition = useMemo(
    () => conditionOptions.find((source) => source.sourceType === task.conditionSourceType && source.sourceId === task.conditionSourceId && source.metric === task.conditionMetric) || null,
    [conditionOptions, task.conditionMetric, task.conditionSourceId, task.conditionSourceType],
  );

  return (
    <div data-testid="pm-scheduled-task-card" className="rounded-xl border bg-card p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-bold">Task #{task.taskNumber}</span>
            <Badge variant="secondary" className="text-[10px]">{PM_TASK_TYPE_LABELS[task.taskType]}</Badge>
            <Badge variant="outline" className="text-[10px]">{task.maintenanceMode.toUpperCase()}</Badge>
          </div>
          <p className="mt-1 break-words text-sm font-semibold">{task.description}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{formatPmScheduleTaskPlanningSummary(task)}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move Task #${task.taskNumber} up`}><ChevronUp className="h-4 w-4" /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={index === total - 1} onClick={() => onMove(1)} aria-label={`Move Task #${task.taskNumber} down`}><ChevronDown className="h-4 w-4" /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={onRemove} aria-label={`Remove Task #${task.taskNumber}`}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Maintenance Mode</Label>
          <Select value={task.maintenanceMode} onValueChange={(value) => onChange({ maintenanceMode: value as PmScheduleTaskDraft['maintenanceMode'] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tbm">TBM · Time Based</SelectItem>
              <SelectItem value="ubm">UBM · Usage Based</SelectItem>
              <SelectItem value="cbm">CBM · Condition Based</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Equipment State</Label>
          <Select value={task.equipmentState} onValueChange={(value) => onChange({ equipmentState: value as PmScheduleTaskDraft['equipmentState'] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="running">RUNNING</SelectItem>
              <SelectItem value="stopped">STOPPED</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Estimated Minutes</Label>
          <Input type="number" min="0" step="1" value={task.estimatedMinutes} onChange={(event) => onChange({ estimatedMinutes: event.target.value })} placeholder="0" />
        </div>
        <div className="space-y-1.5">
          <Label>Lead Days</Label>
          <Input type="number" min="0" step="1" value={task.leadDays} onChange={(event) => onChange({ leadDays: event.target.value })} />
        </div>
      </div>

      {task.maintenanceMode === 'tbm' && (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Interval *</Label>
            <Input type="number" min="1" step="1" value={task.frequencyInterval} onChange={(event) => onChange({ frequencyInterval: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Unit *</Label>
            <Select value={task.frequencyUnit} onValueChange={(value) => onChange({ frequencyUnit: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PM_SCHEDULE_TASK_TIME_UNITS.map((unit) => <SelectItem key={unit} value={unit}>{unit.charAt(0).toUpperCase() + unit.slice(1)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Next Due Date *</Label>
            <Input type="date" value={task.nextDueDate} onChange={(event) => onChange({ nextDueDate: event.target.value })} />
          </div>
        </div>
      )}

      {task.maintenanceMode === 'ubm' && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5 lg:col-span-2">
            <Label>Asset Meter *</Label>
            <Select
              value={task.meterName && task.frequencyUnit ? `${task.meterName}|||${task.frequencyUnit}` : undefined}
              onValueChange={(value) => {
                const meter = meterOptions.find((item) => meterKey(item) === value);
                if (meter) onChange({ meterName: meter.meterName, frequencyUnit: meter.unit, nextDueReading: '' });
              }}
              disabled={sourcesLoading || meterOptions.length === 0}
            >
              <SelectTrigger><SelectValue placeholder={sourcesLoading ? 'Loading meters...' : 'Select asset meter'} /></SelectTrigger>
              <SelectContent>
                {meterOptions.map((meter) => <SelectItem key={meterKey(meter)} value={meterKey(meter)}>{meter.meterName} · {meter.value} {meter.unit}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Usage Interval *</Label>
            <Input type="number" min="0.000001" step="any" value={task.frequencyInterval} onChange={(event) => onChange({ frequencyInterval: event.target.value, nextDueReading: '' })} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3 rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            {selectedMeter
              ? `Current reading: ${selectedMeter.value} ${selectedMeter.unit}. ${task.nextDueReading ? `Next due: ${task.nextDueReading} ${selectedMeter.unit}.` : 'The server will calculate the next threshold from the latest reading.'}`
              : 'Select a meter recorded on this asset. Free-text meter sources are not accepted.'}
          </div>
        </div>
      )}

      {task.maintenanceMode === 'cbm' && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Condition Source *</Label>
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
              <SelectTrigger><SelectValue placeholder={sourcesLoading ? 'Loading condition sources...' : 'Select condition source'} /></SelectTrigger>
              <SelectContent>
                {conditionOptions.map((source) => <SelectItem key={conditionKey(source)} value={conditionKey(source)}>{source.label}{source.currentValue == null ? '' : ` · ${source.currentValue} ${source.unit}`}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Operator *</Label>
            <Select value={task.conditionOperator} onValueChange={(value) => onChange({ conditionOperator: value as PmScheduleTaskDraft['conditionOperator'] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONDITION_OPERATORS.map((operator) => <SelectItem key={operator.value} value={operator.value}>{operator.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{task.conditionOperator === 'outside_range' ? 'Lower Threshold *' : 'Threshold *'}</Label>
            <div className="flex items-center gap-2">
              <Input type="number" step="any" value={task.conditionThreshold} onChange={(event) => onChange({ conditionThreshold: event.target.value })} />
              {task.conditionUnit && <span className="shrink-0 text-xs text-muted-foreground">{task.conditionUnit}</span>}
            </div>
          </div>
          {task.conditionOperator === 'outside_range' && (
            <div className="space-y-1.5">
              <Label>Upper Threshold *</Label>
              <div className="flex items-center gap-2">
                <Input type="number" step="any" value={task.conditionThresholdMax} onChange={(event) => onChange({ conditionThresholdMax: event.target.value })} />
                {task.conditionUnit && <span className="shrink-0 text-xs text-muted-foreground">{task.conditionUnit}</span>}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Evaluation Cadence (min)</Label>
            <Input type="number" min="0" step="1" value={task.evaluationCadenceMinutes} onChange={(event) => onChange({ evaluationCadenceMinutes: event.target.value })} placeholder="Optional" />
          </div>
          <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
            {selectedCondition
              ? `Current ${selectedCondition.metric}: ${selectedCondition.currentValue ?? '—'} ${selectedCondition.unit}.`
              : 'Choose an authoritative component reading or active IoT source for this target.'}
          </div>
        </div>
      )}
    </div>
  );
}
